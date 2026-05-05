const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { resolveDivisionForAccount } = require("../../shared/productFields");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");

function clean(v) {
  return String(v ?? "").trim();
}

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const name = clean(qs.name);
  let mfgCompanyId = clean(qs.mfg_company_id || qs.mfgCompanyId);
  const divisionId = clean(qs.division_id || qs.divisionId);
  const excludeId = clean(qs.exclude_id || qs.excludeId);
  if (!name) return fail(400, "VALIDATION_ERROR", "name is required");

  if (!mfgCompanyId && divisionId) {
    const d = await resolveDivisionForAccount(ctx.accountId, divisionId);
    if (d?.mfg_company_id) mfgCompanyId = String(d.mfg_company_id);
  }

  const roleCode = await getRoleCodeForAccount(ctx.accountId);
  const isRetailer = roleCode === "RETAILER";

  if (!mfgCompanyId) {
    if (!isRetailer) {
      return ok({
        available: true,
        manufacturer_required: true,
        existing_product: null
      });
    }
    // Retailer flow: enforce account-wide name uniqueness on rows with no mfg.
    try {
      const rs = await query(
        `SELECT id, code, name, division_id
         FROM products
         WHERE account_id = $1
           AND mfg_company_id IS NULL
           AND deleted_at IS NULL
           AND lower(name) = lower($2)
           AND ($3 = '' OR id::text <> $3)
         LIMIT 1`,
        [ctx.accountId, name, excludeId]
      );
      const existing = rs.rows?.[0] || null;
      return ok({ available: !existing, existing_product: existing });
    } catch {
      return fail(500, "INTERNAL_ERROR", "Something went wrong.");
    }
  }

  try {
    const rs = await query(
      `SELECT id, code, name, division_id
       FROM products
       WHERE account_id = $1
         AND mfg_company_id = $2
         AND deleted_at IS NULL
         AND lower(name) = lower($3)
         AND ($4 = '' OR id::text <> $4)
       LIMIT 1`,
      [ctx.accountId, mfgCompanyId, name, excludeId]
    );
    const existing = rs.rows?.[0] || null;
    return ok({
      available: !existing,
      existing_product: existing
    });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.");
  }
}

module.exports = { handler };
