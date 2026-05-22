import { useState, useCallback } from "react";
import "./Gstr3bPage.css";
import ReportShell from "../components/reports/ReportShell.jsx";
import { ReportPageIntro, ReportCard } from "../components/reports/ReportUi.jsx";
import AppButton from "../components/ui/AppButton.jsx";
import CommonLoading from "../components/CommonLoading.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { fmtCurrency } from "../utils/currency.js";
import { getGstr3b } from "../services/gstr3bService.js";
import { printGstr3bReport } from "../print/gstr3bPrint.js";
import { useToast } from "../components/ToastProvider.jsx";
import {
  BarChart3, FileText, Download, TrendingUp,
  ShieldCheck, Banknote, BadgeIndianRupee,
  AlertTriangle, RefreshCw, Info,
} from "lucide-react";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function n2(v) {
  const num = Number(v);
  return isNaN(num) ? "0.00" : num.toFixed(2);
}

/** Validate GSTIN format: 15-char alphanumeric per GST rules */
function isValidGstin(g) {
  if (!g) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(g.toUpperCase().trim());
}

/** Format date as "20th June 2026" */
function fmtDueDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const day = d.getDate();
  const suffix = [, "st", "nd", "rd"][day] || "th";
  return `${day}${suffix} ${MONTH_NAMES[d.getMonth() + 1]} ${d.getFullYear()}`;
}

function buildYearOptions() {
  const now = new Date();
  const years = [];
  for (let y = now.getFullYear() + 1; y >= 2020; y--) years.push(y);
  return years;
}

