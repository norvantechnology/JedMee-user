const bcrypt = require("bcryptjs");
const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { isEmailLike, isValidRole, normalizeEmail } = require("../../shared/validation");
const {
  parseTtlSeconds,
  secondsFromNow,
  randomToken,
  makeSalt,
  hashToken,
  signAccessToken
} = require("../../shared/tokens");

async function handler(event) {
  const body = parseJsonBody(event);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const role = body.role ? String(body.role || "").toUpperCase() : "";
  const rememberMe = Boolean(body.rememberMe);

  if (!email) return fail(400, "VALIDATION_ERROR", "email is required");
  if (!isEmailLike(email)) return fail(400, "VALIDATION_ERROR", "email is invalid");
  if (!password) return fail(400, "VALIDATION_ERROR", "password is required");
  if (role && !isValidRole(role)) return fail(400, "VALIDATION_ERROR", "role must be WHOLESALER or RETAILER");

  const result = await query(
    `
    SELECT
      u.id,
      r.code AS role,
      u.full_name,
      u.email,
      u.phone_country_code,
      u.phone_number,
      u.password_hash,
      u.email_verified,
      u.status,
      u.is_blocked,
      u.must_change_password,
      u.account_id,
      u.firm_name,
      u.gst_number,
      u.address,
      u.pin_code,
      u.city,
      u.state,
      u.drug_license_1_number,
      u.drug_license_2_number,
      u.gst_certificate_url,
      u.drug_license_1_url,
      u.drug_license_2_url,
      u.created_at
    FROM app_users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.email = $1
    ${role ? "AND r.code = $2" : ""}
    LIMIT 1
    `,
    role ? [email, role] : [email]
  );

  const row = result.rows[0];
  if (!row) return fail(401, "INVALID_CREDENTIALS", "Invalid email or password");

  const okPw = await bcrypt.compare(password, row.password_hash);
  if (!okPw) return fail(401, "INVALID_CREDENTIALS", "Invalid email or password");

  if (!row.email_verified) return fail(403, "EMAIL_NOT_VERIFIED", "Please verify your email OTP");

  if (row.is_blocked) return fail(403, "USER_BLOCKED", "Your account is blocked. Please contact support.");

  const accessTtl = parseTtlSeconds(process.env.ACCESS_TOKEN_TTL_SECONDS, 900);
  const refreshTtl = rememberMe
    ? parseTtlSeconds(process.env.REFRESH_TOKEN_TTL_REMEMBER_SECONDS, 30 * 24 * 60 * 60)
    : parseTtlSeconds(process.env.REFRESH_TOKEN_TTL_SECONDS, 24 * 60 * 60);

  const refreshToken = randomToken(32);
  const salt = makeSalt(16);
  const refreshHash = hashToken(refreshToken, salt);
  const refreshExpiresAt = secondsFromNow(refreshTtl);

  await query(
    `
    INSERT INTO user_sessions (user_id, refresh_token_hash, refresh_token_salt, expires_at, created_at, last_used_at, revoked_at)
    VALUES ($1, $2, $3, $4, now(), now(), NULL)
    ON CONFLICT (user_id) DO UPDATE
    SET
      refresh_token_hash = EXCLUDED.refresh_token_hash,
      refresh_token_salt = EXCLUDED.refresh_token_salt,
      expires_at = EXCLUDED.expires_at,
      created_at = now(),
      last_used_at = now(),
      revoked_at = NULL
    `,
    [row.id, refreshHash, salt, refreshExpiresAt]
  );

  const accessToken = signAccessToken({ sub: row.id, email: row.email, role: row.role }, accessTtl);

  const user = {
    id: row.id,
    role: row.role,
    full_name: row.full_name,
    email: row.email,
    phone_country_code: row.phone_country_code,
    phone_number: row.phone_number,
    email_verified: row.email_verified,
    status: row.status,
    is_blocked: row.is_blocked,
    must_change_password: Boolean(row.must_change_password),
    account_id: row.account_id,
    firm_name: row.firm_name || null,
    gst_number: row.gst_number || null,
    address: row.address || null,
    pin_code: row.pin_code || null,
    city: row.city || null,
    state: row.state || null,
    drug_license_1_number: row.drug_license_1_number || null,
    drug_license_2_number: row.drug_license_2_number || null,
    gst_certificate_url: row.gst_certificate_url || null,
    drug_license_1_url: row.drug_license_1_url || null,
    drug_license_2_url: row.drug_license_2_url || null,
    created_at: row.created_at
  };

  return ok({
    user,
    tokens: {
      accessToken,
      accessExpiresInSec: accessTtl,
      refreshToken,
      refreshExpiresInSec: refreshTtl,
      rememberMe
    }
  });
}

module.exports = { handler };

