const { emailBase, summaryCard, metaRow, sectionHeading, divider, greeting, para, noticeBox, E, C, ICONS } = require("../../shared/emailTemplate");

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmt(v) {
  return `Rs.\u202F${n(v).toFixed(2)}`;
}

function statusBadgeColor(status) {
  const s = String(status || "").toUpperCase();
  if (s === "CONFIRMED" || s === "PAID") return C.success;
  if (s === "CANCELLED") return C.danger;
  return C.accent;
}

function buildSalesInvoiceEmailHtml(doc) {
  const inv        = doc.invoice || {};
  const seller     = doc.seller  || {};
  const invNo      = E(inv.invoice_number || "");
  const custName   = E(inv.customer_name  || "");
  const invDate    = String(inv.invoice_date || "").slice(0, 10);
  const sellerName = E(seller.firm_name || seller.full_name || "");
  const status     = String(inv.status || "").toUpperCase();
  const sub        = n(inv.total_amount);
  const paid       = n(inv.amount_paid_resolved ?? inv.amount_paid);
  const due        = n(inv.balance_due_resolved  ?? inv.balance_due);

  // ── Items table ────────────────────────────────────────────────────────────
  const items = doc.items || [];
  const itemRows = items.length
    ? items.map((l, i) => {
        const bg = i % 2 === 0 ? C.bgCard : C.bgAlt;
        return [
          `<tr style="background:${bg};">`,
          `  <td style="padding:10px 14px;font-size:13px;color:${C.textDark};border-bottom:1px solid ${C.border};">${E(l.product_name || l.product_code || "-")}</td>`,
          `  <td style="padding:10px 14px;font-size:13px;color:${C.textMid};text-align:center;border-bottom:1px solid ${C.border};">${n(l.qty)}</td>`,
          `  <td style="padding:10px 14px;font-size:13px;color:${C.textDark};text-align:right;border-bottom:1px solid ${C.border};font-weight:600;">${fmt(l.line_total)}</td>`,
          `</tr>`,
        ].join("\n");
      }).join("\n")
    : `<tr><td colspan="3" style="padding:20px;text-align:center;color:${C.textMuted};font-size:13px;">No items on this invoice.</td></tr>`;

  const itemsTable = [
    sectionHeading("Invoice Items"),
    `<table role="presentation" class="em-tbl" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${C.border};border-radius:10px;overflow:hidden;margin-bottom:24px;">`,
    `  <thead>`,
    `    <tr style="background:${C.accentLight};">`,
    `      <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:${C.accent};text-transform:uppercase;letter-spacing:0.08em;">Product</th>`,
    `      <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:${C.accent};text-transform:uppercase;letter-spacing:0.08em;">Qty</th>`,
    `      <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:${C.accent};text-transform:uppercase;letter-spacing:0.08em;">Amount</th>`,
    `    </tr>`,
    `  </thead>`,
    `  <tbody>${itemRows}</tbody>`,
    `</table>`,
  ].join("\n");

  // ── Totals block ───────────────────────────────────────────────────────────
  const totalsRows = [
    `<tr>`,
    `  <td style="padding:8px 0;font-size:13px;color:${C.textMid};">Subtotal</td>`,
    `  <td style="padding:8px 0;font-size:13px;color:${C.textDark};text-align:right;font-weight:600;">${fmt(sub)}</td>`,
    `</tr>`,
    paid > 0 ? [
      `<tr>`,
      `  <td style="padding:8px 0;font-size:13px;color:${C.success};">Amount Paid</td>`,
      `  <td style="padding:8px 0;font-size:13px;color:${C.success};text-align:right;font-weight:600;">${fmt(paid)}</td>`,
      `</tr>`,
    ].join("") : "",
    due > 0 ? [
      `<tr style="border-top:2px solid ${C.border};">`,
      `  <td style="padding:12px 0 4px;font-size:15px;font-weight:700;color:${C.danger};">Balance Due</td>`,
      `  <td style="padding:12px 0 4px;font-size:15px;font-weight:700;color:${C.danger};text-align:right;">${fmt(due)}</td>`,
      `</tr>`,
    ].join("") : "",
  ].filter(Boolean).join("\n");

  const totalsBlock = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bgAlt};border:1px solid ${C.border};border-radius:10px;margin-bottom:24px;">`,
    `  <tr><td style="padding:16px 20px;">`,
    `    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    totalsRows,
    `    </table>`,
    `  </td></tr>`,
    `</table>`,
  ].join("\n");

  // ── Status badge ───────────────────────────────────────────────────────────
  const statusBadge = status
    ? `<span style="display:inline-block;padding:3px 12px;border-radius:20px;background:${statusBadgeColor(status)}1a;color:${statusBadgeColor(status)};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${status}</span>`
    : "";

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = [
    greeting(custName || "Customer"),
    para(`Please find your sales invoice details below. A PDF copy is attached for your records.`),
    divider(),

    // Invoice meta
    sectionHeading("Invoice Details"),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bgAlt};border:1px solid ${C.border};border-radius:10px;margin-bottom:24px;">`,
    `  <tr>`,
    `    <td style="padding:16px 20px;">`,
    `      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    `        <tr>`,
    `          <td style="padding:4px 0;font-size:12px;color:${C.textMuted};width:40%;">Invoice No.</td>`,
    `          <td style="padding:4px 0;font-size:13px;color:${C.textDark};font-weight:700;">${invNo || "-"}</td>`,
    `        </tr>`,
    `        <tr>`,
    `          <td style="padding:4px 0;font-size:12px;color:${C.textMuted};">Date</td>`,
    `          <td style="padding:4px 0;font-size:13px;color:${C.textDark};">${E(invDate) || "-"}</td>`,
    `        </tr>`,
    `        <tr>`,
    `          <td style="padding:4px 0;font-size:12px;color:${C.textMuted};">Status</td>`,
    `          <td style="padding:6px 0;">${statusBadge || "-"}</td>`,
    `        </tr>`,
    sellerName ? [
      `        <tr>`,
      `          <td style="padding:4px 0;font-size:12px;color:${C.textMuted};">From</td>`,
      `          <td style="padding:4px 0;font-size:13px;color:${C.textDark};">${sellerName}</td>`,
      `        </tr>`,
    ].join("") : "",
    `      </table>`,
    `    </td>`,
    `  </tr>`,
    `</table>`,

    itemsTable,
    totalsBlock,

    para(
      `If you have any questions about this invoice, please contact us directly.`,
      { color: C.textMuted, size: "12px" }
    ),
  ].join("\n");

  return emailBase({
    preheader: `Invoice ${invNo} from ${sellerName || "your supplier"} - Total ${fmt(sub)}`,
    headerLabel: "Sales Invoice",
    headerTitle: invNo ? `Invoice #${invNo}` : "Sales Invoice",
    headerSub: sellerName || undefined,
    body,
    brandName: sellerName || "JedMee",
  });
}

function buildPlainTextFromDoc(doc) {
  const inv = doc.invoice || {};
  const lines = [
    `Sales Invoice ${inv.invoice_number || ""}`,
    `Customer: ${inv.customer_name || ""}`,
    `Date: ${String(inv.invoice_date || "").slice(0, 10)}`,
    `Status: ${inv.status || ""}`,
    `Total: Rs.${n(inv.total_amount).toFixed(2)}`,
    "",
    "Items:",
  ];
  (doc.items || []).forEach((l) => {
    lines.push(`  - ${l.product_name || l.product_code || ""}  Qty ${n(l.qty)}  Rs.${n(l.line_total).toFixed(2)}`);
  });
  return lines.join("\n");
}

module.exports = { buildSalesInvoiceEmailHtml, buildPlainTextFromDoc, escapeHtml: E };