function buildMonthOptions() {
  return MONTH_NAMES.slice(1).map((name, i) => ({ value: i + 1, label: name }));
}

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function isDueSoon(dueDate) {
  if (!dueDate) return false;
  const diff = (new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 5;
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCsv(data, year, month) {
  if (!data) return;
  const os  = data.outward_supplies || {};
  const itc = data.itc              || {};
  const tp  = data.tax_payable      || {};
  const s   = data.summary          || {};
  const biz = data.business         || {};

  const rows = [
    ["GSTR-3B Monthly Summary Report"],
    [`Business: ${biz.firm_name || ""}`],
    [`GSTIN: ${biz.gst_number || ""}`],
    [`Period: ${MONTH_NAMES[month]} ${year}`],
    [`Due Date: ${fmtDueDate(data.due_date)}`],
    [],
    ["SUMMARY"],
    ["Total Sales Value", n2(s.total_sales_value)],
    ["Total GST Collected", n2(s.total_gst_collected)],
    ["Total ITC Available", n2(s.total_itc_available)],
    ["Net GST Payable", n2(s.net_gst_payable)],
    [],
    ["SECTION 3.1 — OUTWARD SUPPLIES", "Total Value", "CGST", "SGST", "IGST", "Cess"],
    ["Taxable Sales", n2(os.taxable?.total_value), n2(os.taxable?.cgst), n2(os.taxable?.sgst), n2(os.taxable?.igst), "0.00"],
    ["Nil Rated / Exempt Sales", n2(os.nil_rated?.total_value), "0.00", "0.00", "0.00", "0.00"],
    ["TOTAL", n2(os.totals?.total_value), n2(os.totals?.cgst), n2(os.totals?.sgst), n2(os.totals?.igst), "0.00"],
    [],
    ["SECTION 4 — ITC FROM PURCHASES", "Total Value", "CGST", "SGST", "IGST", "Cess"],
    ["Eligible Purchases (Supplier has GSTIN)", n2(itc.eligible?.taxable_value), n2(itc.eligible?.cgst), n2(itc.eligible?.sgst), n2(itc.eligible?.igst), "0.00"],
    ["Imports (if any)", "0.00", "0.00", "0.00", "0.00", "0.00"],
    ["Ineligible Purchases (No GSTIN)", n2(itc.ineligible?.taxable_value), n2(itc.ineligible?.cgst), n2(itc.ineligible?.sgst), n2(itc.ineligible?.igst), "0.00"],
    ["Purchase Returns Reversed", n2(itc.reversals?.total_amount), n2(itc.reversals?.cgst), n2(itc.reversals?.sgst), n2(itc.reversals?.igst), "0.00"],
    ["Net ITC Available", "", n2(itc.net_itc?.cgst), n2(itc.net_itc?.sgst), n2(itc.net_itc?.igst), "0.00"],
    [],
    ["SECTION 6 — NET TAX PAYABLE", "GST Collected", "ITC Available", "Net Payable", "Interest", "Late Fee"],
    ["CGST", n2(tp.cgst?.gst_collected), n2(tp.cgst?.itc_available), n2(tp.cgst?.net_payable), "0.00", "0.00"],
    ["SGST", n2(tp.sgst?.gst_collected), n2(tp.sgst?.itc_available), n2(tp.sgst?.net_payable), "0.00", "0.00"],
    ["IGST", n2(tp.igst?.gst_collected), n2(tp.igst?.itc_available), n2(tp.igst?.net_payable), "0.00", "0.00"],
    ["Cess", "0.00", "0.00", "0.00", "0.00", "0.00"],
    ["TOTAL", n2(tp.total?.gst_collected), n2(tp.total?.itc_available), n2(tp.total?.net_payable), "0.00", "0.00"],
  ];

  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `GSTR3B_${year}_${String(month).padStart(2, "0")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Amount cell ───────────────────────────────────────────────────────────────
function AmtCell({ v, bold, highlight, success, muted }) {
  let cls = "tR";
  if (bold)      cls += " tBold";
  if (highlight) cls += " tHighlight";
  if (success)   cls += " tSuccess";
  if (muted)     cls += " tMuted";
  return <td className={cls}>{muted ? "—" : `₹${n2(v)}`}</td>;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Gstr3bPage() {
  const { taxLabel } = useLocale();
  const { showToast } = useToast();

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [fetched,    setFetched]    = useState(false);
  const [generatedAt, setGeneratedAt] = useState(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setFetched(false);
    try {
      const resp = await getGstr3b({ year, month });
      if (resp.json?.ok) {
        setData(resp.json.data);
        setFetched(true);
        setGeneratedAt(new Date());
      } else {
        showToast("error", "Failed to load GSTR3B", { message: resp.json?.error?.message || "Please try again." });
      }
    } finally {
      setLoading(false);
    }
  }, [year, month, showToast]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const s   = data?.summary          || {};
  const os  = data?.outward_supplies || {};
  const itc = data?.itc              || {};
  const tp  = data?.tax_payable      || {};
  const notes = data?.notes          || {};
  const mh    = data?.month_history  || [];
  const biz   = data?.business       || {};
  const sec32 = data?.section_3_2    || {};
  const sec5  = data?.section_5      || {};

  const taxable  = os.taxable   || {};
  const nilRated = os.nil_rated || {};
  const osTot    = os.totals    || {};

  const itcElig = itc.eligible   || {};
  const itcInel = itc.ineligible || {};
  const itcRev  = itc.reversals  || {};
  const itcNet  = itc.net_itc    || {};

  const dueDate = data?.due_date || "";
  const overdue = isOverdue(dueDate);
  const dueSoon = !overdue && isDueSoon(dueDate);

  // Always show notes section when data is loaded (GSTR-1 auto-pop note is always relevant)
  const hasNotes = true;
  const showCf   = Number(s.carry_forward_total) > 0;

  return (
    <ReportShell>
      <div className="pageWrap">
        <ReportPageIntro
          title="GSTR-3B — Monthly Summary Report"
          subtitle={`Monthly ${taxLabel} summary for your CA — outward supplies, ITC, and net ${taxLabel} payable`}
        />

        <ReportCard>
          {/* ── Filter bar ── */}
          <div className="g3bFilterBar">
            <div className="g3bFilterRow">
              <div className="g3bFilterField">
                <label className="g3bFieldLabel">Month</label>
                <select className="g3bSelect" value={month}
                  onChange={e => { setMonth(Number(e.target.value)); setFetched(false); setData(null); }}>
                  {buildMonthOptions().map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="g3bFilterField">
                <label className="g3bFieldLabel">Year</label>
                <select className="g3bSelect" value={year}
                  onChange={e => { setYear(Number(e.target.value)); setFetched(false); setData(null); }}>
                  {buildYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="g3bFilterActions">
                <AppButton variant="primary" icon={<BarChart3 size={15} />} onClick={fetchReport} disabled={loading}>
                  {loading ? "Loading…" : "Generate Report"}
                </AppButton>
                {fetched && data && (
                  <>
                    <AppButton
                      variant="secondary"
                      icon={<RefreshCw size={15} />}
                      onClick={fetchReport}
                      disabled={loading}
                      title="Recalculate from latest invoices and update the snapshot"
                    >
                      Refresh
                    </AppButton>
                    <AppButton variant="secondary" icon={<FileText size={15} />}
                      onClick={() => printGstr3bReport({ data, taxLabel })}>
                      Print PDF
                    </AppButton>
                    <AppButton variant="secondary" icon={<Download size={15} />}
                      onClick={() => exportCsv(data, year, month)}>
                      Export CSV
                    </AppButton>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Loading ── */}
          {loading && (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <CommonLoading variant="inline" size="md" text="Generating GSTR3B report…" />
            </div>
          )}

          {/* ── Empty state ── */}
          {!loading && !fetched && (
            <div className="g3bEmpty">
              <div className="g3bEmptyIcon"><BarChart3 size={32} /></div>
              <div className="g3bEmptyTitle">Select month and year, then click Generate Report</div>
              <div className="g3bEmptySub">
                GSTR-3B shows your monthly {taxLabel} summary — outward supplies, ITC from purchases, and net {taxLabel} payable. Share this with your CA for filing.
              </div>
            </div>
          )}

          {/* ── Report ── */}
          {!loading && fetched && data && (
            <>
              {/* Critical HSN warning — top of report, red for mandatory compliance */}
              {notes.missing_hsn_count > 0 && (
                <div className="g3bHsnWarn">
                  <AlertTriangle size={16} />
                  <div>
                    <strong>Action Required — {notes.missing_hsn_count} Line Item(s) Missing HSN Codes</strong>
                    <div style={{ fontSize: 12, marginTop: 2 }}>HSN codes are mandatory for GSTR-1 filing. Update these items before sharing with your CA. Filing without HSN codes may result in rejection.</div>
                  </div>
                </div>
              )}

              {/* Due date notice */}
              {dueDate && (overdue || dueSoon) && (
                <div className={`g3bDueNotice${overdue ? " overdue" : ""}`}>
                  <AlertTriangle size={15} />
                  {overdue
                    ? `OVERDUE — Due date was ${fmtDueDate(dueDate)}. Please share with your CA immediately.`
                    : `Due soon — Filing due by ${fmtDueDate(dueDate)}. ${Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24))} days remaining.`
                  }
                </div>
              )}

              {/* Business Details block */}
              <div className="g3bBizHeader">
                <div className="g3bBizLeft">
                  <div className="g3bBizSectionLabel">Business Details</div>
                  {biz.firm_name && <div className="g3bBizName">{biz.firm_name}</div>}
                  {biz.gst_number ? (
                    <>
                      <div className="g3bBizGstin">GSTIN: <strong>{biz.gst_number}</strong></div>
                      {!isValidGstin(biz.gst_number) && (
                        <div className="g3bGstinInvalid">
                          <AlertTriangle size={11} /> Invalid GSTIN format — must be 15 characters (e.g. 29ABCDE1234F1Z5)
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="g3bBizGstin g3bGstinMissing"><AlertTriangle size={12} /> GSTIN not set — add it in your profile</div>
                  )}
                </div>
                <div className="g3bBizRight">
                  <span className="g3bPeriodLabel">{MONTH_NAMES[month]} {year}</span>
                  <span className="g3bDuePill">Due: {fmtDueDate(dueDate)}</span>
                </div>
              </div>

              {/* Generated-at timestamp with stale data prompt */}
              {generatedAt && (
                <div className="g3bGeneratedBar">
                  <span>Generated: {generatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — {generatedAt.toLocaleDateString()}</span>
                  <span className="g3bGeneratedNote">New invoices added after this time won't appear — click <strong>Refresh</strong> to recalculate.</span>
                </div>
              )}

              {/* Summary cards */}
              <div className="g3bSummaryRow">
                <div className="g3bStatCard">
                  <div className="g3bStatIcon" style={{ "--ic": "var(--color-primary)" }}><TrendingUp size={18} /></div>
                  <div className="g3bStatLabel">Total Sales Value</div>
                  <div className="g3bStatValue">{fmtCurrency(s.total_sales_value)}</div>
                </div>
                <div className="g3bStatCard">
                  <div className="g3bStatIcon" style={{ "--ic": "#f59e0b" }}><BadgeIndianRupee size={18} /></div>
                  <div className="g3bStatLabel">Total {taxLabel} Collected</div>
                  <div className="g3bStatValue">{fmtCurrency(s.total_gst_collected)}</div>
                  {s.all_sales_nil_rated && (
                    <div className="g3bStatNote">All sales are nil-rated / exempt — ₹0 GST is correct</div>
                  )}
                </div>
                <div className="g3bStatCard">
                  <div className="g3bStatIcon" style={{ "--ic": "var(--color-text-3)" }}><ShieldCheck size={18} /></div>
                  <div className="g3bStatLabel">Total ITC from Purchases</div>
                  <div className="g3bStatValue">{fmtCurrency(s.total_itc_available)}</div>
                  {Number(s.total_itc_available) === 0 && (
                    <div className="g3bStatNote">
                      {Number(itcElig.invoice_count) === 0
                        ? "0 eligible suppliers this period"
                        : "ITC reversed by purchase returns"}
                    </div>
                  )}
                </div>
                <div className="g3bStatCard g3bStatCardPrimary">
                  <div className="g3bStatIcon" style={{ "--ic": "var(--color-primary)" }}><Banknote size={18} /></div>
                  <div className="g3bStatLabel">Net {taxLabel} Payable</div>
                  <div className={`g3bStatValueLg ${Number(s.net_gst_payable) === 0 ? "g3bPayZero" : "g3bPayDue"}`}>
                    {fmtCurrency(s.net_gst_payable)}
                  </div>
                  {showCf && <div className="g3bStatNote">ITC carry-forward: {fmtCurrency(s.carry_forward_total)}</div>}
                </div>
              </div>

              {/* Section 3.1 — Outward Supplies */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Section 3.1 — Outward Supplies</span>
                  <span className="g3bSectionBadge">{osTot.invoice_count || 0} invoices</span>
                </div>
                {/* Data quality warning: items with GST rate set but zero actual amounts */}
                {s.gst_rate_mismatch_count > 0 && (
                  <div className="g3bNoteRow g3bNoteWarn" style={{ margin: "8px 18px 0", borderRadius: 8 }}>
                    <AlertTriangle size={14} />
                    <span><strong>{s.gst_rate_mismatch_count} line item(s)</strong> have a GST rate set but ₹0 GST collected — reclassified as Nil Rated. Verify these items have the correct GST rate in your product master.</span>
                  </div>
                )}
                <div className="g3bTableScroll">
                  <table className="g3bTable">
                    <thead>
                      <tr>
                        <th>Nature of Supply</th>
                        <th className="tR">Total Value</th>
                        <th className="tR">CGST</th>
                        <th className="tR">SGST</th>
                        <th className="tR">IGST</th>
                        <th className="tR">Cess</th>
                        <th className="tR">Invoices</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>(a) Taxable Supplies <span className="g3bInelNote">(GST &gt; 0)</span></td>
                        <AmtCell v={taxable.total_value} />
                        <AmtCell v={taxable.cgst} />
                        <AmtCell v={taxable.sgst} />
                        <AmtCell v={taxable.igst} />
                        <AmtCell v={0} />
                        <td className="tR">{taxable.invoice_count || 0}</td>
                      </tr>
                      <tr>
                        <td>(b) Nil Rated / Exempt / Zero-GST Supplies</td>
                        <AmtCell v={nilRated.total_value} />
                        <AmtCell v={0} />
                        <AmtCell v={0} />
                        <AmtCell v={0} />
                        <AmtCell v={0} />
                        <td className="tR">{nilRated.invoice_count || 0}</td>
                      </tr>
                      <tr className="tTotal">
                        <td className="tBold">Total</td>
                        <AmtCell v={osTot.total_value} bold highlight />
                        <AmtCell v={osTot.cgst} bold />
                        <AmtCell v={osTot.sgst} bold />
                        <AmtCell v={osTot.igst} bold />
                        <AmtCell v={0} bold />
                        <td className="tR tBold">{osTot.invoice_count || 0}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 3.2 — Inter-state supplies */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Section 3.2 — Inter-state Supplies</span>
                  <span className="g3bSectionBadge g3bBadgeInfo" style={{ fontSize: 12, padding: "3px 10px" }}>⟳ Auto-populated from GSTR-1</span>
                </div>
                <div className="g3bNoteRow g3bNoteInfo" style={{ margin: "6px 18px 0", borderRadius: 6, padding: "5px 10px" }}>
                  <Info size={13} />
                  <span style={{ fontSize: 12 }}>Inter-state supplies only — intra-state not shown here. Auto-populated from GSTR-1 from July 2025.</span>
                </div>
                <div className="g3bTableScroll">
                  <table className="g3bTable">
                    <thead>
                      <tr>
                        <th>Supply Type</th>
                        <th className="tR">Taxable Value</th>
                        <th className="tR">IGST <span style={{ fontWeight: 400, fontStyle: "italic" }}>(inter-state only)</span></th>
                        <th className="tR">Cess</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td>Supplies to Unregistered Persons</td><AmtCell v={0} /><AmtCell v={0} /><AmtCell v={0} /></tr>
                      <tr><td>Supplies to Composition Taxpayers</td><AmtCell v={0} /><AmtCell v={0} /><AmtCell v={0} /></tr>
                      <tr><td>Supplies to UIN Holders</td><AmtCell v={0} /><AmtCell v={0} /><AmtCell v={0} /></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 4 — ITC from Purchases */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Section 4 — Input Tax Credit (ITC)</span>
                  <span className="g3bSectionBadge">{itcElig.invoice_count || 0} eligible invoices</span>
                </div>
                <div className="g3bTableScroll">
                  <table className="g3bTable">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th className="tR">Total Value</th>
                        <th className="tR">CGST</th>
                        <th className="tR">SGST</th>
                        <th className="tR">IGST</th>
                        <th className="tR">Cess</th>
                        <th className="tR">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>(A) Eligible Purchases <span className="g3bInelNote">(Supplier has GSTIN)</span></td>
                        <AmtCell v={itcElig.taxable_value} />
                        <AmtCell v={itcElig.cgst} />
                        <AmtCell v={itcElig.sgst} />
                        <AmtCell v={itcElig.igst} />
                        <AmtCell v={0} />
                        <td className="tR">{itcElig.invoice_count || 0}</td>
                      </tr>
                      <tr>
                        <td>(B) Imports <span className="g3bInelNote">(if any)</span></td>
                        <AmtCell v={0} />
                        <AmtCell v={0} />
                        <AmtCell v={0} />
                        <AmtCell v={0} />
                        <AmtCell v={0} />
                        <td className="tR">0</td>
                      </tr>
                      <tr className="g3bInfoRow">
                        <td>(C) Ineligible — No GSTIN <span className="g3bInelNote">(reference only, not claimable)</span></td>
                        <AmtCell v={itcInel.taxable_value} />
                        <AmtCell v={itcInel.cgst} />
                        <AmtCell v={itcInel.sgst} />
                        <AmtCell v={itcInel.igst} />
                        <AmtCell v={0} />
                        <td className="tR">{itcInel.invoice_count || 0}</td>
                      </tr>
                      <tr className="g3bInfoRow">
                        <td>(D) ITC Reversed — Purchase Returns</td>
                        <AmtCell v={itcRev.total_amount} />
                        <AmtCell v={itcRev.cgst} />
                        <AmtCell v={itcRev.sgst} />
                        <AmtCell v={itcRev.igst} />
                        <AmtCell v={0} />
                        <td className="tR">{itcRev.return_count || 0}</td>
                      </tr>
                      <tr className="tTotal">
                        <td className="tBold">Net ITC Available <span className="g3bInelNote">(A + B − D)</span></td>
                        <AmtCell v={itcNet.total || 0} bold />
                        <AmtCell v={itcNet.cgst} bold success={Number(itcNet.cgst) > 0} />
                        <AmtCell v={itcNet.sgst} bold success={Number(itcNet.sgst) > 0} />
                        <AmtCell v={itcNet.igst} bold success={Number(itcNet.igst) > 0} />
                        <AmtCell v={0} bold />
                        <td className="tR tBold">0</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {itcInel.invoice_count > 0 && (
                  <div className="g3bNoteRow g3bNoteWarn" style={{ margin: "8px 18px 12px", borderRadius: 8 }}>
                    <AlertTriangle size={14} />
                    <span>
                      <strong>RCM Alert:</strong> {itcInel.invoice_count} purchase(s) from unregistered suppliers — GST paid (₹{n2(s.ineligible_itc_cost)}) is an <strong>additional cost to your business</strong>, not claimable as ITC.
                      Reverse Charge Mechanism (RCM) may apply on specific notified goods/services — consult your CA.
                    </span>
                  </div>
                )}
              </div>

              {/* Section 5 — Nil-rated inward supplies */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Section 5 — Exempt, Nil-rated & Non-GST Inward Supplies</span>
                </div>
                <div className="g3bNoteRow g3bNoteInfo" style={{ margin: "8px 18px 0", borderRadius: 8 }}>
                  <Info size={14} />
                  <span>No tax is applicable on these supplies — CGST/SGST/IGST columns are absent per the official GSTR-3B form.</span>
                </div>
                <div className="g3bTableScroll">
                  <table className="g3bTable">
                    <thead>
                      <tr>
                        <th>Nature</th>
                        <th className="tR">Taxable Value</th>
                        <th className="tR">Invoices</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Nil Rated Inward Supplies <span className="g3bInelNote">(Purchases with 0% GST)</span></td>
                        <AmtCell v={sec5.nil_rated_inward?.taxable_value} />
                        <td className="tR">{sec5.nil_rated_inward?.invoice_count || 0}</td>
                      </tr>
                      <tr>
                        <td>Exempt Inward Supplies</td>
                        <AmtCell v={0} />
                        <td className="tR">0</td>
                      </tr>
                      <tr>
                        <td>Non-GST Inward Supplies</td>
                        <AmtCell v={0} />
                        <td className="tR">0</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 6 — Net Tax Payable */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Section 6 — Payment of Tax</span>
                </div>
                <div className="g3bNoteRow g3bNoteInfo" style={{ margin: "8px 18px 0", borderRadius: 8 }}>
                  <Info size={14} />
                  <span>Interest and Late Fee are ₹0.00 when filed on or before the due date ({fmtDueDate(dueDate)}). These will be non-zero if filed after the due date.</span>
                </div>
                <div className="g3bTableScroll">
                  <table className="g3bTable">
                    <thead>
                      <tr>
                        <th>Tax Head</th>
                        <th className="tR">GST Collected</th>
                        <th className="tR">ITC Available</th>
                        <th className="tR">Net Payable</th>
                        <th className="tR">Interest</th>
                        <th className="tR">Late Fee</th>
                        {showCf && <th className="tR">Carry Forward</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "CGST", row: tp.cgst || {} },
                        { label: "SGST", row: tp.sgst || {} },
                        { label: "IGST", row: tp.igst || {} },
                        { label: "Cess", row: tp.cess || {} },
                      ].map(({ label, row }) => (
                        <tr key={label}>
                          <td className="tBold">{label}</td>
                          <AmtCell v={row.gst_collected} />
                          <AmtCell v={row.itc_available} />
                          <AmtCell v={row.net_payable} />
                          <AmtCell v={row.interest || 0} />
                          <AmtCell v={row.late_fee || 0} />
                          {showCf && <AmtCell v={row.carry_forward} />}
                        </tr>
                      ))}
                      <tr className="tTotal">
                        <td className="tBold">Total</td>
                        <AmtCell v={tp.total?.gst_collected} bold />
                        <AmtCell v={tp.total?.itc_available} bold />
                        <AmtCell v={tp.total?.net_payable} bold />
                        <AmtCell v={tp.total?.interest || 0} bold />
                        <AmtCell v={tp.total?.late_fee || 0} bold />
                        {showCf && <AmtCell v={tp.total?.carry_forward} bold />}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Month history — exclude current month being viewed */}
              {(() => {
                const pastHistory = mh.filter(r => !(r.year === year && r.month === month));
                return pastHistory.length > 0 ? (
                  <div className="g3bHistorySection">
                    <div className="g3bHistoryTitle">Filing History (Previous Months)</div>
                    <div className="g3bTableScroll">
                      <table className="g3bTable">
                        <thead>
                          <tr>
                            <th>Period</th>
                            <th className="tR">Total Sales</th>
                            <th className="tR">GST Collected</th>
                            <th className="tR">ITC Available</th>
                            <th className="tR">Net Payable</th>
                            <th className="tR">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pastHistory.map(row => {
                            const netPay = Number(row.net_payable);
                            const payClass = netPay === 0 ? "tSuccess" : "tDanger";
                            return (
                              <tr key={`${row.year}-${row.month}`}>
                                <td>{MONTH_NAMES[row.month]} {row.year}</td>
                                <td className="tR">{fmtCurrency(row.total_sales)}</td>
                                <td className="tR">{fmtCurrency(row.total_gst)}</td>
                                <td className="tR">{fmtCurrency(row.total_itc)}</td>
                                <td className={`tR ${payClass}`}>{fmtCurrency(row.net_payable)}</td>
                                <td className="tR"><span className="g3bStatusBadge draft">Draft</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="g3bHistorySection">
                    <div className="g3bHistoryTitle">Filing History</div>
                    <div style={{ padding: "12px 0", color: "var(--color-text-4)", fontSize: 13 }}>No previous months available.</div>
                  </div>
                );
              })()}

              {/* Combined Important Notes + Disclaimer */}
              <div className="g3bSection g3bNotesSection" style={{ margin: "0 20px 16px" }}>
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Important Notes &amp; Disclaimer for CA</span>
                </div>
                <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* HSN warning already shown at top — not repeated here */}
                  {notes.missing_gstin_count > 0 && (
                    <div className="g3bNoteRow g3bNoteWarn">
                      <AlertTriangle size={14} />
                      <span><strong>{notes.missing_gstin_count} purchase invoice(s)</strong> from suppliers without GSTIN — GST paid is a cost, not claimable as ITC. RCM may apply — consult your CA.</span>
                    </div>
                  )}
                  {/* Info notes */}
                  {notes.purchase_returns_count > 0 && (
                    <div className="g3bNoteRow g3bNoteInfo">
                      <Info size={14} />
                      <span>{notes.purchase_returns_count} purchase return(s) totalling {fmtCurrency(notes.purchase_returns_amount)} reversed ITC this month.</span>
                    </div>
                  )}
                  <div className="g3bNoteRow g3bNoteInfo">
                    <Info size={14} />
                    <span>From July 2025, Table 3.2 values are <strong>auto-populated from GSTR-1</strong> on the GST portal and cannot be manually edited.</span>
                  </div>
                  {/* Disclaimer */}
                  <div className="g3bNoteRow g3bNoteWarn" style={{ marginTop: 4, borderTop: "1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 20%, transparent)", paddingTop: 8 }}>
                    <AlertTriangle size={14} />
                    <span><strong>Disclaimer:</strong> GSTR-3B <strong>cannot be revised once submitted</strong>. Verify all figures with your CA before filing. These numbers are system-generated and must be cross-checked against your books of accounts.</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </ReportCard>
      </div>
    </ReportShell>
  );
}