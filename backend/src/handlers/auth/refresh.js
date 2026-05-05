const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { isEmailLike, normalizeEmail } = require("../../shared/validation");
const {
  parseTtlSeconds,
  randomToken,
  makeSalt,
  hashToken,
  verifyTokenHash,
  signAccessToken
} = require("../../shared/tokens");
const { mapDbConnectivityError } = require("../../shared/dbConnectivity");

async function handler(event) {
  try {
    const body = parseJsonBody(event);
    const email = normalizeEmail(body.email);
    const refreshToken = String(body.refreshToken || "").trim();

    if (!email) return fail(400, "VALIDATION_ERROR", "email is required");
    if (!isEmailLike(email)) return fail(400, "VALIDATION_ERROR", "email is invalid");
    if (!refreshToken) return fail(400, "VALIDATION_ERROR", "refreshToken is required");

    const res = await query(
      `
      SELECT u.id, s.refresh_token_hash, s.refresh_token_salt, s.expires_at AS refresh_token_expires_at
      FROM app_users u
      JOIN user_sessions s ON s.user_id = u.id
      WHERE u.email = $1
        AND s.revoked_at IS NULL
      LIMIT 1
      `,
      [email]
    );
    const row = res.rows[0];
    if (!row || !row.refresh_token_hash || !row.refresh_token_salt || !row.refresh_token_expires_at) {
      return fail(401, "INVALID_REFRESH", "Invalid session. Please login again.");
    }
    if (new Date(row.refresh_token_expires_at).getTime() < Date.now()) {
      return fail(401, "REFRESH_EXPIRED", "Session expired. Please login again.");
    }
    if (!verifyTokenHash(refreshToken, row.refresh_token_salt, row.refresh_token_hash)) {
      return fail(401, "INVALID_REFRESH", "Invalid session. Please login again.");
    }

    const accessTtl = parseTtlSeconds(process.env.ACCESS_TOKEN_TTL_SECONDS, 900);

    const newRefresh = randomToken(32);
    const salt = makeSalt(16);
    const newHash = hashToken(newRefresh, salt);

    await query(
      `
      UPDATE user_sessions
      SET
        refresh_token_hash = $2,
        refresh_token_salt = $3,
        last_used_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL
      `,
      [row.id, newHash, salt]
    );

    const accessToken = signAccessToken({ sub: row.id, email }, accessTtl);

    return ok({
      accessToken,
      accessExpiresInSec: accessTtl,
      refreshToken: newRefresh,
      refreshExpiresAt: row.refresh_token_expires_at
    });
  } catch (e) {
    const net = mapDbConnectivityError(e);
    if (net) return net;
    console.error("[auth/refresh]", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
