const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { allowedImportEntityTypes, requireImportPermission } = require("./importPermissions");

async function handler(event) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth.resp;

  const qs = event?.queryStringParameters || {};
  const limit = Math.min(100, Math.max(1, parseInt(String(qs.limit || "30"), 10) || 30));
  const entityType = String(qs.entityType || qs.entity_type || "").trim().toUpperCase();

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const allowedEntities = allowedImportEntityTypes(ctx);
  if (!allowedEntities.length) {
    return fail(403, "FORBIDDEN", "You do not have permission to view import jobs.");
  }

  if (entityType) {
    const etAuth = await requireImportPermission(event, entityType);
    if (!etAuth.ok) return etAuth.resp;
  }

  const params = [ctx.accountId, limit, allowedEntities];
  let sql = `
    SELECT id, entity_type, status, original_filename, total_rows, created_rows, updated_rows, skipped_rows, error_rows,
           duplicate_strategy, skip_errors, started_at, completed_at, created_at
    FROM import_jobs
    WHERE account_id = $1
      AND entity_type = ANY($3::text[])
  `;
  if (entityType) {
    sql += ` AND entity_type = $4`;
    params.push(entityType);
  }
  sql += ` ORDER BY created_at DESC LIMIT $2`;

  const r = await query(sql, params);
  return ok({ items: r.rows || [] });
}

module.exports = { handler };
