const { created, fail } = require("../../shared/response");
const { withTransaction } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser, hasPermission } = require("../../shared/permissions");

function clean(v) {
  return String(v ?? "").trim();
}

async function handler(event) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const canBroadcast = ctx.isAccountOwner || (await hasPermission(actorId, "USERS", "UPDATE"));
  if (!canBroadcast) return fail(403, "FORBIDDEN", "Only the account owner or user managers can send notifications.");

  const body = parseJsonBody(event);
  const title = clean(body.title);
  const msg = clean(body.body || body.message);
  const actionLabel = clean(body.actionLabel || body.action_label);
  const actionPath = clean(body.actionPath || body.action_path);
  const audience = clean(body.audience || "all").toLowerCase(); // all | selected
  const userIds = Array.isArray(body.userIds || body.user_ids) ? (body.userIds || body.user_ids).map((x) => String(x).trim()).filter(Boolean) : [];

  if (title.length < 2) return fail(400, "VALIDATION_ERROR", "Title is required.");
  if (msg.length < 2) return fail(400, "VALIDATION_ERROR", "Message is required.");
  if (actionPath && !actionPath.startsWith("/")) return fail(400, "VALIDATION_ERROR", "actionPath must start with /.");

  if (audience === "selected" && !userIds.length) {
    return fail(400, "VALIDATION_ERROR", "userIds required when audience is selected.");
  }

  try {
    const payloadJson = JSON.stringify({ source: "admin_broadcast" });
    const sent = await withTransaction(async (q) => {
      const r =
        audience === "selected"
          ? await q(
              `
              INSERT INTO user_notifications (
                account_id, user_id, type, title, body, payload, action_label, action_path, dedupe_key, created_by_user_id
              )
              SELECT $1, u.id, 'ADMIN_BROADCAST', $2, $3, $4::jsonb, $5, $6, NULL, $7
              FROM app_users u
              WHERE u.account_id = $1
                AND u.status = 'APPROVED'
                AND u.is_blocked = false
                AND u.id = ANY($8::uuid[])
              RETURNING id
              `,
              [ctx.accountId, title, msg, payloadJson, actionLabel || null, actionPath || null, actorId, userIds]
            )
          : await q(
              `
              INSERT INTO user_notifications (
                account_id, user_id, type, title, body, payload, action_label, action_path, dedupe_key, created_by_user_id
              )
              SELECT $1, u.id, 'ADMIN_BROADCAST', $2, $3, $4::jsonb, $5, $6, NULL, $7
              FROM app_users u
              WHERE u.account_id = $1
                AND u.status = 'APPROVED'
                AND u.is_blocked = false
              RETURNING id
              `,
              [ctx.accountId, title, msg, payloadJson, actionLabel || null, actionPath || null, actorId]
            );
      return (r.rows || []).length;
    });

    return created({ sent }, { message: "Notifications sent." });
  } catch (e) {
    console.error("[notifications:createBroadcast]", e);
    return fail(500, "INTERNAL_ERROR", "Failed to send notifications.");
  }
}

module.exports = { handler };
