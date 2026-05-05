const { ok, fail } = require("../../shared/response");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");
const { runConfirmSalesReturnInTx } = require("./runConfirmSalesReturnCore");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_RETURNS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const id = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!id) return fail(400, "VALIDATION_ERROR", "return id is required");
  try {
    const data = await withTransaction(async (q) => runConfirmSalesReturnInTx(q, { accountId: ctx.accountId, actorId }, id));
    if (data?.err) return data.err;
    await refreshLowStockNotifications(ctx.accountId, data?.affectedBatchIds || []);
    return ok(data, { message: "Sales return confirmed." });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
