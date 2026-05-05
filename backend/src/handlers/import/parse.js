const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { query } = require("../../shared/db");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");
const { parseImportFile } = require("../../shared/csvImport/fileParser");
const { suggestMappings } = require("../../shared/csvImport/columnAliases");
const { fieldsWithRequired } = require("../../shared/csvImport/fieldMeta");
const { requireImportPermission, entityAllowedForRole } = require("./importPermissions");

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_ROWS = 8000;

async function handler(event) {
  const body = parseJsonBody(event);
  const entityType = String(body.entityType || body.entity_type || "").toUpperCase();
  if (!entityType) return fail(400, "VALIDATION_ERROR", "entityType is required.");

  const auth = await requireImportPermission(event, entityType);
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const roleCode = await getRoleCodeForAccount(ctx.accountId);
  if (!entityAllowedForRole(entityType, roleCode)) {
    return fail(403, "FORBIDDEN", "This import type is not available for your business profile.");
  }

  const filename = String(body.filename || "upload.csv");
  const b64 = body.contentBase64 || body.content_base64;
  if (!b64) return fail(400, "VALIDATION_ERROR", "contentBase64 is required.");

  let buf;
  try {
    buf = Buffer.from(String(b64), "base64");
  } catch {
    return fail(400, "VALIDATION_ERROR", "Invalid base64 content.");
  }
  if (buf.length > MAX_BYTES) {
    return fail(400, "VALIDATION_ERROR", `File too large (max ${MAX_BYTES / 1024 / 1024}MB).`);
  }

  let parsed;
  try {
    parsed = parseImportFile(buf, filename);
  } catch (e) {
    return fail(400, "PARSE_ERROR", String(e.message || "Could not parse file."));
  }

  let rows = parsed.rows || [];
  if (rows.length > MAX_ROWS) {
    rows = rows.slice(0, MAX_ROWS);
  }

  const staging = {
    headers: parsed.headers || [],
    rows,
    filename
  };

  const ins = await query(
    `
    INSERT INTO import_jobs (
      account_id, created_by_user_id, entity_type, status, original_filename, staging, total_rows
    ) VALUES ($1, $2, $3, 'PARSED', $4, $5::jsonb, $6)
    RETURNING id, created_at
    `,
    [ctx.accountId, actorId, entityType, filename, JSON.stringify(staging), rows.length]
  );
  const job = ins.rows?.[0];
  if (!job) return fail(500, "INTERNAL_ERROR", "Could not create import job.");

  const sampleRows = rows.slice(0, 5);
  const autoMappings = suggestMappings(parsed.headers || [], entityType);

  return created(
    {
      jobId: job.id,
      entityType,
      totalRows: rows.length,
      headers: parsed.headers,
      sampleRows,
      autoMappings,
      fields: fieldsWithRequired(entityType)
    },
    { message: "File parsed.", subMessage: "Map columns and validate before importing." }
  );
}

module.exports = { handler };
