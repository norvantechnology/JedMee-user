const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { isEmailLike, normalizeEmail } = require("../../shared/validation");
const { verifyOtpHash } = require("../../shared/otp");
const { checkRateLimit, lambdaClientIp } = require("../../shared/rateLimiter");
const {
  parseTtlSeconds,
  secondsFromNow,
  randomToken,
  makeSalt,
  hashToken,
  signAccessToken
} = require("../../shared/tokens");

async function ensureAccountRoleBootstrap(userId, roleCode) {
  const role = String(roleCode || "").toUpperCase() === "RETAILER" ? "RETAILER" : "WHOLESALER";

  await query(
    `
    INSERT INTO account_settings (
      account_id,
      business_type,
      default_billing_mode,
      default_sales_rate_type,
      require_prescription_for_control,
      show_mrp_on_invoice,
      auto_create_walk_in_customer
    )
    VALUES (
      $1,
      $2,
      CASE WHEN $2 = 'RETAILER' THEN 'QUICK' ELSE 'STANDARD' END,
      CASE WHEN $2 = 'RETAILER' THEN 'RETAIL_RATE' ELSE 'SALES_RATE' END,
      CASE WHEN $2 = 'RETAILER' THEN true ELSE false END,
      true,
      CASE WHEN $2 = 'RETAILER' THEN true ELSE false END
    )
    ON CONFLICT (account_id) DO NOTHING
    `,
    [userId, role]
  );

  if (role !== "RETAILER") return;

  const walkRes = await query(
    `
    WITH existing AS (
      SELECT id
      FROM customers
      WHERE account_id = $1
        AND is_walk_in = true
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    ),
    inserted AS (
      INSERT INTO customers (
        account_id, code, name, short_name,
        customer_type, is_cash_customer, is_walk_in, is_active,
        credit_days, credit_limit
      )
      SELECT
        $1, 'WALK-IN', 'Walk-in / Counter Sale', 'Walk-in',
        'PATIENT'::customer_type_enum, true, true, true, 0, 0
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id
    )
    SELECT id FROM existing
    UNION ALL
    SELECT id FROM inserted
    LIMIT 1
    `,
    [userId]
  );
  const walkInId = walkRes.rows?.[0]?.id || null;
  if (!walkInId) return;

  await query(
    `
    UPDATE account_settings
    SET
      business_type = 'RETAILER',
      auto_create_walk_in_customer = true,
      default_billing_mode = 'QUICK',
      default_sales_rate_type = 'RETAIL_RATE',
      walk_in_customer_id = COALESCE(walk_in_customer_id, $2)
    WHERE account_id = $1
    `,
    [userId, walkInId]
  );
}

async function handler(event) {
  const limited = checkRateLimit('otp', lambdaClientIp(event));
  if (limited) return fail(429, 'RATE_LIMITED', limited.message);

  const body = parseJsonBody(event);
  const email = normalizeEmail(body.email);
  const otp = String(body.otp || "").trim();
  const rememberMe = Boolean(body.rememberMe);

  if (!email) return fail(400, "VALIDATION_ERROR", "email is required");
  if (!isEmailLike(email)) return fail(400, "VALIDATION_ERROR", "email is invalid");
  if (!otp) return fail(400, "VALIDATION_ERROR", "otp is required");
  if (!/^\d{6}$/.test(otp)) return fail(400, "VALIDATION_ERROR", "otp must be 6 digits");

  const tokRes = await query(
    `
    SELECT t.otp_hash, t.otp_salt, t.expires_at, u.id AS user_id
    FROM email_verification_otps t
    INNER JOIN app_users u ON u.id = t.user_id
    WHERE u.email = $1 AND u.email_verified = false
    LIMIT 1
    `,
    [email]
  );
  const tok = tokRes.rows[0];
  if (!tok) return fail(400, "INVALID_OTP", "Invalid or expired verification code. Request a new code.");
  if (new Date(tok.expires_at).getTime() < Date.now()) {
    await query(`DELETE FROM email_verification_otps WHERE user_id = $1`, [tok.user_id]);
    return fail(400, "OTP_EXPIRED", "Code expired. Request a new OTP.");
  }
  if (!verifyOtpHash(otp, tok.otp_salt, tok.otp_hash)) {
    return fail(400, "INVALID_OTP", "Invalid verification code.");
  }

  await query(`DELETE FROM email_verification_otps WHERE user_id = $1`, [tok.user_id]);

  const updated = await query(
    `
    UPDATE app_users
    SET email_verified = true
    WHERE id = $1 AND email_verified = false
    RETURNING id, email_verified
    `,
    [tok.user_id]
  );

  if (!updated.rows[0]) return fail(404, "NOT_FOUND", "User not found");

  // Fetch user + role + approval status so we can issue tokens immediately.
  const userRes = await query(
    `
    SELECT
      u.id,
      r.code AS role,
      u.full_name,
      u.email,
      u.phone_country_code,
      u.phone_number,
      u.email_verified,
      u.status,
      u.is_blocked,
      u.created_at
    FROM app_users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.email = $1
    LIMIT 1
    `,
    [email]
  );
  const row = userRes.rows[0];
  if (!row) return fail(404, "NOT_FOUND", "User not found");

  // Check blocked BEFORE bootstrapping so blocked users don't get account data created.
  if (row.is_blocked) return fail(403, "USER_BLOCKED", "Your account is blocked. Please contact support.");

  // Only bootstrap account settings / walk-in customer for APPROVED users.
  // PENDING users will be bootstrapped when an admin approves them.
  if (String(row.status || "").toUpperCase() === "APPROVED") {
    await ensureAccountRoleBootstrap(row.id, row.role);
  }

  const accessTtl = parseTtlSeconds(process.env.ACCESS_TOKEN_TTL_SECONDS, 24 * 60 * 60);
  const refreshTtl = rememberMe
    ? parseTtlSeconds(process.env.REFRESH_TOKEN_TTL_REMEMBER_SECONDS, 90 * 24 * 60 * 60)
    : parseTtlSeconds(process.env.REFRESH_TOKEN_TTL_SECONDS, 30 * 24 * 60 * 60);

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
    created_at: row.created_at
  };

  return ok(
    {
      verified: true,
      user,
      tokens: {
        accessToken,
        accessExpiresInSec: accessTtl,
        refreshToken,
        refreshExpiresInSec: refreshTtl,
        rememberMe
      }
    },
    { message: "Email verified successfully." }
  );
}

module.exports = { handler };

