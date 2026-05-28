const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction, query } = require("../../shared/db");
const { clean, n, round2, getAccountContextForUser, getAccountProfile, nextOrderNumber, createInAppNotification } = require("./_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const actor = await getAccountContextForUser(actorId);
  if (String(actor?.role_code || "").toUpperCase() !== "RETAILER") {
    return fail(403, "FORBIDDEN", "Only retailers can place orders.");
  }

  const body = parseJsonBody(event);
  const wholesalerAccountId = clean(body.wholesaler_account_id || body.wholesalerAccountId);
  const items = Array.isArray(body.items) ? body.items : [];
  const retailerNotes      = clean(body.retailer_notes    || body.retailerNotes)   || null;
  const deliveryAddressRaw = clean(body.delivery_address  || body.deliveryAddress) || null;
  const deliveryPhoneRaw   = clean(body.delivery_phone    || body.deliveryPhone)   || null;
  const deliveryCityRaw    = clean(body.delivery_city     || body.deliveryCity)    || null;
  const deliveryPincodeRaw = clean(body.delivery_pincode  || body.deliveryPincode) || null;
  const deliveryStateRaw   = clean(body.delivery_state    || body.deliveryState)   || null;
  const deliveryCountryRaw = clean(body.delivery_country  || body.deliveryCountry) || null;

  if (!wholesalerAccountId) return fail(400, "VALIDATION_ERROR", "wholesaler_account_id is required.");
  if (String(wholesalerAccountId) === String(perms.accountId)) return fail(400, "VALIDATION_ERROR", "Wholesaler cannot be same as retailer.");
  if (!items.length) return fail(400, "VALIDATION_ERROR", "At least one item is required.");

  const wholesaler = await getAccountProfile(wholesalerAccountId);
  if (!wholesaler || String(wholesaler.role_code || "").toUpperCase() !== "WHOLESALER") {
    return fail(400, "VALIDATION_ERROR", "Invalid wholesaler account.");
  }

  const link = await query(
    `
    SELECT *
    FROM wholesaler_retailer_links
    WHERE wholesaler_account_id = $1
      AND retailer_account_id = $2
      AND status = 'ACTIVE'
    LIMIT 1
    `,
    [wholesalerAccountId, perms.accountId]
  );
  const retailerDiscount = n(link.rows?.[0]?.discount_percent || 0);

  const catalogIds = [...new Set(items.map((x) => clean(x.catalog_id || x.catalogId)).filter(Boolean))];
  if (!catalogIds.length) return fail(400, "VALIDATION_ERROR", "catalog_id is required for each line.");

  const cat = await query(
    `
    SELECT
      wc.*,
      p.code AS product_code,
      p.name AS product_name,
      p.drug_name,
      p.packing AS product_packing,
      p.sales_gst
    FROM wholesaler_catalog wc
    JOIN products p ON p.id = wc.product_id AND p.account_id = wc.account_id AND p.deleted_at IS NULL
    WHERE wc.account_id = $1
      AND wc.is_visible = true
      AND wc.id = ANY($2::uuid[])
    `,
    [wholesalerAccountId, catalogIds]
  );
  if ((cat.rows || []).length !== catalogIds.length) {
    return fail(400, "VALIDATION_ERROR", "One or more products are unavailable in catalog.");
  }

  const lineByCatalog = new Map((cat.rows || []).map((x) => [String(x.id), x]));
  const out = [];
  for (const raw of items) {
    const catalogId = clean(raw.catalog_id || raw.catalogId);
    const qty = Math.max(0, Number(raw.qty || raw.quantity || 0) || 0);
    const c = lineByCatalog.get(catalogId);
    if (!c) return fail(400, "VALIDATION_ERROR", "Invalid catalog item.");
    if (!(qty > 0)) return fail(400, "VALIDATION_ERROR", `Quantity must be > 0 for ${c.product_name}.`);
    if (qty < Number(c.min_order_qty || 1)) return fail(400, "VALIDATION_ERROR", `Minimum quantity for ${c.product_name} is ${c.min_order_qty}.`);
    if (c.max_order_qty && qty > Number(c.max_order_qty)) return fail(400, "VALIDATION_ERROR", `Maximum quantity for ${c.product_name} is ${c.max_order_qty}.`);

    const gross = n(c.catalog_price) * qty;
    const discountAmount = round2(gross * (retailerDiscount / 100));
    const taxableAmount = round2(gross - discountAmount);
    const gstPercent = n(c.sales_gst);
    const gstAmount = round2(taxableAmount * (gstPercent / 100));
    const lineTotal = round2(taxableAmount + gstAmount);
    out.push({
      catalog_id: c.id,
      product_id: c.product_id,
      product_code: c.product_code,
      product_name: c.product_name,
      drug_name: c.drug_name || null,
      packing: c.packing || c.product_packing || null,
      ordered_qty: qty,
      unit_price: round2(c.catalog_price),
      mrp: c.mrp != null ? round2(c.mrp) : null,
      discount_percent: retailerDiscount,
      discount_amount: discountAmount,
      taxable_amount: taxableAmount,
      gst_percent: gstPercent,
      gst_amount: gstAmount,
      line_total: lineTotal
    });
  }

  const subtotal = round2(out.reduce((s, x) => s + n(x.unit_price) * n(x.ordered_qty), 0));
  const totalDiscount = round2(out.reduce((s, x) => s + n(x.discount_amount), 0));
  const totalGst = round2(out.reduce((s, x) => s + n(x.gst_amount), 0));
  const totalAmount = round2(out.reduce((s, x) => s + n(x.line_total), 0));

  // Fallback delivery fields to retailer's profile values
  const deliveryAddress = deliveryAddressRaw || clean(actor?.address)                   || null;
  const deliveryPhone   = deliveryPhoneRaw   || clean(actor?.phone_number)              || null;
  const deliveryCity    = deliveryCityRaw    || clean(actor?.city)                      || null;
  const deliveryPincode = deliveryPincodeRaw || clean(actor?.pin_code)                  || null;
  const deliveryState   = deliveryStateRaw   || clean(actor?.state)                     || null;
  const deliveryCountry = deliveryCountryRaw || clean(actor?.preferred_country_code)    || null;
  const retailerGstNumber = clean(actor?.gst_number) || null;

  try {
    const data = await withTransaction(async (q) => {
      const orderNumber = await nextOrderNumber(q, wholesalerAccountId);
      const orderIns = await q(
        `
        INSERT INTO orders (
          order_number, retailer_account_id, retailer_firm_name,
          wholesaler_account_id, wholesaler_firm_name, status,
          subtotal, total_discount, total_gst, total_amount, retailer_notes,
          delivery_address, delivery_phone, retailer_gst_number,
          delivery_city, delivery_pincode, delivery_state, delivery_country
        )
        VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING *
        `,
        [
          orderNumber,
          perms.accountId,
          clean(actor?.firm_name) || clean(actor?.full_name) || "Retailer",
          wholesalerAccountId,
          clean(wholesaler?.firm_name) || clean(wholesaler?.full_name) || "Wholesaler",
          subtotal,
          totalDiscount,
          totalGst,
          totalAmount,
          retailerNotes,
          deliveryAddress,
          deliveryPhone,
          retailerGstNumber,
          deliveryCity,
          deliveryPincode,
          deliveryState,
          deliveryCountry
        ]
      );
      const order = orderIns.rows?.[0];

      for (const it of out) {
        await q(
          `
          INSERT INTO order_items (
            order_id, account_id, catalog_id, product_id, product_code, product_name, drug_name, packing,
            ordered_qty, unit_price, mrp, discount_percent, discount_amount, gst_percent, gst_amount, taxable_amount, line_total
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          `,
          [
            order.id,
            wholesalerAccountId,
            it.catalog_id,
            it.product_id,
            it.product_code,
            it.product_name,
            it.drug_name,
            it.packing,
            it.ordered_qty,
            it.unit_price,
            it.mrp,
            it.discount_percent,
            it.discount_amount,
            it.gst_percent,
            it.gst_amount,
            it.taxable_amount,
            it.line_total
          ]
        );
      }

      await createInAppNotification(
        q,
        wholesalerAccountId,
        wholesalerAccountId,
        "NEW_ORDER",
        `New order received – ${order.order_number}`,
        `${clean(actor?.firm_name) || clean(actor?.full_name) || "A retailer"} just placed an order worth ₹${totalAmount.toFixed(2)}.`,
        { order_id: order.id },
        `/orders/${order.id}`,
        "View order"
      );
      return { order };
    });
    if (data?.err) return data.err;
    return created(data, { message: "Order placed." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to place order.");
  }
}

module.exports = { handler };

