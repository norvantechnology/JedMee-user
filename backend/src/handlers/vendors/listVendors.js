const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getSortFromEvent, buildOrderBy } = require("../../shared/sort");
const { VENDOR_ROW_COLUMNS } = require("../../shared/vendorInput");
const { mapVendorPgError, logVendorPgError } = require("../../shared/vendorPgErrors");
const { mapDbConnectivityError } = require("../../shared/dbConnectivity");

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "VIEW");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const sort = getSortFromEvent(event);
  const orderBy = buildOrderBy({
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    allowed: {
      created_at: "created_at",
      code: "code",
      name: "name",
      short_name: "short_name",
      rack_number: "rack_number",
      main_company: "main_company",
      is_active: "is_active",
      updated_at: "updated_at"
    },
    fallback: "created_at DESC"
  });

  try {
    const res = await query(
      `
      SELECT ${VENDOR_ROW_COLUMNS}
      FROM vendors
      WHERE account_id = $1 AND deleted_at IS NULL
      ${orderBy}
      `,
      [ctx.accountId]
    );

    return ok({ vendors: res.rows || [] });
  } catch (e) {
    const net = mapDbConnectivityError(e);
    if (net) return net;
    logVendorPgError("list", e);
    const mapped = mapVendorPgError(e);
    if (mapped) return mapped;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
