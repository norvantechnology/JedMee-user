const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { mapCustomerRow, validateCustomerPayload } = require("./_common");

async function handler(event) {
  const auth = await requirePermission(event, "CUSTOMERS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const customerId = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!customerId) return fail(400, "VALIDATION_ERROR", "customer id is required");

  const body = parseJsonBody(event);
  const v = validateCustomerPayload(body, true);
  if (!v.ok) return fail(400, "VALIDATION_ERROR", v.errs[0], { details: v.errs });

  try {
    const exists = await query(`SELECT id FROM customers WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [customerId, ctx.accountId]);
    if (!exists.rows?.length) return fail(404, "NOT_FOUND", "Customer not found");
    const rs = await query(
      `UPDATE customers SET
        code = COALESCE(NULLIF($3,''), code),
        name = COALESCE(NULLIF($4,''), name),
        short_name = $5,
        phone_country_code = $6,
        phone_number = $7,
        email = $8,
        address = $9,
        city = $10,
        state = $11,
        pincode = $12,
        customer_type = $13::customer_type_enum,
        gst_number = $14,
        drug_license_number = $15,
        dl_expiry_date = $16,
        credit_days = $17,
        credit_limit = $18,
        discount_percent = $19,
        is_active = $20,
        is_cash_customer = $21,
        notes = $22,
        updated_by_user_id = $23,
        updated_at = now(),
        b2b_flag = $24,
        state_code = $25,
        gstin_validated_at = $26
      WHERE id = $1 AND account_id = $2
      RETURNING *`,
      [
        customerId, ctx.accountId, v.out.code || null, v.out.name || null, v.out.shortName || null, v.out.phoneCountryCode || null, v.out.phoneNumber || null,
        v.out.email || null, v.out.address || null, v.out.city || null, v.out.state || null, v.out.pincode || null, v.out.customerType,
        v.out.gstNumber || null, v.out.drugLicenseNumber || null, v.out.dlExpiryDate || null, v.out.creditDays, v.out.creditLimit, v.out.discountPercent,
        v.out.isActive, v.out.isCashCustomer, v.out.notes || null, actorId,
        v.out.b2bFlag,
        v.out.stateCode || null,
        v.out.gstinValidatedAt || null
      ]
    );
    return ok({ customer: mapCustomerRow(rs.rows?.[0] || null) }, { message: "Customer updated." });
  } catch (e) {
    if (String(e.code || "") === "23505") return fail(409, "DUPLICATE", "Customer with same name/code already exists.");
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
