const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { clean } = require("../../shared/purchase");
const { normalizeCountryCode, normalizePhoneNumber } = require("../../shared/vendorInput");

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

async function handler(event) {
  const auth = await requirePermission(event, "DIVISIONS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const id = String(getPathParam(event, "id") || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  const body = parseJsonBody(event);
  const patch = {};
  if (body.code !== undefined) {
    const c = clean(body.code).toUpperCase().replace(/\s+/g, "");
    if (!c) return fail(400, "VALIDATION_ERROR", "code cannot be empty");
    patch.code = c;
  }
  if (body.name !== undefined) {
    const n = clean(body.name);
    if (n.length < 2) return fail(400, "VALIDATION_ERROR", "name must be at least 2 characters.");
    patch.name = n;
  }
  if (body.shortName !== undefined || body.short_name !== undefined) patch.short_name = clean(body.shortName ?? body.short_name) || null;
  if (body.mfgCompanyId !== undefined || body.mfg_company_id !== undefined) {
    const mid = clean(body.mfgCompanyId ?? body.mfg_company_id);
    if (!mid) return fail(400, "VALIDATION_ERROR", "mfgCompanyId cannot be cleared.");
    const mc = await query(`SELECT id FROM mfg_companies WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [mid, ctx.accountId]);
    if (!mc.rows?.[0]) return fail(400, "VALIDATION_ERROR", "Invalid mfg company.");
    patch.mfg_company_id = mid;
  }
  if (body.creditDays !== undefined || body.credit_days !== undefined) {
    const cd = Number.parseInt(String(body.creditDays ?? body.credit_days), 10);
    if (!Number.isFinite(cd) || cd < 0) return fail(400, "VALIDATION_ERROR", "creditDays invalid.");
    patch.credit_days = cd;
  }
  if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);
  if (body.email !== undefined) patch.email = clean(body.email).toLowerCase() || null;
  if (body.address !== undefined) patch.address = clean(body.address) || null;
  if (body.notes !== undefined) patch.notes = clean(body.notes) || null;
  if (body.phoneCountryCode !== undefined || body.phone_country_code !== undefined) {
    patch.phone_country_code = normalizeCountryCode(body.phoneCountryCode ?? body.phone_country_code) || null;
  }
  if (body.phoneNumber !== undefined || body.phone_number !== undefined) {
    patch.phone_number = normalizePhoneNumber(body.phoneNumber ?? body.phone_number) || null;
  }

  if (!Object.keys(patch).length) return fail(400, "VALIDATION_ERROR", "No fields to update.");

  const sets = [];
  const args = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k} = $${i++}`);
    args.push(v);
  }
  sets.push("updated_at = now()");
  sets.push(`updated_by_user_id = $${i++}`);
  args.push(actorId);
  args.push(id, ctx.accountId);

  try {
    const u = await query(
      `UPDATE divisions SET ${sets.join(", ")} WHERE id = $${i++} AND account_id = $${i++} AND deleted_at IS NULL RETURNING id`,
      args
    );
    if (!u.rows?.[0]) return fail(404, "NOT_FOUND", "Division not found.");
    const r = await query(
      `SELECT d.*, m.name AS mfg_company_name FROM divisions d
       INNER JOIN mfg_companies m ON m.id = d.mfg_company_id AND m.account_id = d.account_id
       WHERE d.id = $1 LIMIT 1`,
      [id]
    );
    return ok({ division: r.rows?.[0] }, { message: "Division updated." });
  } catch (e) {
    if (String(e.code || "") === "23505") return fail(409, "DUPLICATE", "Code or name conflict.");
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
