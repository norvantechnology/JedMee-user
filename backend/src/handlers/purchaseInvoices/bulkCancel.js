const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction, query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseIdsFromBody } = require("../../shared/bulkIds");
const { cancelPurchaseInvoiceTx } = require("./cancelCore");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");
const { MSG } = require("../../shared/apiMessages");
const {
  enrichBulkFailuresWithInvoiceNumbers,
  buildBulkInvoiceOkPayload,
  bulkMetaMessage,
  shortUserMessage
} = require("../../shared/bulkInvoiceResult");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_INVOICES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", MSG.ACCOUNT_NOT_FOUND);

  const body = parseJsonBody(event);
  const parsed = parseIdsFromBody(body);
  if (!parsed.ok) return fail(400, "VALIDATION_ERROR", shortUserMessage(parsed.error));
  const ids = parsed.ids;
  const cancelReason = String(body.cancelReason || body.cancel_reason || "Cancelled from UI").trim() || "Cancelled from UI";

  const cancelledIds = [];
  const failed = [];
  const allAffectedBatches = new Set();

  for (const invoiceId of ids) {
    try {
      const result = await withTransaction(async (q) =>
        cancelPurchaseInvoiceTx(q, { accountId: ctx.accountId, actorId, invoiceId, cancelReason })
      );
      if (!result.ok) {
        failed.push({ id: invoiceId, message: shortUserMessage(result.message), code: result.code });
      } else {
        cancelledIds.push(invoiceId);
        for (const b of result.affectedBatchIds || []) allAffectedBatches.add(b);
      }
    } catch (e) {
      failed.push({ id: invoiceId, message: shortUserMessage(e.message || MSG.CANNOT_PROCESS) });
    }
  }

  await refreshLowStockNotifications(ctx.accountId, [...allAffectedBatches]);

  const enrichedFailed = await enrichBulkFailuresWithInvoiceNumbers(query, {
    accountId: ctx.accountId,
    tableName: "purchase_invoices",
    failed
  });

  return ok(
    buildBulkInvoiceOkPayload({
      succeededIds: cancelledIds,
      failed: enrichedFailed,
      selectedCount: ids.length,
      succeededKey: "cancelledIds"
    }),
    {
      message: bulkMetaMessage({
        verbPast: "cancelled",
        successCount: cancelledIds.length,
        failedCount: enrichedFailed.length
      })
    }
  );
}

module.exports = { handler };
