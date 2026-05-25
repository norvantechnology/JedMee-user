const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { isEmailLike, normalizeEmail } = require("../../shared/validation");
const {
  parseTtlSeconds,
  secondsFromNow,
  randomToken,
  makeSalt,
  hashToken,
  verifyTokenHash,
  signAccessToken
} = require("../../shared/tokens");
const { mapDbConnectivityError } = require("../../shared/dbConnectivity");

function refreshTtlForSession(expiresAt) {
  const defaultTtl = parseTtlSeconds(process.env.REFRESH_TOKEN_TTL_SECONDS, 30 * 24 * 60 * 60);
  const rememberTtl = parseTtlSeconds(
    process.env.REFRESH_TOKEN_TTL_REMEMBER_SECONDS,
    90 * 24 * 60 * 60
  );
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  // Long initial session (remember-me) keeps the longer sliding window.
  return remainingMs > 7 * 24 * 60 * 60 * 1000 ? rememberTtl : defaultTtl;
}

async function handler(event) {
  try {
    const body = parseJsonBody(event);
    const email = normalizeEmail(body.email);
    const refreshToken = String(body.refreshToken || "").trim();

    if (!email) return fail(400, "VALIDATION_ERROR", "email is required");
    if (!isEmailLike(email)) return fail(400, "VALIDATION_ERROR", "email is invalid");
    if (!refreshToken) return fail(400, "VALIDATION_ERROR", "refreshToken is required");

    // Load all non-revoked, non-expired sessions for this user so we can find
    // the one whose hash matches the supplied refresh token.  Each device has
    // its own row since migration 067 dropped the UNIQUE constraint on user_id.
    const res = await query(
      `
      SELECT u.id AS user_id,
             s.id AS session_id,
             s.refresh_token_hash,
             s.refresh_token_salt,
             s.expires_at AS refresh_token_expires_at
      FROM app_users u
      JOIN user_sessions s ON s.user_id = u.id
      WHERE u.email = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
      `,
      [email]
    );

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
      return fail(401, "INVALID_REFRESH", "Invalid session. Please login again.");
    }

    const accessTtl = parseTtlSeconds(process.env.ACCESS_TOKEN_TTL_SECONDS, 24 * 60 * 60);
    const refreshTtl = refreshTtlForSession(matched.refresh_token_expires_at);
    const newRefreshExpiresAt = secondsFromNow(refreshTtl);

    const newRefresh = randomToken(32);
    const salt = makeSalt(16);
    const newHash = hashToken(newRefresh, salt);

    // Rotate only this device's session row (leave other devices untouched).
    await query(
      `
      UPDATE user_sessions
      SET
        refresh_token_hash = $2,
        refresh_token_salt = $3,
        expires_at = $4,
        last_used_at = now()
      WHERE id = $1
        AND revoked_at IS NULL
      `,
      [matched.session_id, newHash, salt, newRefreshExpiresAt]
    );

    // Alias so the rest of the handler can use `row` unchanged.
    const row = matched;

    const accessToken = signAccessToken({ sub: row.id, email }, accessTtl);

    return ok({
      accessToken,
      accessExpiresInSec: accessTtl,
      refreshToken: newRefresh,
      refreshExpiresAt: newRefreshExpiresAt
    });
  } catch (e) {
    const net = mapDbConnectivityError(e);
    if (net) return net;
    console.error("[auth/refresh]", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
