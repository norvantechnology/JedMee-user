const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/sales");
const { mapCustomerRow } = require("./_common");
const { getRoleCodeForAccount, getAccountSettings } = require("../../shared/accountRoleProfile");
const { hasColumn } = require("../../shared/schemaSupport");

async function handler(event) {
  const auth = await requirePermission(event, "CUSTOMERS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(qs.limit) || 50));
  const offset = (page - 1) * limit;
  const q = clean(qs.q || qs.search);
  const type = clean(qs.customer_type || qs.customerType).toUpperCase();
  const active = clean(qs.active).toLowerCase();
  const forBilling = ["1", "true", "yes"].includes(clean(qs.for_billing || qs.forBilling).toLowerCase());
  const hideWalkIn = ["1", "true", "yes"].includes(clean(qs.exclude_walk_in || qs.excludeWalkIn).toLowerCase());
  const roleCode = await getRoleCodeForAccount(ctx.accountId);
  const accountSettings = forBilling ? await getAccountSettings(ctx.accountId) : null;
  const supportsWalkInColumn = await hasColumn("customers", "is_walk_in");

  const wh = ["c.account_id = $1", "c.deleted_at IS NULL"];
  const ps = [ctx.accountId];
  if (q) {
    ps.push(`%${q}%`);
    wh.push(`(c.code ILIKE $${ps.length} OR c.name ILIKE $${ps.length} OR c.short_name ILIKE $${ps.length} OR c.phone_number ILIKE $${ps.length})`);
  }
  if (type) {
    ps.push(type);
    wh.push(`c.customer_type = $${ps.length}::customer_type_enum`);
  }
  if (active === "true" || active === "false") {
    ps.push(active === "true");
    wh.push(`c.is_active = $${ps.length}`);
  }
  if (hideWalkIn && supportsWalkInColumn) {
    wh.push(`COALESCE(c.is_walk_in, false) = false`);
  }
  const whereSql = `WHERE ${wh.join(" AND ")}`;
  try {
    const tc = await query(`SELECT COUNT(*)::int AS c FROM customers c ${whereSql}`, ps);
    const total = Number(tc.rows?.[0]?.c || 0);
    const listParams = [...ps];
    let orderSql = `ORDER BY c.created_at DESC`;
    if (forBilling && supportsWalkInColumn) {
      listParams.push(roleCode);
      orderSql = `ORDER BY
           CASE
             WHEN $${listParams.length}::text = 'RETAILER' AND COALESCE(c.is_walk_in, false) = true THEN 0
             ELSE 1
           END,
           lower(c.name) ASC,
           c.created_at DESC`;
    }
    listParams.push(limit);
    const limitParam = listParams.length;
    listParams.push(offset);
    const offsetParam = listParams.length;
    const rs = await query(
      `SELECT c.*,
              COALESCE(ob.outstanding_amount, 0)::numeric(14,2) AS outstanding_amount
       FROM customers c
       LEFT JOIN (
         SELECT customer_id, SUM(balance_due)::numeric(14,2) AS outstanding_amount
         FROM sales_invoices
         WHERE account_id = $1
           AND status = 'CONFIRMED'::sales_invoice_status
           AND payment_status IN ('UNPAID'::sales_payment_status, 'PARTIAL'::sales_payment_status)
           AND deleted_at IS NULL
         GROUP BY customer_id
       ) ob ON ob.customer_id = c.id
       ${whereSql} ${orderSql} LIMIT $${limitParam} OFFSET $${offsetParam}`,
      listParams
    );
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const list = (rs.rows || []).map(mapCustomerRow);
    const walkInCustomer =
      roleCode === "RETAILER" && accountSettings?.walk_in_customer_id
        ? list.find((x) => String(x.id) === String(accountSettings.walk_in_customer_id)) || null
        : null;
    return ok({
      roleCode,
      walk_in_customer_id: accountSettings?.walk_in_customer_id || null,
      walk_in_customer: walkInCustomer,
      customers: list,
      pagination: { page, limit, total, total_pages: totalPages, has_next: page < totalPages, has_prev: page > 1 }
    });
  } catch (e) {
    console.error("customers.list failed", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
