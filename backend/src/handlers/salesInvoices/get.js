const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const id = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!id) return fail(400, "VALIDATION_ERROR", "invoice id is required");
  try {
    const inv = await query(`SELECT * FROM sales_invoices WHERE id = $1 AND account_id = $2 LIMIT 1`, [id, ctx.accountId]);
    const invoice = inv.rows?.[0] || null;
    if (!invoice) return fail(404, "NOT_FOUND", "Invoice not found");
    const [items, payments] = await Promise.all([
      query(
        `SELECT sii.*,
          COALESCE(pb.packing_units, p.units_per_strip, 1) AS packing_units,
          COALESCE((
            SELECT SUM(sri.return_qty)
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.id = sri.sales_return_id
            WHERE sri.sales_invoice_item_id = sii.id
              AND sri.account_id = sii.account_id
              AND sr.status IN ('DRAFT'::sales_return_status, 'CONFIRMED'::sales_return_status)
          ), 0) AS already_returned_qty,
          COALESCE((
            SELECT SUM(sri.return_free_qty)
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.id = sri.sales_return_id
            WHERE sri.sales_invoice_item_id = sii.id
              AND sri.account_id = sii.account_id
              AND sr.status IN ('DRAFT'::sales_return_status, 'CONFIRMED'::sales_return_status)
          ), 0) AS already_returned_free_qty,
          COALESCE((
            SELECT SUM(sri.return_loose_qty)
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.id = sri.sales_return_id
            WHERE sri.sales_invoice_item_id = sii.id
              AND sri.account_id = sii.account_id
              AND sr.status IN ('DRAFT'::sales_return_status, 'CONFIRMED'::sales_return_status)
          ), 0) AS already_returned_loose_qty
         FROM sales_invoice_items sii
         LEFT JOIN product_batches pb ON pb.id = sii.batch_id AND pb.account_id = sii.account_id
         LEFT JOIN products p ON p.id = sii.product_id AND p.account_id = sii.account_id
         WHERE sii.sales_invoice_id = $1 AND sii.account_id = $2
         ORDER BY sii.created_at ASC`,
        [id, ctx.accountId]
      ),
      query(`SELECT * FROM customer_payments WHERE sales_invoice_id = $1 AND account_id = $2 ORDER BY payment_date DESC, created_at DESC`, [id, ctx.accountId])
    ]);
    return ok({ invoice, items: items.rows || [], payments: payments.rows || [] });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
