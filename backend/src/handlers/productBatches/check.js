const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function clean(v) {
  return String(v ?? "").trim();
}

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const productId = clean(qs.product_id || qs.productId);
  const productCode = clean(qs.product_code || qs.productCode);
  const batchNo = clean(qs.batch_no || qs.batchNo);
  const excludeId = clean(qs.exclude_id || qs.excludeId);

  if ((!productId && !productCode) || !batchNo) return fail(400, "VALIDATION_ERROR", "product_id/product_code and batch_no are required");

  try {
    let resolvedProductId = productId;
    if (!resolvedProductId && productCode) {
      const p = await query(
        `SELECT id
         FROM products
         WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2)
         LIMIT 1`,
        [ctx.accountId, productCode]
      );
      resolvedProductId = String(p.rows?.[0]?.id || "");
    }
    if (!resolvedProductId) return ok({ exists: false, batch: null });

    const rs = await query(
      `SELECT id, product_id, batch_no
       FROM product_batches
       WHERE account_id = $1
         AND product_id = $2
         AND deleted_at IS NULL
         AND lower(batch_no) = lower($3)
         AND ($4 = '' OR id::text <> $4)
       LIMIT 1`,
      [ctx.accountId, resolvedProductId, batchNo, excludeId]
    );
    return ok({
      exists: Boolean(rs.rows?.[0]),
      batch: rs.rows?.[0] || null
    });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
