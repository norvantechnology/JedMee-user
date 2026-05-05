const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_INVOICES", "DELETE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const id = String(event?.pathParameters?.id || "").trim();
  if (!id) return fail(400, "BAD_REQUEST", "id is required");

  try {
    const cur = await query(
      `
      SELECT id, status, amount_paid
      FROM purchase_invoices
      WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
      LIMIT 1
      `,
      [id, ctx.accountId]
    );
    const row = cur.rows?.[0];
    if (!row) return fail(404, "NOT_FOUND", "Purchase invoice not found.");

    const st = String(row.status || "");
    if (st !== "DRAFT" && st !== "CANCELLED") {
      return fail(
        400,
        "BUSINESS_RULE",
        "Only draft or cancelled invoices can be removed from the list. Cancel a confirmed invoice first if needed."
      );
    }
    if (st === "DRAFT" && Number(row.amount_paid || 0) > 0) {
      return fail(400, "BUSINESS_RULE", "Cannot remove a draft that has payments recorded.");
    }

    const upd = await query(
      `
      UPDATE purchase_invoices
      SET deleted_at = now(),
          deleted_by_user_id = $3,
          updated_at = now()
      WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
      RETURNING id
      `,
      [id, ctx.accountId, actorId]
    );
    if (!upd.rows[0]) return fail(404, "NOT_FOUND", "Purchase invoice not found.");

    return ok({ id }, { message: "Purchase invoice removed from list.", subMessage: "The record is kept for audit but hidden from screens." });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[purchase-invoices:delete]", e);
    const detail = e && (e.detail || e.message) ? String(e.detail || e.message) : "Please try again.";
    const hint =
      /deleted_at|column/i.test(detail) && /does not exist/i.test(detail)
        ? " Apply sql/migrations/022_purchase_invoices_soft_delete.sql to your database."
        : "";
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: `${detail}${hint}` });
  }
}

module.exports = { handler };
