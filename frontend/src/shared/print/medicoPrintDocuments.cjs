"use strict";

/**
 * Single source of truth for printable Medico documents (HTML + scoped CSS).
 * Consumed by:
 * - User frontend print iframes (Vite resolves this file)
 * - User backend invoice email PDF rendering (via Puppeteer → same DOM/CSS as print)
 */

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = Date.parse(String(dateStr));
  if (!Number.isFinite(ms)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(ms);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatBatchExpiryDaysCompact(dateStr) {
  const d = daysUntil(dateStr);
  if (d == null) return "";
  if (d < 0) return `${Math.abs(d)}d ago`;
  if (d === 0) return "today";
  return `${d}d left`;
}

/** Same as frontend `batchExpiryDaysInlineSuffix` (no deps). */
function batchExpiryDaysInlineSuffix(dateStr) {
  const bit = formatBatchExpiryDaysCompact(dateStr);
  return bit ? ` · ${bit}` : "";
}

/** Shared print stylesheet - keep in sync with former `PRINT_STYLES` (print iframe). Adds explicit `--font`. */
function getMedicoPrintDocumentCss() {
  return `
  :root {
    --font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
    --pr-primary:    #6b3fa0;
    --pr-secondary:  #5c3390;
    --pr-text:       #1a0c30;
    --pr-text-2:     #381870;
    --pr-text-3:     #623898;
    --pr-text-muted: #4c2480;
    --pr-text-faint: #a885cc;
    --pr-bg:         #ffffff;
    --pr-surface:    #f8f3ff;
    --pr-border:     #d0b8f0;
    --pr-paid:       #15803d;
    --pr-danger:     #dc2626;
  }
  @page { size: A4; margin: 11mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: var(--font); color: var(--pr-text); background: var(--pr-bg); line-height: 1.3; }
  .prDoc { width: 100%; }
  .prHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 2px solid var(--pr-border); border-top: 4px solid var(--pr-primary); }
  .prTitle { font-size: 21px; font-weight: 800; margin: 0 0 2px; letter-spacing: .01em; font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif; color: var(--pr-primary); }
  .prSub { font-size: 12px; color: var(--pr-text-2); margin: 0; }
  .prMeta { margin-top: 3px; font-size: 11px; color: var(--pr-text-muted); }
  .prGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .prCard { border: 1px solid var(--pr-border); border-radius: 8px; padding: 8px 9px; }
  .prCard h3 { margin: 0 0 7px; font-size: 11px; color: var(--pr-primary); text-transform: uppercase; letter-spacing: .07em; }
  .prRow { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; margin: 3px 0; }
  .prKvs { display: flex; flex-direction: column; gap: 5px; }
  .prKv { display: grid; grid-template-columns: 98px 1fr; gap: 8px; font-size: 12px; }
  .prLabel { color: var(--pr-text-muted); }
  .prValue { font-weight: 600; word-break: break-word; }
  .prSection { margin-top: 10px; break-inside: avoid; }
  .prTable { width: 100%; border-collapse: collapse; margin-top: 0; font-size: 11px; }
  .prTable th, .prTable td { border: 1px solid var(--pr-border); padding: 5px 6px; vertical-align: top; }
  .prTable th { background: var(--pr-surface); text-align: left; font-size: 10px; text-transform: uppercase; color: var(--pr-text-muted); letter-spacing: .05em; }
  .prNum { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .prSmall { font-size: 10px; color: var(--pr-text-muted); margin-top: 2px; }
  .prEmpty { text-align: center; color: var(--pr-text-muted); }
  .prItems .prName { font-weight: 600; }
  .prItems .prDetails { font-size: 10px; color: var(--pr-text-muted); margin-top: 2px; }
  .prTotals { width: 100%; border: 1px solid var(--pr-border); border-radius: 8px; padding: 8px; }
  .prTotals .prRow { margin: 4px 0; }
  .prTotals .prRow strong:nth-child(2) { font-weight: 800; font-variant-numeric: tabular-nums; }
  .prTotals .prPaid { color: var(--pr-paid); }
  .prTotalGrand { border-top: 1px dashed var(--pr-text-faint); padding-top: 6px; margin-top: 6px; font-size: 13px; }
  .prTotalDue { color: var(--pr-danger); font-weight: 700; }
  .prFooter { margin-top: 10px; font-size: 10px; color: var(--pr-text-muted); border-top: 1px dashed var(--pr-border); padding-top: 7px; display: flex; justify-content: space-between; gap: 8px; }
  .prNoPrint button { border: 1px solid var(--pr-border); background: var(--pr-bg); border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; font-family: var(--font); color: var(--pr-text); }
  @media print { .prNoPrint { display: none !important; } }
`;
}

function money(v) {
  return Number(v || 0).toFixed(2);
}

function ymd(v) {
  return String(v || "").slice(0, 10) || "-";
}

/** Format a date value as "23 Jan 2023" (no leading zero on day). */
function fmtDate(v) {
  const s = String(v || "").slice(0, 10);
  if (!s || s === "-") return "-";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(`${s}T00:00:00`);
  if (!Number.isFinite(dt.getTime())) return s;
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function qty(v) {
  return Number(v || 0).toFixed(2).replace(/\.00$/, "");
}

function sellerPhone(seller) {
  return String(seller?.phone ?? seller?.phone_number ?? "").trim();
}

/** Body HTML only - same markup as legacy `salesInvoicePrint.js`. */
function buildSalesInvoiceBodyHtml(data) {
  const seller = data?.seller || {};
  const inv = data?.invoice || {};
  const items = Array.isArray(data?.items) ? data.items : [];
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const tax = Array.isArray(data?.tax_summary) ? data.tax_summary : [];
  const paidAmount = inv.amount_paid_resolved ?? inv.amount_paid;
  const balanceAmount = inv.balance_due_resolved ?? inv.balance_due;
  const sellerAddress = [seller.address, seller.city, seller.state, seller.pincode].filter(Boolean).join(", ");
  const customerAddress = [inv.customer_address, inv.customer_city, inv.customer_state, inv.customer_pincode].filter(Boolean).join(", ");

  const itemsRows = items
    .map(
      (it, i) => `<tr>
      <td class="prNum">${i + 1}</td>
      <td>
        <div class="prName">${esc(it.product_name || "-")}</div>
        <div class="prDetails">${esc(it.batch_no || "-")}${it.expiry_date ? ` | Exp ${fmtDate(it.expiry_date)}${esc(batchExpiryDaysInlineSuffix(it.expiry_date))}` : ""}</div>
      </td>
      <td class="prNum">${qty(it.qty)}</td>
      <td class="prNum">${qty(it.free_qty)}</td>
      <td class="prNum">${money(it.mrp)}</td>
      <td class="prNum">${money(it.sales_rate)}</td>
      <td class="prNum">${money(it.discount_amount)}</td>
      <td class="prNum">${money(it.gst_amount)}</td>
      <td class="prNum">${money(it.line_total)}</td>
    </tr>`
    )
    .join("");

  const paymentRows = payments.length
    ? payments
        .map(
          (p, i) => `<tr>
        <td>${i + 1}</td>
        <td>${fmtDate(p.payment_date)}</td>
        <td>${esc(p.payment_mode || "-")}</td>
        <td>${esc(p.reference_number || "-")}</td>
        <td class="prNum">${money(p.amount)}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="prEmpty">No payments linked</td></tr>`;

  const taxRows = tax.length
    ? tax
        .map(
          (t) => `<tr>
        <td class="prNum">${money(t.gst_percent)}%</td>
        <td class="prNum">${money(t.taxable_amount)}</td>
        <td class="prNum">${money(t.gst_amount)}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="prEmpty">No tax rows</td></tr>`;

  const phoneLine = sellerPhone(seller);
  return `
    <div class="prDoc">
      <div class="prHead">
        <div>
          <h1 class="prTitle">${esc(data?.printable?.title || "Sales Invoice")}</h1>
          <p class="prSub">${esc(seller.firm_name || seller.full_name || "Business")}${seller.gst_number ? ` | GST: ${esc(seller.gst_number)}` : ""}</p>
          <p class="prMeta">${esc(sellerAddress || "-")}${phoneLine ? ` | ${esc(phoneLine)}` : ""}</p>
        </div>
        <div class="prNoPrint"><button type="button" onclick="window.print()">Print</button></div>
      </div>

      <div class="prGrid">
        <div class="prCard">
          <h3>Invoice</h3>
          <div class="prKvs">
            <div class="prKv"><span class="prLabel">Invoice No</span><span class="prValue">${esc(inv.invoice_number || "-")}</span></div>
            <div class="prKv"><span class="prLabel">Invoice Date</span><span class="prValue">${fmtDate(inv.invoice_date)}</span></div>
            <div class="prKv"><span class="prLabel">Status</span><span class="prValue">${esc(inv.status || "-")}</span></div>
            <div class="prKv"><span class="prLabel">Payment</span><span class="prValue">${esc(inv.payment_status_resolved || inv.payment_status || "-")}</span></div>
          </div>
        </div>
        <div class="prCard">
          <h3>Customer</h3>
          <div class="prKvs">
            <div class="prKv"><span class="prLabel">Name</span><span class="prValue">${esc(inv.customer_name || "-")}</span></div>
            <div class="prKv"><span class="prLabel">Phone</span><span class="prValue">${esc(inv.customer_phone || "-")}</span></div>
            <div class="prKv"><span class="prLabel">GST</span><span class="prValue">${esc(inv.customer_gst_number || inv.customer_gst || "-")}</span></div>
            <div class="prKv"><span class="prLabel">Address</span><span class="prValue">${esc(customerAddress || "-")}</span></div>
          </div>
        </div>
      </div>

      <div class="prSection">
        <table class="prTable prItems">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th class="prNum">Qty</th>
              <th class="prNum">Free</th>
              <th class="prNum">MRP</th>
              <th class="prNum">Rate</th>
              <th class="prNum">Disc</th>
              <th class="prNum">GST</th>
              <th class="prNum">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
      </div>

      <div class="prSection prGrid">
        <div class="prCard">
          <h3>GST Summary</h3>
          <table class="prTable" style="margin-top:0;">
            <thead><tr><th class="prNum">GST %</th><th class="prNum">Taxable</th><th class="prNum">GST</th></tr></thead>
            <tbody>${taxRows}</tbody>
          </table>
        </div>
        <div class="prTotals">
          <div class="prRow"><span>Subtotal</span><strong>${money(inv.subtotal)}</strong></div>
          <div class="prRow"><span>Discount</span><strong>${money(inv.total_discount)}</strong></div>
          <div class="prRow"><span>GST</span><strong>${money(inv.total_gst)}</strong></div>
          <div class="prRow"><span>Round Off</span><strong>${money(inv.round_off)}</strong></div>
          <div class="prRow prTotalGrand"><span>Total Amount</span><strong>${money(inv.total_amount)}</strong></div>
          <div class="prRow"><span>Amount Paid</span><strong class="prPaid">${money(paidAmount)}</strong></div>
          <div class="prRow"><span>Balance Due</span><strong class="prTotalDue">${money(balanceAmount)}</strong></div>
        </div>
      </div>

      <div class="prSection">
        <div class="prCard">
          <h3>Payments</h3>
          <table class="prTable" style="margin-top:0;">
            <thead><tr><th>#</th><th>Date</th><th>Mode</th><th>Reference</th><th class="prNum">Amount</th></tr></thead>
            <tbody>${paymentRows}</tbody>
          </table>
        </div>
      </div>

      <div class="prFooter">
        <span>Generated on ${new Date().toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <span>Invoice ${esc(inv.invoice_number || "-")} | ${esc(inv.payment_status_resolved || inv.payment_status || "-")}</span>
      </div>
    </div>
  `;
}

/** Full HTML document (print iframe / Puppeteer PDF). */
function buildSalesInvoiceCompleteHtmlDocument(data, opts) {
  const inv = data?.invoice || {};
  const title =
    opts && opts.title ? String(opts.title) : `Invoice ${String(inv.invoice_number || "").trim() || "-"}`;
  const bodyHtml = buildSalesInvoiceBodyHtml(data);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <style>${getMedicoPrintDocumentCss()}</style>
  </head>
  <body>${bodyHtml}</body>
</html>`;
}

/**
 * Body HTML for purchase invoice - same CSS classes as sales invoice.
 * Data shape: { seller, invoice, items, printable }
 * invoice fields: invoice_number, vendor_invoice_number, invoice_date, due_date,
 *   status, payment_status, vendor_name, vendor_email, division_label,
 *   division_mfg_name, total_amount, amount_paid, balance_due, notes
 * items fields: product_name, product_code, batch_no, expiry_date, hsn_code,
 *   qty, free_qty, purchase_rate, mrp, discount_percent, gst_percent,
 *   line_amount, taxable_amount
 */
function buildPurchaseInvoiceBodyHtml(data) {
  const seller = data?.seller || {};
  const inv = data?.invoice || {};
  const items = Array.isArray(data?.items) ? data.items : [];

  const sellerAddress = [seller.address, seller.city, seller.state, seller.pincode].filter(Boolean).join(", ");
  const phoneLine = sellerPhone(seller);

  // Party display: division (mfg) or vendor
  const partyLabel = (inv.division_label || inv.division_name)
    ? `${inv.division_label || inv.division_name || ""}${inv.division_mfg_name ? ` (${inv.division_mfg_name})` : ""}`.trim()
    : String(inv.vendor_name || "").trim();

  const itemsRows = items
    .map(
      (it, i) => `<tr>
      <td class="prNum">${i + 1}</td>
      <td>
        <div class="prName">${esc(it.product_name || it.product_code || "-")}</div>
        <div class="prDetails">${esc(it.batch_no || "-")}${it.expiry_date ? ` | Exp ${fmtDate(it.expiry_date)}${esc(batchExpiryDaysInlineSuffix(it.expiry_date))}` : ""}${it.hsn_code ? ` | HSN ${esc(it.hsn_code)}` : ""}</div>
      </td>
      <td class="prNum">${qty(it.qty)}</td>
      <td class="prNum">${qty(it.free_qty)}</td>
      <td class="prNum">${money(it.purchase_rate)}</td>
      <td class="prNum">${money(it.mrp)}</td>
      <td class="prNum">${money(it.discount_percent)}%</td>
      <td class="prNum">${money(it.gst_percent)}%</td>
      <td class="prNum">${money(it.line_amount != null ? it.line_amount : it.taxable_amount)}</td>
    </tr>`
    )
    .join("");

  // GST summary grouped by gst_percent
  const gstMap = {};
  for (const it of items) {
    const pct = Number(it.gst_percent || 0);
    const taxable = Number(it.taxable_amount || 0);
    const gstAmt = taxable * (pct / 100);
    if (!gstMap[pct]) gstMap[pct] = { taxable: 0, gst: 0 };
    gstMap[pct].taxable += taxable;
    gstMap[pct].gst += gstAmt;
  }
  const taxRows = Object.keys(gstMap).length
    ? Object.entries(gstMap)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(
          ([pct, v]) => `<tr>
        <td class="prNum">${money(pct)}%</td>
        <td class="prNum">${money(v.taxable)}</td>
        <td class="prNum">${money(v.gst)}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="prEmpty">No tax rows</td></tr>`;

  const totalAmount = Number(inv.total_amount || 0);
  const amountPaid = Number(inv.amount_paid || 0);
  const balanceDue = Number(inv.balance_due != null ? inv.balance_due : totalAmount - amountPaid);

  return `
    <div class="prDoc">
      <div class="prHead">
        <div>
          <h1 class="prTitle">${esc(data?.printable?.title || "Purchase Invoice")}</h1>
          <p class="prSub">${esc(seller.firm_name || seller.full_name || "Business")}${seller.gst_number ? ` | GST: ${esc(seller.gst_number)}` : ""}</p>
          <p class="prMeta">${esc(sellerAddress || "-")}${phoneLine ? ` | ${esc(phoneLine)}` : ""}</p>
        </div>
        <div class="prNoPrint"><button type="button" onclick="window.print()">Print</button></div>
      </div>

      <div class="prGrid">
        <div class="prCard">
          <h3>Invoice</h3>
          <div class="prKvs">
            <div class="prKv"><span class="prLabel">Invoice No</span><span class="prValue">${esc(inv.invoice_number || "-")}</span></div>
            ${inv.vendor_invoice_number ? `<div class="prKv"><span class="prLabel">Supplier Ref</span><span class="prValue">${esc(inv.vendor_invoice_number)}</span></div>` : ""}
            <div class="prKv"><span class="prLabel">Invoice Date</span><span class="prValue">${fmtDate(inv.invoice_date)}</span></div>
            ${inv.due_date ? `<div class="prKv"><span class="prLabel">Due Date</span><span class="prValue">${fmtDate(inv.due_date)}</span></div>` : ""}
            <div class="prKv"><span class="prLabel">Status</span><span class="prValue">${esc(inv.status || "-")}</span></div>
            <div class="prKv"><span class="prLabel">Payment</span><span class="prValue">${esc(inv.payment_status || "-")}</span></div>
          </div>
        </div>
        <div class="prCard">
          <h3>Supplier / Division</h3>
          <div class="prKvs">
            <div class="prKv"><span class="prLabel">Party</span><span class="prValue">${esc(partyLabel || "-")}</span></div>
            ${inv.vendor_name && partyLabel !== inv.vendor_name ? `<div class="prKv"><span class="prLabel">Vendor</span><span class="prValue">${esc(inv.vendor_name)}</span></div>` : ""}
            ${inv.vendor_email ? `<div class="prKv"><span class="prLabel">Email</span><span class="prValue">${esc(inv.vendor_email)}</span></div>` : ""}
            ${inv.notes ? `<div class="prKv"><span class="prLabel">Notes</span><span class="prValue">${esc(inv.notes)}</span></div>` : ""}
          </div>
        </div>
      </div>

      <div class="prSection">
        <table class="prTable prItems">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th class="prNum">Qty</th>
              <th class="prNum">Free</th>
              <th class="prNum">Rate</th>
              <th class="prNum">MRP</th>
              <th class="prNum">Disc%</th>
              <th class="prNum">GST%</th>
              <th class="prNum">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsRows || `<tr><td colspan="9" class="prEmpty">No items</td></tr>`}</tbody>
        </table>
      </div>

      <div class="prSection prGrid">
        <div class="prCard">
          <h3>GST Summary</h3>
          <table class="prTable" style="margin-top:0;">
            <thead><tr><th class="prNum">GST %</th><th class="prNum">Taxable</th><th class="prNum">GST</th></tr></thead>
            <tbody>${taxRows}</tbody>
          </table>
        </div>
        <div class="prTotals">
          <div class="prRow prTotalGrand"><span>Total Amount</span><strong>Rs.${money(totalAmount)}</strong></div>
          <div class="prRow"><span>Amount Paid</span><strong class="prPaid">Rs.${money(amountPaid)}</strong></div>
          <div class="prRow"><span>Balance Due</span><strong class="prTotalDue">Rs.${money(balanceDue)}</strong></div>
        </div>
      </div>

      <div class="prFooter">
        <span>Generated on ${new Date().toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <span>Invoice ${esc(inv.invoice_number || "-")} | ${esc(inv.status || "-")}</span>
      </div>
    </div>
  `;
}

/** Full HTML document for purchase invoice (print iframe / Puppeteer PDF). */
function buildPurchaseInvoiceCompleteHtmlDocument(data, opts) {
  const inv = data?.invoice || {};
  const title =
    opts && opts.title
      ? String(opts.title)
      : `Purchase Invoice ${String(inv.invoice_number || "").trim() || "-"}`;
  const bodyHtml = buildPurchaseInvoiceBodyHtml(data);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <style>${getMedicoPrintDocumentCss()}</style>
  </head>
  <body>${bodyHtml}</body>
</html>`;
}

module.exports = {
  esc,
  getMedicoPrintDocumentCss,
  buildSalesInvoiceBodyHtml,
  buildSalesInvoiceCompleteHtmlDocument,
  buildPurchaseInvoiceBodyHtml,
  buildPurchaseInvoiceCompleteHtmlDocument,
  sellerPhone,
  batchExpiryDaysInlineSuffix,
  money,
  ymd,
  qty,
};
