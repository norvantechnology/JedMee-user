const { query } = require("../../shared/db");

function ymd(v) {
  return String(v || "").slice(0, 10);
}

function getPaymentLedgerType(p) {
  const allocation = String(p?.allocation_type || p?.allocation_type_resolved || "").toUpperCase();
  const notes = String(p?.notes || "").toLowerCase();
  if (notes.includes("advance adjusted") || notes.includes("split-adjusted")) return "ADVANCE_APPLIED";
  if (allocation === "ON_ACCOUNT") return "ADVANCE";
  return "PAYMENT";
}

function paymentTypeLabel(type) {
  if (type === "ADVANCE") return "On Account Advance";
  if (type === "ADVANCE_APPLIED") return "Advance Applied";
  if (type === "RETURN") return "Sales Return";
  if (type === "INVOICE") return "Sales Invoice";
  if (type === "PAYMENT") return "Customer Payment";
  return String(type || "").replace(/_/g, " ") || "Entry";
}

function ledgerTs(isoDate, createdAt) {
  const t = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isNaN(t)) return t;
  const d = new Date(String(isoDate || "").slice(0, 10) || 0).getTime();
  return Number.isNaN(d) ? 0 : d;
}

function sortLedgerEntries(entries) {
  return [...entries].sort((a, b) => {
    const da = new Date(a.date || 0).getTime();
    const db = new Date(b.date || 0).getTime();
    if (da !== db) return da - db;
    const ta = Number(a.sortTs ?? 0) - Number(b.sortTs ?? 0);
    if (ta !== 0) return ta;
    return String(a.sortId ?? "").localeCompare(String(b.sortId ?? ""), undefined, { numeric: true });
  });
}

/**
 * @param {{ accountId: string; customerId: string }} p
 * @returns {Promise<object|null>} Ledger document or null if customer missing.
 */
async function buildCustomerLedgerDoc({ accountId, customerId }) {
  const customerRs = await query(
    `SELECT id, code, name, phone_number, phone_country_code, email, address, city, state, pincode, gst_number
     FROM customers
     WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [customerId, accountId]
  );
  const customer = customerRs.rows?.[0] || null;
  if (!customer) return null;

  const [invoicesRs, paymentsRs, returnsRs] = await Promise.all([
    query(
      `SELECT id, invoice_number, invoice_date, total_amount, payment_status, status, created_at
       FROM sales_invoices
       WHERE account_id = $1 AND customer_id = $2 AND deleted_at IS NULL
         AND status = 'CONFIRMED'::sales_invoice_status
       ORDER BY invoice_date ASC, created_at ASC`,
      [accountId, customerId]
    ),
    query(
      `SELECT cp.id, cp.payment_date, cp.amount, cp.reference_number, cp.notes, cp.allocation_type, cp.created_at,
              si.invoice_number
       FROM customer_payments cp
       LEFT JOIN sales_invoices si ON si.id = cp.sales_invoice_id AND si.account_id = cp.account_id
       WHERE cp.account_id = $1 AND cp.customer_id = $2
       ORDER BY cp.payment_date ASC, cp.created_at ASC`,
      [accountId, customerId]
    ),
    query(
      `SELECT id, return_number, return_date, total_return_amount, status, created_at
       FROM sales_returns
       WHERE account_id = $1 AND customer_id = $2
         AND status = 'CONFIRMED'
         AND deleted_at IS NULL
       ORDER BY return_date ASC, created_at ASC`,
      [accountId, customerId]
    )
  ]);

  const invoices = invoicesRs.rows || [];
  const payments = paymentsRs.rows || [];
  const returns = returnsRs.rows || [];

  const entriesRaw = [
    ...invoices.map((x) => ({
      date: ymd(x.invoice_date),
      type: "INVOICE",
      type_label: paymentTypeLabel("INVOICE"),
      reference: x.invoice_number || "",
      debit: Number(x.total_amount || 0),
      credit: 0,
      sortTs: ledgerTs(x.invoice_date, x.created_at),
      sortId: x.id
    })),
    ...payments.map((x) => {
      const t = getPaymentLedgerType(x);
      return {
        date: ymd(x.payment_date),
        type: t,
        type_label: paymentTypeLabel(t),
        reference: x.invoice_number || x.reference_number || (t === "ADVANCE" ? "On Account" : ""),
        debit: 0,
        credit: Number(x.amount || 0),
        sortTs: ledgerTs(x.payment_date, x.created_at),
        sortId: x.id
      };
    }),
    ...returns.map((x) => ({
      date: ymd(x.return_date),
      type: "RETURN",
      type_label: paymentTypeLabel("RETURN"),
      reference: x.return_number || "",
      debit: 0,
      credit: Number(x.total_return_amount || 0),
      sortTs: ledgerTs(x.return_date, x.created_at),
      sortId: x.id
    }))
  ];
  const entries = sortLedgerEntries(entriesRaw);

  let running = 0;
  const withBalance = entries.map((e) => {
    running += Number(e.debit || 0) - Number(e.credit || 0);
    const { sortTs, sortId, ...row } = e;
    return { ...row, balance: running };
  });

  const totalBilled = invoices.reduce((s, x) => s + Number(x.total_amount || 0), 0);
  const totalPaid = payments.reduce((s, x) => s + Number(x.amount || 0), 0) + returns.reduce((s, x) => s + Number(x.total_return_amount || 0), 0);
  const netBalance = totalBilled - totalPaid;
  const balanceDue = Math.max(0, netBalance);
  const advanceAmount = Math.max(0, -netBalance);
  const confirmedUnpaid = invoices.filter(
    (x) => String(x.status || "") === "CONFIRMED" && (x.payment_status === "UNPAID" || x.payment_status === "PARTIAL")
  );
  let oldestBillAgeDays = 0;
  if (confirmedUnpaid.length) {
    const oldest = [...confirmedUnpaid].sort((a, b) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime())[0];
    oldestBillAgeDays = Math.max(0, Math.floor((Date.now() - new Date(oldest.invoice_date).getTime()) / (1000 * 60 * 60 * 24)));
  }

  return {
    document: { type: "customer_ledger", generated_at: new Date().toISOString(), print_version: 1 },
    customer: {
      ...customer,
      full_address: [customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(", ")
    },
    summary: { totalBilled, totalPaid, balanceDue, advanceAmount, netBalance, oldestBillAgeDays },
    entries: withBalance,
    printable: { title: `Customer Ledger  ${customer.name || "Customer"}` }
  };
}

module.exports = {
  buildCustomerLedgerDoc
};
