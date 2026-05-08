const { created, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean, n, computeDerived, validate, computeExpiryStatus, normalizeLooseUnitNameForDb } = require("../../shared/productBatchCalc");
const { getMfgCompany } = require("../../shared/mfgCompanyPolicy");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");
const { assertProductNameUniquePerMfg } = require("../../shared/productUniqueness");
const { buildProductFields } = require("../../shared/productFields");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");

function parseThresholdInput(v) {
  if (v === undefined || v === null || String(v).trim() === "") return { ok: true, value: 0 };
  const x = Number(v);
  if (!Number.isFinite(x) || x < 0) return { ok: false, value: 0 };
  return { ok: true, value: x };
}

async function nextCode(accountId) {
  const r = await query(
    `
    SELECT code
    FROM products
    WHERE account_id = $1
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 250
    `,
    [accountId]
  );
  let max = 0;
  for (const row of r.rows || []) {
    const s = String(row.code || "").trim().toUpperCase();
    const m = s.match(/^PRD-(\d{4,})$/);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  const next = max + 1;
  return `PRD-${String(next).padStart(4, "0")}`;
}

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "ADD");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const roleCode = await getRoleCodeForAccount(ctx.accountId);
  const isRetailer = roleCode === "RETAILER";

  const body = parseJsonBody(event);
  const input = {
    productId: clean(body.productId || body.product_id),
    productCode: clean(body.productCode),
    productName: clean(body.productName),
    drugName: clean(body.drugName),
    batchNo: clean(body.batchNo),
    barcode: clean(body.barcode),
    expiryDate: clean(body.expiryDate),
    mfgDate: clean(body.mfgDate),

    mrp: body.mrp,
    purchaseRate: body.purchaseRate,
    salesRate: body.salesRate,
    retailRate: body.retailRate,
    specialRate1: body.specialRate1,
    specialRate2: body.specialRate2,
    netRate: body.netRate,
    landingCost: body.landingCost,
    looseStock: body.looseStock,
    looseUnitName: body.looseUnitName,

    discountSales: body.discountSales,
    discountPurchase: body.discountPurchase,
    retailDiscountPercent: body.retailDiscountPercent,
    netDiscountPercent: body.netDiscountPercent,

    openingStock: body.openingStock,
    openStockFreeQty: body.openStockFreeQty,

    isHold: Boolean(body.isHold),
    holdReason: clean(body.holdReason || body.hold_reason),
    isNet: Boolean(body.isNet),
    isNonEditableFreeQty: Boolean(body.isNonEditableFreeQty),
    lowStockAlertEnabled: body.lowStockAlertEnabled !== undefined ? Boolean(body.lowStockAlertEnabled) : false,
    lowStockThreshold: body.lowStockThreshold
  };

  const lowStockThresholdParsed = parseThresholdInput(input.lowStockThreshold);
  if (!lowStockThresholdParsed.ok) {
    return fail(400, "VALIDATION_ERROR", "Batch low stock threshold must be a non-negative number.");
  }

  // Resolve product: by productId first, else by productCode
  let product = null;
  if (input.productId) {
    const r = await query(
      `SELECT * FROM products WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [input.productId, ctx.accountId]
    );
    product = r.rows?.[0] || null;
    if (!product) return fail(400, "VALIDATION_ERROR", "Selected product not found.");
  } else if (input.productCode) {
    const r = await query(
      `SELECT * FROM products WHERE account_id = $1 AND lower(code) = lower($2) AND deleted_at IS NULL LIMIT 1`,
      [ctx.accountId, input.productCode]
    );
    product = r.rows?.[0] || null;
  }

  const productCode = product?.code || input.productCode || (await nextCode(ctx.accountId));
  const vendorId = body.vendorId ? String(body.vendorId).trim() : "";

  // Backward-compat: callers may still pass division/mfg at batch level (e.g. legacy forms,
  // or when auto-creating a product from the batch flow). If a product exists, product wins.
  let divisionId = clean(body.divisionId);
  let mfgCompanyId = clean(body.mfgCompanyId);

  if (product) {
    if (!product.division_id && !isRetailer) {
      return fail(400, "VALIDATION_ERROR", "Selected product has no division assigned.", {
        subMessage: "Open the product master and set a division before adding batches."
      });
    }
    divisionId = product.division_id ? String(product.division_id) : "";
    mfgCompanyId = product.mfg_company_id ? String(product.mfg_company_id) : mfgCompanyId;
  } else {
    // Auto-create path: division is mandatory for wholesaler, optional for retailer.
    if (!divisionId && !isRetailer) {
      return fail(400, "VALIDATION_ERROR", "Division is required.", {
        subMessage: "Select a division for the product before adding a batch."
      });
    }
    if (divisionId) {
      const d = await query(
        `SELECT id, mfg_company_id, is_active FROM divisions WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [divisionId, ctx.accountId]
      );
      if (!d.rows?.[0]) return fail(400, "VALIDATION_ERROR", "Invalid division.", { subMessage: "Selected division was not found for this account." });
      if (d.rows[0].is_active === false) {
        return fail(400, "VALIDATION_ERROR", "Selected division is inactive.", { subMessage: "Activate the division first." });
      }
      mfgCompanyId = String(d.rows[0].mfg_company_id || "");
    }
    if (vendorId) {
      const v = await query(`SELECT id FROM vendors WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [vendorId, ctx.accountId]);
      if (!v.rows?.[0]) return fail(400, "VALIDATION_ERROR", "Invalid vendor.", { subMessage: "Selected vendor was not found for this account." });
    }
    if (mfgCompanyId) {
      const c = await query(`SELECT id FROM mfg_companies WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [mfgCompanyId, ctx.accountId]);
      if (!c.rows?.[0]) return fail(400, "VALIDATION_ERROR", "Invalid mfg company.", { subMessage: "Selected manufacturing company was not found for this account." });
    }
  }

  // Upsert product (when a matching product wasn't found)
  let productId = product?.id ? String(product.id) : "";
  if (!productId) {
    const baseValidate = { ...input, productCode };
    const errs = validate(baseValidate);
    if (errs.length) {
      const msg = String(errs[0] || "Validation error");
      return fail(400, "VALIDATION_ERROR", msg, { details: errs });
    }
    // Allow passing full product-level payload (GST/scheme/packing/flags) when auto-creating
    const normalized = await buildProductFields(body, ctx.accountId, {
      partial: false,
      requireDivision: !isRetailer
    });
    if (!normalized.ok) return fail(400, normalized.error.code, normalized.error.message);
    const pvals = normalized.values;

    const effectiveMfg = pvals.mfg_company_id ?? (mfgCompanyId || null);
    const nu = await assertProductNameUniquePerMfg(ctx.accountId, input.productName, effectiveMfg, null);
    if (!nu.ok) return fail(400, "VALIDATION_ERROR", nu.message);

    const insProd = await query(
      `INSERT INTO products (
         account_id, code, name, drug_name,
         division_id, mfg_company_id,
         packing, bulk_pack, case_pack, conversion_unit,
         stockable, is_discount_enabled, is_control, is_half_scheme, is_otc,
         sales_gst, purchase_gst,
         sales_scheme, scheme_qty_paid, scheme_qty_free,
         created_by_user_id
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        ctx.accountId,
        productCode,
        input.productName,
        input.drugName || null,
        pvals.division_id ?? (divisionId || null),
        effectiveMfg,
        pvals.packing ?? null,
        pvals.bulk_pack ?? null,
        pvals.case_pack ?? null,
        pvals.conversion_unit ?? null,
        pvals.stockable ?? true,
        pvals.is_discount_enabled ?? true,
        pvals.is_control ?? false,
        pvals.is_half_scheme ?? false,
        pvals.is_otc !== undefined ? pvals.is_otc : true,
        pvals.sales_gst ?? null,
        pvals.purchase_gst ?? null,
        pvals.sales_scheme ?? null,
        pvals.scheme_qty_paid ?? null,
        pvals.scheme_qty_free ?? null,
        actorId
      ]
    );
    product = insProd.rows?.[0] || null;
    productId = product?.id ? String(product.id) : "";
  }
  if (!productId || !product) return fail(500, "INTERNAL_ERROR", "Failed to resolve product.");

  // Full validation  product-level fields come from the product row
  const mergedForValidation = {
    ...input,
    productCode,
    productName: product.name,
    drugName: product.drug_name,
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
  const errs = validate(mergedForValidation);
  if (errs.length) {
    const msg = String(errs[0] || "Validation error");
    const subMessage = msg.toLowerCase().includes("mrp") ? "Set MRP higher than sales rate, or reduce sales rate." : "Please review the highlighted fields and try again.";
    return fail(400, "VALIDATION_ERROR", msg, { details: errs, subMessage });
  }

  // Mfg policy: prevent_net_rate forces system-calculated net rate
  const mfg = product.mfg_company_id ? await getMfgCompany(ctx.accountId, product.mfg_company_id) : null;
  if (mfg?.prevent_net_rate) {
    mergedForValidation.isNet = false;
    mergedForValidation.netRate = undefined;
  }

  const d = computeDerived(mergedForValidation);
  const looseUnitNameStored = normalizeLooseUnitNameForDb(input.looseUnitName);

  try {
    // NOTE: product-level columns (packing, gst, scheme, flags, stockable, conversion_unit,
    // is_*, etc.) are still written as snapshots on the batch for backward compatibility
    // with existing reports. Source-of-truth is the `products` table; new code should
    // prefer reading those values from there.
    const ins = await query(
      `
      INSERT INTO product_batches (
        account_id,
        product_id,
        vendor_id,
        division_id,
        product_code,
        product_name,
        drug_name,
        batch_no,
        barcode,
        expiry_date,
        mfg_date,
        mrp,
        purchase_rate,
        sales_rate,
        retail_rate,
        net_rate,
        landing_cost,
        discount_sales,
        discount_purchase,
        retail_discount_percent,
        net_discount_percent,
        sales_scheme,
        scheme_qty_paid,
        scheme_qty_free,
        sales_gst,
        purchase_gst,
        opening_stock,
        open_stock_free_qty,
        stockable,
        conversion_unit,
        packing,
        bulk_pack,
        case_pack,
        is_discount_enabled,
        is_hold,
        hold_reason,
        is_half_scheme,
        is_net,
        is_non_editable_free_qty,
        is_control,
        is_otc,
        low_stock_alert_enabled,
        low_stock_threshold,
        special_rate_1,
        special_rate_2,
        loose_stock,
        loose_unit_name,
        created_by_user_id
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48
      )
      RETURNING id
      `,
      [
        ctx.accountId,
        productId,
        product.division_id ? null : vendorId || null,
        product.division_id || null,
        productCode,
        product.name,
        product.drug_name || null,
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
        product.sales_scheme || null,
        n(product.scheme_qty_paid) || null,
        n(product.scheme_qty_free) || null,
        n(product.sales_gst) || null,
        n(product.purchase_gst) || null,
        n(input.openingStock) || null,
        n(input.openStockFreeQty) || null,
        Boolean(product.stockable ?? true),
        n(product.conversion_unit) || null, // legacy numeric column retained for compat
        product.packing || null,
        product.bulk_pack || null,
        product.case_pack || null,
        Boolean(product.is_discount_enabled ?? true),
        Boolean(input.isHold),
        input.holdReason || null,
        Boolean(product.is_half_scheme ?? false),
        Boolean(mergedForValidation.isNet),
        Boolean(input.isNonEditableFreeQty),
        Boolean(product.is_control ?? false),
        product.is_otc !== undefined ? Boolean(product.is_otc) : true,
        Boolean(input.lowStockAlertEnabled),
        lowStockThresholdParsed.value,
        n(input.specialRate1) || null,
        n(input.specialRate2) || null,
        n(input.looseStock) || 0,
        looseUnitNameStored,
        actorId
      ]
    );

    const id = ins.rows[0]?.id;
    await query(
      `
      INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, note, created_by_user_id)
      VALUES ($1, $2, 'OPENING', $3, $4, $5, $6)
      `,
      [ctx.accountId, id, n(input.openingStock) || 0, n(input.openStockFreeQty) || 0, "Opening stock", actorId]
    );
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
    return created({ item }, { message: "Quality master created.", subMessage: "Record has been added successfully." });
  } catch (e) {
    const code = String(e.code || "");
    const constraint = String(e.constraint || "");
    if (code === "23505") {
      if (constraint.includes("product_batches_account_barcode_key")) return fail(409, "BARCODE_EXISTS", "Barcode already exists");
      if (constraint.includes("product_batches_account_product_batch_key")) return fail(409, "BATCH_EXISTS", "Batch No already exists for this product");
      if (constraint.includes("products_account_code_key")) return fail(409, "CODE_EXISTS", "Product code already exists");
    }
    console.error("[productBatches:create]", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
