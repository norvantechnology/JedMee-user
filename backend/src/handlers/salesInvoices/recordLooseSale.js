const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const invoiceId = String(event?.pathParameters?.id || "");
  if (!invoiceId) return fail(400, "VALIDATION_ERROR", "invoice id is required");
  const body = parseJsonBody(event);
  const batchId = String(body.batchId || body.batch_id || "");
  const looseQty = Number(body.looseQty ?? body.loose_qty);
  const note = String(body.note || "").trim();
  if (!batchId) return fail(400, "VALIDATION_ERROR", "batchId is required.");
  if (!Number.isFinite(looseQty) || looseQty <= 0) {
    return fail(400, "VALIDATION_ERROR", "looseQty must be greater than 0.");
  }
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  try {
    const data = await withTransaction(async (q) => {
      const invRes = await q(
        `SELECT id, invoice_number, status
         FROM sales_invoices
         WHERE id = $1 AND account_id = $2
         LIMIT 1`,
        [invoiceId, ctx.accountId]
      );
      const inv = invRes.rows?.[0] || null;
      if (!inv) return { err: fail(404, "NOT_FOUND", "Invoice not found.") };
      if (String(inv.status) !== "CONFIRMED") {
        return { err: fail(400, "BUSINESS_RULE", "Loose sale can only be posted on CONFIRMED invoices.") };
      }
      const hasBatchRes = await q(
        `SELECT 1
         FROM sales_invoice_items
         WHERE sales_invoice_id = $1 AND account_id = $2 AND batch_id = $3
         LIMIT 1`,
        [invoiceId, ctx.accountId, batchId]
      );
      if (!hasBatchRes.rows?.length) {
        return { err: fail(400, "VALIDATION_ERROR", "Batch does not belong to this invoice.") };
      }

      const batchRes = await q(
        `SELECT id, batch_no, loose_stock, loose_unit_name
         FROM product_batches
         WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [batchId, ctx.accountId]
      );
      const batch = batchRes.rows?.[0] || null;
      if (!batch) return { err: fail(404, "NOT_FOUND", "Batch not found.") };
      const availableLoose = Number(batch.loose_stock || 0);
      if (availableLoose < looseQty) {
        return {
          err: fail(
            400,
            "BUSINESS_RULE",
            `Insufficient loose stock. Available: ${availableLoose} ${batch.loose_unit_name || "UNIT"}.`
          )
        };
      }

      await q(`UPDATE product_batches SET loose_stock = loose_stock - $3, updated_at = now() WHERE id = $1 AND account_id = $2`, [
        batchId,
        ctx.accountId,
        looseQty
      ]);
      await q(
        `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, note, created_by_user_id)
         VALUES ($1, $2, 'LOOSE_SALE', 0, 0, $3, $4)`,
        [
          ctx.accountId,
          batchId,
          note || `Loose sale (${looseQty} ${batch.loose_unit_name || "UNIT"}) via invoice ${inv.invoice_number || inv.id}`,
          actorId
        ]
      );
      return { invoiceId, batchId, looseQty, looseUnitName: batch.loose_unit_name || "UNIT" };
    });
    if (data?.err) return data.err;
    return ok(data, { message: "Loose sale recorded." });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
