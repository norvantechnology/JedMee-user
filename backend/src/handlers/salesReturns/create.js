const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean, i, n, nextSalesNumber, isFutureDate, localCalendarYmd } = require("../../shared/sales");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_RETURNS", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const body = parseJsonBody(event);
  const customerId = clean(body.customerId || body.customer_id);
  if (!customerId) return fail(400, "VALIDATION_ERROR", "customerId is required");
  const returnDate = clean(body.returnDate || body.return_date) || localCalendarYmd();
  if (isFutureDate(returnDate, { clientTodayYmd: clean(body.clientToday) })) {
    return fail(400, "VALIDATION_ERROR", "Return date cannot be in future.");
  }
  const returnReason = clean(body.returnReason || body.return_reason || "OTHER").toUpperCase();
  if (!["EXPIRED", "DAMAGED", "WRONG_PRODUCT", "EXCESS", "PATIENT_RETURNED", "OTHER"].includes(returnReason)) {
    return fail(400, "VALIDATION_ERROR", "Invalid return reason.");
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return fail(400, "VALIDATION_ERROR", "At least one return line is required.");

  try {
    const data = await withTransaction(async (q) => {
      const c = await q(`SELECT * FROM customers WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [customerId, ctx.accountId]);
      const customer = c.rows?.[0] || null;
      if (!customer) return { err: fail(400, "VALIDATION_ERROR", "Customer not found.") };
      const number = clean(body.returnNumber || body.return_number) || (await nextSalesNumber(q, ctx.accountId, "sales_returns", "SR"));
      const salesInvoiceId = clean(body.salesInvoiceId || body.sales_invoice_id) || null;
      if (salesInvoiceId) {
        const inv = await q(`SELECT id FROM sales_invoices WHERE id = $1 AND account_id = $2 AND customer_id = $3 LIMIT 1`, [salesInvoiceId, ctx.accountId, customer.id]);
        if (!inv.rows?.length) return { err: fail(400, "VALIDATION_ERROR", "Linked sales invoice not found for selected customer.") };
      }
      const rs = await q(
        `INSERT INTO sales_returns (
           account_id, return_number, sales_invoice_id, customer_id, customer_name, return_date, return_reason, status, notes, created_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::sales_return_reason,'DRAFT'::sales_return_status,$8,$9)
         RETURNING *`,
        [ctx.accountId, number, salesInvoiceId, customer.id, customer.name, returnDate, returnReason, clean(body.notes) || null, actorId]
      );
      const ret = rs.rows?.[0];

      for (const it of items) {
        const batchId = clean(it.batchId || it.batch_id);
        const productId = clean(it.productId || it.product_id);
        const returnQty = i(it.returnQty || it.return_qty);
        const returnLooseQty = Math.max(0, Number(it.returnLooseQty || it.return_loose_qty || 0));

        // At least one of returnQty or returnLooseQty must be positive
        if (!batchId || !productId || (returnQty <= 0 && returnLooseQty <= 0)) {
          return { err: fail(400, "VALIDATION_ERROR", "Each return line must include product, batch and return qty > 0 (or loose qty > 0).") };
        }

        // Fetch batch info (for packing_units and loose_unit_name)
        const pb = await q(
          `SELECT pb.batch_no, pb.expiry_date, pb.loose_unit_name,
                  COALESCE(pb.packing_units, p.units_per_strip, 1) AS packing_units,
                  p.name AS product_name, p.mfg_company_id
           FROM product_batches pb
           JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
           WHERE pb.id = $1 AND pb.product_id = $2 AND pb.account_id = $3
           LIMIT 1`,
          [batchId, productId, ctx.accountId]
        );
        const row = pb.rows?.[0] || null;
        if (!row) return { err: fail(400, "VALIDATION_ERROR", "Invalid product/batch in return line.") };

        const packingUnits = Math.max(1, Number(row.packing_units || 1));
        const netRate = n(it.netRate || it.net_rate || it.salesRate || it.sales_rate);
        const looseRate = netRate / packingUnits;

        // Strip amount + loose amount
        const stripAmount = Number((returnQty * netRate).toFixed(4));
        const looseAmount = Number((returnLooseQty * looseRate).toFixed(4));
        const returnAmount = Number((stripAmount + looseAmount).toFixed(4));

        const salesInvoiceItemId = clean(it.salesInvoiceItemId || it.sales_invoice_item_id) || null;
        if (salesInvoiceItemId) {
          // Validate strip qty against original invoice item
          const original = await q(
            `SELECT qty, loose_qty FROM sales_invoice_items WHERE id = $1 AND account_id = $2 LIMIT 1`,
            [salesInvoiceItemId, ctx.accountId]
          );
          const soldQty = Number(original.rows?.[0]?.qty || 0);
          const soldLooseQty = Number(original.rows?.[0]?.loose_qty || 0);
          if (!soldQty && !soldLooseQty) return { err: fail(400, "VALIDATION_ERROR", "Linked invoice item not found.") };

          // Already returned (strip qty)
          const alreadyReturned = await q(
            `SELECT COALESCE(SUM(sri.return_qty),0)::numeric AS total_qty,
                    COALESCE(SUM(sri.return_loose_qty),0)::numeric AS total_loose
             FROM sales_return_items sri
             JOIN sales_returns sr ON sr.id = sri.sales_return_id
             WHERE sri.sales_invoice_item_id = $1 AND sri.account_id = $2
               AND sr.status IN ('DRAFT'::sales_return_status,'CONFIRMED'::sales_return_status)`,
            [salesInvoiceItemId, ctx.accountId]
          );
          const maxReturnable = soldQty - Number(alreadyReturned.rows?.[0]?.total_qty || 0);
          const maxReturnableLoose = soldLooseQty - Number(alreadyReturned.rows?.[0]?.total_loose || 0);

          if (returnQty > maxReturnable) {
            return { err: fail(400, "VALIDATION_ERROR", `Return qty (${returnQty}) exceeds max returnable (${maxReturnable}).`) };
          }
          if (returnLooseQty > maxReturnableLoose) {
            return { err: fail(400, "VALIDATION_ERROR", `Return loose qty (${returnLooseQty}) exceeds max returnable loose qty (${maxReturnableLoose}).`) };
          }
        }

        await q(
          `INSERT INTO sales_return_items (
            account_id, sales_return_id, sales_invoice_item_id, product_id, product_name, batch_id, batch_no, expiry_date,
            mfg_company_id, return_qty, return_loose_qty, return_free_qty, sales_rate, net_rate, return_amount
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
          )`,
          [
            ctx.accountId, ret.id, salesInvoiceItemId, productId, row.product_name,
            batchId, row.batch_no, row.expiry_date, row.mfg_company_id || null,
            returnQty, returnLooseQty, i(it.returnFreeQty || it.return_free_qty || 0),
            n(it.salesRate || it.sales_rate), netRate, returnAmount
          ]
        );
      }
      return { item: ret };
    });
    if (data?.err) return data.err;
    return created(data, { message: "Sales return draft created." });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
