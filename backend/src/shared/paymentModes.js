const CUSTOMER_PAYMENT_MODES = ["CASH", "CHEQUE", "NEFT", "UPI", "CARD", "OTHER"];
const VENDOR_PAYMENT_MODES = ["CASH", "CHEQUE", "NEFT", "UPI", "CARD", "IMPS", "OTHER"];
const SALES_INVOICE_PAYMENT_MODES = ["CASH", "UPI", "CARD", "CHEQUE", "NEFT", "CREDIT", "ADVANCE"];

function cleanMode(v) {
  return String(v ?? "").trim().toUpperCase();
}

function normalizeCustomerPaymentMode(mode, defaultMode = "CASH") {
  const m = cleanMode(mode);
  if (CUSTOMER_PAYMENT_MODES.includes(m)) return m;
  return defaultMode;
}

function normalizeVendorPaymentMode(mode, defaultMode = "CASH") {
  const m = cleanMode(mode);
  if (VENDOR_PAYMENT_MODES.includes(m)) return m;
  return defaultMode;
}

/** Maps confirm-time mode to sales_invoices.payment_mode (TEXT column). */
function salesInvoicePaymentModeLabel(shouldSettle, mode) {
  if (!shouldSettle) return "CREDIT";
  const m = normalizeCustomerPaymentMode(mode, "CASH");
  return SALES_INVOICE_PAYMENT_MODES.includes(m) ? m : "CASH";
}

function parseConfirmPaymentOptions(body) {
  const opts = {};
  if (!body || typeof body !== "object") return opts;
  const markPaidRaw = body.markPaidAtConfirm ?? body.mark_paid_at_confirm;
  if (markPaidRaw === true || markPaidRaw === false) opts.markPaidAtConfirm = markPaidRaw;
  const mode = cleanMode(body.paymentMode || body.payment_mode);
  if (mode) opts.paymentMode = mode;
  return opts;
}

module.exports = {
  CUSTOMER_PAYMENT_MODES,
  VENDOR_PAYMENT_MODES,
  SALES_INVOICE_PAYMENT_MODES,
  normalizeCustomerPaymentMode,
  normalizeVendorPaymentMode,
  salesInvoicePaymentModeLabel,
  parseConfirmPaymentOptions,
};
