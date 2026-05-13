const { created, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { assertProductNameUniquePerMfg } = require("../../shared/productUniqueness");
const { buildProductFields, clean } = require("../../shared/productFields");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");

async function nextProductCode(accountId) {
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
  return `PRD-${String(max + 1).padStart(4, "0")}`;
}

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "ADD");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const name = clean(body.name);
  if (name.length < 2) return fail(400, "VALIDATION_ERROR", "Product name is required (at least 2 characters).");

  const roleCode = await getRoleCodeForAccount(ctx.accountId);
  const isRetailer = roleCode === "RETAILER";
  const normalized = await buildProductFields(body, ctx.accountId, {
    partial: false,
    requireDivision: !isRetailer
  });
  if (!normalized.ok) return fail(400, normalized.error.code, normalized.error.message);
  const values = normalized.values;
  values.name = name;

  let code = clean(body.code || body.productCode);
  if (!code) code = await nextProductCode(ctx.accountId);

  const dup = await query(
    `SELECT id FROM products WHERE account_id = $1 AND lower(code) = lower($2) AND deleted_at IS NULL LIMIT 1`,
    [ctx.accountId, code]
  );
  if (dup.rows?.[0]) {
    return fail(400, "VALIDATION_ERROR", "A product with this code already exists.", { subMessage: "Use a different code or leave blank to auto-generate." });
  }

  const mfgCompanyId = values.mfg_company_id || null;
  const nameUnique = await assertProductNameUniquePerMfg(ctx.accountId, name, mfgCompanyId, null);
  if (!nameUnique.ok) return fail(400, "VALIDATION_ERROR", nameUnique.message);

  try {
    const ins = await query(
      `INSERT INTO products (
         account_id, code, name, drug_name,
         division_id, mfg_company_id,
         packing, bulk_pack, case_pack, units_per_strip, conversion_unit,
         stockable, is_discount_enabled, is_control, is_half_scheme, is_otc,
         sales_gst, purchase_gst,
         sales_scheme, scheme_qty_paid, scheme_qty_free,
         hsn_code, rack_location,
         low_stock_alert_enabled, low_stock_threshold,
         created_by_user_id
       )
       VALUES (
         $1, $2, $3, $4,
         $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16,
         $17, $18,
         $19, $20, $21,
         $22, $23,
         $24, $25,
         $26
       )
       RETURNING *`,
      [
        ctx.accountId,
        code,
        name,
        values.drug_name ?? null,
        values.division_id ?? null,
        mfgCompanyId,
        values.packing ?? null,
        values.bulk_pack ?? null,
        values.case_pack ?? null,
        values.units_per_strip != null ? Math.max(1, Number(values.units_per_strip) || 1) : 1,
        values.conversion_unit ?? null,
        values.stockable ?? true,
        values.is_discount_enabled ?? true,
        values.is_control ?? false,
        values.is_half_scheme ?? false,
        values.is_otc !== undefined ? values.is_otc : true,
        values.sales_gst ?? null,
        values.purchase_gst ?? null,
        values.sales_scheme ?? null,
        values.scheme_qty_paid ?? null,
        values.scheme_qty_free ?? null,
        values.hsn_code ?? null,
        values.rack_location ?? null,
        values.low_stock_alert_enabled ?? false,
        values.low_stock_threshold ?? 0,
        actorId
      ]
    );
    const row = ins.rows?.[0];
    if (!row) return fail(500, "INTERNAL_ERROR", "Failed to create product.");

    const enriched = await query(
      `
      SELECT
        p.*,
        m.name AS mfg_company_name,
        m.short_name AS mfg_short_name,
        COALESCE(m.purchase_order_lock, false) AS mfg_purchase_order_lock,
        COALESCE(m.sale_lock, false) AS mfg_sale_lock,
        COALESCE(m.prevent_discount, false) AS mfg_prevent_discount,
        COALESCE(m.prevent_free_qty, false) AS mfg_prevent_free_qty,
        COALESCE(m.prevent_net_rate, false) AS mfg_prevent_net_rate,
        d.name AS division_name,
        d.code AS division_code,
        COALESCE(d.is_active, true) AS division_is_active,
        0::int AS active_batch_count,
        0::numeric(12,3) AS total_quantity,
        0::int AS low_batch_count,
        (
          COALESCE(p.low_stock_alert_enabled, false)
          AND 0::numeric(12,3) <= COALESCE(p.low_stock_threshold, 0)
        ) AS product_low_stock
      FROM products p
      LEFT JOIN mfg_companies m
        ON m.id = p.mfg_company_id
       AND m.account_id = p.account_id
       AND m.deleted_at IS NULL
      LEFT JOIN divisions d
        ON d.id = p.division_id
       AND d.account_id = p.account_id
       AND d.deleted_at IS NULL
      WHERE p.id = $1 AND p.account_id = $2
      LIMIT 1
      `,
      [row.id, ctx.accountId]
    );

    return created({ product: enriched.rows?.[0] || row }, { message: "Product created.", subMessage: "Add batches when you receive stock or use Add batch." });
  } catch (e) {
    console.error("[products:create]", e);
    const code = String(e.code || "");
    const constraint = String(e.constraint || "");
    if (code === "23505") {
      if (constraint.includes("products_name_per_mfg_unique")) return fail(409, "NAME_EXISTS", "Another product with this name already exists under the same manufacturer.");
      if (constraint.includes("products_account_code_key")) return fail(409, "CODE_EXISTS", "Product code already exists.");
    }
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
