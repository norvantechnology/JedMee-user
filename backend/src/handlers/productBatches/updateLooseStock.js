const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const batchId = String(event?.pathParameters?.id || "");
  if (!batchId) return fail(400, "VALIDATION_ERROR", "batch id is required");
  const body = parseJsonBody(event);
  const looseStock = Number(body.looseStock ?? body.loose_stock);
  if (!Number.isFinite(looseStock) || looseStock < 0) {
    return fail(400, "VALIDATION_ERROR", "looseStock must be a non-negative number.");
  }
  const looseUnitNameRaw = body.looseUnitName ?? body.loose_unit_name;
  const looseUnitName = looseUnitNameRaw === undefined || looseUnitNameRaw === null
    ? null
    : String(looseUnitNameRaw).trim().slice(0, 20).toUpperCase();
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  try {
    const data = await withTransaction(async (q) => {
      const rs = await q(
        `UPDATE product_batches
         SET loose_stock = $3,
             loose_unit_name = COALESCE($4, loose_unit_name),
             updated_at = now()
         WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
         RETURNING id, product_id, batch_no, loose_stock, loose_unit_name`,
        [batchId, ctx.accountId, looseStock, looseUnitName]
      );
      const row = rs.rows?.[0] || null;
      if (!row) return { err: fail(404, "NOT_FOUND", "Batch not found.") };
      await q(
        `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, note, created_by_user_id)
         VALUES ($1, $2, 'ADJUSTMENT', 0, 0, $3, $4)`,
        [ctx.accountId, batchId, `Loose stock set to ${row.loose_stock} ${row.loose_unit_name || "UNIT"}`, actorId]
      );
      return { item: row };
    });
    if (data?.err) return data.err;
    return ok(data, { message: "Loose stock updated." });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
