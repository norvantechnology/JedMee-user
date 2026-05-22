import { esc, openPrintDocument } from "./printDocument.js";

const MONTH_NAMES = ["","January","February","March","April","May","June","July","August","September","October","November","December"];

function n2(v) { const num = Number(v); return isNaN(num) ? "0.00" : num.toFixed(2); }
function amt(v) { return `₹${n2(v)}`; }
function th(label, cls) { return `<th${cls ? ` class="${cls}"` : ""}>${label}</th>`; }
function td(v, cls, bold, color) {
  let style = "";
  if (bold && color) style = ` style="font-weight:700;color:${color}"`;
  else if (bold)     style = ` style="font-weight:700"`;
  else if (color)    style = ` style="color:${color}"`;
  return `<td${cls ? ` class="${cls}"` : ""}${style}>${v}</td>`;
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Build and open the GSTR-1 Summary PDF via the browser print dialog.
 * @param {{ data, year, month, taxLabel, taxIdLabel }} opts
 */
export function printGstReport({ data, year, month, taxLabel = "GST", taxIdLabel = "GSTIN" }) {
  if (!data) return;

  const biz      = data.business    || {};
  const s        = data.summary     || {};
  const hsnRows  = data.hsn_summary || [];
  const b2bInvs  = data.b2b_invoices || [];
  const b2cSum   = data.b2c_summary  || [];
  const b2cTot   = data.b2c_total    || {};
  const largeB2c = data.large_b2c    || [];
  const period   = data.period       || {};
  const fy       = data.financial_year || "";

  const mo = month || period.month;
  const yr = year  || period.year;
  const periodLabel = mo && yr ? `${MONTH_NAMES[mo] || ""} ${yr}` : `${period.from_date || ""} to ${period.to_date || ""}`;

  // Generated on — human readable, no seconds
  const generatedOn = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  // ── Header ──────────────────────────────────────────────────────────────────
  const headerHtml = `
    <div class="prHead">
      <div class="prHeadLeft">
        <h1 class="prTitle">GSTR-1 — ${esc(taxLabel)} Summary Report</h1>
        <p class="prSub">Outward Supply Summary &nbsp;|&nbsp; For CA Filing</p>
      </div>
      <div class="prHeadRight">
        <table class="prMetaTable">
          <tr><td class="prMetaLabel">Legal / Trade Name</td><td class="prMetaVal">${esc(biz.firm_name || "—")}</td></tr>
          <tr><td class="prMetaLabel">GSTIN</td><td class="prMetaVal prMono">${esc(biz.gst_number || "Not set")}${biz.gst_number && !biz.gstin_valid ? ' <span style="color:#dc2626;font-size:10px;font-weight:700">⚠ Invalid format</span>' : ""}</td></tr>
          <tr><td class="prMetaLabel">Return Period</td><td class="prMetaVal">${esc(periodLabel)}</td></tr>
          ${fy ? `<tr><td class="prMetaLabel">Financial Year</td><td class="prMetaVal">${esc(fy)}</td></tr>` : ""}
          <tr><td class="prMetaLabel">Generated On</td><td class="prMetaVal" style="color:#6b7280;font-weight:400">${generatedOn}</td></tr>
        </table>
      </div>
    </div>`;

  // ── Summary cards ────────────────────────────────────────────────────────────
  const summaryHtml = `
    <div class="prGrid4">
      <div class="prCard">
        <div class="prCardLabel">Total Invoices</div>
        <div class="prCardValue">${s.total_invoices || 0}</div>
        <div class="prCardNote">${s.b2b_count || 0} B2B + ${s.b2c_count || 0} B2C</div>
      </div>
      <div class="prCard">
        <div class="prCardLabel">Taxable Value</div>
        <div class="prCardValue">${amt(s.total_taxable)}</div>
        <div class="prCardNote">Excl. ${esc(taxLabel)}</div>
      </div>
      <div class="prCard">
        <div class="prCardLabel">Total ${esc(taxLabel)}</div>
        <div class="prCardValue">${amt(s.total_tax)}</div>
        <div class="prCardNote">CGST + SGST + IGST</div>
      </div>
      <div class="prCard prCardHL">
        <div class="prCardLabel">Total Value</div>
        <div class="prCardValue">${amt(s.total_value)}</div>
        <div class="prCardNote">Incl. ${esc(taxLabel)}</div>
      </div>
    </div>`;

  // ── HSN warning ──────────────────────────────────────────────────────────────
  const hsnWarnHtml = s.missing_hsn_count > 0 ? `
    <div class="prWarnBox" style="background:#fee2e2;border-color:#ef4444;color:#991b1b">
      <strong>⚠ Action Required:</strong> ${s.missing_hsn_count} sales line item(s) missing HSN codes — mandatory for GSTR-1 filing. Update before sharing with CA.
    </div>` : "";

  // ── GSTIN issues warning ─────────────────────────────────────────────────────
  const gstinWarnHtml = s.gstin_issue_count > 0 ? `
    <div class="prWarnBox">
      <strong>⚠ ${s.gstin_issue_count} B2B Invoice(s) with GSTIN Issues — Resolve Before Filing</strong>
    </div>` : "";

  // ── HSN-wise Summary ─────────────────────────────────────────────────────────
  const hsnTableHtml = `
    <div class="prSection">
      <h3>HSN-wise Summary (Table 12)</h3>
      ${hsnRows.length === 0 ? '<p class="prNote">No HSN data for selected period.</p>' : `
      <table class="prTable">
        <thead><tr>
          ${th("HSN Code")}${th("GST Rate","prNum")}${th("Invoices","prNum")}
          ${th("Taxable Value","prNum")}${th("CGST","prNum")}${th("SGST","prNum")}
          ${th("IGST","prNum")}${th("CESS","prNum")}${th("Total Value","prNum")}
        </tr></thead>
        <tbody>
          ${hsnRows.map((r, i) => `<tr${i % 2 === 1 ? ' class="prAlt"' : ""}>
            ${td(r.hsn_code === "N/A" ? '<span style="color:#f59e0b;font-style:italic">N/A ⚠</span>' : `<span class="prMono">${esc(r.hsn_code)}</span>`)}
            ${td(`${n2(r.gst_rate)}%`,"prNum")}
            ${td(r.invoice_count,"prNum")}
            ${td(amt(r.taxable_value),"prNum")}
            ${td(amt(r.cgst),"prNum")}
            ${td(amt(r.sgst),"prNum")}
            ${td(amt(r.igst),"prNum")}
            ${td(amt(0),"prNum")}
            ${td(amt(r.total_value),"prNum",true)}
          </tr>`).join("")}
        </tbody>
      </table>`}
    </div>`;

  // ── B2B Invoices — individual rows ───────────────────────────────────────────
  const b2bHtml = `
    <div class="prSection prPageBreak">
      <h3>B2B Invoices — ${b2bInvs.length} invoice(s) — Report Individually in GSTR-1 (Table 4)</h3>
      ${b2bInvs.length === 0 ? '<p class="prNote">No B2B invoices for this period.</p>' : `
      <table class="prTable">
        <thead><tr>
          ${th("#")}${th("Invoice No")}${th("Date")}${th("Customer")}${th("GSTIN")}
          ${th("Place of Supply")}${th("Taxable Value","prNum")}
          ${th("CGST","prNum")}${th("SGST","prNum")}${th("IGST","prNum")}
          ${th("CESS","prNum")}${th("Total","prNum")}
        </tr></thead>
        <tbody>
          ${b2bInvs.map((r, idx) => `<tr${r.gstin_issue ? ' class="prIssueRow"' : (idx % 2 === 1 ? ' class="prAlt"' : "")}>
            ${td(idx + 1)}
            ${td(esc(r.invoice_number || ""))}
            ${td(fmtDate(r.invoice_date))}
            ${td(esc(r.customer_name || ""))}
            ${td(`<span class="prMono">${esc(r.customer_gstin || "—")}</span>${r.gstin_issue ? ' <span style="color:#b91c1c;font-size:9px">⚠</span>' : ''}`)}
            ${td(esc(r.place_of_supply || "—"))}
            ${td(amt(r.taxable_value),"prNum")}
            ${td(amt(r.cgst),"prNum")}
            ${td(amt(r.sgst),"prNum")}
            ${td(amt(r.igst),"prNum")}
            ${td(amt(0),"prNum")}
            ${td(amt(r.total_value),"prNum",true)}
          </tr>`).join("")}
        </tbody>
      </table>`}
    </div>`;

  // ── B2C Summary by GST Rate ──────────────────────────────────────────────────
  const b2cHtml = `
    <div class="prSection prPageBreak">
      <h3>B2C Summary — Grouped by ${esc(taxLabel)} Rate (Table 5/7)</h3>
      <p class="prNote">Enter these totals in the B2C summary section of GSTR-1 on the GST portal. Only rows with non-zero values need to be entered.</p>
      <table class="prTable">
        <thead><tr>
          ${th("GST Rate")}${th("Invoices","prNum")}${th("Taxable Value","prNum")}
          ${th("CGST","prNum")}${th("SGST","prNum")}${th("IGST","prNum")}
          ${th("CESS","prNum")}${th("Total Value","prNum")}
        </tr></thead>
        <tbody>
          ${b2cSum.map((r, i) => `<tr${i % 2 === 1 ? ' class="prAlt"' : ""}${r.invoice_count === 0 ? ' style="opacity:0.4"' : ""}>
            ${td(`${r.gst_rate}%`,null,true)}
            ${td(r.invoice_count,"prNum")}
            ${td(amt(r.taxable_value),"prNum")}
            ${td(amt(r.cgst),"prNum")}
            ${td(amt(r.sgst),"prNum")}
            ${td(amt(r.igst),"prNum")}
            ${td(amt(0),"prNum")}
            ${td(amt(r.total_value),"prNum")}
          </tr>`).join("")}
          <tr class="prTotalRow">
            ${td("Total",null,true)}
            ${td(b2cTot.invoice_count || 0,"prNum",true)}
            ${td(amt(b2cTot.taxable_value),"prNum",true)}
            ${td(amt(b2cTot.cgst),"prNum",true)}
            ${td(amt(b2cTot.sgst),"prNum",true)}
            ${td(amt(b2cTot.igst),"prNum",true)}
            ${td(amt(0),"prNum",true)}
            ${td(amt(b2cTot.total_value),"prNum",true)}
          </tr>
        </tbody>
      </table>
    </div>`;

  // ── Large B2C ────────────────────────────────────────────────────────────────
  const largeB2cHtml = largeB2c.length > 0 ? `
    <div class="prSection">
      <h3>⚠ Large B2C Invoices (&gt;₹2.5 Lakh) — Report Individually in GSTR-1</h3>
      <p class="prNote prNoteWarn">These invoices exceed ₹2.5 lakh and must be reported individually in GSTR-1, not in the B2C summary.</p>
      <table class="prTable">
        <thead><tr>
          ${th("#")}${th("Invoice No")}${th("Date")}${th("Customer")}
          ${th("Taxable Value","prNum")}${th("CGST","prNum")}${th("SGST","prNum")}
          ${th("IGST","prNum")}${th("CESS","prNum")}${th("Total","prNum")}
        </tr></thead>
        <tbody>
          ${largeB2c.map((r, idx) => `<tr${idx % 2 === 1 ? ' class="prAlt"' : ""}>
            ${td(idx + 1)}
            ${td(esc(r.invoice_number || ""))}
            ${td(fmtDate(r.invoice_date))}
            ${td(esc(r.customer_name || ""))}
            ${td(amt(r.taxable_value),"prNum")}
            ${td(amt(r.cgst),"prNum")}
            ${td(amt(r.sgst),"prNum")}
            ${td(amt(r.igst),"prNum")}
            ${td(amt(0),"prNum")}
            ${td(amt(r.total_value),"prNum",true)}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  // ── Notes & Disclaimer ───────────────────────────────────────────────────────
  const notesHtml = `
    <div class="prSection prPageBreak prNotes">
      <h3>Important Notes &amp; Disclaimer for CA</h3>
      <ol style="margin:0 0 12px;padding-left:20px;line-height:1.8;font-size:12px">
        <li>B2B invoices are reported individually in GSTR-1. Ensure all customer GSTINs are valid before filing.</li>
        <li>B2C invoices above ₹2.5 lakh must be reported individually — they appear in the Large B2C section above.</li>
        <li>Place of Supply determines whether CGST+SGST or IGST applies. Verify customer state in their profile.</li>
        <li>HSN codes are mandatory for businesses above certain turnover. Update missing HSN codes before filing.</li>
        <li>This report is system-generated from your invoices. Cross-check with your books before sharing with CA.</li>
      </ol>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0"/>
      <div class="prWarnBox" style="background:#fef3c7;border-color:#f59e0b;color:#92400e">
        <strong style="color:#92400e">Legal Disclaimer:</strong> GSTR-1 cannot be easily revised after filing. Verify all GSTIN values, invoice amounts, and HSN codes carefully before submission to the GST portal. This is a system-generated report — verify before filing.
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-top:12px;text-align:center">
        Generated: ${generatedOn} &nbsp;|&nbsp; ${esc(biz.firm_name || "")} &nbsp;|&nbsp; GSTIN: ${esc(biz.gst_number || "Not set")} &nbsp;|&nbsp; Period: ${esc(periodLabel)}${fy ? ` &nbsp;|&nbsp; FY: ${esc(fy)}` : ""}
      </p>
    </div>`;

  const bodyHtml = `
    <div class="prDoc">
      ${headerHtml}
      ${hsnWarnHtml}
      ${gstinWarnHtml}
      ${summaryHtml}
      ${hsnTableHtml}
      ${b2bHtml}
      ${b2cHtml}
      ${largeB2cHtml}
      ${notesHtml}
      <div class="prFooter">
        <span>GSTR-1 Summary &bull; ${esc(periodLabel)}</span>
        <span>System-generated — verify before filing</span>
      </div>
    </div>

    <style>
      @page { size: A4 landscape; margin: 14mm 12mm 18mm; }
      .prDoc { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; max-width: 960px; margin: 0 auto; padding: 20px; }
      .prHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 2px solid #1d4ed8; }
      .prHeadLeft { flex: 1; }
      .prHeadRight { flex: 0 0 auto; }
      .prTitle { font-size: 17px; font-weight: 800; color: #1f2937; margin: 0 0 4px; }
      .prSub { font-size: 11px; color: #6b7280; margin: 0; }
      .prMetaTable { border-collapse: collapse; font-size: 11px; }
      .prMetaTable td { padding: 2px 6px; }
      .prMetaLabel { color: #6b7280; font-weight: 600; white-space: nowrap; }
      .prMetaVal { color: #1f2937; font-weight: 700; }
      .prMono { font-family: monospace; letter-spacing: 0.05em; }
      .prGrid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
      .prCard { background: #f8f5ff; border: 1px solid #e0d8f0; border-radius: 8px; padding: 10px 12px; }
      .prCardHL { background: #f0e8ff; border: 2px solid #1d4ed8; }
      .prCardLabel { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin-bottom: 4px; }
      .prCardValue { font-size: 15px; font-weight: 700; color: #1f2937; }
      .prCardNote { font-size: 9px; color: #6b7280; margin-top: 2px; }
      .prSection { margin-bottom: 14px; page-break-inside: avoid; }
      .prPageBreak { page-break-before: always; }
      .prSection h3 { font-size: 11.5px; font-weight: 700; color: #1f2937; background: #f0f4ff; border-left: 3px solid #1d4ed8; padding: 5px 8px; margin: 0 0 0; }
      .prNotes h3 { background: #fffbeb; border-left-color: #f59e0b; }
      .prTable { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 0; }
      .prTable th { padding: 5px 7px; text-align: left; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #374151; background: #f9fafb; border: 1px solid #e5e7eb; white-space: nowrap; }
      .prTable td { padding: 5px 7px; border: 1px solid #e5e7eb; vertical-align: middle; }
      .prTable .prNum { text-align: right; }
      .prTable .prAlt td { background: #f9fafb; }
      .prTable .prTotalRow td { background: #f0f4ff; border-top: 2px solid #1d4ed8; font-weight: 700; }
      .prTable .prIssueRow td { background: #fef2f2; }
      .prNote { font-size: 10px; color: #6b7280; margin: 5px 0 6px; line-height: 1.5; }
      .prNoteWarn { color: #b45309; }
      .prNotes ol { margin: 6px 0 0; padding-left: 16px; }
      .prNotes li { margin-bottom: 4px; font-size: 10.5px; line-height: 1.5; }
      .prWarnBox { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 11.5px; color: #b91c1c; line-height: 1.5; }
      .prFooter { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9.5px; color: #9ca3af; }
      @media print {
        .prDoc { padding: 0; }
        .prCard, .prCardHL, .prTotalRow td, .prSection h3, .prIssueRow td, .prAlt td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>`;

  return openPrintDocument({
    title: `GSTR1_${periodLabel.replace(/\s+/g, "_")}`,
    bodyHtml,
  });
}