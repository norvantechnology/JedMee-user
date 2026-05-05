const { ok, fail } = require("../../shared/response");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "DELETE");
  if (!auth.ok) return auth.resp;

  const ctx = await getPermissionsForUser(String(auth.claims?.sub || ""));
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const id = String(getPathParam(event, "id") || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  try {
    const result = await withTransaction(async (q) => {
      const prod = await q(
        `SELECT id FROM products WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [id, ctx.accountId]
      );
      if (!prod.rows?.[0]) return { ok: false, code: "NOT_FOUND" };

      const batches = await q(
        `
        UPDATE product_batches
        SET deleted_at = now(), updated_at = now()
        WHERE account_id = $1 AND product_id = $2 AND deleted_at IS NULL
        RETURNING id
        `,
        [ctx.accountId, id]
      );

      const upd = await q(
        `
        UPDATE products
        SET deleted_at = now(), updated_at = now()
        WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
        RETURNING id
        `,
        [id, ctx.accountId]
      );
      if (!upd.rows?.[0]) return { ok: false, code: "NOT_FOUND" };

      return {
        ok: true,
        batchesSoftDeleted: (batches.rows || []).length
      };
    });

    if (!result.ok) {
      if (result.code === "NOT_FOUND") return fail(404, "NOT_FOUND", "Product not found.");
      return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
    }

    return ok(
      { deleted: true, batchesSoftDeleted: result.batchesSoftDeleted },
      {
        message: "Product removed.",
        subMessage:
          result.batchesSoftDeleted > 0
            ? `Soft-deleted this product and ${result.batchesSoftDeleted} batch record(s). Historical invoices are unchanged.`
            : "Soft-deleted this product. Historical invoices are unchanged."
      }
    );
  } catch (e) {
    console.error("[products:delete]", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
