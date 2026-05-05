const { query } = require("./db");
const { fail } = require("./response");

async function getMfgCompany(accountId, companyId) {
  const id = String(companyId || "").trim();
  if (!id) return null;
  const res = await query(
    `
    SELECT *
    FROM mfg_companies
    WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
    LIMIT 1
    `,
    [id, accountId]
  );
  return res.rows?.[0] || null;
}

// Walk up the parent chain and fail if the proposed parent would introduce a cycle.
// Caps at 10 levels of depth to avoid unbounded loops on corrupted data.
async function validateNoCircularParent(accountId, companyId, proposedParentId) {
  const parentId = String(proposedParentId || "").trim();
  if (!parentId) return { ok: true };
  if (companyId && parentId === String(companyId)) {
    return { ok: false, code: "CIRCULAR_PARENT", message: "A company cannot be its own parent." };
  }
  const visited = new Set();
  if (companyId) visited.add(String(companyId));
  let cur = parentId;
  for (let depth = 0; depth < 10; depth += 1) {
    if (visited.has(cur)) {
      return { ok: false, code: "CIRCULAR_PARENT", message: "Circular parent reference detected." };
    }
    visited.add(cur);
    const res = await query(
      `SELECT main_company_id FROM mfg_companies WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [cur, accountId]
    );
    const row = res.rows?.[0];
    if (!row) {
      return { ok: false, code: "INVALID_PARENT", message: "Parent company not found." };
    }
    if (!row.main_company_id) return { ok: true };
    cur = String(row.main_company_id);
  }
  return { ok: false, code: "CIRCULAR_PARENT", message: "Parent chain too deep; possible cycle." };
}

async function getMfgForProduct(accountId, productId) {
  if (!productId) return null;
  const res = await query(
    `
    SELECT m.*
    FROM products p
    JOIN mfg_companies m
      ON m.id = p.mfg_company_id
     AND m.account_id = p.account_id
     AND m.deleted_at IS NULL
    WHERE p.id = $1 AND p.account_id = $2 AND p.deleted_at IS NULL
    LIMIT 1
    `,
    [productId, accountId]
  );
  return res.rows?.[0] || null;
}

function assertSaleAllowed(company) {
  if (!company) return null;
  if (Boolean(company.sale_lock)) {
    return fail(403, "SALE_LOCKED", "Sales are locked for this manufacturing company.", { subMessage: "Disable “Sale lock” in Mfg Company settings to allow billing." });
  }
  return null;
}

function assertPurchaseAllowed(company) {
  if (!company) return null;
  if (Boolean(company.purchase_order_lock)) {
    return fail(403, "PURCHASE_LOCKED", "Purchase orders are locked for this manufacturing company.", {
      subMessage: "Disable “Purchase order lock” in Mfg Company settings to allow purchases."
    });
  }
  return null;
}

function assertStockReportAllowed(company) {
  if (!company) return null;
  if (Boolean(company.stock_report_lock)) {
    return fail(403, "STOCK_REPORT_LOCKED", "Stock report is locked for this manufacturing company.", {
      subMessage: "Disable “Stock report lock” in Mfg Company settings to view stock."
    });
  }
  return null;
}

// Apply sales-line restrictions. Mutates the lineItem in place when
// `prevent_net_rate` is enabled (server-calculated net rate overrides UI).
// Returns an error string when a restriction is violated; otherwise null.
function applySalesRestrictions(company, lineItem) {
  if (!company || !lineItem) return null;
  if (company.prevent_free_qty && Number(lineItem.free_qty || 0) > 0) {
    return `Free quantity is not allowed for manufacturer: ${company.name}.`;
  }
  if (company.prevent_discount && Number(lineItem.discount || lineItem.discount_sales || 0) > 0) {
    return `Discounts are not allowed for manufacturer: ${company.name}.`;
  }
  if (company.prevent_net_rate) {
    const salesRate = Number(lineItem.sales_rate || lineItem.salesRate || 0);
    const discountPct = Number(lineItem.discount || lineItem.discount_sales || 0);
    lineItem.net_rate = Math.round(salesRate * (1 - discountPct / 100) * 100) / 100;
  }
  return null;
}

// Stub: replace once billing module is live. Returns outstanding info per customer.
async function getCustomerOutstandingInfo(/* accountId, customerId */) {
  return { outstanding_bills: 0, oldest_bill_age_days: 0, outstanding_amount: 0 };
}

// Check financial guardrails against a manufacturer's policy before allowing
// a new invoice to be created. Billing module hooks into this.
async function checkFinancialLimits({ company, customerOutstanding, newInvoiceTotal }) {
  if (!company) return null;
  const info = customerOutstanding || { outstanding_bills: 0, oldest_bill_age_days: 0, outstanding_amount: 0 };
  const newTotal = Number(newInvoiceTotal || 0);
  if (company.out_bill_limit > 0 && info.outstanding_bills >= company.out_bill_limit) {
    return `Outstanding bill limit exceeded: ${info.outstanding_bills} bills pending (limit: ${company.out_bill_limit}).`;
  }
  if (company.out_day_limit > 0 && info.oldest_bill_age_days > company.out_day_limit) {
    return `Payment overdue: oldest bill is ${info.oldest_bill_age_days} days old (limit: ${company.out_day_limit} days).`;
  }
  if (company.credit_limit > 0 && info.outstanding_amount + newTotal > company.credit_limit) {
    return `Credit limit exceeded: ₹${info.outstanding_amount} outstanding + ₹${newTotal} new > limit ₹${company.credit_limit}.`;
  }
  return null;
}

module.exports = {
  getMfgCompany,
  getMfgForProduct,
  validateNoCircularParent,
  applySalesRestrictions,
  checkFinancialLimits,
  getCustomerOutstandingInfo,
  assertSaleAllowed,
  assertPurchaseAllowed,
  assertStockReportAllowed
};

