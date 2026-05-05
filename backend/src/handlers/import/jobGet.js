const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { getPermissionsForUser } = require("../../shared/permissions");
const { requireImportPermission } = require("./importPermissions");

async function handler(event) {
  const jobId = String(event?.pathParameters?.id || event?.pathParameters?.jobId || "").trim();
  if (!jobId) return fail(400, "BAD_REQUEST", "job id is required");

  const jobRes = await query(
    `
    SELECT id, account_id, entity_type, status, original_filename, total_rows, created_rows, updated_rows,
           skipped_rows, error_rows, duplicate_strategy, skip_errors, execute_errors, validation_result,
           started_at, completed_at, created_at
    FROM import_jobs WHERE id = $1 LIMIT 1
    `,
    [jobId]
  );
  const job = jobRes.rows?.[0];
  if (!job) return fail(404, "NOT_FOUND", "Import job not found.");

  const entityType = String(job.entity_type || "").toUpperCase();
  const auth = await requireImportPermission(event, entityType);
  if (!auth.ok) return auth.resp;

  const ctx = await getPermissionsForUser(String(auth.claims?.sub || ""));
  if (!ctx.accountId || String(job.account_id) !== String(ctx.accountId)) {
    return fail(403, "FORBIDDEN", "Import job does not belong to this account.");
  }

  return ok({ job });
}

module.exports = { handler };
