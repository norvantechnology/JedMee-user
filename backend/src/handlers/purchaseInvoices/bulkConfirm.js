const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseIdsFromBody } = require("../../shared/bulkIds");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");
const { runConfirmPurchaseInvoiceInTx } = require("./runConfirmPurchaseCore");
const { parseConfirmPaymentOptions } = require("../../shared/paymentModes");

function errMessage(errResp) {
  try {
    const b = JSON.parse(errResp.body || "{}");
    return String(b?.error?.message || b?.error?.subMessage || "Cannot confirm purchase.");
  } catch {
    return "Cannot confirm purchase.";
  }
}

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_INVOICES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const parsed = parseIdsFromBody(body, { max: 200 });
  if (!parsed.ok) return fail(400, "VALIDATION_ERROR", parsed.error);
  const ids = parsed.ids;
  const confirmOptions = parseConfirmPaymentOptions(body);

  const confirmedIds = [];
  const failed = [];
  const allAffectedBatches = new Set();

  for (const invoiceId of ids) {
    try {
      const result = await withTransaction(async (q) =>
        runConfirmPurchaseInvoiceInTx(q, { accountId: ctx.accountId, actorId, confirmOptions }, invoiceId, null)
      );
      if (result?.err) {
        failed.push({ id: invoiceId, message: errMessage(result.err) });
        continue;
      }
      confirmedIds.push(invoiceId);
      for (const b of result?.affectedBatchIds || []) allAffectedBatches.add(String(b));
    } catch (e) {
      failed.push({ id: invoiceId, message: String(e.message || "Error") });
    }
  }

  await refreshLowStockNotifications(ctx.accountId, [...allAffectedBatches]);

  return ok(
    { confirmedIds, failed },
    {
      message:
        failed.length && confirmedIds.length
          ? `Confirmed ${confirmedIds.length} purchase(s); ${failed.length} failed.`
          : failed.length
            ? "No purchase invoices were confirmed."
            : `Confirmed ${confirmedIds.length} purchase invoice(s).`
    }
  );
}

module.exports = { handler };
