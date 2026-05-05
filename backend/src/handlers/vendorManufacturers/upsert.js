const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function clean(v) {
  return String(v ?? "").trim();
}

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const vendorId = clean(body.vendorId || body.vendor_id);
  const mfgId = clean(body.mfgCompanyId || body.mfg_company_id);
  if (!vendorId) return fail(400, "VALIDATION_ERROR", "vendorId is required.");
  if (!mfgId) return fail(400, "VALIDATION_ERROR", "mfgCompanyId is required.");

  const divisionName = clean(body.divisionName || body.division_name) || null;
  const notes = clean(body.notes) || null;

  try {
    const v = await query(
      `SELECT id FROM vendors WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [vendorId, ctx.accountId]
    );
    if (!v.rows?.[0]) return fail(404, "NOT_FOUND", "Vendor not found.");

    const mc = await query(
      `SELECT id FROM mfg_companies WHERE id = $1 AND account_id = $2 LIMIT 1`,
      [mfgId, ctx.accountId]
    );
    if (!mc.rows?.[0]) return fail(404, "NOT_FOUND", "Manufacturer not found.");

    const res = await query(
      `
      INSERT INTO vendor_manufacturers (account_id, vendor_id, mfg_company_id, division_name, notes)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (account_id, vendor_id, mfg_company_id) DO UPDATE
        SET division_name = COALESCE(EXCLUDED.division_name, vendor_manufacturers.division_name),
            notes         = COALESCE(EXCLUDED.notes, vendor_manufacturers.notes)
      RETURNING *
      `,
      [ctx.accountId, vendorId, mfgId, divisionName, notes]
    );
    return ok({ vendorManufacturer: res.rows?.[0] || null });
  } catch (e) {
    // Avoid unused actorId lint while keeping the variable for future audit columns.
    void actorId;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
