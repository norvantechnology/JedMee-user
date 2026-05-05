const { ok } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireAuth } = require("../../shared/auth");

async function handler(event) {
  const auth = requireAuth(event);
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const res = await query(
    `
    SELECT
      u.id,
      r.code AS role,
      u.full_name,
      u.email,
      u.phone_country_code,
      u.phone_number,
      u.email_verified,
      u.status,
      u.is_blocked,
      u.must_change_password,
      u.account_id,
      u.firm_name,
      u.gst_number,
      u.address,
      u.pin_code,
      u.city,
      u.state,
      u.drug_license_1_number,
      u.drug_license_2_number,
      u.gst_certificate_url,
      u.drug_license_1_url,
      u.drug_license_2_url,
      u.created_at
    FROM app_users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = $1
    LIMIT 1
    `,
    [userId]
  );

  const row = res.rows[0];
  return ok({
    user: row
      ? {
          id: row.id,
          role: row.role,
          full_name: row.full_name,
          email: row.email,
          phone_country_code: row.phone_country_code,
          phone_number: row.phone_number,
          email_verified: row.email_verified,
          status: row.status,
          is_blocked: row.is_blocked,
          must_change_password: Boolean(row.must_change_password),
          account_id: row.account_id,
          firm_name: row.firm_name || null,
          gst_number: row.gst_number || null,
          address: row.address || null,
          pin_code: row.pin_code || null,
          city: row.city || null,
          state: row.state || null,
          drug_license_1_number: row.drug_license_1_number || null,
          drug_license_2_number: row.drug_license_2_number || null,
          gst_certificate_url: row.gst_certificate_url || null,
          drug_license_1_url: row.drug_license_1_url || null,
          drug_license_2_url: row.drug_license_2_url || null,
          created_at: row.created_at
        }
      : null
  });
}

module.exports = { handler };

