/**
 * TransactionPrecheck
 *
 * Pre-flight validator used by transactional modules (Purchases, Sales,
 * Returns, etc.) to enforce RBAC, user status, batch availability, and
 * manufacturer-level policy rules in a single place.
 *
 * The Sales/Purchase modules are not yet implemented, so these methods
 * are currently a STUB. They are structured so that the billing/purchase
 * modules can import this service and call the appropriate validator.
 */

const { query } = require("./db");
const { hasPermission } = require("./permissions");
const { batchLiveStockInlineSql } = require("./productStockSql");
const {
  getMfgForProduct,
  assertSaleAllowed,
  assertPurchaseAllowed,
  applySalesRestrictions,
  checkFinancialLimits,
  getCustomerOutstandingInfo
} = require("./mfgCompanyPolicy");

async function checkUserActive(accountId, userId) {
  const res = await query(
    `SELECT status, is_blocked, account_id FROM app_users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const row = res.rows?.[0];
  if (!row) return "User not found.";
  if (String(row.account_id) !== String(accountId)) return "User does not belong to this account.";
  if (Boolean(row.is_blocked)) return "Account has been blocked.";
  if (String(row.status || "").toUpperCase() !== "APPROVED") return "Account pending approval or rejected.";
  return null;
}

async function checkBatchAvailability(accountId, batchId, requestedQty) {
  const res = await query(
    `SELECT id, batch_no, is_hold, ${batchLiveStockInlineSql}
     FROM product_batches pb
     WHERE pb.id = $1 AND pb.account_id = $2 AND pb.deleted_at IS NULL LIMIT 1`,
    [batchId, accountId]
  );
  const batch = res.rows?.[0];
  if (!batch) return "Batch not found.";
  if (batch.is_hold) return `Batch ${batch.batch_no} is on hold.`;
  const available = Number(batch.current_stock || 0);
  const required = Number(requestedQty || 0);
  if (available < required) {
    return `Not enough stock for batch ${batch.batch_no}.`;
  }
  return null;
}

async function validateSale({ accountId, userId, customerId, items }) {
  const userErr = await checkUserActive(accountId, userId);
  if (userErr) return { ok: false, error: userErr };

  const canSell = await hasPermission(userId, "SALES_INVOICES", "ADD");
  // Permission resource may not be seeded yet for billing; fall back to PRODUCT_BATCHES.VIEW
  const fallbackPerm = canSell || (await hasPermission(userId, "PRODUCT_BATCHES", "VIEW"));
  if (!fallbackPerm) return { ok: false, error: "You do not have permission to create sales." };

  const mfgCache = new Map();
  for (const item of items || []) {
    const mfg = await getMfgForProduct(accountId, item.product_id);
    if (mfg) mfgCache.set(String(mfg.id), mfg);

    const saleLockErr = assertSaleAllowed(mfg);
    if (saleLockErr) return { ok: false, error: saleLockErr.body?.error?.message || "Sale locked." };

    const restrictionErr = applySalesRestrictions(mfg, item);
    if (restrictionErr) return { ok: false, error: restrictionErr };

    const availErr = await checkBatchAvailability(accountId, item.batch_id, item.qty);
    if (availErr) return { ok: false, error: availErr };
  }

  const invoiceTotal = (items || []).reduce(
    (sum, i) => sum + Number(i.net_rate || 0) * Number(i.qty || 0),
    0
  );

  for (const mfg of mfgCache.values()) {
    const customerOutstanding = await getCustomerOutstandingInfo(accountId, customerId);
    const finErr = await checkFinancialLimits({ company: mfg, customerOutstanding, newInvoiceTotal: invoiceTotal });
    if (finErr) return { ok: false, error: finErr };
  }
  return { ok: true };
}

async function validatePurchase({ accountId, userId, items }) {
  const userErr = await checkUserActive(accountId, userId);
  if (userErr) return { ok: false, error: userErr };

  const canPurchase = await hasPermission(userId, "PURCHASE_ORDERS", "ADD");
  const fallbackPerm = canPurchase || (await hasPermission(userId, "PRODUCT_BATCHES", "ADD"));
  if (!fallbackPerm) return { ok: false, error: "You do not have permission to create purchases." };

  for (const item of items || []) {
    const mfg = await getMfgForProduct(accountId, item.product_id);
    const lockErr = assertPurchaseAllowed(mfg);
    if (lockErr) return { ok: false, error: lockErr.body?.error?.message || "Purchase locked." };
  }
  return { ok: true };
}

module.exports = {
  checkUserActive,
  checkBatchAvailability,
  validateSale,
  validatePurchase
};
