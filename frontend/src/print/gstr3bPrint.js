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

/**
 * Build and open the GSTR3B Summary PDF via the browser print dialog.
 * @param {{ data: object, taxLabel: string }} opts
 */
export function printGstr3bReport({ data, taxLabel }) {
  if (!data) return;

  const year   = data.year  || "";
  const month  = data.month || "";
  const biz    = data.business || {};

  const s    = data.summary          || {};
  const os   = data.outward_supplies || {};
  const itc  = data.itc              || {};
  const tp   = data.tax_payable      || {};
  const notes  = data.notes          || {};
  const sec32  = data.section_3_2    || {};
  const sec5   = data.section_5      || {};

  const taxable  = os.taxable   || {};
  const nilRated = os.nil_rated || {};
  const osTot    = os.totals    || {};

  const itcElig = itc.eligible   || {};
  const itcInel = itc.ineligible || {};
  const itcRev  = itc.reversals  || {};
  const itcNet  = itc.net_itc    || {};

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? Number(year) + 1 : Number(year);
  const dueDateStr = `20 ${MONTH_NAMES[nextMonth]} ${nextYear}`;
  const fyEnd = Number(year) + 1;
  const fy = `${year}-${String(fyEnd).slice(2)}`;
  const monthNum = String(month).padStart(2, "0");

  /* ── Critical HSN warning (compact, top of PDF) ── */
  const hsnWarningHtml = notes.missing_hsn_count > 0 ? `
    <div class="prWarnBox">
      <strong>⚠ Action Required:</strong> ${notes.missing_hsn_count} sales line item(s) missing HSN codes — mandatory for GSTR-1 filing. Update before sharing with CA.
    </div>` : "";

  const generatedOn = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  /* ── PDF Header ── */
  const headerHtml = `
    <div class="prHead">
      <div class="prHeadLeft">
        <h1 class="prTitle">GSTR-3B — Monthly Summary Return</h1>
        <p class="prSub">Form GSTR-3B &nbsp;|&nbsp; Sections 3.1, 3.2, 4, 5 &amp; 6</p>
      </div>
      <div class="prHeadRight">
        <table class="prMetaTable">
          <tr><td class="prMetaLabel">Legal / Trade Name</td><td class="prMetaVal">${esc(biz.firm_name || "—")}</td></tr>
          <tr><td class="prMetaLabel">GSTIN</td><td class="prMetaVal prMono">${esc(biz.gst_number || "Not set")}</td></tr>
          <tr><td class="prMetaLabel">Return Period</td><td class="prMetaVal">${esc(MONTH_NAMES[month] || "")} ${esc(String(year))}</td></tr>
          <tr><td class="prMetaLabel">Financial Year</td><td class="prMetaVal">${fy} &nbsp;<span style="color:#6b7280;font-weight:400">(Month ${monthNum} of FY ${fy})</span></td></tr>
          <tr><td class="prMetaLabel">Due Date</td><td class="prMetaVal">${dueDateStr}</td></tr>
          <tr><td class="prMetaLabel">ARN</td><td class="prMetaVal prArnBlank">_________________________ (to be filled after filing)</td></tr>
          <tr><td class="prMetaLabel">Generated On</td><td class="prMetaVal" style="color:#6b7280;font-weight:400">${generatedOn}</td></tr>
        </table>
      </div>
    </div>`;

  /* ── Summary cards ── */
  const summaryHtml = `
    <div class="prGrid4">
      <div class="prCard">
        <div class="prCardLabel">Total Sales Value</div>
        <div class="prCardValue">${amt(s.total_sales_value)}</div>
      </div>
      <div class="prCard">
        <div class="prCardLabel">Total ${esc(taxLabel)} Collected</div>
        <div class="prCardValue">${amt(s.total_gst_collected)}</div>
        ${s.all_sales_nil_rated ? '<div class="prCardNote">All sales nil-rated / exempt — ₹0 GST is correct</div>' : ""}
      </div>
      <div class="prCard">
        <div class="prCardLabel">Total ITC from Purchases</div>
        <div class="prCardValue">${amt(s.total_itc_available)}</div>
      </div>
      <div class="prCard prCardHL">
        <div class="prCardLabel">Net ${esc(taxLabel)} Payable</div>
        <div class="prCardValue prCardValueLg">${amt(s.net_gst_payable)}</div>
      </div>
    </div>`;

  /* ── Nil-rated explanation ── */
  const nilNoteHtml = s.all_sales_nil_rated ? `
    <div class="prInfoBox">
      <strong>Why is GST Collected ₹0.00?</strong> All sales this period are nil-rated or exempt (0% GST).
      Common for pharmacies selling medicines under nil-rated HSN codes. This is correct and expected.
    </div>` : "";

  /* ── Data quality warning ── */
  const dataQualityHtml = s.gst_rate_mismatch_count > 0 ? `
    <div class="prWarnBox" style="margin-bottom:8px">
      <strong>⚠ Data Quality:</strong> ${s.gst_rate_mismatch_count} line item(s) have a GST rate set but ₹0 GST collected — reclassified as Nil Rated.
      Verify these items have the correct GST rate in your product master.
    </div>` : "";

  /* ── Section 3.1 — Outward Supplies ── */
  const sec31Html = `
    <div class="prSection">
      <h3>3.1 — Details of Outward Supplies and Inward Supplies Liable to Reverse Charge</h3>
      ${dataQualityHtml}
      <table class="prTable">
        <thead><tr>
          ${th("Nature of Supply")}
          ${th("Total Value", "prNum")}
          ${th("CGST", "prNum")}
          ${th("SGST / UTGST", "prNum")}
          ${th("IGST", "prNum")}
          ${th("Cess", "prNum")}
          ${th("Invoices", "prNum")}
        </tr></thead>
        <tbody>
          <tr>
            ${td("(a) Taxable Supplies (GST &gt; 0)")}
            ${td(amt(taxable.total_value), "prNum")}
            ${td(amt(taxable.cgst), "prNum")}
            ${td(amt(taxable.sgst), "prNum")}
            ${td(amt(taxable.igst), "prNum")}
            ${td(amt(0), "prNum")}
            ${td(taxable.invoice_count || 0, "prNum")}
          </tr>
          <tr>
            ${td("(c) Other Outward Supplies (Nil Rated, Exempted)")}
            ${td(amt(nilRated.total_value), "prNum")}
            ${td(amt(0), "prNum")}
            ${td(amt(0), "prNum")}
            ${td(amt(0), "prNum")}
            ${td(amt(0), "prNum")}
            ${td(nilRated.invoice_count || 0, "prNum")}
          </tr>
          <tr class="prTotalRow">
            ${td("Total", null, true)}
            ${td(amt(osTot.total_value), "prNum", true)}
            ${td(amt(osTot.cgst), "prNum", true)}
            ${td(amt(osTot.sgst), "prNum", true)}
            ${td(amt(osTot.igst), "prNum", true)}
            ${td(amt(0), "prNum", true)}
            ${td(osTot.invoice_count || 0, "prNum", true)}
          </tr>
        </tbody>
      </table>
    </div>`;

  /* ── Section 3.2 — Inter-state Supplies ── */
  const sec32Html = `
    <div class="prSection">
      <h3>3.2 — Supplies Made to Unregistered Persons, Composition Taxpayers and UIN Holders</h3>
      <p class="prNote">Inter-state supplies only. Intra-state supplies are not shown here.
      From July 2025, these values are <strong>auto-populated from GSTR-1</strong> on the GST portal and cannot be manually edited.</p>
      <table class="prTable">
        <thead><tr>
          ${th("Type of Supply")}
          ${th("Taxable Value", "prNum")}
          ${th("IGST", "prNum")}
          ${th("Cess", "prNum")}
        </tr></thead>
        <tbody>
          <tr>${td("(i) Supplies to Unregistered Persons")}${td(amt(sec32.unregistered?.taxable_value || 0), "prNum")}${td(amt(sec32.unregistered?.igst || 0), "prNum")}${td(amt(0), "prNum")}</tr>
          <tr>${td("(ii) Supplies to Composition Taxpayers")}${td(amt(sec32.composition?.taxable_value || 0), "prNum")}${td(amt(sec32.composition?.igst || 0), "prNum")}${td(amt(0), "prNum")}</tr>
          <tr>${td("(iii) Supplies to UIN Holders")}${td(amt(sec32.uin_holders?.taxable_value || 0), "prNum")}${td(amt(sec32.uin_holders?.igst || 0), "prNum")}${td(amt(0), "prNum")}</tr>
        </tbody>
      </table>
    </div>`;

  /* ── Table 3.3 — Supplies through E-commerce Operators (Section 9(5)) ── */
  const tableIIHtml = `
    <div class="prSection">
      <h3>3.3 — Supplies Made Through E-Commerce Operators (Section 9(5))</h3>
      <p class="prNote">Tax to be paid by e-commerce operator on behalf of supplier. Enter zero if not applicable.</p>
      <table class="prTable">
        <thead><tr>
          ${th("Nature")}
          ${th("Taxable Value", "prNum")}
          ${th("CGST", "prNum")}
          ${th("SGST / UTGST", "prNum")}
          ${th("IGST", "prNum")}
          ${th("Cess", "prNum")}
        </tr></thead>
        <tbody>
          <tr>
            ${td("(a) Supplies where tax is paid by e-commerce operator")}
            ${td(amt(0), "prNum")}${td(amt(0), "prNum")}${td(amt(0), "prNum")}${td(amt(0), "prNum")}${td(amt(0), "prNum")}
          </tr>
          <tr>
            ${td("(b) Supplies where tax is paid by supplier")}
            ${td(amt(0), "prNum")}${td(amt(0), "prNum")}${td(amt(0), "prNum")}${td(amt(0), "prNum")}${td(amt(0), "prNum")}
          </tr>
        </tbody>
      </table>
    </div>`;

  /* ── Section 4 — ITC ── */
  const sec4Html = `
    <div class="prSection">
      <h3>4 — Eligible Input Tax Credit (ITC)</h3>
      <table class="prTable">
        <thead><tr>
          ${th("Source")}
          ${th("Total Value", "prNum")}
          ${th("CGST", "prNum")}
          ${th("SGST / UTGST", "prNum")}
          ${th("IGST", "prNum")}
          ${th("Cess", "prNum")}
          ${th("Count", "prNum")}
        </tr></thead>
        <tbody>
          <tr>
            ${td("(A) ITC Available — Eligible Purchases (Supplier has GSTIN)")}
            ${td(amt(itcElig.taxable_value), "prNum")}
            ${td(amt(itcElig.cgst), "prNum")}
            ${td(amt(itcElig.sgst), "prNum")}
            ${td(amt(itcElig.igst), "prNum")}
            ${td(amt(0), "prNum")}
            ${td(itcElig.invoice_count || 0, "prNum")}
          </tr>
          <tr>
            ${td("(B) ITC Available — Imports (if any)")}
            ${td(amt(0), "prNum")}${td(amt(0), "prNum")}${td(amt(0), "prNum")}${td(amt(0), "prNum")}${td(amt(0), "prNum")}${td(0, "prNum")}
          </tr>
          <tr class="prInfoRow">
            ${td("(C) Ineligible ITC — Purchases from Unregistered Suppliers (reference only, not claimable)")}
            ${td(amt(itcInel.taxable_value), "prNum")}
            ${td(amt(itcInel.cgst), "prNum")}
            ${td(amt(itcInel.sgst), "prNum")}
            ${td(amt(itcInel.igst), "prNum")}
            ${td(amt(0), "prNum")}
            ${td(itcInel.invoice_count || 0, "prNum")}
          </tr>
          <tr class="prInfoRow">
            ${td("(D) ITC Reversed — Purchase Returns")}
            ${td(amt(itcRev.total_amount), "prNum")}
            ${td(amt(itcRev.cgst), "prNum")}
            ${td(amt(itcRev.sgst), "prNum")}
            ${td(amt(itcRev.igst), "prNum")}
            ${td(amt(0), "prNum")}
            ${td(itcRev.return_count || 0, "prNum")}
          </tr>
          <tr class="prTotalRow">
            ${td("Net ITC Available (A + B − D)", null, true)}
            ${td(amt(itcNet.total || 0), "prNum", true)}
            ${td(amt(itcNet.cgst), "prNum", true, "#1d4ed8")}
            ${td(amt(itcNet.sgst), "prNum", true, "#1d4ed8")}
            ${td(amt(itcNet.igst), "prNum", true, "#1d4ed8")}
            ${td(amt(0), "prNum", true)}
            ${td("—", "prNum")}
          </tr>
        </tbody>
      </table>
      ${itcInel.invoice_count > 0 ? `
        <p class="prNote prNoteWarn">⚠ Row C (Ineligible ITC): GST paid ₹${n2(s.ineligible_itc_cost)} is an <strong>additional cost to your business</strong> — not claimable as ITC.
        Row C is shown for reference only and is NOT subtracted from Net ITC.
        RCM may apply on specific notified goods/services — consult your CA.</p>` : ""}
    </div>`;

  /* ── Section 5 — Nil-rated Inward Supplies ── */
  const sec5Html = `
    <div class="prSection">
      <h3>5 — Exempt, Nil-Rated and Non-GST Inward Supplies</h3>
      <p class="prNote">No tax is applicable on these supplies — CGST/SGST/IGST columns are absent per the official GSTR-3B form.</p>
      <table class="prTable">
        <thead><tr>
          ${th("Nature of Supply")}
          ${th("Taxable Value", "prNum")}
          ${th("Invoices", "prNum")}
        </tr></thead>
        <tbody>
          <tr>
            ${td("(i) Nil Rated Inward Supplies (Purchases with 0% GST)")}
            ${td(amt(sec5.nil_rated_inward?.taxable_value || 0), "prNum")}
            ${td(sec5.nil_rated_inward?.invoice_count || 0, "prNum")}
          </tr>
          <tr>
            ${td("(ii) Exempt Inward Supplies")}
            ${td(amt(sec5.exempt_inward?.taxable_value || 0), "prNum")}
            ${td(0, "prNum")}
          </tr>
          <tr>
            ${td("(iii) Non-GST Inward Supplies")}
            ${td(amt(sec5.non_gst_inward?.taxable_value || 0), "prNum")}
            ${td(0, "prNum")}
          </tr>
        </tbody>
      </table>
    </div>`;

  /* ── Section 6 — Net Tax Payable ── */
  const showCf = Number(s.carry_forward_total) > 0;
  const cfHeader = showCf ? th("Carry Forward", "prNum") : "";

  const taxRows = [
    { label: "CGST",  row: tp.cgst  || {} },
    { label: "SGST",  row: tp.sgst  || {} },
    { label: "IGST",  row: tp.igst  || {} },
    { label: "Cess",  row: tp.cess  || {} },
    { label: "Total", row: tp.total || {}, bold: true },
  ].map(({ label, row, bold }) =>
    `<tr${bold ? ' class="prTotalRow"' : ""}>
      ${td(label, null, bold)}
      ${td(amt(row.gst_collected), "prNum", bold)}
      ${td(amt(row.itc_available), "prNum", bold)}
      ${td(amt(row.net_payable), "prNum", bold)}
      ${td(amt(row.interest || 0), "prNum")}
      ${td(amt(row.late_fee || 0), "prNum")}
      ${showCf ? td(amt(row.carry_forward || 0), "prNum") : ""}
    </tr>`
  ).join("");

  const sec6Html = `
    <div class="prSection">
      <h3>6 — Payment of Tax</h3>
      <p class="prNote">Interest and Late Fee are ₹0.00 when filed on or before the due date (${dueDateStr}). These will be non-zero if filed after the due date.</p>
      <table class="prTable">
        <thead><tr>
          ${th("Tax Head")}
          ${th("GST Collected", "prNum")}
          ${th("ITC Available", "prNum")}
          ${th("Net Payable", "prNum")}
          ${th("Interest", "prNum")}
          ${th("Late Fee", "prNum")}
          ${cfHeader}
        </tr></thead>
        <tbody>${taxRows}</tbody>
      </table>
    </div>`;

  /* ── Important Notes + Disclaimer ── */
  const noteLines = [];
  // HSN warning already shown at top of PDF — not repeated here
  if (notes.missing_gstin_count > 0)
    noteLines.push({ warn: true, text: `${notes.missing_gstin_count} purchase invoice(s) from suppliers without GSTIN — GST paid is a cost, not claimable as ITC. RCM may apply — consult your CA.` });
  if (notes.purchase_returns_count > 0)
    noteLines.push({ warn: false, text: `${notes.purchase_returns_count} purchase return(s) totalling ₹${n2(notes.purchase_returns_amount)} reversed ITC this month.` });
  noteLines.push({ warn: false, text: "From July 2025, Table 3.2 values are auto-populated from GSTR-1 on the GST portal and cannot be manually edited." });
  noteLines.push({ warn: true, text: `Interest and Late Fee in Section 6 are ₹0.00 only if filed on or before ${dueDateStr}. Filing after this date will attract interest at 18% p.a. and late fee as applicable.` });

  const notesHtml = `
    <div class="prSection prNotes">
      <h3>Important Notes &amp; Disclaimer for CA</h3>
      <ul>
        ${noteLines.map(l => `<li${l.warn ? ' class="prNoteWarnLi"' : ""}>${esc(l.text)}</li>`).join("")}
        <li class="prNoteWarnLi"><strong>Disclaimer:</strong> GSTR-3B <strong>cannot be revised once submitted</strong> on the GST portal.
        Verify all figures carefully with your CA before filing. These numbers are system-generated and must be cross-checked against your books of accounts.</li>
      </ul>
    </div>`;

  /* ── Full document ── */
  const bodyHtml = `
    <div class="prDoc">
      ${hsnWarningHtml}
      ${headerHtml}

      <h2 class="prSectionTitle">Summary</h2>
      ${summaryHtml}
      ${nilNoteHtml}

      ${sec31Html}
      ${sec32Html}
      ${tableIIHtml}
      ${sec4Html}
      ${sec5Html}
      ${sec6Html}
      ${notesHtml}

      <div class="prFooter">
        <span>GSTR-3B &bull; ${esc(MONTH_NAMES[month] || "")} ${esc(String(year))}</span>
        <span>System-generated report — verify before filing</span>
      </div>
    </div>

    <style>
      /* ── Layout ── */
      .prDoc { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; max-width: 900px; margin: 0 auto; padding: 20px; }

      /* ── Header ── */
      .prHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 2px solid #1d4ed8; }
      .prHeadLeft { flex: 1; }
      .prHeadRight { flex: 0 0 auto; }
      .prTitle { font-size: 18px; font-weight: 800; color: #1f2937; margin: 0 0 4px; }
      .prSub { font-size: 11px; color: #6b7280; margin: 0; }
      .prMetaTable { border-collapse: collapse; font-size: 11.5px; }
      .prMetaTable td { padding: 2px 6px; }
      .prMetaLabel { color: #6b7280; font-weight: 600; white-space: nowrap; }
      .prMetaVal { color: #1f2937; font-weight: 700; }
      .prMono { font-family: monospace; letter-spacing: 0.05em; }
      .prArnBlank { color: #9ca3af; font-style: italic; font-weight: 400; }

      /* ── Warning box ── */
      .prWarnBox { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 11.5px; color: #b91c1c; line-height: 1.5; }

      /* ── Info box ── */
      .prInfoBox { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; font-size: 11.5px; color: #1d4ed8; line-height: 1.5; }

      /* ── Summary cards ── */
      .prGrid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
      .prCard { background: #f8f5ff; border: 1px solid #e0d8f0; border-radius: 8px; padding: 10px 12px; }
      .prCardHL { background: #f0e8ff; border: 2px solid #1d4ed8; }
      .prCardLabel { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin-bottom: 4px; }
      .prCardValue { font-size: 15px; font-weight: 700; color: #1f2937; }
      .prCardValueLg { font-size: 18px; font-weight: 800; color: #1d4ed8; }
      .prCardNote { font-size: 9px; color: #6b7280; margin-top: 2px; }

      /* ── Section heading ── */
      .prSectionTitle { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin: 16px 0 6px; }
      .prSection { margin-bottom: 14px; }
      .prSection h3 { font-size: 11.5px; font-weight: 700; color: #1f2937; background: #f0f4ff; border-left: 3px solid #1d4ed8; padding: 5px 8px; margin: 0 0 0; }

      /* ── Tables ── */
      .prTable { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 0; }
      .prTable th { padding: 5px 7px; text-align: left; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #374151; background: #f9fafb; border: 1px solid #e5e7eb; white-space: nowrap; }
      .prTable td { padding: 5px 7px; border: 1px solid #e5e7eb; vertical-align: middle; }
      .prTable .prNum { text-align: right; }
      .prTable .prTotalRow td { background: #f0f4ff; border-top: 2px solid #1d4ed8; font-weight: 700; }
      .prTable .prInfoRow td { color: #6b7280; }

      /* ── Notes ── */
      .prNote { font-size: 10px; color: #6b7280; margin: 5px 0 6px; line-height: 1.5; padding: 0 2px; }
      .prNoteWarn { color: #b45309; }
      .prNotes ul { margin: 6px 0 0; padding-left: 16px; }
      .prNotes li { margin-bottom: 4px; font-size: 10.5px; line-height: 1.5; }
      .prNotes .prNoteWarnLi { color: #b91c1c; }
      .prNotes h3 { background: #fffbeb; border-left-color: #f59e0b; }

      /* ── Footer ── */
      .prFooter { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9.5px; color: #9ca3af; }

      /* ── Print ── */
      @media print {
        .prDoc { padding: 0; }
        .prWarnBox, .prCard, .prCardHL, .prTotalRow td, .prSection h3, .prInfoBox { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>`;

  return openPrintDocument({
    title: `GSTR3B_${year}_${String(month).padStart(2, "0")}`,
    bodyHtml,
  });
}