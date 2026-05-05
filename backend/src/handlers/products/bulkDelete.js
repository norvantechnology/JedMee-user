const { ok, fail } = require("../../shared/response");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseJsonBody } = require("../../shared/request");
const { parseIdsFromBody } = require("../../shared/bulkIds");

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "DELETE");
  if (!auth.ok) return auth.resp;

  const ctx = await getPermissionsForUser(String(auth.claims?.sub || ""));
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const parsed = parseIdsFromBody(parseJsonBody(event));
  if (!parsed.ok) return fail(400, "VALIDATION_ERROR", parsed.error);
  const ids = parsed.ids;

  try {
    const result = await withTransaction(async (q) => {
      const bt = await q(
        `
        UPDATE product_batches
        SET deleted_at = now(), updated_at = now()
        WHERE account_id = $1
          AND product_id = ANY($2::uuid[])
          AND deleted_at IS NULL
        RETURNING id
        `,
        [ctx.accountId, ids]
      );

      const pr = await q(
        `
        UPDATE products
        SET deleted_at = now(), updated_at = now()
        WHERE account_id = $1
          AND id = ANY($2::uuid[])
          AND deleted_at IS NULL
        RETURNING id
        `,
        [ctx.accountId, ids]
      );

      const deletedIds = (pr.rows || []).map((r) => String(r.id));
      const deletedSet = new Set(deletedIds);
      const failed = ids.filter((id) => !deletedSet.has(String(id))).map((id) => ({
        id,
        message: "Product not found or already removed."
      }));

      return {
        deletedIds,
        failed,
        batchesSoftDeleted: (bt.rows || []).length
      };
    });

    return ok(result, {
      message:
        result.failed.length > 0
          ? `Soft-deleted ${result.deletedIds.length} product(s); ${result.failed.length} not found.`
          : `Soft-deleted ${result.deletedIds.length} product(s).`,
      subMessage:
        result.batchesSoftDeleted > 0
          ? `Also soft-deleted ${result.batchesSoftDeleted} batch record(s). Historical invoices are unchanged.`
          : undefined
    });
  } catch (e) {
    console.error("[products:bulkDelete]", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
