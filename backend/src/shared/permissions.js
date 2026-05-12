const { query } = require("./db");
const { roleVisibility, getRoleCodeForAccount } = require("./accountRoleProfile");

const RESOURCES = [
  "USERS",
  "ROLES",
  "VENDORS",
  "DIVISIONS",
  "PRODUCT_BATCHES",
  "MFG_COMPANIES",
  "PURCHASE_INVOICES",
  "PURCHASE_RETURNS",
  "VENDOR_PAYMENTS",
  "DIVISION_PAYMENTS",
  "PURCHASE_ORDERS",
  "CUSTOMERS",
  "SALES_INVOICES",
  "SALES_RETURNS",
  "CUSTOMER_PAYMENTS",
  "PRESCRIPTIONS",
  "REPORTS"
];

// Role visibility uses canonical resource keys (sidebar groups). Map our finer
// permission resources onto those canonical keys so a RETAILER doesn't get
// MFG_COMPANIES/DIVISIONS just by being the account owner, and a WHOLESALER
// doesn't get PRESCRIPTIONS visibility.
function canonicalForRoleVisibility(resource) {
  switch (resource) {
    case "MFG_COMPANIES":
      return "MANUFACTURERS";
    case "DIVISIONS":
      return "DIVISIONS";
    case "DIVISION_PAYMENTS":
      return "DIVISION_PAYMENTS";
    case "VENDORS":
      return "VENDORS";
    case "VENDOR_PAYMENTS":
      // Vendor payments are retailer-only conceptually, but wholesalers also
      // historically had a vendor payments module  keep it visible for both
      // unless we explicitly hide it later.
      return "";
    case "PRESCRIPTIONS":
      return "PRESCRIPTIONS";
    default:
      return "";
  }
}
const ACTIONS = ["ADD", "VIEW", "UPDATE", "DELETE"];

function normalizeResource(v) {
  const s = String(v || "").trim().toUpperCase();
  return RESOURCES.includes(s) ? s : "";
}

function normalizeAction(v) {
  const s = String(v || "").trim().toUpperCase();
  return ACTIONS.includes(s) ? s : "";
}

function actionToColumn(action) {
  if (action === "ADD") return "can_add";
  if (action === "VIEW") return "can_view";
  if (action === "UPDATE") return "can_update";
  if (action === "DELETE") return "can_delete";
  return "";
}

async function getAccountIdForUser(userId) {
  const res = await query(`SELECT account_id FROM app_users WHERE id = $1 LIMIT 1`, [userId]);
  return res.rows[0]?.account_id || null;
}

async function getUserRoleId(userId) {
  const res = await query(`SELECT role_id FROM user_role_members WHERE user_id = $1 LIMIT 1`, [userId]);
  return res.rows[0]?.role_id || null;
}

function applyRoleVisibility(permissions, roleCode) {
  const vis = roleVisibility(roleCode);
  const out = {};
  for (const [resource, actions] of Object.entries(permissions || {})) {
    const canonical = canonicalForRoleVisibility(resource);
    if (canonical && !vis.isResourceVisible(canonical)) continue;
    out[resource] = actions;
  }
  return out;
}

async function getPermissionsForUser(userId) {
  const accountId = await getAccountIdForUser(userId);
  if (!accountId) return { accountId: null, isAccountOwner: false, permissions: {} };
  const isAccountOwner = String(accountId) === String(userId);
  const roleCode = await getRoleCodeForAccount(accountId);

  if (isAccountOwner) {
    // Owner gets full permissions by default  but role visibility still
    // hides resources that don't apply to their business model (e.g. a retailer
    // never sees Manufacturers / Divisions / Division Payments).
    const perms = {};
    for (const r of RESOURCES) {
      perms[r] = { ADD: true, VIEW: true, UPDATE: true, DELETE: true };
    }
    return { accountId, isAccountOwner, permissions: applyRoleVisibility(perms, roleCode) };
  }

  const userRoleId = await getUserRoleId(userId);
  if (!userRoleId) return { accountId, isAccountOwner: false, permissions: {} };

  const rows = await query(
    `
    SELECT resource, can_add, can_view, can_update, can_delete
    FROM user_role_permissions
    WHERE role_id = $1
    `,
    [userRoleId]
  );

  const permissions = {};
  for (const r of rows.rows || []) {
    permissions[String(r.resource).toUpperCase()] = {
      ADD: Boolean(r.can_add),
      VIEW: Boolean(r.can_view),
      UPDATE: Boolean(r.can_update),
      DELETE: Boolean(r.can_delete)
    };
  }
  return { accountId, isAccountOwner: false, permissions: applyRoleVisibility(permissions, roleCode) };
}

async function hasPermission(userId, resource, action) {
  const r = normalizeResource(resource);
  const a = normalizeAction(action);
  if (!r || !a) return false;
  const ctx = await getPermissionsForUser(userId);
  // Do NOT short-circuit for account owners — getPermissionsForUser already
  // applies applyRoleVisibility so role-restricted resources (e.g. MANUFACTURERS
  // for a RETAILER owner) are correctly absent from ctx.permissions.
  return Boolean(ctx.permissions?.[r]?.[a]);
}

module.exports = {
  RESOURCES,
  ACTIONS,
  normalizeResource,
  normalizeAction,
  actionToColumn,
  getAccountIdForUser,
  getUserRoleId,
  getPermissionsForUser,
  hasPermission
};

