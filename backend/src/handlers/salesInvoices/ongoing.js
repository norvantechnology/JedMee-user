const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/sales");

/**
 * List ongoing (DRAFT) sales invoices for the current account.
 *
 * Used by the parallel-billing UI: shop staff keep multiple in-progress bills
 * open at the counter and switch between them with a quick chip rail.
 *
 * Returns a compact payload — enough to render a chip (customer/walk-in name,
 * bill number, item count, total, who started it, last update). The full
 * invoice + line items are loaded only when the user opens a specific bill.
 *
 * Query params:
 *   scope=mine|shared (optional)
 *     mine   — only drafts created by the current user
 *     shared — drafts created by other staff (so they can be picked up)
 *     omit   — all account drafts (default; pharmacy counter is shared)
 *   q (optional) — fuzzy match on customer or bill number
 *   limit (optional, default 30, max 100)
 */
async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const scope = clean(qs.scope).toLowerCase();
  const search = clean(qs.q || qs.search);
  const limit = Math.min(100, Math.max(1, Number(qs.limit) || 30));

  const wh = [
    "si.account_id = $1",
    "si.deleted_at IS NULL",
    "si.status = 'DRAFT'::sales_invoice_status"
  ];
  const ps = [ctx.accountId];

  if (scope === "mine") {
    ps.push(actorId);
    wh.push(`si.created_by_user_id = $${ps.length}`);
  } else if (scope === "shared") {
    ps.push(actorId);
    wh.push(`(si.created_by_user_id IS NULL OR si.created_by_user_id <> $${ps.length})`);
  }

  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(si.invoice_number ILIKE $${ps.length} OR si.customer_name ILIKE $${ps.length} OR c.name ILIKE $${ps.length})`);
  }

  try {
    const rows = await query(
      `
      SELECT
        si.id,
        si.invoice_number,
        si.customer_id,
        COALESCE(c.name, si.customer_name, '') AS customer_name,
        si.bill_type,
        si.rate_type,
        si.total_amount,
        si.global_discount_percent,
        si.invoice_date,
        si.notes,
        si.created_by_user_id,
        COALESCE(u.full_name, u.email, '') AS created_by_name,
        si.created_at,
        si.updated_at,
        (SELECT COUNT(*)::int FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id) AS item_count,
        (SELECT COALESCE(SUM(sii.qty),0)::numeric FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id) AS total_qty
      FROM sales_invoices si
      LEFT JOIN customers c ON c.id = si.customer_id AND c.account_id = si.account_id
      LEFT JOIN app_users u ON u.id = si.created_by_user_id
      WHERE ${wh.join(" AND ")}
      ORDER BY si.updated_at DESC NULLS LAST, si.created_at DESC
      LIMIT $${ps.length + 1}
      `,
      [...ps, limit]
    );
    return ok({ items: rows.rows || [], count: rows.rows?.length || 0 });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
