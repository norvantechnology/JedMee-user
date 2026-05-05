const bcrypt = require("bcryptjs");
const { ok, created, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { isEmailLike, isValidRole, normalizeEmail, normalizeCountryCode, normalizePhoneNumber } = require("../../shared/validation");

function isNonEmpty(s, min = 1) {
  return String(s || "").trim().length >= min;
}

function isPinCode6(v) {
  return /^\d{6}$/.test(String(v || "").trim());
}

function isGstLike(v) {
  // Keep basic length check per requirement; can be strengthened later.
  return String(v || "").trim().length === 15;
}

function isUrlLike(v) {
  const s = String(v || "").trim();
  return /^https?:\/\/.+/i.test(s);
}

function fieldErrorsToFail(errors) {
  return fail(400, "VALIDATION_ERROR", "Validation failed", { fieldErrors: errors });
}

async function handler(event) {
  const body = parseJsonBody(event);

  const role = body.role ? String(body.role || "").toUpperCase() : "";
  const fullName = String(body.fullName || "").trim();
  const email = normalizeEmail(body.email);
  const phoneCountryCode = normalizeCountryCode(body.countryCode);
  const phoneNumber = normalizePhoneNumber(body.phoneNumber);
  const password = String(body.password || "");

  const firmName = String(body.firmName || "").trim();
  const address = String(body.address || "").trim();
  const pinCode = String(body.pinCode || "").trim();
  const city = String(body.city || "").trim();
  const state = String(body.state || "").trim();

  const gstNumber = String(body.gstNumber || "").trim();
  const dl1Number = String(body.drugLicense1Number || "").trim();
  const dl2Number = String(body.drugLicense2Number || "").trim();

  const gstCertUrl = String(body.gstCertificateUrl || "").trim();
  const dl1Url = String(body.drugLicense1Url || "").trim();
  const dl2Url = String(body.drugLicense2Url || "").trim();

  const errors = {};

  if (!role) errors.role = "role is required";
  else if (!isValidRole(role)) errors.role = "role must be WHOLESALER or RETAILER";

  if (!isNonEmpty(fullName, 2)) errors.fullName = "fullName must be at least 2 characters";
  if (!email) errors.email = "email is required";
  else if (!isEmailLike(email)) errors.email = "email is invalid";

  if (!/^\+\d{1,4}$/.test(String(phoneCountryCode || ""))) errors.countryCode = "countryCode is invalid";
  if (!phoneNumber) errors.phoneNumber = "phoneNumber is required";
  else if (!/^\d{7,15}$/.test(phoneNumber)) errors.phoneNumber = "phoneNumber must be 7 to 15 digits";

  if (!password) errors.password = "password is required";
  else if (password.length < 8) errors.password = "password must be at least 8 characters";

  if (!isNonEmpty(firmName, 2)) errors.firmName = "firmName is required";
  if (!isNonEmpty(address, 5)) errors.address = "address is required";
  if (!isPinCode6(pinCode)) errors.pinCode = "pinCode must be 6 digits";
  if (!isNonEmpty(city, 2)) errors.city = "city is required";
  if (!isNonEmpty(state, 2)) errors.state = "state is required";

  if (!gstNumber) errors.gstNumber = "gstNumber is required";
  else if (!isGstLike(gstNumber)) errors.gstNumber = "gstNumber must be 15 characters";

  if (!dl1Number) errors.drugLicense1Number = "drugLicense1Number is required";
  if (!dl2Number) errors.drugLicense2Number = "drugLicense2Number is required";

  if (!gstCertUrl) errors.gstCertificateUrl = "gstCertificateUrl is required";
  else if (!isUrlLike(gstCertUrl)) errors.gstCertificateUrl = "gstCertificateUrl must be a URL";
  if (!dl1Url) errors.drugLicense1Url = "drugLicense1Url is required";
  else if (!isUrlLike(dl1Url)) errors.drugLicense1Url = "drugLicense1Url must be a URL";
  if (!dl2Url) errors.drugLicense2Url = "drugLicense2Url is required";
  else if (!isUrlLike(dl2Url)) errors.drugLicense2Url = "drugLicense2Url must be a URL";

  if (Object.keys(errors).length) return fieldErrorsToFail(errors);

  // If email exists but is NOT verified, allow upsert/update.
  const existingRes = await query(
    `
    SELECT u.id, u.email_verified
    FROM app_users u
    WHERE u.email = $1
    LIMIT 1
    `,
    [email]
  );
  const existing = existingRes.rows[0] || null;

  // Uniqueness checks with field-level errors.
  // When upserting, allow the same user's own unique values.
  const excludeId = existing ? existing.id : null;
  const dup = await query(
    `
    SELECT
      (SELECT 1 FROM app_users WHERE phone_country_code = $1 AND phone_number = $2 ${excludeId ? "AND id <> $7" : ""} LIMIT 1) AS phone_dup,
      (SELECT 1 FROM app_users WHERE gst_number = $3 ${excludeId ? "AND id <> $7" : ""} LIMIT 1) AS gst_dup,
      (SELECT 1 FROM app_users WHERE drug_license_1_number = $4 ${excludeId ? "AND id <> $7" : ""} LIMIT 1) AS dl1_dup,
      (SELECT 1 FROM app_users WHERE drug_license_2_number = $5 ${excludeId ? "AND id <> $7" : ""} LIMIT 1) AS dl2_dup,
      (SELECT 1 FROM app_users WHERE email = $6 LIMIT 1) AS email_dup
    `,
    excludeId
      ? [phoneCountryCode, phoneNumber, gstNumber, dl1Number, dl2Number, email, excludeId]
      : [phoneCountryCode, phoneNumber, gstNumber, dl1Number, dl2Number, email]
  );
  const d = dup.rows[0] || {};
  const dupErrors = {};
  if (d.email_dup && (!existing || existing.email_verified)) dupErrors.email = "Email already registered";
  if (d.phone_dup) dupErrors.phoneNumber = "Phone number already registered";
  if (d.gst_dup) dupErrors.gstNumber = "GST number already registered";
  if (d.dl1_dup) dupErrors.drugLicense1Number = "Drug license 1 number already registered";
  if (d.dl2_dup) dupErrors.drugLicense2Number = "Drug license 2 number already registered";
  if (Object.keys(dupErrors).length) return fieldErrorsToFail(dupErrors);

  const roleRes = await query(`SELECT id, code FROM roles WHERE code = $1 LIMIT 1`, [role]);
  const roleRow = roleRes.rows[0];
  if (!roleRow) return fail(400, "VALIDATION_ERROR", "role must be WHOLESALER or RETAILER");

  const cost = Number(process.env.BCRYPT_COST || 12);
  const passwordHash = await bcrypt.hash(password, cost);

  if (existing && existing.email_verified) {
    return fieldErrorsToFail({ email: "Email already registered" });
  }

  if (existing) {
    const upd = await query(
      `
      UPDATE app_users
      SET
        role_id = $2,
        full_name = $3,
        phone_country_code = $4,
        phone_number = $5,
        password_hash = $6,
        firm_name = $7,
        address = $8,
        pin_code = $9,
        city = $10,
        state = $11,
        gst_number = $12,
        drug_license_1_number = $13,
        drug_license_2_number = $14,
        gst_certificate_url = $15,
        drug_license_1_url = $16,
        drug_license_2_url = $17,
        status = 'PENDING'
      WHERE id = $1
      RETURNING
        id, full_name, email, phone_country_code, phone_number,
        firm_name, address, pin_code, city, state,
        gst_number, drug_license_1_number, drug_license_2_number,
        gst_certificate_url, drug_license_1_url, drug_license_2_url,
        status, is_blocked, created_at, email_verified
      `,
      [
        existing.id,
        roleRow.id,
        fullName,
        phoneCountryCode,
        phoneNumber,
        passwordHash,
        firmName,
        address,
        pinCode,
        city,
        state,
        gstNumber,
        dl1Number,
        dl2Number,
        gstCertUrl,
        dl1Url,
        dl2Url
      ]
    );

    return ok(
      {
        user: {
          ...upd.rows[0],
          role: roleRow.code
        }
      },
      { message: "Registration draft updated. Please verify your email OTP to continue." }
    );
  }

  const ins = await query(
    `
    INSERT INTO app_users (
      role_id,
      full_name,
      email,
      phone_country_code,
      phone_number,
      password_hash,
      email_verified,
      firm_name,
      address,
      pin_code,
      city,
      state,
      gst_number,
      drug_license_1_number,
      drug_license_2_number,
      gst_certificate_url,
      drug_license_1_url,
      drug_license_2_url,
      status,
      is_blocked
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,false,
      $7,$8,$9,$10,$11,
      $12,$13,$14,
      $15,$16,$17,
      'PENDING', false
    )
    RETURNING
      id, full_name, email, phone_country_code, phone_number,
      firm_name, address, pin_code, city, state,
      gst_number, drug_license_1_number, drug_license_2_number,
      gst_certificate_url, drug_license_1_url, drug_license_2_url,
      status, is_blocked, created_at, email_verified
    `,
    [
      roleRow.id,
      fullName,
      email,
      phoneCountryCode,
      phoneNumber,
      passwordHash,
      firmName,
      address,
      pinCode,
      city,
      state,
      gstNumber,
      dl1Number,
      dl2Number,
      gstCertUrl,
      dl1Url,
      dl2Url
    ]
  );

  return created(
    {
      user: {
        ...ins.rows[0],
        role: roleRow.code
      }
    },
    { message: "Registration submitted successfully. Your account is pending approval. Please verify your email OTP." }
  );
}

module.exports = { handler };

