const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean, getAccountContextForUser } = require("../orders/_common");
const { query } = require("../../shared/db");

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const acct = await getAccountContextForUser(actorId);
  if (String(acct?.role_code || "").toUpperCase() !== "WHOLESALER") {
    return fail(403, "FORBIDDEN", "Only wholesalers can manage catalog.");
  }

  const qs = event?.queryStringParameters || {};
  const search = clean(qs.search || qs.q);
  const visibility = clean(qs.visibility || "").toUpperCase(); // ALL | VISIBLE | HIDDEN
  const inStock = clean(qs.in_stock || qs.inStock || "").toUpperCase(); // ALL | YES | NO

  const wh = ["wc.account_id = $1"];
  const ps = [ctx.accountId];
  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(p.name ILIKE $${ps.length} OR p.code ILIKE $${ps.length} OR p.drug_name ILIKE $${ps.length})`);
  }
  if (visibility === "VISIBLE") wh.push("wc.is_visible = true");
  if (visibility === "HIDDEN") wh.push("wc.is_visible = false");
  if (inStock === "YES") wh.push("COALESCE(st.current_stock, 0) > 0");
  if (inStock === "NO") wh.push("COALESCE(st.current_stock, 0) <= 0");

  try {
    const r = await query(
      `
      WITH st AS (
        SELECT account_id, product_id, COALESCE(SUM(current_stock), 0)::numeric(14,3) AS current_stock
        FROM product_batches
        WHERE deleted_at IS NULL
        GROUP BY account_id, product_id
      )
      SELECT
        wc.*,
        p.code AS product_code,
        p.name AS product_name,
        p.drug_name,
        p.sales_gst,
        COALESCE(st.current_stock, 0) AS current_stock
      FROM wholesaler_catalog wc
      JOIN products p ON p.id = wc.product_id AND p.account_id = wc.account_id AND p.deleted_at IS NULL
      LEFT JOIN st ON st.account_id = wc.account_id AND st.product_id = wc.product_id
      WHERE ${wh.join(" AND ")}
      ORDER BY wc.updated_at DESC
      `,
      ps
    );
    return ok({ items: r.rows || [] });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to load catalog.");
  }
}

module.exports = { handler };

