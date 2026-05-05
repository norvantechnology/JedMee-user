const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { nextSalesNumber } = require("../../shared/sales");
const { clean, n, round2, getAccountContextForUser, createInAppNotification } = require("./_common");

async function nextCustomerCode(q, accountId) {
  const last = await q(
    `SELECT code FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND code ILIKE 'CUS-%' ORDER BY created_at DESC LIMIT 1`,
    [accountId]
  );
  const m = String(last.rows?.[0]?.code || "").match(/^CUS-(\d{4,})$/i);
  const seq = m ? Number(m[1] || 0) + 1 : 1;
  return `CUS-${String(seq).padStart(4, "0")}`;
}

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const actor = await getAccountContextForUser(actorId);
  if (String(actor?.role_code || "").toUpperCase() !== "WHOLESALER") return fail(403, "FORBIDDEN", "Only wholesaler can accept.");

  const orderId = clean(event?.pathParameters?.id);
  if (!orderId) return fail(400, "VALIDATION_ERROR", "order id is required.");
  const body = parseJsonBody(event);
  const wholesalerNotes = clean(body.wholesaler_notes || body.wholesalerNotes) || null;
  const itemOverrides = Array.isArray(body.item_overrides || body.itemOverrides) ? body.item_overrides || body.itemOverrides : [];

  try {
    const out = await withTransaction(async (q) => {
      const orderRs = await q(
        `SELECT * FROM orders WHERE id = $1 AND wholesaler_account_id = $2 AND status = 'PENDING' LIMIT 1`,
        [orderId, perms.accountId]
      );
      const order = orderRs.rows?.[0];
      if (!order) return { err: fail(404, "NOT_FOUND", "Order not found or already processed.") };

      const itemRs = await q(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`, [orderId]);
      const items = itemRs.rows || [];
      if (!items.length) return { err: fail(400, "VALIDATION_ERROR", "Order has no items.") };

      const stockErrors = [];
      for (const it of items) {
        const ov = itemOverrides.find((x) => String(x.order_item_id || x.orderItemId) === String(it.id)) || null;
        const acceptQty = Math.max(0, Number(ov?.accepted_qty ?? ov?.acceptedQty ?? it.ordered_qty) || 0);
        if (!(acceptQty > 0)) continue;
        const stock = await q(
          `
          SELECT COALESCE(SUM(COALESCE(txn.qty, 0) + COALESCE(txn.free_qty, 0)), 0)::numeric(14,3) AS available
          FROM product_batches pb
          LEFT JOIN inventory_txns txn ON txn.batch_id = pb.id AND txn.account_id = pb.account_id
          WHERE pb.account_id = $1
            AND pb.product_id = $2
            AND pb.deleted_at IS NULL
            AND pb.is_hold = false
            AND (pb.expiry_date IS NULL OR pb.expiry_date > current_date)
          `,
          [perms.accountId, it.product_id]
        );
        const available = n(stock.rows?.[0]?.available || 0);
        if (available < acceptQty) stockErrors.push({ product_name: it.product_name, ordered: Number(it.ordered_qty || 0), accepting: acceptQty, available });
      }
      if (stockErrors.length) return { err: fail(409, "INSUFFICIENT_STOCK", "Cannot accept order due to low stock.", { items: stockErrors }) };

      let wholesalerCustomerId = order.wholesaler_customer_id || null;
      if (!wholesalerCustomerId) {
        const r = await q(`SELECT * FROM app_users WHERE id = $1 LIMIT 1`, [order.retailer_account_id]);
        const retailer = r.rows?.[0];
        const ex = await q(
          `
          SELECT id
          FROM customers
          WHERE account_id = $1
            AND deleted_at IS NULL
            AND (LOWER(name) = LOWER($2) OR (phone_number = $3 AND $3 <> ''))
          LIMIT 1
          `,
          [perms.accountId, clean(retailer?.firm_name) || clean(retailer?.full_name) || "Retailer", clean(retailer?.phone_number)]
        );
        if (ex.rows?.[0]) {
          wholesalerCustomerId = ex.rows[0].id;
        } else {
          const code = await nextCustomerCode(q, perms.accountId);
          const ins = await q(
            `
            INSERT INTO customers (
              account_id, code, name, short_name, phone_country_code, phone_number, email, address, city, state, pincode,
              customer_type, gst_number, drug_license_number, credit_days, credit_limit, is_active, notes, created_by_user_id, updated_by_user_id
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'RETAILER',$12,$13,0,0,true,$14,$15,$15)
            RETURNING id
            `,
            [
              perms.accountId,
              code,
              clean(retailer?.firm_name) || clean(retailer?.full_name) || "Retailer",
              (clean(retailer?.firm_name) || clean(retailer?.full_name) || "Retailer").slice(0, 24),
              clean(retailer?.phone_country_code) || "+91",
              clean(retailer?.phone_number) || null,
              clean(retailer?.email) || null,
              clean(retailer?.address) || null,
              clean(retailer?.city) || null,
              clean(retailer?.state) || null,
              clean(retailer?.pin_code) || null,
              clean(retailer?.gst_number) || null,
              clean(retailer?.drug_license_1_number) || null,
              `Auto-created from order ${order.order_number}`,
              actorId
            ]
          );
          wholesalerCustomerId = ins.rows?.[0]?.id || null;
        }
      }

      const salesNo = await nextSalesNumber(q, perms.accountId, "sales_invoices", "SI");
      const inv = await q(
        `
        INSERT INTO sales_invoices (
          account_id, invoice_number, customer_id, customer_name, invoice_date, due_date, status, payment_status,
          subtotal, total_discount, total_gst, total_amount, amount_paid, balance_due, notes,
          created_by_user_id, confirmed_by_user_id, confirmed_at
        )
        VALUES ($1,$2,$3,$4,current_date,current_date + INTERVAL '30 days','CONFIRMED','UNPAID',$5,$6,$7,$8,0,$8,$9,$10,$10,now())
        RETURNING *
        `,
        [perms.accountId, salesNo, wholesalerCustomerId, order.retailer_firm_name, order.subtotal, order.total_discount, order.total_gst, order.total_amount, `From order ${order.order_number}`, actorId]
      );
      const salesInvoice = inv.rows?.[0];

      let invSubtotal = 0;
      let invDiscount = 0;
      let invGst = 0;
      let invTotal = 0;

      for (const it of items) {
        const ov = itemOverrides.find((x) => String(x.order_item_id || x.orderItemId) === String(it.id)) || null;
        const acceptQty = Math.max(0, Number(ov?.accepted_qty ?? ov?.acceptedQty ?? it.ordered_qty) || 0);
        const freeQty = Math.max(0, Number(ov?.free_qty ?? ov?.freeQty ?? it.free_qty ?? 0) || 0);
        if (!(acceptQty > 0)) continue;

        let batchId = clean(ov?.batch_id || ov?.batchId);
        if (!batchId) {
          const b = await q(
            `
            SELECT pb.id
            FROM product_batches pb
            LEFT JOIN (
              SELECT batch_id, SUM(COALESCE(qty,0) + COALESCE(free_qty,0))::numeric(14,3) AS txn_stock
              FROM inventory_txns
              WHERE account_id = $1
              GROUP BY batch_id
            ) txn ON txn.batch_id = pb.id
            WHERE pb.account_id = $1
              AND pb.product_id = $2
              AND pb.deleted_at IS NULL
              AND pb.is_hold = false
              AND COALESCE(txn.txn_stock, pb.current_stock, 0) >= $3
              AND (pb.expiry_date IS NULL OR pb.expiry_date > current_date)
            ORDER BY pb.expiry_date ASC NULLS LAST
            LIMIT 1
            `,
            [perms.accountId, it.product_id, acceptQty + freeQty]
          );
          batchId = b.rows?.[0]?.id || "";
        }
        if (!batchId) return { err: fail(409, "INSUFFICIENT_STOCK", `No suitable batch found for ${it.product_name}.`) };

        const bdet = await q(`SELECT * FROM product_batches WHERE id = $1 AND account_id = $2 LIMIT 1`, [batchId, perms.accountId]);
        const batch = bdet.rows?.[0];
        const deduct = await q(
          `
          UPDATE product_batches
          SET current_stock = GREATEST(0, current_stock) - $3,
              current_free_stock = GREATEST(0, current_free_stock - $4),
              updated_at = now()
          WHERE id = $1
            AND account_id = $2
          RETURNING id
          `,
          [batchId, perms.accountId, acceptQty, freeQty]
        );
        if (!deduct.rows?.[0]) return { err: fail(409, "INSUFFICIENT_STOCK", `Stock changed for ${it.product_name}. Please retry.`) };

        const unitPrice = n(it.unit_price);
        const discountPercent = n(it.discount_percent);
        const gstPercent = n(it.gst_percent);

        const gross = round2(unitPrice * acceptQty);
        const discountAmount = round2(gross * (discountPercent / 100));
        const taxableAmount = round2(gross - discountAmount);
        const gstAmount = round2(taxableAmount * (gstPercent / 100));
        const lineTotal = round2(taxableAmount + gstAmount);

        const netRate = acceptQty > 0 ? round2(taxableAmount / acceptQty) : round2(unitPrice * (1 - discountPercent / 100));
        await q(
          `
          INSERT INTO sales_invoice_items (
            account_id, sales_invoice_id, product_id, product_code, product_name, drug_name,
            batch_id, batch_no, expiry_date, qty, free_qty, mrp, sales_rate, discount_percent,
            discount_amount, net_rate, gst_percent, gst_amount, taxable_amount, line_total
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
          `,
          [
            perms.accountId,
            salesInvoice.id,
            it.product_id,
            it.product_code,
            it.product_name,
            it.drug_name,
            batchId,
            batch.batch_no,
            batch.expiry_date,
            acceptQty,
            freeQty,
            it.mrp || batch.mrp || it.unit_price,
            unitPrice,
            discountPercent,
            discountAmount,
            netRate,
            gstPercent,
            gstAmount,
            taxableAmount,
            lineTotal
          ]
        );
        invSubtotal = round2(invSubtotal + gross);
        invDiscount = round2(invDiscount + discountAmount);
        invGst = round2(invGst + gstAmount);
        invTotal = round2(invTotal + lineTotal);
        await q(
          `
          INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, note, ref_type, ref_id, created_by_user_id)
          VALUES ($1,$2,'SALE',$3,$4,$5,'SALES_INVOICE',$6,$7)
          `,
          [perms.accountId, batchId, -acceptQty, -freeQty, `Order ${order.order_number}`, salesInvoice.id, actorId]
        );
        await q(`UPDATE order_items SET batch_id = $2, batch_no = $3, accepted_qty = $4, free_qty = $5 WHERE id = $1`, [it.id, batchId, batch.batch_no, acceptQty, freeQty]);
      }

      await q(
        `
        UPDATE sales_invoices
        SET subtotal = $2,
            total_discount = $3,
            total_gst = $4,
            total_amount = $5,
            balance_due = $5,
            updated_at = now()
        WHERE id = $1
        `,
        [salesInvoice.id, invSubtotal, invDiscount, invGst, invTotal]
      );

      const orderUp = await q(
        `
        UPDATE orders
        SET status = 'ACCEPTED',
            accepted_at = now(),
            accepted_by_user_id = $3,
            wholesaler_customer_id = $4,
            wholesaler_sales_invoice_id = $5,
            wholesaler_notes = $6,
            updated_at = now()
        WHERE id = $1
          AND wholesaler_account_id = $2
        RETURNING *
        `,
        [orderId, perms.accountId, actorId, wholesalerCustomerId, salesInvoice.id, wholesalerNotes]
      );
      const accepted = orderUp.rows?.[0];
      await createInAppNotification(
        q,
        accepted.retailer_account_id,
        accepted.retailer_account_id,
        "ORDER_ACCEPTED",
        `Order ${accepted.order_number} accepted`,
        "Your order was accepted and is being prepared.",
        { order_id: accepted.id }
      );
      return { order: accepted, sales_invoice_id: salesInvoice.id };
    });
    if (out?.err) return out.err;
    return ok(out, { message: "Order accepted." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to accept order.");
  }
}

module.exports = { handler };

