const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { clean } = require("../../shared/purchase");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");
const { runConfirmPurchaseInvoiceInTx } = require("./runConfirmPurchaseCore");
const { parseConfirmPaymentOptions } = require("../../shared/paymentModes");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_INVOICES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const id = String(event?.pathParameters?.id || "").trim();
  if (!id) return fail(400, "BAD_REQUEST", "id is required");
  const body = parseJsonBody(event);

  let lastQueryLabel = "init";

  try {
    const confirmOptions = parseConfirmPaymentOptions(body);
    const data = await withTransaction(async (rawQ) => {
      return runConfirmPurchaseInvoiceInTx(
        rawQ,
        { accountId: ctx.accountId, actorId, confirmOptions },
        id,
        clean(body.confirmNote) || null
      );
    });

    if (data?.err) return data.err;
    await refreshLowStockNotifications(ctx.accountId, data?.affectedBatchIds || []);
    return ok(data, { message: data?.alreadyConfirmed ? "Invoice already confirmed." : "Purchase invoice confirmed and stock posted." });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[purchase-invoice:confirm] failed", {
      step: e._queryLabel || lastQueryLabel,
      message: e.message,
      code: e.code,
      table: e.table,
      column: e.column,
      constraint: e.constraint,
      detail: e.detail,
      where: e.where,
      routine: e.routine,
      queryText: e._queryText,
      queryParams: e._queryParams
    });
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", {
      subMessage: String(e.message || "Please try again."),
      step: e._queryLabel || lastQueryLabel,
      pgCode: e.code || null,
      pgTable: e.table || null,
      pgColumn: e.column || null,
      pgConstraint: e.constraint || null,
      pgDetail: e.detail || null,
      pgWhere: e.where || null,
      pgRoutine: e.routine || null
    });
  }
}

module.exports = { handler };
