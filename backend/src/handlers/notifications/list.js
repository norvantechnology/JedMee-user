const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function clean(v) {
  return String(v ?? "").trim();
}

async function handler(event) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const limit = Math.min(100, Math.max(1, Number(qs.limit) || 30));
  const offset = Math.min(10_000, Math.max(0, Number(qs.offset) || 0));
  const unreadOnly = ["1", "true", "yes"].includes(clean(qs.unread_only || qs.unreadOnly).toLowerCase());

  try {
    const rows = await query(
      `
      SELECT
        id,
        account_id,
        user_id,
        type,
        title,
        body,
        payload,
        action_label,
        action_path,
        dedupe_key,
        read_at,
        created_at,
        created_by_user_id
      FROM user_notifications
      WHERE user_id = $1 AND account_id = $2
        ${unreadOnly ? "AND read_at IS NULL" : ""}
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [userId, ctx.accountId, limit, offset]
    );

    const raw = rows.rows || [];
    const items = raw.map((r) => ({
      id: r.id,
      account_id: r.account_id,
      user_id: r.user_id,
      type: r.type,
      title: r.title,
      body: r.body,
      payload: r.payload,
      action_label: r.action_label,
      action_path: r.action_path,
      dedupe_key: r.dedupe_key,
      read_at: r.read_at,
      created_at: r.created_at,
      created_by_user_id: r.created_by_user_id
    }));

    const has_more = raw.length === limit;

    return ok({ items, has_more, offset, limit });
  } catch (e) {
    console.error("[notifications:list]", e);
    return fail(500, "INTERNAL_ERROR", "Failed to load notifications.");
  }
}

module.exports = { handler };
