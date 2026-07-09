import { openPrintDocument } from "./printDocument.js";

function fmtDate(d) {
  if (!d) return "-";
  const s = String(d).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "-";
  const dt = new Date(`${s}T00:00:00`);
  if (!Number.isFinite(dt.getTime())) return s;
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtAmt(n) {
  return Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Build the HTML body for a return document (sales or purchase).
 * @param {{ ret: object, items: object[], type: "sales"|"purchase" }} opts
 */
export function buildReturnHtml({ ret = {}, items = [], type = "sales" }) {
  const isSales = type === "sales";
  const docTitle = isSales ? "Sales Return" : "Purchase Return";
  const partyLabel = isSales ? "Customer" : "Supplier / Division";
  const partyName = isSales
    ? ret.customer_name || ""
    : ret.vendor_name || ret.division_name || "";
  const refInvoice = isSales
    ? ret.invoice_number || ret.sales_invoice_number || ""
    : ret.original_invoice_number || "";
  const totalAmount = isSales
    ? Number(ret.total_return_amount || 0)
    : Number(ret.total_amount || 0);

  const itemRows = items
    .map((item, i) => {
      const qty = Number(item.return_qty || item.qty || 0);
      const freeQty = Number(item.return_free_qty || item.free_qty || 0);
      const rate = Number(
        item.net_rate || item.sales_rate || item.purchase_rate || item.rate || 0
      );
      const amt = Number(item.amount != null ? item.amount : qty * rate);
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${esc(item.product_name || "-")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${esc(item.batch_no || "-")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${qty}${freeQty ? ` + ${freeQty}F` : ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmtAmt(rate)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;">${fmtAmt(amt)}</td>
      </tr>`;
    })
    .join("");

  const reasonRow =
    !isSales && ret.return_reason
      ? `<div style="display:flex;gap:4px;"><span style="color:#6b7280;min-width:110px;">Reason:</span><strong>${esc(String(ret.return_reason).replace(/_/g, " "))}</strong></div>`
      : "";
  const notesRow = ret.notes
    ? `<div style="display:flex;gap:4px;"><span style="color:#6b7280;min-width:110px;">Notes:</span><span>${esc(ret.notes)}</span></div>`
    : "";

  return `
<div style="font-family:Arial,sans-serif;max-width:820px;margin:0 auto;padding:28px 24px;font-size:13px;color:#111;">
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px;">
    <div>
      <h1 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.02em;">${esc(docTitle)}</h1>
      <div style="margin-top:4px;font-size:14px;font-weight:700;color:#374151;">${esc(ret.return_number || "")}</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#374151;line-height:1.6;">
      <div>Date: <strong>${esc(fmtDate(ret.return_date))}</strong></div>
      <div>Status: <strong>${esc(ret.status || "")}</strong></div>
    </div>
  </div>

  <!-- Party / meta info -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:20px;font-size:12px;line-height:1.6;">
    <div style="display:flex;gap:4px;">
      <span style="color:#6b7280;min-width:110px;">${esc(partyLabel)}:</span>
      <strong>${esc(partyName)}</strong>
    </div>
    ${refInvoice ? `<div style="display:flex;gap:4px;"><span style="color:#6b7280;min-width:110px;">Ref Invoice:</span><strong>${esc(refInvoice)}</strong></div>` : ""}
    ${reasonRow}
    ${notesRow}
  </div>

  <!-- Items table -->
  ${
    items.length > 0
      ? `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
    <thead>
      <tr style="background:#f3f4f6;border-bottom:1.5px solid #d1d5db;">
        <th style="padding:7px 8px;text-align:left;font-weight:700;">#</th>
        <th style="padding:7px 8px;text-align:left;font-weight:700;">Product</th>
        <th style="padding:7px 8px;text-align:left;font-weight:700;">Batch</th>
        <th style="padding:7px 8px;text-align:right;font-weight:700;">Qty</th>
        <th style="padding:7px 8px;text-align:right;font-weight:700;">Rate</th>
        <th style="padding:7px 8px;text-align:right;font-weight:700;">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr style="border-top:1.5px solid #374151;">
        <td colspan="5" style="padding:9px 8px;text-align:right;font-weight:800;font-size:13px;">Total Return Amount</td>
        <td style="padding:9px 8px;text-align:right;font-weight:900;font-size:14px;">${fmtAmt(totalAmount)}</td>
      </tr>
    </tfoot>
  </table>`
      : `<p style="color:#6b7280;font-size:12px;">No line items recorded.</p>`
  }

  <!-- Footer note -->
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
    This is a system-generated ${esc(docTitle.toLowerCase())} document.
  </div>
</div>`;
}

/**
 * Trigger browser print for a return document.
 * @param {{ ret: object, items: object[], type: "sales"|"purchase" }} opts
 */
export function printReturnDoc({ ret = {}, items = [], type = "sales" }) {
  const label = type === "sales" ? "Sales Return" : "Purchase Return";
  const title = `${label} ${ret.return_number || ""}`.trim();
  return openPrintDocument({ title, bodyHtml: buildReturnHtml({ ret, items, type }) });
}