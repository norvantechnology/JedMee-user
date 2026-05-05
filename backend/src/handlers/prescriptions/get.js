const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requirePermission(event, "PRESCRIPTIONS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const id = String(event?.pathParameters?.id || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  const res = await query(
    `
    SELECT
      p.*,
      si.invoice_number,
      si.invoice_date
    FROM prescriptions p
    LEFT JOIN sales_invoices si ON si.id = p.sales_invoice_id AND si.account_id = p.account_id
    WHERE p.id = $1
      AND p.account_id = $2
    LIMIT 1
    `,
    [id, ctx.accountId]
  );
  const row = res.rows?.[0] || null;
  if (!row) return fail(404, "NOT_FOUND", "Prescription not found");
  return ok({ item: row });
}

module.exports = { handler };
