const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { cancelSalesInvoiceTx } = require("./cancelCore");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "DELETE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const invoiceId = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!invoiceId) return fail(400, "VALIDATION_ERROR", "invoice id is required");
  const body = parseJsonBody(event);
  const cancelReason = body.cancelReason || body.cancel_reason || "Cancelled from UI";

  try {
    const result = await withTransaction(async (q) =>
      cancelSalesInvoiceTx(q, { accountId: ctx.accountId, actorId, invoiceId, cancelReason })
    );
    if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 400, result.code, result.message);
    await refreshLowStockNotifications(ctx.accountId, result.affectedBatchIds || []);
    return ok({ id: invoiceId }, { message: "Sales invoice cancelled." });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
