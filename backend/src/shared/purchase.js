const { fail } = require("./response");

const VALID_GST = new Set([0, 5, 12, 18, 28]);

function clean(v) {
  return String(v ?? "").trim();
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

function localCalendarYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addCalendarDaysYmd(ymd, days) {
  const s = clean(ymd);
  const [y, mo, da] = s.split("-").map(Number);
  const dt = new Date(y, mo - 1, da + Number(days || 0));
  return localCalendarYmd(dt);
}

/** Upper bound for invoice civil date: browser "today" if sent, capped at server today + 1 day (timezone slack, not arbitrary future). */
function effectiveInvoiceDateCap(opts = {}) {
  const server = localCalendarYmd();
  const c = clean(opts.clientTodayYmd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c)) return server;
  const slack = addCalendarDaysYmd(server, 1);
  return c <= slack ? c : slack;
}

/** Compare calendar Y-M-D only (no UTC vs local midnight skew). Optional clientTodayYmd from browser for "today" in the user's timezone. */
function ensureDateNotFuture(ymd, label, opts = {}) {
  const s = clean(ymd);
  if (!s) return `${label} is required`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${label} is invalid`;
  const cap = effectiveInvoiceDateCap(opts);
  if (s > cap) return `${label} cannot be in the future`;
  return "";
}

function computeLineAmounts(item) {
  const qty = n(item.qty);
  const freeQty = Math.max(0, n(item.freeQty));
  const purchaseRate = n(item.purchaseRate);
  const mrp = n(item.mrp);
  const salesRate = n(item.salesRate);
  const discountPercent = Math.max(0, n(item.discountPercent));
  const gstPercent = n(item.gstPercent);
  const landingCost = n(item.landingCost);

  const errs = [];
  if (!(qty > 0)) errs.push("Line qty must be greater than 0.");
  if (freeQty < 0) errs.push("Line free qty must be non-negative.");
  if (!(mrp > 0)) errs.push("MRP must be greater than 0.");
  if (purchaseRate < 0) errs.push("Purchase rate must be non-negative.");
  if (salesRate < 0) errs.push("Sales rate must be non-negative.");
  if (salesRate > 0 && mrp > 0 && salesRate > mrp) errs.push("Sales rate cannot exceed MRP.");
  if (!VALID_GST.has(gstPercent)) errs.push("GST must be one of: 0, 5, 12, 18, 28.");
  if (landingCost < 0) errs.push("Landing cost must be non-negative.");

  const base = qty * purchaseRate;
  const discountAmount = round2(base * (discountPercent / 100));
  const taxableAmount = round2(base - discountAmount);
  const gstAmount = round2(taxableAmount * (gstPercent / 100));
  const netAmount = round2(taxableAmount + gstAmount);

  return {
    errs,
    out: {
      qty,
      freeQty,
      purchaseRate,
      salesRate,
      mrp,
      discountPercent,
      discountAmount,
      gstPercent,
      gstAmount,
      netAmount,
      taxableAmount,
      lineAmount: netAmount,
      landingCost
    }
  };
}

function computeInvoiceTotals(lines) {
  const subtotal = round2(lines.reduce((s, x) => s + n(x.qty) * n(x.purchaseRate), 0));
  const totalDiscount = round2(lines.reduce((s, x) => s + n(x.discountAmount), 0));
  const totalGst = round2(lines.reduce((s, x) => s + n(x.gstAmount), 0));
  const totalAmount = round2(subtotal - totalDiscount + totalGst);
  return { subtotal, totalDiscount, totalGst, totalAmount };
}

async function nextDocNumber(q, table, prefix, accountId) {
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
    `SELECT financial_year, purchase_counter, purchase_return_counter
     FROM invoice_counters
     WHERE account_id = $1
     FOR UPDATE`,
    [accountId]
  );
  const row = lock.rows?.[0] || { financial_year: fy, purchase_counter: 0, purchase_return_counter: 0 };
  let purchaseCounter = Number(row.purchase_counter || 0);
  let purchaseReturnCounter = Number(row.purchase_return_counter || 0);
  let activeFy = String(row.financial_year || fy);
  if (activeFy !== fy) {
    activeFy = fy;
    purchaseCounter = 0;
    purchaseReturnCounter = 0;
  }
  const isReturn = String(table || "").toLowerCase() === "purchase_returns";
  if (isReturn) purchaseReturnCounter += 1;
  else purchaseCounter += 1;
  await q(
    `UPDATE invoice_counters
     SET financial_year = $2,
         purchase_counter = $3,
         purchase_return_counter = $4,
         updated_at = now()
     WHERE account_id = $1`,
    [accountId, activeFy, purchaseCounter, purchaseReturnCounter]
  );
  const serial = isReturn ? purchaseReturnCounter : purchaseCounter;
  return `${prefix}-${activeFy}-${String(serial).padStart(4, "0")}`;
}

async function refreshInvoicePaymentSummary(q, accountId, invoiceId) {
  const p = await q(
    `
    SELECT COALESCE(
      (SELECT SUM(amount) FROM vendor_payments WHERE account_id = $1 AND purchase_invoice_id = $2),
      0
    )::numeric(14,2)
    + COALESCE(
      (SELECT SUM(amount) FROM division_payments WHERE account_id = $1 AND purchase_invoice_id = $2),
      0
    )::numeric(14,2) AS paid
    `,
    [accountId, invoiceId]
  );
  const paid = n(p.rows?.[0]?.paid);
  const ret = await q(
    `SELECT COALESCE(SUM(total_amount),0)::numeric(14,2) AS credits
     FROM purchase_returns
     WHERE account_id = $1 AND purchase_invoice_id = $2 AND status = 'CONFIRMED'`,
    [accountId, invoiceId]
  );
  const returnCredits = n(ret.rows?.[0]?.credits);
  const inv = await q(
    `SELECT total_amount FROM purchase_invoices WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [invoiceId, accountId]
  );
  const total = n(inv.rows?.[0]?.total_amount);
  const due = Math.max(0, round2(total - paid - returnCredits));
  const paymentStatus = due <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
  let paymentModeLabel = "CREDIT";
  if (paymentStatus === "PAID" || paymentStatus === "PARTIAL") {
    const modeRs = await q(
      `
      SELECT mode FROM (
        SELECT vp.payment_mode::text AS mode, vp.payment_date, vp.created_at
        FROM vendor_payments vp
        WHERE vp.account_id = $1 AND vp.purchase_invoice_id = $2
          AND COALESCE(vp.allocation_type, 'INVOICE') = 'INVOICE'
        UNION ALL
        SELECT dp.payment_mode::text AS mode, dp.payment_date, dp.created_at
        FROM division_payments dp
        WHERE dp.account_id = $1 AND dp.purchase_invoice_id = $2
      ) x
      ORDER BY payment_date DESC, created_at DESC
      LIMIT 1
      `,
      [accountId, invoiceId]
    );
    paymentModeLabel = modeRs.rows?.[0]?.mode || "CASH";
  }
  await q(
    `
    UPDATE purchase_invoices
    SET amount_paid = $3, balance_due = $4, payment_status = $5,
        payment_mode = $6, updated_at = now()
    WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
    `,
    [invoiceId, accountId, paid, due, paymentStatus, paymentModeLabel]
  );
  return { amountPaid: paid, balanceDue: due, paymentStatus, paymentMode: paymentModeLabel };
}

function badRequest(message, details) {
  return fail(400, "VALIDATION_ERROR", message, details ? { details } : undefined);
}

module.exports = {
  VALID_GST,
  clean,
  n,
  round2,
  localCalendarYmd,
  addCalendarDaysYmd,
  ensureDateNotFuture,
  computeLineAmounts,
  computeInvoiceTotals,
  nextDocNumber,
  refreshInvoicePaymentSummary,
  badRequest
};
