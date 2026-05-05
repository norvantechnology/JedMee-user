const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { query } = require("../../shared/db");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");
const { mapRow } = require("../../shared/csvImport/columnAliases");
const { validateImportRows } = require("../../shared/csvImport/importValidate");
const { requireImportPermission, entityAllowedForRole } = require("./importPermissions");

async function handler(event) {
  const body = parseJsonBody(event);
  const jobId = String(body.jobId || body.job_id || "").trim();
  const columnMappings = body.columnMappings || body.column_mappings || {};
  if (!jobId) return fail(400, "VALIDATION_ERROR", "jobId is required.");

  const jobRes = await query(
    `SELECT id, account_id, entity_type, staging, status FROM import_jobs WHERE id = $1 LIMIT 1`,
    [jobId]
  );
  const job = jobRes.rows?.[0];
  if (!job) return fail(404, "NOT_FOUND", "Import job not found.");

  const entityType = String(job.entity_type || "").toUpperCase();
  const auth = await requireImportPermission(event, entityType);
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId || String(job.account_id) !== String(ctx.accountId)) {
    return fail(403, "FORBIDDEN", "Import job does not belong to this account.");
  }

  const roleCode = await getRoleCodeForAccount(ctx.accountId);
  if (!entityAllowedForRole(entityType, roleCode)) {
    return fail(403, "FORBIDDEN", "This import type is not available for your business profile.");
  }

  const staging = job.staging || {};
  const rows = Array.isArray(staging.rows) ? staging.rows : [];
  const headers = staging.headers || [];

  await query(`UPDATE import_jobs SET status = 'VALIDATING' WHERE id = $1`, [jobId]);

  const rowsWithIndex = [];
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i] || {};
    const mapped = mapRow(raw, columnMappings);
    rowsWithIndex.push({ rowIndex: i + 2, data: mapped });
  }

  const validation = await validateImportRows(ctx.accountId, roleCode, entityType, rowsWithIndex, query);

  await query(
    `UPDATE import_jobs SET
      status = 'VALIDATED',
      column_mappings = $2::jsonb,
      validation_result = $3::jsonb
     WHERE id = $1`,
    [
      jobId,
      JSON.stringify(columnMappings),
      JSON.stringify({
        entityType,
        valid: validation.valid,
        updates: validation.updates,
        invalid: validation.invalid,
        summary: validation.summary
      })
    ]
  );

  const previewErrors = (validation.invalid || []).slice(0, 50);

  return created(
    {
      jobId,
      entityType,
      summary: validation.summary,
      previewErrors,
      duplicateStrategy: body.duplicateStrategy || body.duplicate_strategy || "UPDATE"
    },
    { message: "Validation complete." }
  );
}

module.exports = { handler };
