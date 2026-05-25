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

  // Load all non-revoked sessions for this user so we can find the one whose
  // hash matches the supplied refresh token.  Each device has its own row
  // since migration 067 dropped the UNIQUE constraint on user_sessions.user_id.
  const res = await query(
    `
    SELECT u.id AS user_id, s.id AS session_id, s.refresh_token_hash, s.refresh_token_salt
    FROM app_users u
    JOIN user_sessions s ON s.user_id = u.id
    WHERE u.email = $1
      AND s.revoked_at IS NULL
    `,
    [email]
  );

  if (!res.rows.length) {
    return ok({ logged_out: true }, { message: "Logged out." });
  }

  // Find the session whose stored hash matches the supplied token.
  let matched = null;
  for (const s of res.rows) {
    if (s.refresh_token_hash && s.refresh_token_salt &&
        verifyTokenHash(refreshToken, s.refresh_token_salt, s.refresh_token_hash)) {
      matched = s;
      break;
    }
  }

  if (!matched) {
    // Token not found — treat as already logged out (don't leak info).
    return ok({ logged_out: true }, { message: "Logged out." });
  }

  // Revoke only this device's session; other devices remain logged in.
  await query(
    `
    UPDATE user_sessions
    SET revoked_at = now()
    WHERE id = $1
      AND revoked_at IS NULL
    `,
    [matched.session_id]
  );

  return ok({ logged_out: true }, { message: "Logged out." });
}

module.exports = { handler };

