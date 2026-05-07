const { requirePermission } = require("../../shared/auth");
const { fail } = require("../../shared/response");
const { roleVisibility } = require("../../shared/accountRoleProfile");

const ENTITY_TO_PERM = {
  MANUFACTURERS: ["MFG_COMPANIES", "ADD"],
  DIVISIONS: ["DIVISIONS", "ADD"],
  SUPPLIERS: ["VENDORS", "ADD"],
  PRODUCTS: ["PRODUCT_BATCHES", "ADD"],
  PRODUCT_BATCHES: ["PRODUCT_BATCHES", "ADD"],
  CUSTOMERS: ["CUSTOMERS", "ADD"],
  PURCHASES: ["PURCHASE_INVOICES", "ADD"],
  SALES: ["SALES_INVOICES", "ADD"],
  SALES_RETURNS: ["SALES_RETURNS", "ADD"],
  PURCHASE_RETURNS: ["PURCHASE_RETURNS", "ADD"],
  PRESCRIPTIONS: ["PRESCRIPTIONS", "VIEW"]
};

async function requireImportPermission(event, entityType) {
  const rec = ENTITY_TO_PERM[entityType];
  if (!rec) {
    return { ok: false, resp: fail(400, "VALIDATION_ERROR", `Unsupported import entityType: ${entityType || "(empty)"}`) };
  }
  return requirePermission(event, rec[0], rec[1]);
}

function entityAllowedForRole(entityType, roleCode) {
  const vis = roleVisibility(roleCode);
  const map = {
    MANUFACTURERS: "MFG_COMPANIES",
    DIVISIONS: "DIVISIONS",
    SUPPLIERS: "VENDORS",
    PRESCRIPTIONS: "PRESCRIPTIONS"
  };
  const res = map[entityType];
  if (!res) return true;
  return vis.isResourceVisible(res);
}

function allowedImportEntityTypes(permissionCtx) {
  const perms = permissionCtx?.permissions || {};
  return Object.entries(ENTITY_TO_PERM)
    .filter(([, [resource, action]]) => Boolean(perms?.[resource]?.[action]))
    .map(([entityType]) => entityType);
}

module.exports = { requireImportPermission, entityAllowedForRole, allowedImportEntityTypes, ENTITY_TO_PERM };
