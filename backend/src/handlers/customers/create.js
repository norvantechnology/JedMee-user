const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { mapCustomerRow, validateCustomerPayload } = require("./_common");

async function handler(event) {
  const auth = await requirePermission(event, "CUSTOMERS", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const v = validateCustomerPayload(body, false);
  if (!v.ok) return fail(400, "VALIDATION_ERROR", v.errs[0], { details: v.errs });

  try {
    let code = v.out.code;
    if (!code) {
      const last = await query(
        `SELECT code FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND code ILIKE 'CUS-%' ORDER BY created_at DESC LIMIT 1`,
        [ctx.accountId]
      );
      const m = String(last.rows?.[0]?.code || "").match(/^CUS-(\d{4,})$/i);
      const seq = m ? Number(m[1] || 0) + 1 : 1;
      code = `CUS-${String(seq).padStart(4, "0")}`;
    }
    const dup = await query(
      `SELECT id FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND (lower(name) = lower($2) OR lower(code) = lower($3)) LIMIT 1`,
      [ctx.accountId, v.out.name, code]
    );
    if (dup.rows?.length) return fail(409, "DUPLICATE", "Customer with same name/code already exists.");
    const rs = await query(
      `INSERT INTO customers (
        account_id, code, name, short_name, phone_country_code, phone_number, email, address, city, state, pincode,
        customer_type, gst_number, drug_license_number, dl_expiry_date, credit_days, credit_limit, discount_percent,
        is_active, is_cash_customer, notes, created_by_user_id, updated_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::customer_type_enum,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22)
      RETURNING *`,
      [
        ctx.accountId, code, v.out.name, v.out.shortName || null, v.out.phoneCountryCode || null, v.out.phoneNumber || null, v.out.email || null,
        v.out.address || null, v.out.city || null, v.out.state || null, v.out.pincode || null, v.out.customerType, v.out.gstNumber || null,
        v.out.drugLicenseNumber || null, v.out.dlExpiryDate || null, v.out.creditDays, v.out.creditLimit, v.out.discountPercent,
        v.out.isActive, v.out.isCashCustomer, v.out.notes || null, actorId
      ]
    );
    return created({ customer: mapCustomerRow(rs.rows?.[0] || null) }, { message: "Customer created." });
  } catch (e) {
    if (String(e.code || "") === "23505") return fail(409, "DUPLICATE", "Customer with same name/code already exists.");
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
