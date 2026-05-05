const { query } = require("../../shared/db");

async function getSalesInvoicePrintDoc({ accountId, invoiceId }) {
  const inv = await query(
    `SELECT
       si.*,
       c.code AS customer_code,
       c.phone_number AS customer_phone,
       c.email AS customer_email,
       c.address AS customer_address,
       c.city AS customer_city,
       c.state AS customer_state,
       c.pincode AS customer_pincode,
       c.gst_number AS customer_gst_number
     FROM sales_invoices si
     LEFT JOIN customers c ON c.id = si.customer_id AND c.account_id = si.account_id
     WHERE si.id = $1 AND si.account_id = $2
     LIMIT 1`,
    [invoiceId, accountId]
  );
  const invoice = inv.rows?.[0] || null;
  if (!invoice) return null;

  const items = await query(
    `SELECT
       sii.id,
       sii.product_id,
       sii.product_code,
       sii.product_name,
       sii.drug_name,
       sii.batch_id,
       sii.batch_no,
       sii.expiry_date,
       sii.qty,
       sii.free_qty,
       sii.mrp,
       sii.sales_rate,
       sii.discount_percent,
       sii.discount_amount,
       sii.net_rate,
       sii.gst_percent,
       sii.gst_amount,
       sii.taxable_amount,
       sii.line_total,
       sii.prescription_no,
       sii.doctor_name,
       sii.patient_name
     FROM sales_invoice_items sii
     WHERE sii.sales_invoice_id = $1 AND sii.account_id = $2
     ORDER BY sii.created_at ASC`,
    [invoiceId, accountId]
  );
  const payments = await query(
    `SELECT
       cp.id,
       cp.payment_date,
       cp.amount,
       cp.payment_mode,
       cp.reference_number,
       cp.notes,
       COALESCE(cp.allocation_type, CASE WHEN cp.sales_invoice_id IS NULL THEN 'ON_ACCOUNT' ELSE 'INVOICE' END) AS allocation_type_resolved
     FROM customer_payments cp
     WHERE cp.account_id = $1 AND cp.sales_invoice_id = $2
     ORDER BY cp.payment_date ASC, cp.created_at ASC`,
    [accountId, invoiceId]
  );
  const taxSummary = await query(
    `SELECT
       sii.gst_percent,
       COUNT(*)::int AS line_count,
       COALESCE(SUM(sii.taxable_amount), 0)::numeric(12,4) AS taxable_amount,
       COALESCE(SUM(sii.gst_amount), 0)::numeric(12,4) AS gst_amount
     FROM sales_invoice_items sii
     WHERE sii.sales_invoice_id = $1 AND sii.account_id = $2
     GROUP BY sii.gst_percent
     ORDER BY sii.gst_percent ASC`,
    [invoiceId, accountId]
  );
  const seller = await query(
    `SELECT
       u.id,
       u.full_name,
       u.email,
       COALESCE(to_jsonb(u) ->> 'firm_name', '') AS firm_name,
       COALESCE(to_jsonb(u) ->> 'gst_number', '') AS gst_number,
       COALESCE(to_jsonb(u) ->> 'address', '') AS address,
       COALESCE(to_jsonb(u) ->> 'phone_number', '') AS phone_number
     FROM app_users u
     WHERE u.id = $1
     LIMIT 1`,
    [accountId]
  );
  const paidAmount = (payments.rows || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const recomputedBalance = Math.max(0, Number(invoice.total_amount || 0) - paidAmount);
  const paymentStatus = recomputedBalance <= 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "UNPAID";

  return {
    document: {
      type: "sales_invoice",
      generated_at: new Date().toISOString(),
      print_version: 1
    },
    seller: seller.rows?.[0] || null,
    invoice: {
      ...invoice,
      payment_status_resolved: paymentStatus,
      amount_paid_resolved: paidAmount,
      balance_due_resolved: recomputedBalance
    },
    items: items.rows || [],
    payments: payments.rows || [],
    tax_summary: taxSummary.rows || [],
    printable: {
      title: "Sales Invoice"
    }
  };
}

module.exports = { getSalesInvoicePrintDoc };

