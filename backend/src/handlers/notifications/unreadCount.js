const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  try {
    const r = await query(
      `
      SELECT COUNT(*)::int AS c
      FROM user_notifications
      WHERE user_id = $1 AND account_id = $2 AND read_at IS NULL
      `,
      [userId, ctx.accountId]
    );
    return ok({ unread_count: Number(r.rows?.[0]?.c || 0) });
  } catch (e) {
    console.error("[notifications:unreadCount]", e);
    return fail(500, "INTERNAL_ERROR", "Failed to count notifications.");
  }
}

module.exports = { handler };
