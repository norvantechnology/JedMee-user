const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseIdsFromBody } = require("../../shared/bulkIds");
const { cancelSalesInvoiceTx } = require("./cancelCore");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "DELETE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const parsed = parseIdsFromBody(body);
  if (!parsed.ok) return fail(400, "VALIDATION_ERROR", parsed.error);
  const ids = parsed.ids;
  const cancelReason = String(body.cancelReason || body.cancel_reason || "Cancelled from UI").trim() || "Cancelled from UI";

  const cancelledIds = [];
  const failed = [];
  const allAffectedBatches = new Set();

  for (const invoiceId of ids) {
    try {
      const result = await withTransaction(async (q) =>
        cancelSalesInvoiceTx(q, { accountId: ctx.accountId, actorId, invoiceId, cancelReason })
      );
      if (!result.ok) failed.push({ id: invoiceId, message: result.message, code: result.code });
      else {
        cancelledIds.push(invoiceId);
        for (const b of result.affectedBatchIds || []) allAffectedBatches.add(b);
      }
    } catch (e) {
      failed.push({ id: invoiceId, message: String(e.message || "Error") });
    }
  }

  await refreshLowStockNotifications(ctx.accountId, [...allAffectedBatches]);

  return ok(
    { cancelledIds, failed },
    {
      message:
        failed.length && cancelledIds.length
          ? `Cancelled ${cancelledIds.length} invoice(s); ${failed.length} could not be cancelled.`
          : failed.length
            ? "No invoices were cancelled."
            : `Cancelled ${cancelledIds.length} invoice(s).`
    }
  );
}

module.exports = { handler };
