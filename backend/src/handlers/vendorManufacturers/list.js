const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const vendorId = String(qs.vendor_id || qs.vendorId || "").trim() || null;
  const mfgId = String(qs.mfg_company_id || qs.mfgCompanyId || "").trim() || null;

  const params = [ctx.accountId];
  let where = "vm.account_id = $1";
  if (vendorId) {
    params.push(vendorId);
    where += ` AND vm.vendor_id = $${params.length}`;
  }
  if (mfgId) {
    params.push(mfgId);
    where += ` AND vm.mfg_company_id = $${params.length}`;
  }

  try {
    const res = await query(
      `
      SELECT
        vm.id, vm.account_id, vm.vendor_id, vm.mfg_company_id,
        vm.division_name, vm.notes, vm.created_at,
        v.name AS vendor_name, v.short_name AS vendor_short_name, v.phone_number AS vendor_phone, v.address AS vendor_address,
        mc.name AS mfg_name, mc.code AS mfg_code, mc.short_name AS mfg_short_name
      FROM vendor_manufacturers vm
      JOIN vendors v ON v.id = vm.vendor_id AND v.account_id = vm.account_id AND v.deleted_at IS NULL
      JOIN mfg_companies mc ON mc.id = vm.mfg_company_id AND mc.account_id = vm.account_id
      WHERE ${where}
      ORDER BY mc.name ASC, v.name ASC
      `,
      params
    );
    return ok({ vendorManufacturers: res.rows || [] });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
