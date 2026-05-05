const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean, normalizeCountryCode, normalizePhoneNumber, normalizeVendorType, VENDOR_ROW_COLUMNS } = require("../../shared/vendorInput");
const { mapVendorPgError, logVendorPgError } = require("../../shared/vendorPgErrors");
const { mapDbConnectivityError } = require("../../shared/dbConnectivity");

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "UPDATE");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const id = String(getPathParam(event, "id") || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  try {
    const body = parseJsonBody(event);
    const patch = {};

    if (body.code !== undefined) {
      const code = clean(body.code).toUpperCase();
      if (!code) return fail(400, "VALIDATION_ERROR", "code cannot be empty");
      if (code.length > 32) return fail(400, "VALIDATION_ERROR", "code must be <= 32 characters");
      patch.code = code;
    }
    if (body.name !== undefined) {
      const name = clean(body.name);
      if (!name) return fail(400, "VALIDATION_ERROR", "name cannot be empty");
      if (name.length < 2) return fail(400, "VALIDATION_ERROR", "name must be at least 2 characters.");
      if (name.length > 180) return fail(400, "VALIDATION_ERROR", "name must be <= 180 characters");
      patch.name = name;
    }
    if (body.shortName !== undefined || body.short_name !== undefined) patch.short_name = clean(body.shortName ?? body.short_name) || null;
    if (body.rackNumber !== undefined || body.rack_number !== undefined) patch.rack_number = clean(body.rackNumber ?? body.rack_number) || null;
    if (body.mainCompany !== undefined || body.main_company !== undefined) patch.main_company = clean(body.mainCompany ?? body.main_company) || null;
    if (body.phoneCountryCode !== undefined || body.phone_country_code !== undefined) {
      const cc = normalizeCountryCode(body.phoneCountryCode ?? body.phone_country_code);
      if (!cc) return fail(400, "VALIDATION_ERROR", "phoneCountryCode is invalid");
      patch.phone_country_code = cc;
    }
    if (body.phoneNumber !== undefined || body.phone_number !== undefined) {
      const pn = normalizePhoneNumber(body.phoneNumber ?? body.phone_number);
      if (!pn) return fail(400, "VALIDATION_ERROR", "phoneNumber must be 7 to 15 digits");
      patch.phone_number = pn;
    }
    if (body.email !== undefined) patch.email = clean(body.email).toLowerCase() || null;
    if (body.address !== undefined) patch.address = clean(body.address) || null;
    if (body.notes !== undefined) patch.notes = clean(body.notes) || null;
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);

    if (body.creditDays !== undefined || body.credit_days !== undefined) {
      const raw = body.creditDays ?? body.credit_days;
      const cd = Number.parseInt(String(raw), 10);
      if (!Number.isFinite(cd) || cd < 0) return fail(400, "VALIDATION_ERROR", "creditDays must be a non-negative integer.");
      patch.credit_days = cd;
    }

    if (body.vendorType !== undefined || body.vendor_type !== undefined) {
      const vt = normalizeVendorType(body.vendorType ?? body.vendor_type);
      if (vt === null) {
        return fail(400, "VALIDATION_ERROR", "vendorType must be one of WHOLESALER, DISTRIBUTOR, DIRECT_MFG, OTHER.");
      }
      patch.vendor_type = vt;
    }

    if (body.mfgCompanyId !== undefined || body.mfg_company_id !== undefined) {
      const mid = clean(body.mfgCompanyId ?? body.mfg_company_id);
      if (!mid) {
        patch.mfg_company_id = null;
      } else {
        const mc = await query(`SELECT id FROM mfg_companies WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [mid, ctx.accountId]);
        if (!mc.rows?.[0]) return fail(400, "VALIDATION_ERROR", "Invalid mfg company.", { subMessage: "Selected company was not found for this account." });
        patch.mfg_company_id = mid;
      }
    }

    const wantsStructured =
      Object.prototype.hasOwnProperty.call(patch, "phone_country_code") ||
      Object.prototype.hasOwnProperty.call(patch, "phone_number");
    if (wantsStructured) {
      const existing = await query(
        `SELECT phone_country_code, phone_number FROM vendors WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [id, ctx.accountId]
      );
      if (!existing.rows[0]) return fail(404, "NOT_FOUND", "Vendor not found");
      const nextCc = patch.phone_country_code ?? existing.rows[0].phone_country_code ?? "";
      const nextPn = patch.phone_number ?? existing.rows[0].phone_number ?? "";
      if (!nextCc) return fail(400, "VALIDATION_ERROR", "phoneCountryCode is required");
      if (!nextPn) return fail(400, "VALIDATION_ERROR", "phoneNumber is required");
    }

    const fields = Object.keys(patch);
    if (!fields.length) return fail(400, "VALIDATION_ERROR", "No fields to update");

    const sets = fields.map((k, i) => `${k} = $${i + 3}`).join(", ");
    const values = fields.map((k) => patch[k]);

    const upd = await query(
      `
      UPDATE vendors
      SET ${sets}, updated_at = now()
      WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
      RETURNING ${VENDOR_ROW_COLUMNS}
      `,
      [id, ctx.accountId, ...values]
    );
    if (!upd.rows[0]) return fail(404, "NOT_FOUND", "Vendor not found");

    return ok(
      { vendor: upd.rows[0] },
      { message: "Vendor updated.", subMessage: "Your changes have been saved successfully." }
    );
  } catch (e) {
    const net = mapDbConnectivityError(e);
    if (net) return net;
    logVendorPgError("update", e);
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
