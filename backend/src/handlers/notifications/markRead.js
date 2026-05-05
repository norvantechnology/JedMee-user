const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(userId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const markAll = Boolean(body.all);
  const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x).trim()).filter(Boolean) : [];

  try {
    if (markAll) {
      const r = await query(
        `
        UPDATE user_notifications
        SET read_at = now()
        WHERE user_id = $1 AND account_id = $2 AND read_at IS NULL
        RETURNING id
        `,
        [userId, ctx.accountId]
      );
      return ok({ updated: (r.rows || []).length });
    }

    if (!ids.length) return fail(400, "VALIDATION_ERROR", "ids required (or pass all: true).");

    const r = await query(
      `
      UPDATE user_notifications
      SET read_at = now()
      WHERE user_id = $1 AND account_id = $2 AND id = ANY($3::uuid[]) AND read_at IS NULL
      RETURNING id
      `,
      [userId, ctx.accountId, ids]
    );
    return ok({ updated: (r.rows || []).length });
  } catch (e) {
    console.error("[notifications:markRead]", e);
    return fail(500, "INTERNAL_ERROR", "Failed to update notifications.");
  }
}

module.exports = { handler };
