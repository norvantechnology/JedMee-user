const { fail } = require("./response");

const VALID_GST = new Set([0, 5, 12, 18, 28]);

function clean(v) {
  return String(v ?? "").trim();
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function i(v) {
  const x = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(x) ? x : 0;
}

function round4(v) {
  return Math.round((Number(v) + Number.EPSILON) * 10000) / 10000;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function isFutureDate(ymd) {
  const s = clean(ymd);
  if (!s) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  const t = new Date(`${todayYmd()}T00:00:00.000Z`);
  return d.getTime() > t.getTime();
}

function calculateLineItem(item) {
  const qty = i(item.qty);
  const freeQty = Math.max(0, i(item.freeQty));
  const salesRate = n(item.salesRate);
  const mrp = n(item.mrp);
  const discountPercent = n(item.discountPercent);
  const gstPercent = n(item.gstPercent);

  if (qty <= 0) return { ok: false, message: "Qty must be greater than 0." };
  if (mrp <= 0) return { ok: false, message: "MRP must be greater than 0." };
  if (salesRate < 0) return { ok: false, message: "Sales rate cannot be negative." };
  if (salesRate > mrp) return { ok: false, message: `Sales rate ₹${salesRate} cannot exceed MRP ₹${mrp}.` };
  if (discountPercent < 0 || discountPercent > 100) return { ok: false, message: "Discount must be between 0 and 100." };
  if (!VALID_GST.has(gstPercent)) return { ok: false, message: "GST must be one of 0, 5, 12, 18, 28." };

  const gross = qty * salesRate;
  const discountAmount = round4(gross * (discountPercent / 100));
  const halfScheme = Boolean(item.halfScheme);
  const schemeTaxableAdd = halfScheme ? round4(freeQty * salesRate * 0.5) : 0;
  const taxableAmount = round4(gross - discountAmount + schemeTaxableAdd);
  const netRate = round4(salesRate * (1 - discountPercent / 100));
  const gstAmount = round4(taxableAmount * (gstPercent / 100));
  const lineTotal = round4(taxableAmount + gstAmount);

  return {
    ok: true,
    out: {
      qty,
      freeQty,
      mrp,
      salesRate,
      discountPercent,
      discountAmount,
      netRate,
      gstPercent,
      gstAmount,
      schemeTaxableAdd,
      taxableAmount,
      lineTotal
    }
  };
}

function calculateInvoiceTotals(items) {
  const subtotal = round4(items.reduce((s, it) => s + n(it.qty) * n(it.salesRate), 0));
  const totalDiscount = round4(items.reduce((s, it) => s + n(it.discountAmount), 0));
  const totalGst = round4(items.reduce((s, it) => s + n(it.gstAmount), 0));
  const fromParts = round4(subtotal - totalDiscount + totalGst);
  const sumLineTotals = items.length
    ? round4(items.reduce((s, it) => s + n(it.lineTotal !== undefined && it.lineTotal !== null ? it.lineTotal : 0), 0))
    : 0;
  const hasAllLineTotals = items.length > 0 && items.every((it) => it.lineTotal !== undefined && it.lineTotal !== null);
  const totalBeforeRound = hasAllLineTotals ? sumLineTotals : fromParts;
  const roundOff = round4(Math.round(totalBeforeRound) - totalBeforeRound);
  const totalAmount = round4(totalBeforeRound + roundOff);
  return { subtotal, totalDiscount, totalGst, roundOff, totalAmount };
}

async function nextSalesNumber(q, accountId, table, prefix) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  const fy = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
  await q(
    `INSERT INTO invoice_counters (account_id, financial_year)
     VALUES ($1, $2)
     ON CONFLICT (account_id) DO NOTHING`,
    [accountId, fy]
  );
  const lock = await q(
    `SELECT financial_year, sales_counter, sales_return_counter
     FROM invoice_counters
     WHERE account_id = $1
     FOR UPDATE`,
    [accountId]
  );
  const row = lock.rows?.[0] || { financial_year: fy, sales_counter: 0, sales_return_counter: 0 };
  let salesCounter = Number(row.sales_counter || 0);
  let salesReturnCounter = Number(row.sales_return_counter || 0);
  let activeFy = String(row.financial_year || fy);
  if (activeFy !== fy) {
    activeFy = fy;
    salesCounter = 0;
    salesReturnCounter = 0;
  }
  const isReturn = String(table || "").toLowerCase() === "sales_returns";
  if (isReturn) salesReturnCounter += 1;
  else salesCounter += 1;
  await q(
    `UPDATE invoice_counters
     SET financial_year = $2,
         sales_counter = $3,
         sales_return_counter = $4,
         updated_at = now()
     WHERE account_id = $1`,
    [accountId, activeFy, salesCounter, salesReturnCounter]
  );
  const serial = isReturn ? salesReturnCounter : salesCounter;
  return `${prefix}-${activeFy}-${String(serial).padStart(4, "0")}`;
}

async function getCustomerOutstandingInfo(q, accountId, customerId) {
  const rs = await q(
    `SELECT id, invoice_date, total_amount, amount_paid, balance_due
     FROM sales_invoices
     WHERE account_id = $1 AND customer_id = $2
       AND status = 'CONFIRMED'::sales_invoice_status
       AND payment_status IN ('UNPAID'::sales_payment_status, 'PARTIAL'::sales_payment_status)`,
    [accountId, customerId]
  );
  const unpaidInvoices = rs.rows || [];
  const outstandingBills = unpaidInvoices.length;
  const outstandingAmount = round4(unpaidInvoices.reduce((s, inv) => s + n(inv.balance_due), 0));
  let oldestBillAgeDays = 0;
  if (unpaidInvoices.length) {
    let oldest = unpaidInvoices[0];
    for (const inv of unpaidInvoices) {
      if (new Date(inv.invoice_date).getTime() < new Date(oldest.invoice_date).getTime()) oldest = inv;
    }
    oldestBillAgeDays = Math.floor((Date.now() - new Date(oldest.invoice_date).getTime()) / (1000 * 60 * 60 * 24));
  }
  return { outstandingBills, outstandingAmount, oldestBillAgeDays, unpaidInvoices };
}

function badRequest(message, details) {
  return fail(400, "VALIDATION_ERROR", message, details ? { details } : undefined);
}

module.exports = {
  VALID_GST,
  clean,
  n,
  i,
  round4,
  todayYmd,
  isFutureDate,
  calculateLineItem,
  calculateInvoiceTotals,
  nextSalesNumber,
  getCustomerOutstandingInfo,
  badRequest
};
