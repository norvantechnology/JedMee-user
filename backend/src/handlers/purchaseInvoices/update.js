const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { validateInvoiceHeader, enrichAndValidateItems, mapInvoiceRow, resolveDueDate, resolveDueDateFromDivision, resolvePurchaseParty, insertPurchaseLineItemsMany } = require("./_common");
const { computeDerived } = require("../../shared/productBatchCalc");
const { refreshInvoicePaymentSummary } = require("../../shared/purchase");

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function toGstSlab(v) {
  const x = Math.round(Number(v) || 0);
  return [0, 5, 12, 18, 28].includes(x) ? x : 0;
}

function batchKey(id) {
  return String(id || "");
}

function sumByBatch(items) {
  const out = new Map();
  for (const it of items || []) {
    const bid = batchKey(it.confirmed_batch_id || it.batch_id);
    if (!bid) continue;
    const prev = out.get(bid) || { qty: 0, free: 0 };
    prev.qty += n(it.qty);
    prev.free += n(it.free_qty);
    out.set(bid, prev);
  }
  return out;
}

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_INVOICES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const id = String(event?.pathParameters?.id || "").trim();
  if (!id) return fail(400, "BAD_REQUEST", "id is required");
  const body = parseJsonBody(event);
  const h = await validateInvoiceHeader(body);
  if (!h.ok) return fail(400, "VALIDATION_ERROR", h.message);

  try {
    const data = await withTransaction(async (q) => {
      const cur = await q(
        `SELECT * FROM purchase_invoices WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [id, ctx.accountId]
      );
      const row = cur.rows?.[0];
      if (!row) return { err: fail(404, "NOT_FOUND", "Purchase invoice not found.") };
      const status = String(row.status || "");
      const isDraft = status === "DRAFT";
      const isConfirmed = status === "CONFIRMED";
      if (!isDraft && !isConfirmed) return { err: fail(400, "INVALID_STATE", "Only draft or confirmed invoices can be edited.") };
      if (isConfirmed && !Boolean(body.allowConfirmedEdit)) {
        return { err: fail(400, "INVALID_STATE", "Confirmed invoice editing is disabled for this request.") };
      }

      if (isConfirmed) {
        const ret = await q(
          `SELECT 1
           FROM purchase_returns
           WHERE account_id = $1 AND purchase_invoice_id = $2
             AND status = 'CONFIRMED'::purchase_return_status
           LIMIT 1`,
          [ctx.accountId, id]
        );
        if (ret.rows?.length) {
          return { err: fail(400, "INVALID_STATE", "Cannot edit a confirmed invoice that already has confirmed purchase returns.") };
        }
      }

      const party = await resolvePurchaseParty(q, ctx.accountId, h.header);
      if (!party.ok) return { err: fail(400, "VALIDATION_ERROR", party.message) };
      const resolvedDueDate =
        party.mode === "division"
          ? resolveDueDateFromDivision(h.header.invoiceDate, h.header.dueDate, party.creditSource)
          : resolveDueDate(h.header.invoiceDate, h.header.dueDate, party.creditSource);
      const itemsRes = await enrichAndValidateItems(q, ctx.accountId, party, body.items);
      if (!itemsRes.ok) return { err: fail(400, "VALIDATION_ERROR", itemsRes.message, { details: itemsRes.details }) };

      if (isConfirmed) {
        const oldItemsRes = await q(
          `SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = $1 AND account_id = $2`,
          [id, ctx.accountId]
        );
        const oldByBatch = sumByBatch(oldItemsRes.rows || []);
        const newByBatch = new Map();
        for (const it of itemsRes.items || []) {
          const bid = batchKey(it.batchId);
          if (!bid) continue;
          const prev = newByBatch.get(bid) || { qty: 0, free: 0 };
          prev.qty += n(it.qty);
          prev.free += n(it.freeQty);
          newByBatch.set(bid, prev);
        }

        const affected = new Set([...oldByBatch.keys(), ...newByBatch.keys()]);
        const deltas = [];
        for (const bid of affected) {
          const o = oldByBatch.get(bid) || { qty: 0, free: 0 };
          const ne = newByBatch.get(bid) || { qty: 0, free: 0 };
          const dq = ne.qty - o.qty;
          const df = ne.free - o.free;
          if (Math.abs(dq) > 0.0001 || Math.abs(df) > 0.0001) deltas.push({ bid, dq, df });
        }

        for (const d of deltas) {
          const locked = await q(
            `SELECT id, current_stock, current_free_stock
             FROM product_batches
             WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
             FOR UPDATE`,
            [d.bid, ctx.accountId]
          );
          const b = locked.rows?.[0];
          if (!b) return { err: fail(400, "VALIDATION_ERROR", "Batch not found for stock adjustment.") };
          const nextPaid = n(b.current_stock) + n(d.dq);
          const nextFree = n(b.current_free_stock) + n(d.df);
          if (nextPaid < -0.0001 || nextFree < -0.0001) {
            return {
              err: fail(
                400,
                "BUSINESS_RULE",
                "Cannot reduce purchase quantities because stock has already been sold/consumed for one or more batches."
              )
            };
          }
        }

        for (const d of deltas) {
          const note = `Purchase invoice edited: ${row.invoice_number || ""}`.trim();
          await q(
            `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, ref_type, ref_id, note, created_by_user_id)
             VALUES ($1,$2,'ADJUSTMENT'::inventory_txn_type,$3::numeric,$4::numeric,'PURCHASE_INVOICE',$5,$6,$7)`,
            [ctx.accountId, d.bid, d.dq, d.df, id, note, actorId]
          );
        }

        for (const it of itemsRes.items || []) {
          const bid = batchKey(it.batchId);
          if (!bid) continue;
          const b = await q(
            `SELECT pb.*,
                    COALESCE(p.sales_gst, pb.sales_gst) AS sales_gst,
                    COALESCE(p.purchase_gst, pb.purchase_gst) AS purchase_gst,
                    COALESCE(p.is_discount_enabled, pb.is_discount_enabled) AS is_discount_enabled,
                    COALESCE(p.is_half_scheme, pb.is_half_scheme) AS is_half_scheme,
                    COALESCE(p.scheme_qty_paid, pb.scheme_qty_paid) AS scheme_qty_paid,
                    COALESCE(p.scheme_qty_free, pb.scheme_qty_free) AS scheme_qty_free
             FROM product_batches pb
             JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
             WHERE pb.id = $1 AND pb.account_id = $2 AND pb.deleted_at IS NULL
             LIMIT 1`,
            [bid, ctx.accountId]
          );
          const batch = b.rows?.[0];
          if (!batch) continue;
          const lineMrp = n(it.mrp);
          const lineRate = n(it.purchaseRate);
          const lineSales = n(it.salesRate) || lineRate;
          const batchMrp = n(batch.mrp);
          const batchRate = n(batch.purchase_rate);
          const batchSales = n(batch.sales_rate);
          if (batchMrp !== lineMrp || batchRate !== lineRate || batchSales !== lineSales) {
            const gstSlab = toGstSlab(it.gstPercent);
            const derived = computeDerived({
              purchaseRate: lineRate,
              mrp: lineMrp,
              salesRate: lineSales,
              purchaseGST: n(batch.purchase_gst) || gstSlab,
              salesGST: n(batch.sales_gst) || gstSlab,
              discountPurchase: n(batch.discount_purchase),
              retailDiscountPercent: n(batch.retail_discount_percent),
              netDiscountPercent: n(batch.net_discount_percent),
              isDiscountEnabled: Boolean(batch.is_discount_enabled),
              isNet: Boolean(batch.is_net),
              isHalfScheme: Boolean(batch.is_half_scheme),
              schemeQtyPaid: n(batch.scheme_qty_paid),
              schemeQtyFree: n(batch.scheme_qty_free),
              openingStock: n(batch.opening_stock),
              openStockFreeQty: n(batch.open_stock_free_qty)
            });
            await q(
              `INSERT INTO batch_price_history (
                 account_id, batch_id, purchase_invoice_id, purchase_invoice_item_id,
                 old_mrp, new_mrp, old_purchase_rate, new_purchase_rate, old_sales_rate, new_sales_rate,
                 changed_by_user_id, change_note
               )
               VALUES ($1,$2,$3,NULL,$4::numeric,$5::numeric,$6::numeric,$7::numeric,$8::numeric,$9::numeric,$10,$11)`,
              [ctx.accountId, bid, id, batchMrp, lineMrp, batchRate, lineRate, batchSales, lineSales, actorId, "Price updated on purchase invoice edit"]
            );
            await q(
              `UPDATE product_batches
               SET mrp = $3::numeric, purchase_rate = $4::numeric, sales_rate = $5::numeric, retail_rate = $5::numeric,
                   landing_cost = $6::numeric, discount_sales = $7::numeric, net_rate = $8::numeric,
                   updated_by_user_id = $9, updated_at = now()
               WHERE id = $1 AND account_id = $2`,
              [bid, ctx.accountId, lineMrp, lineRate, lineSales, derived.landingCost, derived.discountSales, derived.netRate, actorId]
            );
          }
        }
      }

      await q(
        `
        UPDATE purchase_invoices
        SET vendor_invoice_number = $3,
            vendor_id = $4,
            division_id = $5,
            division_name = $6,
            purchase_source = $7,
            invoice_date = $8,
            due_date = $9,
            subtotal = $10,
            total_discount = $11,
            total_gst = $12,
            total_amount = $13,
            balance_due = $13 - amount_paid,
            notes = $14,
            updated_by_user_id = $15,
            updated_at = now()
        WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
        `,
        [
          id,
          ctx.accountId,
          h.header.vendorInvoiceNumber,
          party.vendorId,
          party.divisionId,
          party.divisionName,
          party.mode === "division" ? "DIVISION" : "VENDOR",
          h.header.invoiceDate,
          resolvedDueDate,
          itemsRes.totals.subtotal,
          itemsRes.totals.totalDiscount,
          itemsRes.totals.totalGst,
          itemsRes.totals.totalAmount,
          h.header.notes,
          actorId
        ]
      );

      await q(`DELETE FROM purchase_invoice_items WHERE purchase_invoice_id = $1 AND account_id = $2`, [id, ctx.accountId]);
      await insertPurchaseLineItemsMany(q, ctx.accountId, id, itemsRes.items);

      await refreshInvoicePaymentSummary(q, ctx.accountId, id);

      const fin = await q(
        `SELECT * FROM purchase_invoices WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [id, ctx.accountId]
      );
      return { invoice: mapInvoiceRow(fin.rows?.[0]) };
    });
    if (data?.err) return data.err;
    return ok(data, { message: "Purchase invoice updated." });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[purchase-invoice:update] failed", {
      message: e.message, code: e.code, table: e.table, column: e.column,
      constraint: e.constraint, detail: e.detail, where: e.where, routine: e.routine
    });
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", {
      subMessage: String(e.message || "Please try again."),
      details: {
        code: e.code || null, table: e.table || null, column: e.column || null,
        constraint: e.constraint || null, detail: e.detail || null
      }
    });
  }
}

module.exports = { handler };
