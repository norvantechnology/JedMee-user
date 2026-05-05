const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { normalizeCountryCode, normalizePhoneNumber } = require("../../shared/validation");

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

function cleanName(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

async function handler(event) {
  const auth = await requirePermission(event, "USERS", "UPDATE");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const userId = String(getPathParam(event, "id") || "").trim();
  if (!userId) return fail(400, "VALIDATION_ERROR", "id is required");

  // Never allow updating the account owner from sub-user/user management APIs.
  const ownerCheck = await query(`SELECT 1 FROM app_users WHERE id = $1 AND account_id = id LIMIT 1`, [userId]);
  if (ownerCheck.rows[0]) {
    return fail(403, "FORBIDDEN", "You cannot update the account owner.", { subMessage: "Ask the owner to update their own profile." });
  }

  // Target must belong to same account
  const targetCheck = await query(`SELECT 1 FROM app_users WHERE id = $1 AND account_id = $2 LIMIT 1`, [userId, ctx.accountId]);
  if (!targetCheck.rows[0]) return fail(404, "NOT_FOUND", "User not found");

  const body = parseJsonBody(event);

  const patch = {};
  if (body.fullName !== undefined || body.full_name !== undefined) {
    const nm = cleanName(body.fullName ?? body.full_name);
    if (!nm || nm.length < 2) return fail(400, "VALIDATION_ERROR", "fullName must be at least 2 characters");
    patch.full_name = nm;
  }

  const ccRaw = body.phoneCountryCode ?? body.phone_country_code;
  const pnRaw = body.phoneNumber ?? body.phone_number;
  const wantsPhone = ccRaw !== undefined || pnRaw !== undefined;
  if (wantsPhone) {
    const cc = normalizeCountryCode(ccRaw || "");
    const pn = normalizePhoneNumber(pnRaw || "");
    if (!cc || !/^\+\d{1,4}$/.test(cc)) return fail(400, "VALIDATION_ERROR", "phoneCountryCode is invalid");
    if (!pn || !/^\d{7,15}$/.test(pn)) return fail(400, "VALIDATION_ERROR", "phoneNumber must be 7 to 15 digits");

    const dupPhone = await query(
      `SELECT 1 FROM app_users WHERE phone_country_code = $1 AND phone_number = $2 AND id <> $3 LIMIT 1`,
      [cc, pn, userId]
    );
    if (dupPhone.rows[0]) {
      return fail(409, "PHONE_EXISTS", "Phone already registered", { subMessage: "Please use a different phone number." });
    }

    patch.phone_country_code = cc;
    patch.phone_number = pn;
  }

  const fields = Object.keys(patch);
  if (!fields.length) return fail(400, "VALIDATION_ERROR", "No fields to update");

  const sets = fields.map((k, i) => `${k} = $${i + 3}`).join(", ");
  const values = fields.map((k) => patch[k]);

  const upd = await query(
    `
    UPDATE app_users
    SET ${sets}, updated_at = now()
    WHERE id = $1 AND account_id = $2
    RETURNING id, full_name, phone_country_code, phone_number
    `,
    [userId, ctx.accountId, ...values]
  );
  if (!upd.rows[0]) return fail(404, "NOT_FOUND", "User not found");

  return ok({ user: upd.rows[0] }, { message: "User updated.", subMessage: "Your changes have been saved successfully." });
}

module.exports = { handler };

