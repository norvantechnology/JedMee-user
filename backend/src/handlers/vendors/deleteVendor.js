const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { mapVendorPgError, logVendorPgError } = require("../../shared/vendorPgErrors");
const { mapDbConnectivityError } = require("../../shared/dbConnectivity");

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "DELETE");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const id = String(getPathParam(event, "id") || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  try {
    const del = await query(
      `
      UPDATE vendors
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
      RETURNING id
      `,
      [id, ctx.accountId]
    );
    if (!del.rows[0]) return fail(404, "NOT_FOUND", "Vendor not found");

    return ok({ deleted: true }, { message: "Vendor deleted.", subMessage: "Vendor has been removed successfully." });
  } catch (e) {
    const net = mapDbConnectivityError(e);
    if (net) return net;
    logVendorPgError("delete", e);
    const mapped = mapVendorPgError(e);
    if (mapped) return mapped;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
