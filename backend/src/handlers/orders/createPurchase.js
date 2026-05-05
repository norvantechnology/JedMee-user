const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { nextDocNumber, round2, n, clean } = require("../../shared/purchase");
const { getAccountContextForUser, getAccountProfile } = require("./_common");

async function nextVendorCode(q, accountId) {
  const last = await q(
    `SELECT code FROM vendors WHERE account_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [accountId]
  );
  const m = String(last.rows?.[0]?.code || "").match(/(\d{3,})$/);
  const seq = m ? Number(m[1] || 0) + 1 : 1;
  return `SUP${String(seq).padStart(3, "0")}`;
}

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const actor = await getAccountContextForUser(actorId);
  if (String(actor?.role_code || "").toUpperCase() !== "RETAILER") return fail(403, "FORBIDDEN", "Only retailer can create purchase from order.");

  const orderId = clean(event?.pathParameters?.id);
  if (!orderId) return fail(400, "VALIDATION_ERROR", "order id is required.");
  const body = parseJsonBody(event);
  const receivedMap = new Map(
    (Array.isArray(body.items) ? body.items : [])
      .map((x) => [String(x.order_item_id || x.orderItemId || ""), Math.max(0, Number(x.received_qty ?? x.receivedQty ?? x.qty ?? 0) || 0)])
      .filter(([k]) => Boolean(k))
  );

  try {
    const out = await withTransaction(async (q) => {
      const ordRs = await q(`SELECT * FROM orders WHERE id = $1 AND retailer_account_id = $2 AND status = 'DELIVERED' LIMIT 1`, [orderId, perms.accountId]);
      const order = ordRs.rows?.[0];
      if (!order) return { err: fail(404, "NOT_FOUND", "Order not found or not delivered.") };
      if (order.retailer_purchase_invoice_id) return { err: fail(409, "CONFLICT", "Purchase invoice already created for this order.") };

      const wholesaler = await getAccountProfile(order.wholesaler_account_id);
      let vendorRs = await q(
        `SELECT * FROM vendors WHERE account_id = $1 AND deleted_at IS NULL AND LOWER(name) = LOWER($2) LIMIT 1`,
        [perms.accountId, clean(wholesaler?.firm_name) || clean(wholesaler?.full_name) || "Wholesaler"]
      );
      let vendor = vendorRs.rows?.[0];
      if (!vendor) {
        const vendorCode = await nextVendorCode(q, perms.accountId);
        const ins = await q(
          `
          INSERT INTO vendors (
            account_id, code, name, phone_country_code, phone_number, email, vendor_type, credit_days, notes, is_active, created_by_user_id
          )
          VALUES ($1,$2,$3,$4,$5,$6,'WHOLESALER',0,$7,true,$8)
          RETURNING *
          `,
          [
            perms.accountId,
            vendorCode,
            clean(wholesaler?.firm_name) || clean(wholesaler?.full_name) || "Wholesaler",
            clean(wholesaler?.phone_country_code) || "+91",
            clean(wholesaler?.phone_number) || null,
            clean(wholesaler?.email) || null,
            `Auto-created from order ${order.order_number}`,
            actorId
          ]
        );
        vendor = ins.rows?.[0];
      }

      const piNo = await nextDocNumber(q, "purchase_invoices", "PI", perms.accountId);
      const pInv = await q(
        `
        INSERT INTO purchase_invoices (
          account_id, invoice_number, vendor_invoice_number, vendor_id, purchase_source, invoice_date, due_date,
          status, payment_status, subtotal, total_discount, total_gst, total_amount, amount_paid, balance_due,
          notes, created_by_user_id, updated_by_user_id, confirmed_by_user_id, confirmed_at
        )
        VALUES ($1,$2,$3,$4,'VENDOR',$5,$6,'CONFIRMED','UNPAID',$7,$8,$9,$10,0,$10,$11,$12,$12,$12,now())
        RETURNING *
        `,
        [
          perms.accountId,
          piNo,
          order.order_number,
          vendor.id,
          (order.delivered_at || new Date()).toISOString().slice(0, 10),
          (order.delivered_at || new Date()).toISOString().slice(0, 10),
          order.subtotal,
          order.total_discount,
          order.total_gst,
          order.total_amount,
          `Created from order ${order.order_number}`,
          actorId
        ]
      );
      const invoice = pInv.rows?.[0];

      let invSubtotal = 0;
      let invDiscount = 0;
      let invGst = 0;
      let invTotal = 0;

      const itemRs = await q(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`, [orderId]);
      for (const it of itemRs.rows || []) {
        const qtyDefault = Number(it.accepted_qty || it.ordered_qty || 0);
        const qty = receivedMap.has(String(it.id)) ? Number(receivedMap.get(String(it.id)) || 0) : qtyDefault;
        if (!(qty > 0)) continue;
        const freeQty = Math.max(0, Number(it.free_qty || 0) || 0);
        const unitPrice = n(it.unit_price);
        const discountPercent = n(it.discount_percent || 0);
        const gstPercent = n(it.gst_percent || 0);

        const gross = round2(unitPrice * qty);
        const discountAmount = round2(gross * (discountPercent / 100));
        const taxableAmount = round2(gross - discountAmount);
        const gstAmount = round2(taxableAmount * (gstPercent / 100));
        const lineTotal = round2(taxableAmount + gstAmount);

        let prodRs = await q(
          `SELECT * FROM products WHERE account_id = $1 AND deleted_at IS NULL AND LOWER(name) = LOWER($2) LIMIT 1`,
          [perms.accountId, it.product_name]
        );
        let product = prodRs.rows?.[0];
        if (!product) {
          const code = `PRD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;
          const pIns = await q(
            `
            INSERT INTO products (account_id, code, name, drug_name, packing, stockable, is_discount_enabled)
            VALUES ($1,$2,$3,$4,$5,true,true)
            RETURNING *
            `,
            [perms.accountId, code, it.product_name, it.drug_name || null, it.packing || null]
          );
          product = pIns.rows?.[0];
        }

        let batchRs = await q(
          `
          SELECT *
          FROM product_batches
          WHERE account_id = $1
            AND product_id = $2
            AND deleted_at IS NULL
            AND LOWER(batch_no) = LOWER($3)
          LIMIT 1
          `,
          [perms.accountId, product.id, clean(it.batch_no) || `ORD-${order.order_number}`]
        );
        let batch = batchRs.rows?.[0];
        if (!batch) {
          const bIns = await q(
            `
            INSERT INTO product_batches (
              account_id, product_id, product_code, product_name, drug_name, batch_no, expiry_date,
              mrp, purchase_rate, sales_rate, retail_rate, current_stock, current_free_stock, packing, stockable, created_by_user_id
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,0,$12,true,$13)
            RETURNING *
            `,
            [
              perms.accountId,
              product.id,
              product.code,
              product.name,
              product.drug_name || null,
              clean(it.batch_no) || `ORD-${order.order_number}`,
              new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
              it.mrp || it.unit_price,
              it.unit_price,
              it.mrp || it.unit_price,
              it.mrp || it.unit_price,
              it.packing || null,
              actorId
            ]
          );
          batch = bIns.rows?.[0];
        }

        await q(
          `
          INSERT INTO purchase_invoice_items (
            account_id, purchase_invoice_id, product_id, product_code, product_name, drug_name, batch_id, batch_no, expiry_date,
            vendor_id, qty, free_qty, purchase_rate, mrp, discount_percent, discount_amount, gst_percent, gst_amount,
            taxable_amount, net_amount, line_amount
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)
          `,
          [
            perms.accountId,
            invoice.id,
            product.id,
            product.code,
            it.product_name,
            it.drug_name || null,
            batch.id,
            batch.batch_no,
            batch.expiry_date,
            vendor.id,
            qty,
            freeQty,
            unitPrice,
            it.mrp || it.unit_price,
            discountPercent,
            discountAmount,
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
          `UPDATE product_batches SET current_stock = current_stock + $2, current_free_stock = current_free_stock + $3, updated_at = now() WHERE id = $1`,
          [batch.id, qty, freeQty]
        );
        await q(
          `
          INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, note, ref_type, ref_id, created_by_user_id)
          VALUES ($1,$2,'PURCHASE',$3,$4,$5,'PURCHASE_INVOICE',$6,$7)
          `,
          [perms.accountId, batch.id, qty, freeQty, `From order ${order.order_number}`, invoice.id, actorId]
        );
      }

      await q(
        `
        UPDATE purchase_invoices
        SET subtotal = $2,
            total_discount = $3,
            total_gst = $4,
            total_amount = $5,
            balance_due = $5,
            updated_at = now()
        WHERE id = $1
        `,
        [invoice.id, invSubtotal, invDiscount, invGst, invTotal]
      );

      const up = await q(`UPDATE orders SET retailer_purchase_invoice_id = $2, updated_at = now() WHERE id = $1 RETURNING *`, [orderId, invoice.id]);
      return { order: up.rows?.[0], purchase_invoice_id: invoice.id };
    });
    if (out?.err) return out.err;
    return ok(out, { message: "Purchase invoice created from order." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to create purchase from order.");
  }
}

module.exports = { handler };

