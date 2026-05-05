const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function clean(v) {
  return String(v ?? "").trim();
}

async function handler(event) {
  const auth = await requirePermission(event, "MFG_COMPANIES", "VIEW");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const id = clean(event?.pathParameters?.id);
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  const companyRs = await query(
    `SELECT id, name, sale_lock, purchase_order_lock, stock_report_lock
     FROM mfg_companies
     WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [id, ctx.accountId]
  );
  const company = companyRs.rows?.[0];
  if (!company) return fail(404, "NOT_FOUND", "Company not found.");

  const impactRs = await query(
    `
    SELECT
      COUNT(DISTINCT p.id)::int AS product_count,
      COUNT(DISTINCT pb.id)::int AS active_batch_count
    FROM products p
    LEFT JOIN product_batches pb
      ON pb.account_id = p.account_id
     AND pb.product_id = p.id
     AND pb.deleted_at IS NULL
    WHERE p.account_id = $1
      AND p.mfg_company_id = $2
      AND p.deleted_at IS NULL
    `,
    [ctx.accountId, id]
  );

  return ok({
    company,
    impact: {
      productCount: Number(impactRs.rows?.[0]?.product_count || 0),
      activeBatchCount: Number(impactRs.rows?.[0]?.active_batch_count || 0)
    }
  });
}

module.exports = { handler };

