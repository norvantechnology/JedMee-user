const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { cancelPurchaseInvoiceTx } = require("./cancelCore");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_INVOICES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const id = String(event?.pathParameters?.id || "").trim();
  if (!id) return fail(400, "BAD_REQUEST", "id is required");
  const body = parseJsonBody(event);
  const cancelReason = body.cancelReason || "Cancelled by user";

  try {
    const result = await withTransaction(async (q) => {
      const r = await cancelPurchaseInvoiceTx(q, { accountId: ctx.accountId, actorId, invoiceId: id, cancelReason });
      if (!r.ok) return { err: r };
      const done = await q(
        `SELECT * FROM purchase_invoices WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [id, ctx.accountId]
      );
      return {
        invoice: done.rows?.[0] || null,
        alreadyCancelled: Boolean(r.alreadyCancelled),
        affectedBatchIds: r.affectedBatchIds || []
      };
    });
    if (result?.err) {
      const e = result.err;
      return fail(e.code === "NOT_FOUND" ? 404 : 400, e.code, e.message);
    }
    await refreshLowStockNotifications(ctx.accountId, result?.affectedBatchIds || []);
    return ok(
      { invoice: result.invoice },
      { message: result.alreadyCancelled ? "Invoice already cancelled." : "Purchase invoice cancelled." }
    );
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
