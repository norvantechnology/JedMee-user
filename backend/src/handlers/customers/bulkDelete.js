const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseJsonBody } = require("../../shared/request");
const { parseIdsFromBody } = require("../../shared/bulkIds");

async function handler(event) {
  const auth = await requirePermission(event, "CUSTOMERS", "DELETE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const parsed = parseIdsFromBody(parseJsonBody(event));
  if (!parsed.ok) return fail(400, "VALIDATION_ERROR", parsed.error);
  const ids = parsed.ids;

  try {
    const blockedRs = await query(
      `SELECT DISTINCT si.customer_id::text AS id
       FROM sales_invoices si
       WHERE si.account_id = $1
         AND si.customer_id = ANY($2::uuid[])
         AND si.status = 'CONFIRMED'::sales_invoice_status
         AND si.payment_status IN ('UNPAID'::sales_payment_status, 'PARTIAL'::sales_payment_status)`,
      [ctx.accountId, ids]
    );
    const blocked = new Set((blockedRs.rows || []).map((r) => String(r.id)));
    const deletable = ids.filter((id) => !blocked.has(String(id)));
    const failed = ids.filter((id) => blocked.has(String(id))).map((id) => ({
      id,
      message: "Cannot delete customer with outstanding invoices."
    }));

    if (deletable.length) {
      await query(
        `UPDATE customers
         SET deleted_at = now(), updated_at = now(), updated_by_user_id = $3
         WHERE account_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
        [ctx.accountId, deletable, actorId]
      );
    }

    return ok(
      { deletedIds: deletable, failed },
      {
        message:
          failed.length && deletable.length
            ? `Deleted ${deletable.length} customer(s); ${failed.length} could not be deleted.`
            : failed.length
              ? "No customers were deleted."
              : `Deleted ${deletable.length} customer(s).`
      }
    );
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
