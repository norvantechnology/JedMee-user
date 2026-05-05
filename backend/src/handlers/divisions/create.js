const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { clean } = require("../../shared/purchase");
const { normalizeCountryCode, normalizePhoneNumber } = require("../../shared/vendorInput");
const { nextDivisionCode } = require("../../shared/divisionsCore");

async function handler(event) {
  const auth = await requirePermission(event, "DIVISIONS", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  let code = clean(body.code).toUpperCase().replace(/\s+/g, "");
  const name = clean(body.name);
  const shortName = clean(body.shortName || body.short_name);
  const mfgCompanyId = clean(body.mfgCompanyId || body.mfg_company_id);
  const phoneCountryCode = normalizeCountryCode(body.phoneCountryCode || body.phone_country_code || "");
  const phoneNumber = normalizePhoneNumber(body.phoneNumber || body.phone_number || "");
  const email = clean(body.email).toLowerCase();
  const address = clean(body.address);
  const notes = clean(body.notes);
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
  const creditDaysRaw = body.creditDays ?? body.credit_days;
  let creditDays = 0;
  if (creditDaysRaw !== undefined && creditDaysRaw !== null && String(creditDaysRaw).trim() !== "") {
    const cd = Number.parseInt(String(creditDaysRaw), 10);
    if (!Number.isFinite(cd) || cd < 0) return fail(400, "VALIDATION_ERROR", "creditDays must be a non-negative integer.");
    creditDays = cd;
  }

  if (!name || name.length < 2) return fail(400, "VALIDATION_ERROR", "name must be at least 2 characters.");
  if (!mfgCompanyId) return fail(400, "VALIDATION_ERROR", "mfgCompanyId is required.");

  const anyPhone =
    Boolean(body.phoneCountryCode) ||
    Boolean(body.phoneNumber) ||
    Boolean(body.phone_country_code) ||
    Boolean(body.phone_number);
  if (anyPhone) {
    if (!phoneCountryCode) return fail(400, "VALIDATION_ERROR", "phoneCountryCode is invalid");
    if (!phoneNumber) return fail(400, "VALIDATION_ERROR", "phoneNumber must be 7 to 15 digits");
  }

  try {
    const data = await withTransaction(async (q) => {
      const mc = await q(`SELECT id FROM mfg_companies WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [
        mfgCompanyId,
        ctx.accountId
      ]);
      if (!mc.rows?.[0]) return { err: fail(400, "VALIDATION_ERROR", "Invalid mfg company.") };

      if (!code) code = await nextDivisionCode(q, ctx.accountId);
      if (code.length > 48) return { err: fail(400, "VALIDATION_ERROR", "code must be <= 48 characters") };

      const ins = await q(
        `
        INSERT INTO divisions (
          account_id, code, name, short_name, mfg_company_id,
          phone_country_code, phone_number, email, address, notes,
          credit_days, is_active, created_by_user_id, updated_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
        RETURNING *
        `,
        [
          ctx.accountId,
          code,
          name,
          shortName || null,
          mfgCompanyId,
          phoneCountryCode || null,
          phoneNumber || null,
          email || null,
          address || null,
          notes || null,
          creditDays,
          isActive,
          actorId
        ]
      );
      const row = ins.rows?.[0];
      const enriched = await q(
        `SELECT d.*, m.name AS mfg_company_name FROM divisions d
         INNER JOIN mfg_companies m ON m.id = d.mfg_company_id AND m.account_id = d.account_id
         WHERE d.id = $1 LIMIT 1`,
        [row.id]
      );
      return { division: enriched.rows?.[0] || row };
    });
    if (data?.err) return data.err;
    return created(data, { message: "Division created." });
  } catch (e) {
    if (String(e.code || "") === "23505") return fail(409, "DUPLICATE", "Code or name already exists for this manufacturer.");
    // eslint-disable-next-line no-console
    console.error("[divisions:create]", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
