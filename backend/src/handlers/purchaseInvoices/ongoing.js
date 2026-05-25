const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/purchase");

/**
 * List ongoing (DRAFT) purchase invoices for the current account.
 *
 * Mirrors /sales-invoices/ongoing — supports multiple in-progress purchase
 * entries when staff is keying in several vendor bills simultaneously.
 *
 * Query params:
 *   scope=mine|shared (optional; default = all account drafts)
 *   q (optional) — fuzzy match on vendor name or bill number
 *   limit (optional, default 30, max 100)
 */
async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_INVOICES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const scope = clean(qs.scope).toLowerCase();
  const search = clean(qs.q || qs.search);
  const limit = Math.min(100, Math.max(1, Number(qs.limit) || 30));

  const wh = [
    "pi.account_id = $1",
    "pi.deleted_at IS NULL",
    "pi.status = 'DRAFT'"
  ];
  const ps = [ctx.accountId];

  if (scope === "mine") {
    ps.push(actorId);
    wh.push(`pi.created_by_user_id = $${ps.length}`);
  } else if (scope === "shared") {
    ps.push(actorId);
    wh.push(`(pi.created_by_user_id IS NULL OR pi.created_by_user_id <> $${ps.length})`);
  }

  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(pi.invoice_number ILIKE $${ps.length} OR v.name ILIKE $${ps.length} OR pi.vendor_invoice_number ILIKE $${ps.length})`);
  }

  try {
    const rows = await query(
      `
      SELECT
        pi.id,
        pi.invoice_number,
        pi.vendor_id,
        pi.vendor_invoice_number,
        COALESCE(v.name, '') AS vendor_name,
        pi.division_id,
        COALESCE(d.name, pi.division_name, '') AS division_name,
        pi.total_amount,
        pi.invoice_date,
        pi.created_by_user_id,
        COALESCE(u.full_name, u.email, '') AS created_by_name,
        pi.created_at,
        pi.updated_at,
        (SELECT COUNT(*)::int FROM purchase_invoice_items pii WHERE pii.purchase_invoice_id = pi.id) AS item_count
      FROM purchase_invoices pi
      LEFT JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id
      LEFT JOIN divisions d ON d.id = pi.division_id AND d.account_id = pi.account_id
      LEFT JOIN app_users u ON u.id = pi.created_by_user_id
      WHERE ${wh.join(" AND ")}
      ORDER BY pi.updated_at DESC NULLS LAST, pi.created_at DESC
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
