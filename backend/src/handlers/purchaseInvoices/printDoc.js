const { query } = require("../../shared/db");

async function getPurchaseInvoicePrintDoc({ accountId, invoiceId }) {
  const inv = await query(
    `SELECT
       pi.*,
       v.name AS vendor_name,
       v.email AS vendor_email,
       v.phone_country_code AS vendor_phone_country_code,
       v.phone_number AS vendor_phone_number,
       d.name AS division_label,
       m.name AS division_mfg_name
     FROM purchase_invoices pi
     LEFT JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id AND v.deleted_at IS NULL
     LEFT JOIN divisions d ON d.id = pi.division_id AND d.account_id = pi.account_id AND d.deleted_at IS NULL
     LEFT JOIN mfg_companies m ON m.id = d.mfg_company_id AND m.account_id = pi.account_id AND m.deleted_at IS NULL
     WHERE pi.id = $1 AND pi.account_id = $2 AND pi.deleted_at IS NULL
     LIMIT 1`,
    [invoiceId, accountId]
  );
  const invoice = inv.rows?.[0] || null;
  if (!invoice) return null;

  const items = await query(
    `SELECT pii.*
     FROM purchase_invoice_items pii
     WHERE pii.purchase_invoice_id = $1 AND pii.account_id = $2
     ORDER BY pii.created_at ASC`,
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

  return {
    document: {
      type: "purchase_invoice",
      generated_at: new Date().toISOString(),
      print_version: 1
    },
    seller: seller.rows?.[0] || null,
    invoice,
    items: items.rows || [],
    printable: {
      title: "Purchase Invoice"
    }
  };
}

module.exports = { getPurchaseInvoicePrintDoc };
