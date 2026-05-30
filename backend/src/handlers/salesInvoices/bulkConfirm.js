const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction, query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseIdsFromBody } = require("../../shared/bulkIds");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");
const { runConfirmSalesInvoiceInTx } = require("./runConfirmSalesCore");
const { parseConfirmPaymentOptions } = require("../../shared/paymentModes");
const { MSG } = require("../../shared/apiMessages");
const {
  bulkErrMessage,
  enrichBulkFailuresWithInvoiceNumbers,
  buildBulkInvoiceOkPayload,
  bulkMetaMessage,
  shortUserMessage
} = require("../../shared/bulkInvoiceResult");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", MSG.ACCOUNT_NOT_FOUND);

  const body = parseJsonBody(event);
  const parsed = parseIdsFromBody(body, { max: 200 });
  if (!parsed.ok) return fail(400, "VALIDATION_ERROR", shortUserMessage(parsed.error));
  const ids = parsed.ids;
  const confirmOptions = parseConfirmPaymentOptions(body);

  const confirmedIds = [];
  const failed = [];
  const allAffectedBatches = new Set();
  const warnings = [];

  for (const invoiceId of ids) {
    try {
      const result = await withTransaction(async (q) =>
        runConfirmSalesInvoiceInTx(q, { accountId: ctx.accountId, actorId, confirmOptions }, invoiceId)
      );
      if (result?.err) {
        failed.push({ id: invoiceId, message: bulkErrMessage(result.err) });
        continue;
      }
      confirmedIds.push(invoiceId);
      for (const b of result?.affectedBatchIds || []) allAffectedBatches.add(String(b));
      for (const w of result?.warnings || []) warnings.push({ invoiceId, message: String(w || "") });
    } catch (e) {
      failed.push({ id: invoiceId, message: shortUserMessage(e.message || MSG.CANNOT_PROCESS) });
    }
  }

  await refreshLowStockNotifications(ctx.accountId, [...allAffectedBatches]);

  const enrichedFailed = await enrichBulkFailuresWithInvoiceNumbers(query, {
    accountId: ctx.accountId,
    tableName: "sales_invoices",
    failed
  });

  return ok(
    buildBulkInvoiceOkPayload({
      succeededIds: confirmedIds,
      failed: enrichedFailed,
      selectedCount: ids.length,
      succeededKey: "confirmedIds"
    }),
    {
      message: bulkMetaMessage({
        verbPast: "confirmed",
        successCount: confirmedIds.length,
        failedCount: enrichedFailed.length
      }),
      warnings
    }
  );
}

module.exports = { handler };
