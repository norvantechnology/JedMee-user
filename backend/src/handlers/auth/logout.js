const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { isEmailLike, normalizeEmail } = require("../../shared/validation");
const { verifyTokenHash } = require("../../shared/tokens");

async function handler(event) {
  const body = parseJsonBody(event);
  const email = normalizeEmail(body.email);
  const refreshToken = String(body.refreshToken || "").trim();

  if (!email) return fail(400, "VALIDATION_ERROR", "email is required");
  if (!isEmailLike(email)) return fail(400, "VALIDATION_ERROR", "email is invalid");
  if (!refreshToken) return fail(400, "VALIDATION_ERROR", "refreshToken is required");

  const res = await query(
    `
    SELECT u.id, s.refresh_token_hash, s.refresh_token_salt
    FROM app_users u
    JOIN user_sessions s ON s.user_id = u.id
    WHERE u.email = $1
      AND s.revoked_at IS NULL
    LIMIT 1
    `,
    [email]
  );
  const row = res.rows[0];
  if (!row || !row.refresh_token_hash || !row.refresh_token_salt) {
    // Already logged out / no session
    return ok({ logged_out: true }, { message: "Logged out." });
  }

  if (!verifyTokenHash(refreshToken, row.refresh_token_salt, row.refresh_token_hash)) {
    // Don't leak info; treat as logged out locally.
    return ok({ logged_out: true }, { message: "Logged out." });
  }

  // Clear refresh token on logout (invalidate remembered session).
  await query(
    `
    UPDATE user_sessions
    SET revoked_at = now()
    WHERE user_id = $1
      AND revoked_at IS NULL
    `,
    [row.id]
  );

  return ok({ logged_out: true }, { message: "Logged out." });
}

module.exports = { handler };

