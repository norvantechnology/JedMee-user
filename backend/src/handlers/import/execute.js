const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { query } = require("../../shared/db");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");
const { runImportExecute } = require("../../shared/csvImport/importExecute");
const { requireImportPermission, entityAllowedForRole } = require("./importPermissions");

const CREATE_NEW_UNSUPPORTED = new Set([
  "MANUFACTURERS",
  "DIVISIONS",
  "SUPPLIERS",
  "CUSTOMERS",
  "PRODUCTS",
  "PRODUCT_BATCHES",
  "PRESCRIPTIONS"
]);

async function handler(event) {
  const body = parseJsonBody(event);
  const jobId = String(body.jobId || body.job_id || "").trim();
  const duplicateStrategy = String(body.duplicateStrategy || body.duplicate_strategy || "UPDATE").toUpperCase();
  const skipErrors = Boolean(body.skipErrors || body.skip_errors);

  if (!jobId) return fail(400, "VALIDATION_ERROR", "jobId is required.");
  if (!["SKIP", "UPDATE", "CREATE_NEW"].includes(duplicateStrategy)) {
    return fail(400, "VALIDATION_ERROR", "duplicateStrategy must be SKIP, UPDATE, or CREATE_NEW.");
  }

  const jobRes = await query(
    `SELECT id, account_id, entity_type, validation_result, status FROM import_jobs WHERE id = $1 LIMIT 1`,
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
  if (duplicateStrategy === "CREATE_NEW" && CREATE_NEW_UNSUPPORTED.has(entityType)) {
    return fail(400, "VALIDATION_ERROR", `${entityType} import does not support CREATE_NEW for duplicate rows.`);
  }

  const vr = job.validation_result || {};
  if (!vr.valid && !vr.updates) {
    return fail(400, "VALIDATION_ERROR", "Run validate step before execute.");
  }

  await query(
    `UPDATE import_jobs SET status = 'RUNNING', started_at = now(), duplicate_strategy = $2, skip_errors = $3 WHERE id = $1`,
    [jobId, duplicateStrategy, skipErrors]
  );

  const validation = {
    entityType,
    valid: vr.valid || [],
    updates: vr.updates || [],
    invalid: vr.invalid || []
  };

  let stats;
  try {
    stats = await runImportExecute(
      event,
      { accountId: ctx.accountId, actorId, importJobId: jobId },
      validation,
      duplicateStrategy,
      skipErrors
    );
  } catch (e) {
    await query(
      `UPDATE import_jobs SET status = 'FAILED', completed_at = now(), execute_errors = $2::jsonb WHERE id = $1`,
      [jobId, JSON.stringify([{ error: String(e.message || e) }])]
    );
    return fail(500, "IMPORT_FAILED", String(e.message || "Import failed."));
  }

  const finalStatus = stats.errors.length && skipErrors ? "PARTIAL" : "COMPLETED";
  await query(
    `UPDATE import_jobs SET
      status = $2,
      completed_at = now(),
      processed_rows = $3 + $4 + $5 + $6,
      created_rows = $3,
      updated_rows = $4,
      skipped_rows = $5,
      error_rows = $6,
      execute_errors = $7::jsonb
     WHERE id = $1`,
    [
      jobId,
      finalStatus,
      stats.created,
      stats.updated,
      stats.skipped,
      stats.errors.length,
      JSON.stringify(stats.errors.map((m) => ({ message: m })))
    ]
  );

  return created(
    {
      jobId,
      entityType,
      created: stats.created,
      updated: stats.updated,
      skipped: stats.skipped,
      errors: stats.errors
    },
    { message: "Import finished.", subMessage: `${stats.created} created, ${stats.updated} updated.` }
  );
}

module.exports = { handler };
