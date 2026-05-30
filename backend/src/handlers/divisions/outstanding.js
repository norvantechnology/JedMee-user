const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

async function handler(event) {
  const auth = await requirePermission(event, "DIVISIONS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const id = String(getPathParam(event, "id") || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  try {
    const d = await query(`SELECT id FROM divisions WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, ctx.accountId]);
    if (!d.rows?.[0]) return fail(404, "NOT_FOUND", "Division not found.");

    const agg = await query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'CONFIRMED' AND payment_status IN ('UNPAID','PARTIAL'))::int AS unpaid_invoices,
        COUNT(*)::int AS total_invoices,
        COALESCE(SUM(balance_due) FILTER (
          WHERE status = 'CONFIRMED'
            AND payment_status IN ('UNPAID','PARTIAL')
        ), 0)::numeric(14,2) AS total_outstanding,
        MIN(invoice_date) FILTER (WHERE status = 'CONFIRMED' AND payment_status IN ('UNPAID','PARTIAL')) AS oldest_invoice_date
      FROM purchase_invoices
      WHERE account_id = $1 AND division_id = $2 AND deleted_at IS NULL
      `,
      [ctx.accountId, id]
    );
    const row = agg.rows?.[0] || {};
    return ok({
      total_invoices: Number(row.total_invoices || 0),
      unpaid_invoices: Number(row.unpaid_invoices || 0),
      total_outstanding: Number(row.total_outstanding || 0),
      outstanding_amount: Number(row.total_outstanding || 0),
      outstandingAmount: Number(row.total_outstanding || 0),
      oldest_invoice_date: row.oldest_invoice_date || null
    });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
