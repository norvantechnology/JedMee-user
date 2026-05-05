const bcrypt = require("bcryptjs");
const { created, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { isEmailLike, isValidRole, normalizeCountryCode, normalizeEmail, normalizePhoneNumber } = require("../../shared/validation");

async function handler(event) {
  const body = parseJsonBody(event);
  const role = String(body.role || "").toUpperCase();
  const fullName = String(body.fullName || "").trim();
  const email = normalizeEmail(body.email);
  const countryCode = normalizeCountryCode(body.countryCode);
  const phoneNumber = normalizePhoneNumber(body.phoneNumber);
  const password = String(body.password || "");

  if (!isValidRole(role)) return fail(400, "VALIDATION_ERROR", "role must be WHOLESALER or RETAILER");
  if (!fullName) return fail(400, "VALIDATION_ERROR", "fullName is required");
  if (!email) return fail(400, "VALIDATION_ERROR", "email is required");
  if (!isEmailLike(email)) return fail(400, "VALIDATION_ERROR", "email is invalid");
  if (!countryCode || !/^\+\d{1,4}$/.test(countryCode)) return fail(400, "VALIDATION_ERROR", "countryCode is invalid");
  if (!phoneNumber || !/^\d{7,15}$/.test(phoneNumber)) return fail(400, "VALIDATION_ERROR", "phoneNumber is invalid");
  if (password.length < 8) return fail(400, "VALIDATION_ERROR", "password must be at least 8 characters");

  const cost = Number(process.env.BCRYPT_COST || 12);
  const passwordHash = await bcrypt.hash(password, cost);

  try {
    const roleRes = await query(`SELECT id, code FROM roles WHERE code = $1 LIMIT 1`, [role]);
    const roleRow = roleRes.rows[0];
    if (!roleRow) return fail(400, "VALIDATION_ERROR", "role must be WHOLESALER or RETAILER");

    // If email already exists but is NOT verified, allow updating details (upsert).
    // If email is verified, block signup (must login instead).
    const result = await query(
      `
      INSERT INTO app_users (role_id, full_name, email, phone_country_code, phone_number, password_hash, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6, false)
      ON CONFLICT (email) DO UPDATE
      SET
        role_id = EXCLUDED.role_id,
        full_name = EXCLUDED.full_name,
        phone_country_code = EXCLUDED.phone_country_code,
        phone_number = EXCLUDED.phone_number,
        password_hash = EXCLUDED.password_hash,
        email_verified = false
      WHERE app_users.email_verified = false
      RETURNING id, role_id, full_name, email, phone_country_code, phone_number, email_verified, created_at
      `,
      [roleRow.id, fullName, email, countryCode, phoneNumber, passwordHash]
    );

    const userRow = result.rows[0];
    if (!userRow) {
      // Conflict happened but row was verified, so we didn't update it.
      return fail(409, "EMAIL_EXISTS_VERIFIED", "Email already registered. Please login.");
    }
    return created({
      user: {
        ...userRow,
        role: roleRow.code
      }
    });
  } catch (e) {
    const msg = e && typeof e === "object" ? String(e.message || "") : "";
    if (msg.includes("app_users_email_key")) return fail(409, "EMAIL_EXISTS_VERIFIED", "Email already registered. Please login.");
    if (msg.includes("app_users_phone_key")) return fail(409, "PHONE_EXISTS", "phone already exists");
    return fail(500, "INTERNAL_ERROR", "internal_error");
  }
}

module.exports = { handler };

