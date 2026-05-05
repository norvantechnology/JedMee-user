const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { query } = require("../../shared/db");
const { clean, getAccountContextForUser, getAccountProfile } = require("../orders/_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_ORDERS", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const perms = await getPermissionsForUser(actorId);
  if (!perms.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const actor = await getAccountContextForUser(actorId);
  if (String(actor?.role_code || "").toUpperCase() !== "RETAILER") return fail(403, "FORBIDDEN", "Only retailer can request connection.");

  const body = parseJsonBody(event);
  const wholesalerAccountId = clean(body.wholesaler_account_id || body.wholesalerAccountId);
  if (!wholesalerAccountId) return fail(400, "VALIDATION_ERROR", "wholesaler_account_id is required.");
  const wholesaler = await getAccountProfile(wholesalerAccountId);
  if (!wholesaler || String(wholesaler.role_code || "").toUpperCase() !== "WHOLESALER") return fail(400, "VALIDATION_ERROR", "Invalid wholesaler account.");

  try {
    const ins = await query(
      `
      INSERT INTO wholesaler_retailer_links (wholesaler_account_id, retailer_account_id, status, linked_at)
      VALUES ($1,$2,'PENDING',NULL)
      ON CONFLICT (wholesaler_account_id, retailer_account_id)
      DO UPDATE SET updated_at = now()
      RETURNING *
      `,
      [wholesalerAccountId, perms.accountId]
    );
    return created({ link: ins.rows?.[0] || null }, { message: "Connection request sent." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Failed to create connection.");
  }
}

module.exports = { handler };

