const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

const VALID_DEVICE_TYPES = new Set(["android", "ios", "web"]);

async function handler(event) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "Account not found.");

  const body = parseJsonBody(event);
  const token = String(body.token || "").trim();
  const deviceType = String(body.deviceType || body.device_type || "android").toLowerCase();

  if (!token) return fail(400, "VALIDATION_ERROR", "FCM token is required.");
  if (!VALID_DEVICE_TYPES.has(deviceType)) {
    return fail(400, "VALIDATION_ERROR", "deviceType must be android, ios, or web.");
  }

  try {
    // Upsert: insert or update the token's user/account binding and timestamp.
    await query(
      `
      INSERT INTO fcm_tokens (user_id, account_id, token, device_type, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (token) DO UPDATE
        SET user_id    = EXCLUDED.user_id,
            account_id = EXCLUDED.account_id,
            device_type = EXCLUDED.device_type,
            updated_at  = now()
      `,
      [userId, ctx.accountId, token, deviceType]
    );

    return ok({ saved: true });
  } catch (e) {
    console.error("[notifications:saveFcmToken]", e);
    return fail(500, "INTERNAL_ERROR", "Failed to save FCM token.");
  }
}

module.exports = { handler };