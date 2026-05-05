const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { clean, n, getAccountContextForUser } = require("../orders/_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const actor = await getAccountContextForUser(actorId);
  if (String(actor?.role_code || "").toUpperCase() !== "WHOLESALER") return fail(403, "FORBIDDEN", "Only wholesaler can update links.");

  const id = clean(event?.pathParameters?.id);
  const body = parseJsonBody(event);
  const status = clean(body.status).toUpperCase();
  if (!id) return fail(400, "VALIDATION_ERROR", "link id is required.");
  if (status && !["PENDING", "ACTIVE", "BLOCKED"].includes(status)) return fail(400, "VALIDATION_ERROR", "Invalid status.");

  try {
    const up = await query(
      `
      UPDATE wholesaler_retailer_links
      SET status = COALESCE(NULLIF($3, ''), status),
          linked_at = CASE WHEN COALESCE(NULLIF($3, ''), status) = 'ACTIVE' THEN COALESCE(linked_at, now()) ELSE linked_at END,
          credit_days = COALESCE($4, credit_days),
          credit_limit = COALESCE($5, credit_limit),
          discount_percent = COALESCE($6, discount_percent),
          updated_at = now()
      WHERE id = $1
        AND wholesaler_account_id = $2
      RETURNING *
      `,
      [id, perms.accountId, status || "", body.credit_days ?? body.creditDays ?? null, body.credit_limit ?? body.creditLimit ?? null, n(body.discount_percent ?? body.discountPercent)]
    );
    if (!up.rows?.[0]) return fail(404, "NOT_FOUND", "Link not found.");
    return ok({ link: up.rows[0] }, { message: "Connection updated." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to update connection.");
  }
}

module.exports = { handler };

