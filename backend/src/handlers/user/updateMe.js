const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireAuth } = require("../../shared/auth");
const { parseJsonBody } = require("../../shared/request");
const { normalizeCountryCode, normalizePhoneNumber } = require("../../shared/validation");

function cleanName(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

function cleanText(v, maxLen) {
  const s = String(v || "").trim();
  if (!s) return "";
  const trimmed = s.length > maxLen ? s.slice(0, maxLen) : s;
  return trimmed;
}

function isGstLike(v) {
  return String(v || "").trim().length === 15;
}

function isUrlLike(v) {
  const s = String(v || "").trim();
  if (!s) return false;
  return /^https?:\/\/.+/i.test(s);
}

async function handler(event) {
  const auth = requireAuth(event);
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  if (!userId) return fail(401, "UNAUTHORIZED", "Invalid access token");

  const body = parseJsonBody(event);

  const patch = {};
  if (body.fullName !== undefined || body.full_name !== undefined) {
    const nm = cleanName(body.fullName ?? body.full_name);
    if (!nm || nm.length < 2) return fail(400, "VALIDATION_ERROR", "fullName must be at least 2 characters");
    patch.full_name = nm;
  }

  // Phone: if either present, require both and validate
  const ccRaw = body.phoneCountryCode ?? body.phone_country_code;
  const pnRaw = body.phoneNumber ?? body.phone_number;
  const wantsPhone = ccRaw !== undefined || pnRaw !== undefined;
  if (wantsPhone) {
    const cc = normalizeCountryCode(ccRaw || "");
    const pn = normalizePhoneNumber(pnRaw || "");
    if (!cc || !/^\+\d{1,4}$/.test(cc)) return fail(400, "VALIDATION_ERROR", "phoneCountryCode is invalid");
    if (!pn || !/^\d{7,15}$/.test(pn)) return fail(400, "VALIDATION_ERROR", "phoneNumber must be 7 to 15 digits");

    // Phone uniqueness across users
    const dupPhone = await query(
      `SELECT 1 FROM app_users WHERE phone_country_code = $1 AND phone_number = $2 AND id <> $3 LIMIT 1`,
      [cc, pn, userId]
    );
    if (dupPhone.rows[0]) return fail(409, "PHONE_EXISTS", "Phone already registered");

    patch.phone_country_code = cc;
    patch.phone_number = pn;
  }

  if (body.address !== undefined) patch.address = cleanText(body.address, 240) || null;
  if (body.city !== undefined) patch.city = cleanText(body.city, 80) || null;
  if (body.state !== undefined) patch.state = cleanText(body.state, 80) || null;
  if (body.pinCode !== undefined || body.pin_code !== undefined) {
    const pc = cleanText(body.pinCode ?? body.pin_code, 16);
    if (pc && !/^[A-Za-z0-9\- ]{3,16}$/.test(pc)) return fail(400, "VALIDATION_ERROR", "pinCode is invalid");
    patch.pin_code = pc || null;
  }
  if (body.firmName !== undefined || body.firm_name !== undefined) patch.firm_name = cleanText(body.firmName ?? body.firm_name, 180) || null;

  if (body.gstNumber !== undefined || body.gst_number !== undefined) {
    const gst = cleanText(body.gstNumber ?? body.gst_number, 32);
    if (gst && !isGstLike(gst)) return fail(400, "VALIDATION_ERROR", "gstNumber must be 15 characters");
    if (gst) {
      const dupGst = await query(`SELECT 1 FROM app_users WHERE gst_number = $1 AND id <> $2 LIMIT 1`, [gst, userId]);
      if (dupGst.rows[0]) return fail(409, "GST_EXISTS", "GST number already registered");
    }
    patch.gst_number = gst || null;
  }

  if (body.drugLicense1Number !== undefined || body.drug_license_1_number !== undefined) {
    const v = cleanText(body.drugLicense1Number ?? body.drug_license_1_number, 80);
    if (v) {
      const dup = await query(`SELECT 1 FROM app_users WHERE drug_license_1_number = $1 AND id <> $2 LIMIT 1`, [v, userId]);
      if (dup.rows[0]) return fail(409, "DL1_EXISTS", "Drug license 1 number already registered");
    }
    patch.drug_license_1_number = v || null;
  }

  if (body.drugLicense2Number !== undefined || body.drug_license_2_number !== undefined) {
    const v = cleanText(body.drugLicense2Number ?? body.drug_license_2_number, 80);
    if (v) {
      const dup = await query(`SELECT 1 FROM app_users WHERE drug_license_2_number = $1 AND id <> $2 LIMIT 1`, [v, userId]);
      if (dup.rows[0]) return fail(409, "DL2_EXISTS", "Drug license 2 number already registered");
    }
    patch.drug_license_2_number = v || null;
  }

  if (body.gstCertificateUrl !== undefined || body.gst_certificate_url !== undefined) {
    const v = cleanText(body.gstCertificateUrl ?? body.gst_certificate_url, 500);
    if (v && !isUrlLike(v)) return fail(400, "VALIDATION_ERROR", "gstCertificateUrl must be a URL");
    patch.gst_certificate_url = v || null;
  }

  if (body.drugLicense1Url !== undefined || body.drug_license_1_url !== undefined) {
    const v = cleanText(body.drugLicense1Url ?? body.drug_license_1_url, 500);
    if (v && !isUrlLike(v)) return fail(400, "VALIDATION_ERROR", "drugLicense1Url must be a URL");
    patch.drug_license_1_url = v || null;
  }

  if (body.drugLicense2Url !== undefined || body.drug_license_2_url !== undefined) {
    const v = cleanText(body.drugLicense2Url ?? body.drug_license_2_url, 500);
    if (v && !isUrlLike(v)) return fail(400, "VALIDATION_ERROR", "drugLicense2Url must be a URL");
    patch.drug_license_2_url = v || null;
  }

  const fields = Object.keys(patch);
  if (!fields.length) return fail(400, "VALIDATION_ERROR", "No fields to update");

  const sets = fields.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = fields.map((k) => patch[k]);

  const upd = await query(
    `
    UPDATE app_users
    SET ${sets}
    WHERE id = $1
    RETURNING
      id,
      full_name,
      email,
      email_verified,
      phone_country_code,
      phone_number,
      firm_name,
      address,
      city,
      state,
      pin_code,
      gst_number,
      drug_license_1_number,
      drug_license_2_number,
      gst_certificate_url,
      drug_license_1_url,
      drug_license_2_url,
      status,
      is_blocked,
      created_at
    `,
    [userId, ...values]
  );

  return ok(
    {
      user: upd.rows[0] || null
    },
    { message: "Profile updated." }
  );
}

module.exports = { handler };

