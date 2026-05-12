const { ok, fail } = require("../../shared/response");
const { query, withTransaction } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean, n, computeDerived, validate, computeExpiryStatus, normalizeLooseUnitNameForDb } = require("../../shared/productBatchCalc");
const { getMfgCompany } = require("../../shared/mfgCompanyPolicy");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");

function parseThresholdInput(v) {
  if (v === undefined || v === null || String(v).trim() === "") return { ok: true, value: 0 };
  const x = Number(v);
  if (!Number.isFinite(x) || x < 0) return { ok: false, value: 0 };
  return { ok: true, value: x };
}

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "UPDATE");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const roleCode = await getRoleCodeForAccount(ctx.accountId);
  const isRetailer = roleCode === "RETAILER";

  const id = String(getPathParam(event, "id") || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  const existing = await query(`SELECT * FROM product_batches WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, ctx.accountId]);
  const cur = existing.rows[0];
  if (!cur) return fail(404, "NOT_FOUND", "Item not found");

  const body = parseJsonBody(event);

  // Product-level fields are not editable from the batch form; load the product
  // and use it as the source of truth.
  const prodRes = await query(
    `SELECT * FROM products WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [cur.product_id, ctx.accountId]
  );
  const product = prodRes.rows?.[0];
  if (!product) return fail(400, "VALIDATION_ERROR", "Parent product is missing; cannot update the batch.");
  if (!product.division_id && !isRetailer) {
    return fail(400, "VALIDATION_ERROR", "Parent product has no division assigned.", {
      subMessage: "Open the product master and set a division before editing its batches."
    });
  }

  // Validate vendor if provided (supplier is batch-level, independent of division).
  const vendorId = body.vendorId !== undefined
    ? (body.vendorId ? String(body.vendorId).trim() : null)
    : (cur.vendor_id ? String(cur.vendor_id) : null);

  if (vendorId) {
    const vr = await query(
      `SELECT id FROM vendors WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [vendorId, ctx.accountId]
    );
    if (!vr.rows?.[0]) return fail(400, "VALIDATION_ERROR", "Invalid vendor.", { subMessage: "Selected vendor was not found for this account." });
  }

  // Batch-level inputs only (falling back to current row values for partial updates)
  const input = {
    productCode: product.code,
    productName: product.name,
    drugName: product.drug_name,
    batchNo: clean(body.batchNo ?? cur.batch_no),
    barcode: clean(body.barcode ?? cur.barcode),
    expiryDate: clean(body.expiryDate ?? String(cur.expiry_date || "").slice(0, 10)),
    mfgDate: clean(body.mfgDate ?? (cur.mfg_date ? String(cur.mfg_date).slice(0, 10) : "")),

    mrp: body.mrp ?? cur.mrp,
    purchaseRate: body.purchaseRate ?? cur.purchase_rate,
    salesRate: body.salesRate ?? cur.sales_rate,
    retailRate: body.retailRate ?? cur.retail_rate,
    specialRate1: body.specialRate1 !== undefined ? body.specialRate1 : cur.special_rate_1,
    specialRate2: body.specialRate2 !== undefined ? body.specialRate2 : cur.special_rate_2,
    looseStock: body.looseStock !== undefined ? body.looseStock : cur.loose_stock,
    looseUnitName: body.looseUnitName !== undefined ? body.looseUnitName : cur.loose_unit_name,
    netRate: body.netRate ?? cur.net_rate,

    discountSales: body.discountSales ?? cur.discount_sales,
    discountPurchase: body.discountPurchase ?? cur.discount_purchase,
    retailDiscountPercent: body.retailDiscountPercent ?? cur.retail_discount_percent,
    netDiscountPercent: body.netDiscountPercent ?? cur.net_discount_percent,

    openingStock: body.openingStock ?? cur.opening_stock,
    openStockFreeQty: body.openStockFreeQty ?? cur.open_stock_free_qty,

    isHold: body.isHold !== undefined ? Boolean(body.isHold) : Boolean(cur.is_hold),
    holdReason: clean(body.holdReason ?? body.hold_reason ?? cur.hold_reason),
    isNet: body.isNet !== undefined ? Boolean(body.isNet) : Boolean(cur.is_net),
    isNonEditableFreeQty:
      body.isNonEditableFreeQty !== undefined ? Boolean(body.isNonEditableFreeQty) : Boolean(cur.is_non_editable_free_qty),
    lowStockAlertEnabled:
      body.lowStockAlertEnabled !== undefined ? Boolean(body.lowStockAlertEnabled) : Boolean(cur.low_stock_alert_enabled),
    lowStockThreshold: body.lowStockThreshold !== undefined ? body.lowStockThreshold : cur.low_stock_threshold,

    // Product-level (from product row, used for validation/derivation only)
    salesGST: product.sales_gst,
    purchaseGST: product.purchase_gst,
    salesScheme: product.sales_scheme,
    schemeQtyPaid: product.scheme_qty_paid,
    schemeQtyFree: product.scheme_qty_free,
    packing: product.packing,
    bulkPack: product.bulk_pack,
    casePack: product.case_pack,
    conversionUnit: product.conversion_unit,
    stockable: product.stockable ?? true,
    isDiscountEnabled: product.is_discount_enabled ?? true,
    isControl: product.is_control ?? false,
    isHalfScheme: product.is_half_scheme ?? false
  };

  const lowStockThresholdParsed = parseThresholdInput(input.lowStockThreshold);
  if (!lowStockThresholdParsed.ok) {
    return fail(400, "VALIDATION_ERROR", "Batch low stock threshold must be a non-negative number.");
  }

  const errs = validate(input);
  if (errs.length) {
    const msg = String(errs[0] || "Validation error");
    const subMessage = msg.toLowerCase().includes("mrp") ? "Set MRP higher than sales rate, or reduce sales rate." : "Please review the highlighted fields and try again.";
    return fail(400, "VALIDATION_ERROR", msg, { details: errs, subMessage });
  }

  // If free-qty is locked (non-editable), refuse changes that affect it
  if (cur.is_non_editable_free_qty && body.openStockFreeQty !== undefined) {
    const curFree = Number(cur.open_stock_free_qty || 0);
    const newFree = Number(body.openStockFreeQty || 0);
    if (newFree !== curFree) {
      return fail(400, "VALIDATION_ERROR", "Free quantity fields cannot be edited for this batch.", {
        subMessage: "Disable non-editable free qty to change free quantity."
      });
    }
  }

  // Enforce mfg prevent_net_rate
  const mfg = product.mfg_company_id ? await getMfgCompany(ctx.accountId, product.mfg_company_id) : null;
  if (mfg?.prevent_net_rate) {
    input.isNet = false;
    input.netRate = undefined;
  }

  const d = computeDerived(input);
  const looseUnitNameStored = normalizeLooseUnitNameForDb(input.looseUnitName);

  try {
    const upd = await query(
      `
      UPDATE product_batches
      SET
        batch_no = $3,
        barcode = $4,
        expiry_date = $5,
        mfg_date = $6,
        mrp = $7,
        purchase_rate = $8,
        sales_rate = $9,
        retail_rate = $10,
        net_rate = $11,
        landing_cost = $12,
        discount_sales = $13,
        discount_purchase = $14,
        retail_discount_percent = $15,
        net_discount_percent = $16,
        opening_stock = $17,
        open_stock_free_qty = $18,
        is_hold = $19,
        hold_reason = $20,
        is_net = $21,
        is_non_editable_free_qty = $22,
        low_stock_alert_enabled = $23,
        low_stock_threshold = $24,
        -- refresh product-level snapshots from source-of-truth
        product_name = $25,
        drug_name = $26,
        division_id = $27,
        vendor_id = $46,
        packing = $28,
        bulk_pack = $29,
        case_pack = $30,
        conversion_unit = $31,
        stockable = $32,
        is_discount_enabled = $33,
        is_control = $34,
        is_half_scheme = $35,
        is_otc = $36,
        sales_gst = $37,
        purchase_gst = $38,
        sales_scheme = $39,
        scheme_qty_paid = $40,
        scheme_qty_free = $41,
        special_rate_1 = $42,
        special_rate_2 = $43,
        loose_stock = $44,
        loose_unit_name = $45,
        updated_at = now()
      WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
      RETURNING id
      `,
      [
        id,
        ctx.accountId,
        input.batchNo,
        input.barcode || null,
        input.expiryDate,
        input.mfgDate || null,
        n(input.mrp) || null,
        n(input.purchaseRate) || null,
        n(input.salesRate) || null,
        n(d.retailRate) || null,
        n(d.netRate) || null,
        n(d.landingCost) || null,
        n(d.discountSales) || null,
        n(input.discountPurchase) || null,
        n(input.retailDiscountPercent) || null,
        n(input.netDiscountPercent) || null,
        n(input.openingStock) || null,
        n(input.openStockFreeQty) || null,
        Boolean(input.isHold),
        input.holdReason || null,
        Boolean(input.isNet),
        Boolean(input.isNonEditableFreeQty),
        Boolean(input.lowStockAlertEnabled),
        lowStockThresholdParsed.value,
        product.name,
        product.drug_name || null,
        product.division_id || null,
        product.packing || null,
        product.bulk_pack || null,
        product.case_pack || null,
        n(product.conversion_unit) || null,
        Boolean(product.stockable ?? true),
        Boolean(product.is_discount_enabled ?? true),
        Boolean(product.is_control ?? false),
        Boolean(product.is_half_scheme ?? false),
        product.is_otc !== undefined ? Boolean(product.is_otc) : true,
        n(product.sales_gst) || null,
        n(product.purchase_gst) || null,
        product.sales_scheme || null,
        n(product.scheme_qty_paid) || null,
        n(product.scheme_qty_free) || null,
        n(input.specialRate1) || null,
        n(input.specialRate2) || null,
        n(input.looseStock) || 0,
        looseUnitNameStored,
        vendorId || null
      ]
    );
    if (!upd.rows[0]) return fail(404, "NOT_FOUND", "Item not found");

    // Opening stock ledger handling: only editable if no other txn exists.
    const newOpening = n(input.openingStock) || 0;
    const newOpeningFree = n(input.openStockFreeQty) || 0;
    const curOpening = Number(cur.opening_stock || 0);
    const curOpeningFree = Number(cur.open_stock_free_qty || 0);
    const openingChanged = Number(newOpening) !== curOpening || Number(newOpeningFree) !== curOpeningFree;

    if (openingChanged) {
      const otherTxnRes = await query(
        `SELECT 1 FROM inventory_txns
         WHERE account_id = $1 AND batch_id = $2 AND txn_type::text <> 'OPENING'
         LIMIT 1`,
        [ctx.accountId, id]
      );
      if (otherTxnRes.rows?.length) {
        return fail(400, "OPENING_STOCK_FROZEN", "Opening stock cannot be edited after transactions have been posted.", {
          subMessage: "Create an inventory adjustment entry to correct the stock."
        });
      }

      await withTransaction(async (q) => {
        await q(`SET LOCAL medico.allow_txn_delete = 'on'`);
        await q(`DELETE FROM inventory_txns WHERE account_id = $1 AND batch_id = $2 AND txn_type::text = 'OPENING'`, [ctx.accountId, id]);
        await q(
          `
          INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, note, created_by_user_id)
          VALUES ($1, $2, 'OPENING', $3, $4, $5, $6)
          `,
          [ctx.accountId, id, newOpening, newOpeningFree, "Opening stock (corrected)", actorId]
        );
      });
    }

    const row = await query(
      `
      SELECT
        pb.*,
        (COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0)) AS total_stock,
        (
          COALESCE(pb.low_stock_alert_enabled, false)
          AND (COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0)) <= COALESCE(pb.low_stock_threshold, 0)
        ) AS batch_low_stock
      FROM product_batches pb
      LEFT JOIN (
        SELECT
          batch_id,
          SUM(COALESCE(qty, 0))::numeric(12,3) AS qty,
          SUM(COALESCE(free_qty, 0))::numeric(12,3) AS free_qty
        FROM inventory_txns
        WHERE account_id = $2 AND batch_id = $1
        GROUP BY batch_id
      ) st ON st.batch_id = pb.id
      WHERE pb.id = $1
      LIMIT 1
      `,
      [id, ctx.accountId]
    );

    const item = row.rows[0] || null;
    if (item) item.expiry_status = computeExpiryStatus(item.expiry_date);
    await refreshLowStockNotifications(ctx.accountId, [String(id)]);
    return ok({ item }, { message: "Quality master updated.", subMessage: "Your changes have been saved successfully." });
  } catch (e) {
    const code = String(e.code || "");
    const constraint = String(e.constraint || "");
    if (code === "23505") {
      if (constraint.includes("product_batches_account_barcode_key")) return fail(409, "BARCODE_EXISTS", "Barcode already exists");
      if (constraint.includes("product_batches_account_product_batch_key")) return fail(409, "BATCH_EXISTS", "Batch No already exists for this product");
    }
    console.error("[productBatches:update]", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
