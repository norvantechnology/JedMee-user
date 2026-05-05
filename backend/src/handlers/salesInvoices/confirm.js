const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");
const { runConfirmSalesInvoiceInTx } = require("./runConfirmSalesCore");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const invoiceId = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!invoiceId) return fail(400, "VALIDATION_ERROR", "invoice id is required");

  const body = parseJsonBody(event);
  const markPaidRaw = body?.markPaidAtConfirm;
  const confirmOptions = {};
  if (markPaidRaw === true || markPaidRaw === false) confirmOptions.markPaidAtConfirm = markPaidRaw;

  let confirmStep = "start";
  try {
    const result = await withTransaction(async (q) => {
      return runConfirmSalesInvoiceInTx(q, { accountId: ctx.accountId, actorId, confirmOptions }, invoiceId);
    });
    if (result?.err) return result.err;
    await refreshLowStockNotifications(ctx.accountId, result?.affectedBatchIds || []);
    return ok({ id: invoiceId }, { message: "Sales invoice confirmed.", warnings: result?.warnings || [] });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[sales-invoice:confirm] failed", {
      step: confirmStep,
      invoiceId,
      accountId: ctx.accountId,
      actorId,
      message: e?.message,
      stack: e?.stack,
      code: e?.code,
      detail: e?.detail,
      constraint: e?.constraint,
      table: e?.table,
      column: e?.column,
      routine: e?.routine,
      where: e?.where
    });
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
