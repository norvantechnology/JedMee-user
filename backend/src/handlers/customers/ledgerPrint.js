const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { buildCustomerLedgerDoc } = require("./ledgerDoc");

async function handler(event) {
  const auth = await requirePermission(event, "CUSTOMERS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const customerId = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!customerId) return fail(400, "VALIDATION_ERROR", "customer id is required");

  try {
    const doc = await buildCustomerLedgerDoc({ accountId: ctx.accountId, customerId });
    if (!doc) return fail(404, "NOT_FOUND", "Customer not found");
    return ok(doc);
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };

