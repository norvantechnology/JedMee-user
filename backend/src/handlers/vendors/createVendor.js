const { created, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean, normalizeCountryCode, normalizePhoneNumber, normalizeVendorType, VENDOR_ROW_COLUMNS } = require("../../shared/vendorInput");
const { mapVendorPgError, logVendorPgError } = require("../../shared/vendorPgErrors");
const { mapDbConnectivityError } = require("../../shared/dbConnectivity");

function nextCodeFromRows(rows, fallbackPrefix) {
  const safePrefix = String(fallbackPrefix || "SUP").toUpperCase();
  const byPrefix = new Map();
  for (const r of rows || []) {
    const c = clean(r?.code || "").toUpperCase();
    if (!c) continue;
    const m = /^([A-Z_\-]*?)(\d+)$/.exec(c);
    if (!m) continue;
    const prefix = m[1] || safePrefix;
    const num = Number.parseInt(m[2], 10);
    if (!Number.isFinite(num)) continue;
    byPrefix.set(prefix, Math.max(byPrefix.get(prefix) || 0, num));
  }
  let chosenPrefix = safePrefix;
  if (byPrefix.size > 0) {
    const ranked = [...byPrefix.entries()].sort((a, b) => b[1] - a[1]);
    chosenPrefix = ranked[0][0] || safePrefix;
  }
  const next = (byPrefix.get(chosenPrefix) || 0) + 1;
  return `${chosenPrefix}${String(next).padStart(3, "0")}`;
}

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "ADD");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  try {
    const body = parseJsonBody(event);
    let code = clean(body.code).toUpperCase();
    const name = clean(body.name);
    const shortName = clean(body.shortName || body.short_name);
    const rackNumber = clean(body.rackNumber || body.rack_number);
    const mainCompany = clean(body.mainCompany || body.main_company);
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

    const mfgCompanyId = clean(body.mfgCompanyId || body.mfg_company_id);
    const vendorTypeRaw = body.vendorType ?? body.vendor_type;
    const vendorType = vendorTypeRaw === undefined || vendorTypeRaw === null || String(vendorTypeRaw).trim() === ""
      ? "WHOLESALER"
      : normalizeVendorType(vendorTypeRaw);
    if (vendorType === null) {
      return fail(400, "VALIDATION_ERROR", "vendorType must be one of WHOLESALER, DISTRIBUTOR, DIRECT_MFG, OTHER.");
    }

    if (!code) {
      const existing = await query(
        `SELECT code FROM vendors WHERE account_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1000`,
        [ctx.accountId]
      );
      code = nextCodeFromRows(existing.rows || [], "SUP");
    }
    if (code.length > 32) return fail(400, "VALIDATION_ERROR", "code must be <= 32 characters");
    if (!name) return fail(400, "VALIDATION_ERROR", "name is required");
    if (name.length < 2) return fail(400, "VALIDATION_ERROR", "name must be at least 2 characters.");
    if (name.length > 180) return fail(400, "VALIDATION_ERROR", "name must be <= 180 characters");

    if (mfgCompanyId) {
      const mc = await query(`SELECT id FROM mfg_companies WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [mfgCompanyId, ctx.accountId]);
      if (!mc.rows?.[0]) return fail(400, "VALIDATION_ERROR", "Invalid mfg company.", { subMessage: "Selected company was not found for this account." });
    }

    const anyPhone = Boolean(phoneNumber);
    if (anyPhone) {
      if (!phoneCountryCode) return fail(400, "VALIDATION_ERROR", "phoneCountryCode is invalid");
      if (!phoneNumber) return fail(400, "VALIDATION_ERROR", "phoneNumber must be 7 to 15 digits");
    }

    const ins = await query(
      `
      INSERT INTO vendors (
        account_id,
        code,
        name,
        short_name,
        rack_number,
        main_company,
        credit_days,
        mfg_company_id,
        vendor_type,
        phone_country_code,
        phone_number,
        email,
        address,
        notes,
        is_active,
        created_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING ${VENDOR_ROW_COLUMNS}
      `,
      [
        ctx.accountId,
        code,
        name,
        shortName || null,
        rackNumber || null,
        mainCompany || null,
        creditDays,
        mfgCompanyId || null,
        vendorType,
        phoneCountryCode || null,
        phoneNumber || null,
        email || null,
        address || null,
        notes || null,
        isActive,
        actorId
      ]
    );

    return created({ vendor: ins.rows[0] || null }, { message: "Vendor created.", subMessage: "Vendor has been added successfully." });
  } catch (e) {
    const net = mapDbConnectivityError(e);
    if (net) return net;
    logVendorPgError("create", e);
    const mapped = mapVendorPgError(e);
    if (mapped) return mapped;
    const msg = e && typeof e === "object" ? String(e.message || "") : "";
    if (msg.includes("vendors_account_code_key")) {
      return fail(409, "CODE_EXISTS", "Vendor code already exists", { subMessage: "Please use a different vendor code." });
    }
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
