const { query } = require("./db");

function normalizeRoleCode(v) {
  const s = String(v || "").trim().toUpperCase();
  return s === "RETAILER" ? "RETAILER" : "WHOLESALER";
}

function roleVisibility(roleCode) {
  const role = normalizeRoleCode(roleCode);
  const wholesalerOnly = new Set(["MANUFACTURERS", "DIVISIONS", "DIVISION_PAYMENTS"]);
  const retailerOnly = new Set(["VENDORS", "PRESCRIPTIONS"]);
  return {
    role,
    isResourceVisible(resource) {
      const r = String(resource || "").trim().toUpperCase();
      if (!r) return true;
      if (role === "RETAILER" && wholesalerOnly.has(r)) return false;
      if (role === "WHOLESALER" && retailerOnly.has(r)) return false;
      return true;
    }
  };
}

async function getRoleCodeForAccount(accountId) {
  const res = await query(
    `
    SELECT r.code AS role_code
    FROM app_users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = $1
    LIMIT 1
    `,
    [accountId]
  );
  return normalizeRoleCode(res.rows?.[0]?.role_code || "WHOLESALER");
}

async function getAccountSettings(accountId) {
  const res = await query(
    `
    SELECT
      account_id,
      business_type,
      default_billing_mode,
      require_prescription_for_control,
      show_mrp_on_invoice,
      allow_sales_above_mrp,
      default_sales_rate_type,
      auto_create_walk_in_customer,
      walk_in_customer_id
    FROM account_settings
    WHERE account_id = $1
    LIMIT 1
    `,
    [accountId]
  );
  return res.rows?.[0] || null;
}

module.exports = {
  normalizeRoleCode,
  roleVisibility,
  getRoleCodeForAccount,
  getAccountSettings
};
