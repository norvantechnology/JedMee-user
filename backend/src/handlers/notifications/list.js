const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { listNotificationRows } = require("../../shared/notifications/notificationSchema");

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
    const items = await listNotificationRows({
      userId,
      accountId: ctx.accountId,
      limit,
      offset,
      unreadOnly,
    });

    const has_more = items.length === limit;

    return ok({ items, has_more, offset, limit });
  } catch (e) {
    console.error("[notifications:list]", e);
    return fail(500, "INTERNAL_ERROR", "Failed to load notifications.");
  }
}

module.exports = { handler };
