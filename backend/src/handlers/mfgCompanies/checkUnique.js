const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function clean(v) {
  return String(v ?? "").trim();
}

async function existsForField({ accountId, field, value, excludeId }) {
  if (!value) return false;
  const args = [accountId, value];
  let sql = `SELECT id FROM mfg_companies WHERE account_id = $1 AND deleted_at IS NULL AND lower(${field}) = lower($2)`;
  if (excludeId) {
    args.push(excludeId);
    sql += ` AND id <> $3`;
  }
  sql += ` LIMIT 1`;
  const rs = await query(sql, args);
  return Boolean(rs.rows?.[0]);
}

async function handler(event) {
  const auth = await requirePermission(event, "MFG_COMPANIES", "VIEW");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const code = clean(qs.code).toUpperCase();
  const name = clean(qs.name);
  const excludeId = clean(qs.exclude_id || qs.excludeId);

  if (!code && !name) {
    return fail(400, "VALIDATION_ERROR", "At least one of code or name is required.");
  }

  const [codeExists, nameExists] = await Promise.all([
    existsForField({ accountId: ctx.accountId, field: "code", value: code, excludeId }),
    existsForField({ accountId: ctx.accountId, field: "name", value: name, excludeId })
  ]);

  return ok({
    code: { value: code, exists: code ? codeExists : false },
    name: { value: name, exists: name ? nameExists : false }
  });
}

module.exports = { handler };

