const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_INVOICES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const id = String(event?.pathParameters?.id || "").trim();
  if (!id) return fail(400, "BAD_REQUEST", "id is required");

  try {
    const inv = await query(
      `
      SELECT pi.*, v.name AS vendor_name, d.name AS division_label, m.name AS division_mfg_name
      FROM purchase_invoices pi
      LEFT JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id
      LEFT JOIN divisions d ON d.id = pi.division_id AND d.account_id = pi.account_id AND d.deleted_at IS NULL
      LEFT JOIN mfg_companies m ON m.id = d.mfg_company_id AND m.account_id = pi.account_id AND m.deleted_at IS NULL
      WHERE pi.id = $1 AND pi.account_id = $2 AND pi.deleted_at IS NULL
      LIMIT 1
      `,
      [id, ctx.accountId]
    );
    const invoice = inv.rows?.[0];
    if (!invoice) return fail(404, "NOT_FOUND", "Purchase invoice not found.");

    const [items, vendorPayments, divisionPayments] = await Promise.all([
      query(
      `
      SELECT pii.*,
        COALESCE((
          SELECT SUM(pri.return_qty)
          FROM purchase_return_items pri
          JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
          WHERE pri.purchase_invoice_item_id = pii.id
            AND pri.account_id = pii.account_id
            AND pr.status IN ('DRAFT', 'CONFIRMED')
        ), 0) AS already_returned_qty,
        COALESCE((
          SELECT SUM(pri.return_free_qty)
          FROM purchase_return_items pri
          JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
          WHERE pri.purchase_invoice_item_id = pii.id
            AND pri.account_id = pii.account_id
            AND pr.status IN ('DRAFT', 'CONFIRMED')
        ), 0) AS already_returned_free_qty
      FROM purchase_invoice_items pii
      WHERE pii.purchase_invoice_id = $1 AND pii.account_id = $2
      ORDER BY pii.created_at ASC
      `,
      [id, ctx.accountId]
      ),
      query(
        `SELECT * FROM vendor_payments WHERE purchase_invoice_id = $1 AND account_id = $2 ORDER BY payment_date DESC, created_at DESC`,
        [id, ctx.accountId]
      ),
      query(
        `SELECT * FROM division_payments WHERE purchase_invoice_id = $1 AND account_id = $2 ORDER BY payment_date DESC, created_at DESC`,
        [id, ctx.accountId]
      ),
    ]);

    const payments = [...(vendorPayments.rows || []), ...(divisionPayments.rows || [])].sort((a, b) => {
      const da = String(a.payment_date || "");
      const db = String(b.payment_date || "");
      if (da !== db) return db.localeCompare(da);
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });

    return ok({ invoice, items: items.rows || [], payments });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
