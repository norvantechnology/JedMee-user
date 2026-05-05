const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseJsonBody } = require("../../shared/request");
const { parseIdsFromBody } = require("../../shared/bulkIds");
const { mapVendorPgError, logVendorPgError } = require("../../shared/vendorPgErrors");
const { mapDbConnectivityError } = require("../../shared/dbConnectivity");

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "DELETE");
  if (!auth.ok) return auth.resp;
  const ctx = await getPermissionsForUser(String(auth.claims?.sub || ""));
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const parsed = parseIdsFromBody(parseJsonBody(event));
  if (!parsed.ok) return fail(400, "VALIDATION_ERROR", parsed.error);
  const ids = parsed.ids;

  try {
    const upd = await query(
      `
      UPDATE vendors
      SET deleted_at = now(), updated_at = now()
      WHERE account_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL
      RETURNING id
      `,
      [ctx.accountId, ids]
    );
    const deleted = (upd.rows || []).map((r) => String(r.id));
    const deletedSet = new Set(deleted);
    const missing = ids.filter((id) => !deletedSet.has(String(id))).map((id) => ({ id, message: "Vendor not found or already deleted." }));

    return ok(
      { deletedIds: deleted, failed: missing },
      {
        message: missing.length
          ? `Deleted ${deleted.length} vendor(s); ${missing.length} not found.`
          : `Deleted ${deleted.length} vendor(s).`
      }
    );
  } catch (e) {
    const net = mapDbConnectivityError(e);
    if (net) return net;
    logVendorPgError("bulkDelete", e);
    const mapped = mapVendorPgError(e);
    if (mapped) return mapped;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
