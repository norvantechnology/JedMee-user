import { esc, openPrintDocument } from "./printDocument.js";

const MONTH_NAMES = ["","January","February","March","April","May","June","July","August","September","October","November","December"];
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function n2(v) { const x = Number(v); return isNaN(x) ? "0.00" : x.toFixed(2); }
function amt(v) { return `₹${n2(v)}`; }
function th(label, cls) { return `<th${cls ? ` class="${cls}"` : ""}>${label}</th>`; }
function td(v, cls, bold, color) {
  let style = "";
  if (bold && color) style = ` style="font-weight:700;color:${color}"`;
  else if (bold) style = ` style="font-weight:700"`;
  else if (color) style = ` style="color:${color}"`;
  return `<td${cls ? ` class="${cls}"` : ""}${style}>${v}</td>`;
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function isValidGstin(g) { return g && GSTIN_REGEX.test(g.trim().toUpperCase()); }

// FY month: April=1, May=2, ..., March=12
function fyMonth(m) { return m >= 4 ? m - 3 : m + 9; }

export function printGstr2Report({ data, year, month: monthParam }) {
  if (!data) return;

  // Support both old call (data.year/data.month) and new call (year/month props)
  const yr  = year  || data.year  || "";
  const mo  = monthParam || data.month || "";
  const biz = data.business || {};
  const s   = data.summary  || {};
  const cf  = data.itc_carry_forward || {};

  const fyEnd = Number(yr) + 1;
  const fy    = `${yr}-${String(fyEnd).slice(2)}`;
  const fyMo  = fyMonth(Number(mo));
  const gstinOk = isValidGstin(biz.gst_number);
  const generatedOn = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  /* ── Extra CSS injected as <style> tag inside bodyHtml ── */
  const extraCssHtml = `<style>
    @page { size: A4 landscape; margin: 14mm 12mm 18mm; }
    .prGrid3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 12px 0;
    }
    .prAlt { background: #f9fafb !important; }
    .prNetRow { background: #eff6ff !important; }
    .prNetRow td { font-weight: 700 !important; color: #1e293b !important; border-top: 2px solid #bfdbfe !important; }
    .prSection { page-break-inside: avoid; margin-bottom: 20px; }
    h3 { page-break-after: avoid; }
    .prPageBreak { page-break-before: always; }
  </style>`;

  /* ── Header ── */
  const headerHtml = `
    <div class="prHead">
      <div class="prHeadLeft">
        <h1 class="prTitle">GSTR-2 — Purchase ITC Report</h1>
        <p class="prSub">Input Tax Credit Summary &nbsp;|&nbsp; Section 4 of GSTR-3B</p>
      </div>
      <div class="prHeadRight">
        <table class="prMetaTable">
          <tr><td class="prMetaLabel">Legal / Trade Name</td><td class="prMetaVal">${esc(biz.firm_name || "—")}</td></tr>
          <tr>
            <td class="prMetaLabel">GSTIN</td>
            <td class="prMetaVal prMono">
              ${esc(biz.gst_number || "Not set")}
              ${biz.gst_number && !gstinOk ? ' <span style="color:#dc2626;font-size:10px;font-weight:700">⚠ Invalid format — verify with CA</span>' : ""}
            </td>
          </tr>
          <tr><td class="prMetaLabel">Return Period</td><td class="prMetaVal">${esc(MONTH_NAMES[mo] || "")} ${esc(String(yr))}</td></tr>
          <tr><td class="prMetaLabel">Financial Year</td><td class="prMetaVal">${fy} &nbsp;<span style="color:#6b7280;font-weight:400">(Month ${fyMo} of FY ${fy})</span></td></tr>
          <tr><td class="prMetaLabel">Generated On</td><td class="prMetaVal" style="color:#6b7280;font-weight:400">${generatedOn}</td></tr>
        </table>
      </div>
    </div>`;

  /* ── HSN warning ── */
  const hsnWarnHtml = s.missing_hsn_count > 0 ? `
    <div class="prWarnBox" style="background:#fee2e2;border-color:#ef4444;color:#991b1b">
      <strong>⚠ Action Required:</strong> ${s.missing_hsn_count} purchase line item(s) missing HSN codes — mandatory for ITC claims. Update before sharing with CA.
    </div>` : "";

  /* ── GSTIN warning ── */
  const gstinWarnHtml = s.missing_gstin_count > 0 ? `
    <div class="prWarnBox">
      <strong>⚠ Blocked ITC:</strong> ${s.missing_gstin_count} supplier(s) without GSTIN — <strong style="color:#dc2626">${amt(s.ineligible_itc_total)}</strong> ITC is blocked. Add supplier GSTIN to recover future ITC.
    </div>` : "";

  /* ── Summary cards ── */
  const allGstIneligible = Number(s.eligible_itc_total) === 0 && Number(s.total_gst_paid) > 0;
  const netItcColor = Number(s.net_itc_claimable) > 0 ? "#059669" : "#b45309";
  const summaryHtml = `
    <div class="prGrid3">
      <div class="prCard">
        <div class="prCardLabel">Total Purchase Value</div>
        <div class="prCardValue">${amt(s.total_purchase_value)}</div>
        <div class="prCardNote">${s.total_invoice_count} invoice${s.total_invoice_count !== 1 ? "s" : ""}</div>
      </div>
      <div class="prCard">
        <div class="prCardLabel">Total GST Paid</div>
        <div class="prCardValue" style="color:${allGstIneligible ? "#b45309" : "inherit"}">${amt(s.total_gst_paid)}</div>
        <div class="prCardNote">${allGstIneligible ? "All GST paid is ineligible — additional cost" : "Eligible + Ineligible combined"}</div>
      </div>
      <div class="prCard">
        <div class="prCardLabel">Eligible ITC</div>
        <div class="prCardValue" style="color:${Number(s.eligible_itc_total) > 0 ? "#059669" : "#b45309"}">${amt(s.eligible_itc_total)}</div>
        <div class="prCardNote">${Number(s.eligible_itc_total) === 0 ? "No eligible purchases this period" : `${s.eligible_invoice_count} eligible invoice${s.eligible_invoice_count !== 1 ? "s" : ""}`}</div>
      </div>
      <div class="prCard" style="border-color:#fca5a5">
        <div class="prCardLabel">Blocked / Ineligible ITC</div>
        <div class="prCardValue" style="color:#dc2626">${amt(s.ineligible_itc_total)}</div>
        <div class="prCardNote">${s.ineligible_invoice_count} ineligible — additional cost</div>
      </div>
      <div class="prCard">
        <div class="prCardLabel">ITC Reversed (Returns)</div>
        <div class="prCardValue">${amt(s.reversal_total)}</div>
        <div class="prCardNote">${s.reversal_count} return${s.reversal_count !== 1 ? "s" : ""}</div>
      </div>
      <div class="prCard prCardHL">
        <div class="prCardLabel">Net ITC Claimable</div>
        <div class="prCardValue prCardValueLg" style="color:${netItcColor}">${amt(s.net_itc_claimable)}</div>
        <div class="prCardNote">${Number(s.net_itc_claimable) === 0 ? "Nothing to offset against GST payable" : "After reversals + carry-forward"}</div>
      </div>
    </div>`;

  /* ── ITC Carry-Forward ── */
  const inelCgst = (Number(s.total_cgst_paid) || 0) - (Number(cf.earned?.cgst) || 0);
  const inelSgst = (Number(s.total_sgst_paid) || 0) - (Number(cf.earned?.sgst) || 0);
  const inelIgst = (Number(s.total_igst_paid) || 0) - (Number(cf.earned?.igst) || 0);
  const cfHtml = `
    <div class="prSection">
      <h3>ITC Carry-Forward Summary</h3>
      <table class="prTable">
        <thead><tr>
          ${th("")}${th("CGST","prNum")}${th("SGST","prNum")}${th("IGST","prNum")}${th("CESS","prNum")}${th("Total","prNum")}
        </tr></thead>
        <tbody>
          <tr class="prAlt">${td("Opening Balance (prev month)")}${td(amt(cf.opening?.cgst),"prNum")}${td(amt(cf.opening?.sgst),"prNum")}${td(amt(cf.opening?.igst),"prNum")}${td(amt(cf.opening?.cess),"prNum")}${td(amt(cf.opening?.total),"prNum",true)}</tr>
          <tr>${td("ITC Earned This Month (Eligible)")}${td(amt(cf.earned?.cgst),"prNum")}${td(amt(cf.earned?.sgst),"prNum")}${td(amt(cf.earned?.igst),"prNum")}${td(amt(cf.earned?.cess),"prNum")}${td(amt(cf.earned?.total),"prNum",true)}</tr>
          <tr class="prAlt">${td("GST Paid (Ineligible — not claimable)",null,false,"#dc2626")}${td(amt(inelCgst),"prNum",false,"#dc2626")}${td(amt(inelSgst),"prNum",false,"#dc2626")}${td(amt(inelIgst),"prNum",false,"#dc2626")}${td(amt(0),"prNum",false,"#dc2626")}${td(amt(s.ineligible_itc_total),"prNum",false,"#dc2626")}</tr>
          <tr>${td("ITC Reversed This Month")}${td(amt(cf.reversed?.cgst),"prNum")}${td(amt(cf.reversed?.sgst),"prNum")}${td(amt(cf.reversed?.igst),"prNum")}${td(amt(cf.reversed?.cess),"prNum")}${td(amt(cf.reversed?.total),"prNum",true)}</tr>
          <tr class="prNetRow">${td("Net ITC Claimable",null,true)}${td(amt(cf.net?.cgst),"prNum",true)}${td(amt(cf.net?.sgst),"prNum",true)}${td(amt(cf.net?.igst),"prNum",true)}${td(amt(cf.net?.cess),"prNum",true)}${td(amt(cf.net?.total),"prNum",true)}</tr>
        </tbody>
      </table>
      ${allGstIneligible ? `<p class="prNote" style="color:#b45309">Net ITC Claimable = ${amt(cf.net?.total)} because all purchases are from suppliers without GSTIN. The ${amt(s.total_gst_paid)} GST paid is not claimable — it is an additional business cost.</p>` : ""}
    </div>`;

  /* ── Section 1: Supplier Summary ── */
  const allCgst  = (data.supplier_summary || []).reduce((a, r) => a + (Number(r.cgst_itc) || 0), 0);
  const allSgst  = (data.supplier_summary || []).reduce((a, r) => a + (Number(r.sgst_itc) || 0), 0);
  const allIgst  = (data.supplier_summary || []).reduce((a, r) => a + (Number(r.igst_itc) || 0), 0);
  const allCess  = (data.supplier_summary || []).reduce((a, r) => a + (Number(r.cess_itc) || 0), 0);
  const allTotal = allCgst + allSgst + allIgst + allCess;
  const hasIneligible = Number(s.ineligible_itc_total) > 0;
  const allIneligible = (data.supplier_summary || []).length > 0
    && (data.supplier_summary || []).every(r => r.itc_status === "INELIGIBLE");

  const supplierRows = (data.supplier_summary || []).map((r, i) => `
    <tr${i % 2 === 1 ? ' class="prAlt"' : ""}>
      ${td(i + 1)}
      ${td(esc(r.vendor_name))}
      ${td(r.vendor_gstin ? `<span class="prMono">${esc(r.vendor_gstin)}</span>` : '<span style="color:#ef4444">No GSTIN</span>')}
      ${td(r.invoice_count, "prNum")}
      ${td(amt(r.purchase_value), "prNum")}
      ${td(amt(r.cgst_itc), "prNum", false, r.itc_status === "INELIGIBLE" ? "#dc2626" : "")}
      ${td(amt(r.sgst_itc), "prNum", false, r.itc_status === "INELIGIBLE" ? "#dc2626" : "")}
      ${td(amt(r.igst_itc), "prNum", false, r.itc_status === "INELIGIBLE" ? "#dc2626" : "")}
      ${td(amt(r.cess_itc || 0), "prNum", false, r.itc_status === "INELIGIBLE" ? "#dc2626" : "")}
      ${td(amt(r.total_itc), "prNum", true, r.itc_status === "INELIGIBLE" ? "#dc2626" : "")}
      ${td(r.itc_status === "INELIGIBLE" ? "Ineligible — ITC Not Claimable" : "Eligible", null, false, r.itc_status === "INELIGIBLE" ? "#dc2626" : "#059669")}
    </tr>`).join("");

  const sec1Html = `
    <div class="prSection">
      <h3>Section 1 — ITC Summary by Supplier</h3>
      <table class="prTable">
        <thead><tr>
          ${th("#")}${th("Supplier Name")}${th("GSTIN")}${th("Invoices","prNum")}
          ${th("Purchase Value","prNum")}${th("CGST ITC","prNum")}${th("SGST ITC","prNum")}
          ${th("IGST ITC","prNum")}${th("CESS ITC","prNum")}${th("Total ITC","prNum")}${th("Status")}
        </tr></thead>
        <tbody>
          ${supplierRows}
          <tr class="prTotalRow">
            ${td("Total (All Suppliers)",null,true)}${td("",null,true)}${td("",null,true)}
            ${td(s.total_invoice_count,"prNum",true)}
            ${td(amt(s.total_purchase_value),"prNum",true)}
            ${td(amt(allCgst),"prNum",true,hasIneligible ? "#dc2626" : "")}
            ${td(amt(allSgst),"prNum",true,hasIneligible ? "#dc2626" : "")}
            ${td(amt(allIgst),"prNum",true,hasIneligible ? "#dc2626" : "")}
            ${td(amt(allCess),"prNum",true,hasIneligible ? "#dc2626" : "")}
            ${td(amt(allTotal),"prNum",true,hasIneligible ? "#dc2626" : "")}
            ${td("",null,true)}
          </tr>
        </tbody>
      </table>
      <p class="prNote">
        * Ineligible ITC amounts shown in red are for reference only — these are additional costs, not claimable as ITC.
        ${allIneligible ? ` Net ITC Claimable = ${amt(cf.net?.total)} — no eligible suppliers this period.` : " Total row includes all GST paid (eligible + ineligible)."}
      </p>
    </div>`;

  /* ── Section 2: Invoice Detail ── */
  const invoiceRows = (data.invoice_detail || []).map((r, i) => `
    <tr${i % 2 === 1 ? ' class="prAlt"' : ""}>
      ${td(i + 1)}
      ${td(esc(r.invoice_number) + (r.missing_hsn_count > 0 ? ' <span style="color:#f59e0b">⚠</span>' : "") + (r.rcm_applicable ? ' <span style="color:#3730a3;font-size:10px">[RCM]</span>' : ""))}
      ${td(fmtDate(r.invoice_date))}
      ${td(esc(r.vendor_name))}
      ${td(r.vendor_gstin ? `<span class="prMono">${esc(r.vendor_gstin)}</span>` : '<span style="color:#ef4444">No GSTIN</span>')}
      ${td(r.hsn_code ? `<span class="prMono">${esc(r.hsn_code)}</span>` : '<span style="color:#f59e0b;font-style:italic">Missing</span>')}
      ${td(r.supply_type === "INTER_STATE" ? "Inter-State" : "Intra-State")}
      ${td(amt(r.taxable_value), "prNum")}
      ${td(amt(r.cgst_itc), "prNum", false, r.itc_status === "INELIGIBLE" ? "#dc2626" : "")}
      ${td(amt(r.sgst_itc), "prNum", false, r.itc_status === "INELIGIBLE" ? "#dc2626" : "")}
      ${td(amt(r.igst_itc), "prNum", false, r.itc_status === "INELIGIBLE" ? "#dc2626" : "")}
      ${td(r.itc_status === "INELIGIBLE" ? "Ineligible" : r.itc_status === "AT_RISK" ? "At Risk" : r.itc_status === "REVERSAL_REQUIRED" ? "Reversal Required" : "Eligible", null, false, r.itc_status === "INELIGIBLE" ? "#dc2626" : r.itc_status === "AT_RISK" ? "#b45309" : "#059669")}
      ${td(r.itc_status === "INELIGIBLE" ? "N/A" : r.payment_status)}
      ${td(r.itc_status === "INELIGIBLE" ? "N/A" : r.days_to_reversal < 0 ? `${Math.abs(r.days_to_reversal)}d overdue` : `${r.days_to_reversal}d`, "prNum", false, r.itc_status === "INELIGIBLE" ? "" : r.days_to_reversal < 0 ? "#dc2626" : r.days_to_reversal <= 30 ? "#b45309" : "")}
    </tr>`).join("");

  const sec2Html = `
    <div class="prSection prPageBreak">
      <h3>Section 2 — Invoice-wise ITC Detail</h3>
      <table class="prTable">
        <thead><tr>
          ${th("#")}${th("Invoice No")}${th("Date")}${th("Supplier")}${th("GSTIN")}
          ${th("HSN Code")}${th("Supply Type")}${th("Taxable Value","prNum")}${th("CGST","prNum")}
          ${th("SGST","prNum")}${th("IGST","prNum")}${th("ITC Status")}
          ${th("Payment")}${th("Days to Reversal","prNum")}
        </tr></thead>
        <tbody>${invoiceRows}</tbody>
      </table>
      <div style="margin-top:6px;padding:6px 8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px;font-size:10px;color:#6b7280">
        <div>⚠ = Missing HSN code (required for ITC claims)</div>
        <div>[RCM] = Reverse Charge Mechanism — consult CA</div>
        <div>Taxable Value excludes GST</div>
        <div>N/A — Ineligible = payment not tracked (ITC ineligible)</div>
        <div>N/A (days) = 180-day clock not applicable (no GSTIN)</div>
      </div>
    </div>`;

  /* ── Section 3: ITC Reversals — hide headers when empty (Issue: PDF Sec3) ── */
  const hasReversals = (data.reversals || []).length > 0;
  const reversalRows = hasReversals
    ? (data.reversals || []).map((r, i) => `
      <tr${i % 2 === 1 ? ' class="prAlt"' : ""}>
        ${td(i + 1)}${td(esc(r.return_number))}${td(fmtDate(r.return_date))}
        ${td(esc(r.original_invoice_number))}${td(esc(r.vendor_name))}
        ${td("Purchase Return")}
        ${td(amt(r.cgst_reversed),"prNum")}${td(amt(r.sgst_reversed),"prNum")}
        ${td(amt(r.igst_reversed),"prNum")}${td(amt(r.total_reversed),"prNum",true)}
        ${td(amt(r.total_return_amount),"prNum")}
      </tr>`).join("")
    : "";

  const sec3Html = `
    <div class="prSection prPageBreak">
      <h3>Section 3 — ITC Reversals (Purchase Returns)</h3>
      ${hasReversals ? `
      <table class="prTable">
        <thead><tr>
          ${th("#")}${th("Return No")}${th("Return Date")}${th("Original Invoice")}
          ${th("Supplier")}${th("Type")}${th("CGST Reversed","prNum")}
          ${th("SGST Reversed","prNum")}${th("IGST Reversed","prNum")}
          ${th("Total Reversed","prNum")}${th("Return Amount","prNum")}
        </tr></thead>
        <tbody>${reversalRows}</tbody>
      </table>` : `
      <p style="color:#059669;text-align:center;padding:16px;font-size:13px">✓ No ITC reversals this period — No confirmed purchase returns in ${MONTH_NAMES[mo]} ${yr}.</p>`}
    </div>`;

  /* ── Section 4: Blocked ITC ── */
  const blockedRows = (data.blocked_itc || []).length > 0
    ? (data.blocked_itc || []).map((r, i) => `
      <tr${i % 2 === 1 ? ' class="prAlt"' : ""}>
        ${td(i + 1)}${td(esc(r.invoice_number))}${td(fmtDate(r.invoice_date))}
        ${td(esc(r.vendor_name))}
        ${td(r.vendor_gstin ? `<span class="prMono">${esc(r.vendor_gstin)}</span>` : '<span style="color:#ef4444">No GSTIN</span>')}
        ${td(amt(r.purchase_value),"prNum")}
        ${td(amt(r.cgst_paid || 0),"prNum",false,"#dc2626")}
        ${td(amt(r.sgst_paid || 0),"prNum",false,"#dc2626")}
        ${td(amt(r.igst_paid || 0),"prNum",false,"#dc2626")}
        ${td(amt(r.cess_paid || 0),"prNum",false,"#dc2626")}
        ${td(amt(r.gst_paid),"prNum",true,"#dc2626")}
        ${td(esc(r.reason_blocked))}
        ${td(r.rcm_applicable ? "Check with CA" : "No RCM")}
      </tr>`).join("")
    : `<tr><td colspan="13" style="text-align:center;color:#059669;padding:16px">✓ No blocked ITC this period</td></tr>`;

  const sec4Html = `
    <div class="prSection prPageBreak">
      <h3>Section 4 — Blocked / Ineligible ITC</h3>
      <div class="prWarnBox">⚠ Total Blocked ITC: <strong style="color:#dc2626">${amt(data.blocked_itc_total)}</strong> — This is an additional cost to your business. To recover future ITC — update the supplier GSTIN in your accounting software.</div>
      <table class="prTable">
        <thead><tr>
          ${th("#")}${th("Invoice No")}${th("Date")}${th("Supplier")}
          ${th("GSTIN Status")}${th("Purchase Value","prNum")}
          ${th("CGST Paid","prNum")}${th("SGST Paid","prNum")}${th("IGST Paid","prNum")}${th("CESS Paid","prNum")}
          ${th("Total GST","prNum")}${th("Reason Blocked")}${th("RCM")}
        </tr></thead>
        <tbody>${blockedRows}</tbody>
      </table>
    </div>`;

  /* ── Section 5: 180-day risk — hide headers when empty (Issue: PDF Sec5) ── */
  const hasRisk = (data.risk_invoices || []).length > 0;
  const riskRows = hasRisk
    ? (data.risk_invoices || []).map((r, i) => `
      <tr${i % 2 === 1 ? ' class="prAlt"' : ""}>
        ${td(i + 1)}${td(esc(r.invoice_number))}${td(esc(r.vendor_name))}
        ${td(fmtDate(r.invoice_date))}${td(fmtDate(r.reversal_due_date))}
        ${td(r.days_remaining < 0 ? `${Math.abs(r.days_remaining)}d overdue` : `${r.days_remaining}d`,"prNum",true,r.days_remaining < 0 ? "#dc2626" : r.days_remaining <= 30 ? "#b45309" : "#059669")}
        ${td(amt(r.taxable_value),"prNum")}
        ${td(amt(r.itc_at_risk),"prNum",true,"#dc2626")}
        ${td(r.payment_status)}
      </tr>`).join("")
    : "";

  const sec5Html = `
    <div class="prSection prPageBreak">
      <h3>Section 5 — 180-Day Payment Risk</h3>
      ${hasRisk
        ? `<p class="prNote" style="color:#b45309">⚠ Pay these invoices before the reversal date to retain ITC. Total ITC at risk: <strong style="color:#dc2626">${amt(data.risk_itc_total)}</strong></p>
           <table class="prTable">
             <thead><tr>
               ${th("#")}${th("Invoice No")}${th("Supplier")}${th("Invoice Date")}
               ${th("Reversal Due Date")}${th("Days Remaining","prNum")}
               ${th("Taxable Value","prNum")}${th("ITC at Risk","prNum")}${th("Payment Status")}
             </tr></thead>
             <tbody>${riskRows}</tbody>
           </table>`
        : `<p style="color:#059669;text-align:center;padding:16px;font-size:13px">✓ No invoices at risk this period.</p>`}
    </div>`;

  /* ── Notes — Issue: PDF footnote larger, clear divider between notes and disclaimer ── */
  const notesHtml = `
    <div class="prSection prPageBreak">
      <h3>Important Notes for CA</h3>
      <ol style="margin:0 0 12px;padding-left:20px;line-height:1.8;font-size:12px">
        <li>ITC can only be claimed from GST-registered suppliers with valid GSTIN.</li>
        <li>ITC must be reversed if supplier invoice is unpaid beyond 180 days.</li>
        <li>Purchase returns automatically reverse ITC on returned quantities.</li>
        <li>RCM purchases may allow ITC — consult your CA for specific goods.</li>
        <li>This report is system-generated. Cross-check with your actual purchase invoices and books of accounts before sharing with CA.</li>
        <li>IGST ITC can be used to pay IGST, then CGST, then SGST in that order.</li>
        <li>Purchases from unregistered suppliers for specific notified goods (including certain medicines) may attract Reverse Charge Mechanism (RCM) — consult your CA.</li>
      </ol>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0"/>
      <div class="prWarnBox" style="background:#fef3c7;border-color:#f59e0b;color:#92400e">
        <strong style="color:#92400e">Legal Disclaimer:</strong> ITC claims in GSTR-3B are verified against supplier GSTR-1 filings on the GST portal. Mismatches may result in department notices. GSTR-3B cannot be revised once filed — verify all figures carefully before sharing with your CA.
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-top:12px;text-align:center">
        This is a system-generated report — verify before filing &nbsp;|&nbsp; Generated: ${generatedOn} &nbsp;|&nbsp; ${esc(biz.firm_name || "")} &nbsp;|&nbsp; GSTIN: ${esc(biz.gst_number || "Not set")}${biz.gst_number && !gstinOk ? " (Unverified format)" : ""}
      </p>
    </div>`;

  const bodyHtml = `
    ${extraCssHtml}
    ${headerHtml}
    ${hsnWarnHtml}
    ${gstinWarnHtml}
    ${summaryHtml}
    ${cfHtml}
    ${sec1Html}
    ${sec2Html}
    ${sec3Html}
    ${sec4Html}
    ${sec5Html}
    ${notesHtml}`;

  openPrintDocument({
    title: `ITC Report — ${MONTH_NAMES[mo]} ${yr}`,
    bodyHtml,
  });
}