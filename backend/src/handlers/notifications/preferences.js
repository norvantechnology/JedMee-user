const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { hasPreferencesTable } = require("../../shared/notifications/notificationSchema");

const DEFAULT_PREFS = {
  push_enabled: true,
  email_digest_enabled: true,
  push_critical_only: false,
};

async function getPrefs(userId) {
  if (!(await hasPreferencesTable())) return { ...DEFAULT_PREFS };
  try {
    const r = await query(
      `
      SELECT push_enabled, email_digest_enabled, push_critical_only
      FROM user_notification_preferences
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );
    if (r.rows?.[0]) return r.rows[0];
  } catch (_) {
    /* table missing on old DB */
  }
  return { ...DEFAULT_PREFS };
}

async function handlerGet(event) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth.resp;
  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const prefs = await getPrefs(userId);
  return ok({
    push_enabled: prefs.push_enabled !== false,
    email_digest_enabled: prefs.email_digest_enabled !== false,
    push_critical_only: prefs.push_critical_only === true,
  });
}

async function handlerPatch(event) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth.resp;
  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event) || {};
  const pushEnabled = body.push_enabled ?? body.pushEnabled;
  const emailDigest = body.email_digest_enabled ?? body.emailDigestEnabled;
  const criticalOnly = body.push_critical_only ?? body.pushCriticalOnly;

  if (await hasPreferencesTable()) {
    await query(
      `
      INSERT INTO user_notification_preferences (
        user_id, account_id, push_enabled, email_digest_enabled, push_critical_only, updated_at
      )
      VALUES ($1, $2,
        COALESCE($3, true),
        COALESCE($4, true),
        COALESCE($5, false),
        now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        push_enabled = COALESCE($3, user_notification_preferences.push_enabled),
        email_digest_enabled = COALESCE($4, user_notification_preferences.email_digest_enabled),
        push_critical_only = COALESCE($5, user_notification_preferences.push_critical_only),
        updated_at = now()
      `,
      [
        userId,
        ctx.accountId,
        pushEnabled === undefined ? null : Boolean(pushEnabled),
        emailDigest === undefined ? null : Boolean(emailDigest),
        criticalOnly === undefined ? null : Boolean(criticalOnly),
      ]
    );
  }

  const prefs = await getPrefs(userId);
  return ok({
    push_enabled: prefs.push_enabled !== false,
    email_digest_enabled: prefs.email_digest_enabled !== false,
    push_critical_only: prefs.push_critical_only === true,
  });
}

module.exports = { handlerGet, handlerPatch };
