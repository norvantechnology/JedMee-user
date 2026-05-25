import { esc, openPrintDocument } from "./printDocument.js";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function n2(v) {
  const num = Number(v);
  return isNaN(num) ? "0.00" : num.toFixed(2);
}

function amt(v) { return `₹${n2(v)}`; }

function th(label, cls) {
  return `<th${cls ? ` class="${cls}"` : ""}>${label}</th>`;
}

function td(v, cls, bold, color) {
  let style = "";
  if (bold && color) style = ` style="font-weight:700;color:${color}"`;
  else if (bold)     style = ` style="font-weight:700"`;
  else if (color)    style = ` style="color:${color}"`;
  return `<td${cls ? ` class="${cls}"` : ""}${style}>${v}</td>`;
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Build and open the B2B/B2C Segregation Report PDF via the browser print dialog.
 * @param {{ data: object, taxLabel: string, period: { from_date: string, to_date: string } }} opts
 */
export function printGstrB2bB2cReport({ data, taxLabel }) {
  if (!data) return;

  const biz        = data.business     || {};
  const summary    = data.summary      || {};
  const b2bList    = data.b2b_invoices || [];
  const b2cSum     = data.b2c_summary  || [];
  const b2cTot     = data.b2c_total    || {};
  const largeB2c   = data.large_b2c    || [];
  const issues     = data.gstin_issues || [];
  const period     = data.period       || {};
  const b2bReturns = data.b2b_returns  || [];
  const b2cReturns = data.b2c_returns  || [];

  const generatedOn = new Date().toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  // ── Header ──────────────────────────────────────────────────────────────────
  const headerHtml = `
    <div class="prHead">
      <div class="prHeadLeft">
        <h1 class="prTitle">GSTR-1 — B2B vs B2C Segregation Report</h1>
        <p class="prSub">For CA filing — B2B invoices listed individually, B2C grouped by ${esc(taxLabel)} rate</p>
      </div>
      <div class="prHeadRight">
        <table class="prMetaTable">
          <tr><td class="prMetaLabel">Business</td><td class="prMetaVal">${esc(biz.firm_name || "—")}</td></tr>
          <tr><td class="prMetaLabel">GSTIN</td><td class="prMetaVal prMono">${esc(biz.gst_number || "Not set")}${!biz.gstin_valid ? ' <span style="color:#b91c1c;font-size:10px">(invalid format)</span>' : ''}</td></tr>
          <tr><td class="prMetaLabel">Period</td><td class="prMetaVal">${esc(period.from_date || "")} to ${esc(period.to_date || "")}</td></tr>
          <tr><td class="prMetaLabel">Generated On</td><td class="prMetaVal" style="color:#6b7280;font-weight:400">${generatedOn}</td></tr>
        </table>
      </div>
    </div>`;

  // ── Summary cards ────────────────────────────────────────────────────────────
  const summaryHtml = `
    <div class="prGrid4">
      <div class="prCard">
        <div class="prCardLabel">B2B Invoices</div>
        <div class="prCardValue">${summary.b2b_count || 0}</div>
        <div class="prCardNote">Total: ${amt(summary.b2b_value)}</div>
      </div>
      <div class="prCard">
        <div class="prCardLabel">B2C Invoices</div>
        <div class="prCardValue">${summary.b2c_count || 0}</div>
        <div class="prCardNote">Total: ${amt(summary.b2c_value)}</div>
      </div>
      <div class="prCard">
        <div class="prCardLabel">${esc(taxLabel)} from B2B</div>
        <div class="prCardValue">${amt(summary.b2b_gst)}</div>
      </div>
      <div class="prCard prCardHL">
        <div class="prCardLabel">${esc(taxLabel)} from B2C</div>
        <div class="prCardValue">${amt(summary.b2c_gst)}</div>
        ${summary.large_b2c_count > 0 ? `<div class="prCardNote" style="color:#b91c1c">${summary.large_b2c_count} large B2C (>₹2.5L)</div>` : ""}
      </div>
    </div>`;

  // ── GSTIN issues warning ─────────────────────────────────────────────────────
  const issuesHtml = issues.length > 0 ? `
    <div class="prWarnBox" style="margin-bottom:10px">
      <strong>⚠ ${issues.length} B2B Invoice(s) with GSTIN Issues — Resolve Before Filing</strong>
      <table class="prTable" style="margin-top:6px">
        <thead><tr>
          ${th("Invoice No")}${th("Customer")}${th("GSTIN")}${th("Issue")}
        </tr></thead>
        <tbody>
          ${issues.map(r => `<tr>
            ${td(esc(r.invoice_number || ""))}
            ${td(esc(r.customer_name || ""))}
            ${td(`<span class="prMono">${esc(r.customer_gstin || "—")}</span>`)}
            ${td(r.gstin_issue === "MISSING" ? "Missing GSTIN"
              : r.gstin_issue === "INVALID_FORMAT" ? "Invalid format"
              : "Suspicious — verify with CA", null, false, "#b91c1c")}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  // ── B2B invoices table ───────────────────────────────────────────────────────
  const b2bHtml = `
    <div class="prSection">
      <h3>B2B Invoices — ${b2bList.length} invoice(s) — Report individually in GSTR-1</h3>
      ${b2bList.length === 0 ? '<p class="prNote">No B2B invoices for this period.</p>' : `
      <table class="prTable">
        <thead><tr>
          ${th("#")}
          ${th("Invoice No")}
          ${th("Date")}
          ${th("Customer")}
          ${th("GSTIN")}
          ${th("Place of Supply")}
          ${th("Taxable Value", "prNum")}
          ${th("CGST", "prNum")}
          ${th("SGST", "prNum")}
          ${th("IGST", "prNum")}
          ${th("Cess", "prNum")}
          ${th("Total", "prNum")}
        </tr></thead>
        <tbody>
          ${b2bList.map((r, idx) => `<tr${r.gstin_issue ? ' class="prIssueRow"' : ""}>
            ${td(idx + 1)}
            ${td(esc(r.invoice_number || ""))}
            ${td(fmtDate(r.invoice_date))}
            ${td(esc(r.customer_name || ""))}
            ${td(`<span class="prMono">${esc(r.customer_gstin || "—")}</span>${r.gstin_issue ? ' ⚠' : ''}`)}
            ${td(esc(r.place_of_supply || "—"))}
            ${td(amt(r.taxable_value), "prNum")}
            ${td(amt(r.cgst), "prNum")}
            ${td(amt(r.sgst), "prNum")}
            ${td(amt(r.igst), "prNum")}
            ${td(amt(0), "prNum")}
            ${td(amt(r.total_value), "prNum", true)}
          </tr>`).join("")}
        </tbody>
      </table>`}
    </div>`;

  // ── B2C summary table ────────────────────────────────────────────────────────
  const b2cRows = b2cSum.map(r => `<tr>
    ${td(`${r.gst_rate}%`)}
    ${td(r.invoice_count, "prNum")}
    ${td(amt(r.taxable_value), "prNum")}
    ${td(amt(r.cgst), "prNum")}
    ${td(amt(r.sgst), "prNum")}
    ${td(amt(r.igst), "prNum")}
    ${td(amt(0), "prNum")}
    ${td(amt(r.total_value), "prNum")}
  </tr>`).join("");

  const b2cHtml = `
    <div class="prSection">
      <h3>B2C Summary — Grouped by ${esc(taxLabel)} Rate</h3>
      <p class="prNote">Enter these totals in the B2C summary section of GSTR-1 on the GST portal.</p>
      <table class="prTable">
        <thead><tr>
          ${th("GST Rate")}
          ${th("Invoice Count", "prNum")}
          ${th("Taxable Value", "prNum")}
          ${th("CGST", "prNum")}
          ${th("SGST", "prNum")}
          ${th("IGST", "prNum")}
          ${th("Cess", "prNum")}
          ${th("Total Value", "prNum")}
        </tr></thead>
        <tbody>
          ${b2cRows}
          <tr class="prTotalRow">
            ${td("Total", null, true)}
            ${td(b2cTot.invoice_count || 0, "prNum", true)}
            ${td(amt(b2cTot.taxable_value), "prNum", true)}
            ${td(amt(b2cTot.cgst), "prNum", true)}
            ${td(amt(b2cTot.sgst), "prNum", true)}
            ${td(amt(b2cTot.igst), "prNum", true)}
            ${td(amt(0), "prNum", true)}
            ${td(amt(b2cTot.total_value), "prNum", true)}
          </tr>
        </tbody>
      </table>
    </div>`;

  // ── Large B2C section ────────────────────────────────────────────────────────
  const largeB2cHtml = largeB2c.length > 0 ? `
    <div class="prSection">
      <h3>⚠ Large B2C Invoices (>₹2.5 Lakh) — Report Individually in GSTR-1</h3>
      <p class="prNote prNoteWarn">These invoices exceed ₹2.5 lakh and must be reported individually in GSTR-1, not in the B2C summary.</p>
      <table class="prTable">
        <thead><tr>
          ${th("#")}${th("Invoice No")}${th("Date")}${th("Customer")}
          ${th("Taxable Value", "prNum")}${th("CGST", "prNum")}${th("SGST", "prNum")}
          ${th("IGST", "prNum")}${th("Cess", "prNum")}${th("Total", "prNum")}
        </tr></thead>
        <tbody>
          ${largeB2c.map((r, idx) => `<tr>
            ${td(idx + 1)}
            ${td(esc(r.invoice_number || ""))}
            ${td(fmtDate(r.invoice_date))}
            ${td(esc(r.customer_name || ""))}
            ${td(amt(r.taxable_value), "prNum")}
            ${td(amt(r.cgst), "prNum")}
            ${td(amt(r.sgst), "prNum")}
            ${td(amt(r.igst), "prNum")}
            ${td(amt(0), "prNum")}
            ${td(amt(r.total_value), "prNum", true)}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : `
    <div class="prInfoBox">✓ No large B2C invoices (>₹2.5 lakh) this period.</div>`;

  // ── Credit notes / returns ────────────────────────────────────────────────
  const b2bReturnsHtml = b2bReturns.length > 0 ? `
    <div class="prSection">
      <h3>B2B Credit Notes / Returns (CDNR) — ${b2bReturns.length} return(s)</h3>
      <p class="prNote">These must be reported in the CDNR section of GSTR-1 (Credit/Debit Notes for Registered persons).</p>
      <table class="prTable">
        <thead><tr>
          ${th("#")}${th("Return No")}${th("Date")}${th("Customer")}
          ${th("GSTIN")}${th("Linked Invoice")}${th("Return Amount", "prNum")}
        </tr></thead>
        <tbody>
          ${b2bReturns.map((r, idx) => `<tr>
            ${td(idx + 1)}
            ${td(esc(r.return_number || ""))}
            ${td(fmtDate(r.return_date))}
            ${td(esc(r.customer_name || ""))}
            ${td(`<span class="prMono">${esc(r.customer_gstin || "—")}</span>`)}
            ${td(esc(r.linked_invoice_number || "—"))}
            ${td(amt(r.return_amount), "prNum", true)}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  const b2cReturnsHtml = b2cReturns.length > 0 ? `
    <div class="prSection">
      <h3>B2C Credit Notes / Returns (CDNUR) — ${b2cReturns.length} return(s)</h3>
      <p class="prNote">These must be reported in the CDNUR section of GSTR-1 (Credit/Debit Notes for Unregistered persons).</p>
      <table class="prTable">
        <thead><tr>
          ${th("#")}${th("Return No")}${th("Date")}${th("Customer")}
          ${th("Linked Invoice")}${th("Return Amount", "prNum")}
        </tr></thead>
        <tbody>
          ${b2cReturns.map((r, idx) => `<tr>
            ${td(idx + 1)}
            ${td(esc(r.return_number || ""))}
            ${td(fmtDate(r.return_date))}
            ${td(esc(r.customer_name || ""))}
            ${td(esc(r.linked_invoice_number || "—"))}
            ${td(amt(r.return_amount), "prNum", true)}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  // ── Notes ────────────────────────────────────────────────────────────────────
  const notesHtml = `
    <div class="prSection prNotes">
      <h3>Important Notes &amp; Disclaimer for CA</h3>
      <ul>
        <li>B2B invoices are reported individually in GSTR-1. Ensure all customer GSTINs are valid before filing.</li>
        <li>B2C invoices above ₹2.5 lakh must be reported individually — they appear in the Large B2C section above.</li>
        <li>Place of Supply determines whether CGST+SGST or IGST applies. Verify customer state in their profile.</li>
        <li>This report is system-generated from your invoices. Cross-check with your books before sharing with CA.</li>
        ${issues.length > 0 ? `<li class="prNoteWarnLi"><strong>${issues.length} B2B invoice(s) have GSTIN issues.</strong> Resolve these before sharing with CA.</li>` : ""}
        <li class="prNoteWarnLi"><strong>Disclaimer:</strong> GSTR-1 cannot be easily revised after filing. Verify all GSTIN values and invoice amounts carefully before submission.</li>
      </ul>
    </div>`;

  const bodyHtml = `
    <div class="prDoc">
      ${headerHtml}
      <h2 class="prSectionTitle">Summary</h2>
      ${summaryHtml}
      ${issuesHtml}
      ${b2bHtml}
      ${b2cHtml}
      ${largeB2cHtml}
      ${b2bReturnsHtml}
      ${b2cReturnsHtml}
      ${notesHtml}
      <div class="prFooter">
        <span>GSTR-1 B2B/B2C Report &bull; ${esc(period.from_date || "")} to ${esc(period.to_date || "")}</span>
        <span>System-generated — verify before filing</span>
      </div>
    </div>

    <style>
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
      .prSectionTitle { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin: 16px 0 6px; }
      .prSection { margin-bottom: 14px; }
      .prSection h3 { font-size: 11.5px; font-weight: 700; color: #1f2937; background: #f0f4ff; border-left: 3px solid #1d4ed8; padding: 5px 8px; margin: 0 0 0; }
      .prTable { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 0; }
      .prTable th { padding: 5px 7px; text-align: left; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #374151; background: #f9fafb; border: 1px solid #e5e7eb; white-space: nowrap; }
      .prTable td { padding: 5px 7px; border: 1px solid #e5e7eb; vertical-align: middle; }
      .prTable .prNum { text-align: right; }
      .prTable .prTotalRow td { background: #f0f4ff; border-top: 2px solid #1d4ed8; font-weight: 700; }
      .prTable .prIssueRow td { background: #fef2f2; }
      .prNote { font-size: 10px; color: #6b7280; margin: 5px 0 6px; line-height: 1.5; }
      .prNoteWarn { color: #b45309; }
      .prNotes ul { margin: 6px 0 0; padding-left: 16px; }
      .prNotes li { margin-bottom: 4px; font-size: 10.5px; line-height: 1.5; }
      .prNotes .prNoteWarnLi { color: #b91c1c; }
      .prNotes h3 { background: #fffbeb; border-left-color: #f59e0b; }
      .prWarnBox { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 11.5px; color: #b91c1c; line-height: 1.5; }
      .prInfoBox { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; font-size: 11.5px; color: #1d4ed8; line-height: 1.5; }
      .prFooter { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9.5px; color: #9ca3af; }
      @media print {
        .prDoc { padding: 0; }
        .prWarnBox, .prCard, .prCardHL, .prTotalRow td, .prSection h3, .prInfoBox, .prIssueRow td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>`;

  return openPrintDocument({
    title: `GSTR1_B2B_B2C_${period.from_date || "report"}_${period.to_date || ""}`,
    bodyHtml,
  });
}