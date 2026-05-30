const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getSortFromEvent, buildOrderBy } = require("../../shared/sort");
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
      created_at: "v.created_at",
      code: "v.code",
      name: "v.name",
      short_name: "v.short_name",
      rack_number: "v.rack_number",
      main_company: "v.main_company",
      is_active: "v.is_active",
      updated_at: "v.updated_at"
    },
    fallback: "v.created_at DESC"
  });

  try {
    const res = await query(
      `
      SELECT v.*,
             COALESCE(ob.outstanding_amount, 0)::numeric(14,2) AS outstanding_amount
      FROM vendors v
      LEFT JOIN (
        SELECT vendor_id, SUM(balance_due)::numeric(14,2) AS outstanding_amount
        FROM purchase_invoices
        WHERE account_id = $1
          AND status = 'CONFIRMED'::purchase_invoice_status
          AND payment_status IN ('UNPAID'::invoice_payment_status, 'PARTIAL'::invoice_payment_status)
          AND deleted_at IS NULL
          AND vendor_id IS NOT NULL
        GROUP BY vendor_id
      ) ob ON ob.vendor_id = v.id
      WHERE v.account_id = $1 AND v.deleted_at IS NULL
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
