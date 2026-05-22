import { useState, useCallback } from "react";
import "./Gstr3bPage.css";
import "./Gstr2Page.css";
import ReportShell from "../components/reports/ReportShell.jsx";
import { ReportPageIntro, ReportCard } from "../components/reports/ReportUi.jsx";
import AppButton from "../components/ui/AppButton.jsx";
import CommonLoading from "../components/CommonLoading.jsx";
import { fmtCurrency } from "../utils/currency.js";
import { getGstr2 } from "../services/gstr2Service.js";
import { printGstr2Report } from "../print/gstr2Print.js";
import { useToast } from "../components/ToastProvider.jsx";
import {
  BarChart3, Download, TrendingUp, ShieldCheck, ShieldX,
  Banknote, AlertTriangle, RefreshCw, RotateCcw, Info, FileText,
} from "lucide-react";

const MONTH_NAMES = ["","January","February","March","April","May","June","July","August","September","October","November","December"];
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function n2(v) { const x = Number(v); return isNaN(x) ? "0.00" : x.toFixed(2); }
function n(v)  { return Math.round((parseFloat(v) || 0) * 100) / 100; }
function plural(count, word) { return `${count} ${word}${count !== 1 ? "s" : ""}`; }
function isValidGstin(g) { return g && GSTIN_REGEX.test(g.trim().toUpperCase()); }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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

function ItcBadge({ status }) {
  const map = {
    ELIGIBLE:          { cls: "g2bBadgeElig",   label: "Eligible" },
    INELIGIBLE:        { cls: "g2bBadgeInel",   label: "Ineligible" },
    AT_RISK:           { cls: "g2bBadgeRisk",   label: "At Risk" },
    REVERSED_180DAY:   { cls: "g2bBadgeRev",    label: "Reversed (180d)" },
    REVERSAL_REQUIRED: { cls: "g2bBadgeRevReq", label: "Reversal Required" },
  };
  const { cls, label } = map[status] || { cls: "g2bBadgeElig", label: status };
  return <span className={`g2bBadge ${cls}`}>{label}</span>;
}

function PayBadge({ status }) {
  const cls = status === "PAID" ? "g2bPayPaid" : status === "PARTIAL" ? "g2bPayPartial" : "g2bPayUnpaid";
  return <span className={`g2bPayBadge ${cls}`}>{status}</span>;
}

function AmtCell({ v, bold, highlight, danger, muted, ineligible }) {
  let cls = "tR";
  if (bold)      cls += " tBold";
  if (highlight) cls += " tHighlight";
  if (danger || ineligible) cls += " g2bDanger";
  if (muted)     cls += " tMuted";
  return <td className={cls}>{muted ? "—" : `₹${n2(v)}`}</td>;
}

function exportCsv(data, year, month) {
  if (!data) return;
  const biz = data.business || {}, s = data.summary || {}, cf = data.itc_carry_forward || {};
  const rows = [
    ["GSTR-2 / Purchase ITC Report"],
    [`Business: ${biz.firm_name || ""}`],
    [`GSTIN: ${biz.gst_number || ""}`],
    [`Period: ${MONTH_NAMES[month]} ${year}`],
    [`Generated: ${new Date().toLocaleString("en-IN")}`],
    [],
    ["=== SUMMARY ==="],
    ["Total Purchase Value", s.total_purchase_value, "Total Invoices", s.total_invoice_count],
    ["Total GST Paid", s.total_gst_paid],
    ["Eligible ITC", s.eligible_itc_total, "Eligible Invoices", s.eligible_invoice_count],
    ["Ineligible ITC", s.ineligible_itc_total, "Ineligible Invoices", s.ineligible_invoice_count],
    ["ITC Reversed", s.reversal_total, "Returns", s.reversal_count],
    ["Net ITC Claimable", s.net_itc_claimable],
    ["ITC at Risk (180d)", s.itc_at_risk, "Risk Invoices", s.risk_invoice_count],
    [],
    ["=== ITC CARRY FORWARD ==="],
    ["", "CGST", "SGST", "IGST", "CESS", "Total"],
    ["Opening Balance", cf.opening?.cgst, cf.opening?.sgst, cf.opening?.igst, cf.opening?.cess, cf.opening?.total],
    ["ITC Earned (Eligible)", cf.earned?.cgst, cf.earned?.sgst, cf.earned?.igst, cf.earned?.cess, cf.earned?.total],
    ["GST Paid (Ineligible)", s.total_cgst_paid - (cf.earned?.cgst||0), s.total_sgst_paid - (cf.earned?.sgst||0), s.total_igst_paid - (cf.earned?.igst||0), "0.00", s.ineligible_itc_total],
    ["ITC Reversed", cf.reversed?.cgst, cf.reversed?.sgst, cf.reversed?.igst, cf.reversed?.cess, cf.reversed?.total],
    ["Net ITC Claimable", cf.net?.cgst, cf.net?.sgst, cf.net?.igst, cf.net?.cess, cf.net?.total],
    [],
    ["=== SUPPLIER-WISE ITC SUMMARY ==="],
    ["#", "Supplier Name", "GSTIN", "Invoices", "Purchase Value", "CGST ITC", "SGST ITC", "IGST ITC", "CESS ITC", "Total ITC", "Status"],
    ...(data.supplier_summary || []).map((r, i) => [i+1, r.vendor_name, r.vendor_gstin||"—", r.invoice_count, r.purchase_value, r.cgst_itc, r.sgst_itc, r.igst_itc, r.cess_itc||0, r.total_itc, r.itc_status]),
    [],
    ["=== INVOICE-WISE ITC DETAIL ==="],
    ["#", "Invoice No", "Date", "Supplier", "GSTIN", "HSN Code", "Supply Type", "Taxable Value", "CGST", "SGST", "IGST", "Total GST", "ITC Status", "Payment Status", "Days to Reversal"],
    ...(data.invoice_detail || []).map((r, i) => [i+1, r.invoice_number, fmtDate(r.invoice_date), r.vendor_name, r.vendor_gstin||"—", r.hsn_code||"Missing", r.supply_type, r.taxable_value, r.cgst_itc, r.sgst_itc, r.igst_itc, r.total_gst, r.itc_status, r.payment_status, r.days_to_reversal]),
    [],
    ["=== ITC REVERSALS ==="],
    ["#", "Return No", "Return Date", "Original Invoice", "Supplier", "CGST Reversed", "SGST Reversed", "IGST Reversed", "Total Reversed", "Return Amount"],
    ...(data.reversals || []).map((r, i) => [i+1, r.return_number, fmtDate(r.return_date), r.original_invoice_number, r.vendor_name, r.cgst_reversed, r.sgst_reversed, r.igst_reversed, r.total_reversed, r.total_return_amount]),
    [],
    ["=== BLOCKED / INELIGIBLE ITC ==="],
    ["#", "Invoice No", "Date", "Supplier", "GSTIN Status", "Purchase Value", "CGST Paid", "SGST Paid", "IGST Paid", "CESS Paid", "Total GST Paid", "Reason Blocked", "RCM Applicable"],
    ...(data.blocked_itc || []).map((r, i) => [i+1, r.invoice_number, fmtDate(r.invoice_date), r.vendor_name, r.vendor_gstin||"No GSTIN", r.purchase_value, r.cgst_paid||0, r.sgst_paid||0, r.igst_paid||0, r.cess_paid||0, r.gst_paid, r.reason_blocked, r.rcm_applicable ? "Yes — Check with CA" : "No"]),
    [],
    ["=== 180-DAY PAYMENT RISK ==="],
    ["#", "Invoice No", "Supplier", "Invoice Date", "Reversal Due Date", "Days Remaining", "Taxable Value", "ITC at Risk", "Payment Status"],
    ...(data.risk_invoices || []).map((r, i) => [i+1, r.invoice_number, r.vendor_name, fmtDate(r.invoice_date), fmtDate(r.reversal_due_date), r.days_remaining, r.taxable_value, r.itc_at_risk, r.payment_status]),
  ];
  const csv = rows.map(r => r.map(c => `"${String(c??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `ITC_Report_${MONTH_NAMES[month]}_${year}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function Gstr2Page() {
  const { showToast } = useToast();
  const now = new Date();
  const [year,        setYear]        = useState(now.getFullYear());
  const [month,       setMonth]       = useState(now.getMonth() + 1);
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [fetched,     setFetched]     = useState(false);
  const [generatedAt, setGeneratedAt] = useState(null);

  const fetchReport = useCallback(async () => {
    setLoading(true); setFetched(false);
    try {
      const resp = await getGstr2({ year, month });
      if (resp.json?.ok) {
        setData(resp.json.data);
        setFetched(true);
        setGeneratedAt(new Date());
      } else {
        showToast("error", "Failed to load ITC Report", { message: resp.json?.error?.message || "Please try again." });
      }
    } finally { setLoading(false); }
  }, [year, month, showToast]);

  const s   = data?.summary           || {};
  const cf  = data?.itc_carry_forward || {};
  const biz = data?.business          || {};

  const allCgst = n((data?.supplier_summary || []).reduce((acc, r) => acc + n(r.cgst_itc), 0));
  const allSgst = n((data?.supplier_summary || []).reduce((acc, r) => acc + n(r.sgst_itc), 0));
  const allIgst = n((data?.supplier_summary || []).reduce((acc, r) => acc + n(r.igst_itc), 0));
  const allCess = n((data?.supplier_summary || []).reduce((acc, r) => acc + n(r.cess_itc), 0));

  const inelCgst = n(n(s.total_cgst_paid) - n(cf.earned?.cgst));
  const inelSgst = n(n(s.total_sgst_paid) - n(cf.earned?.sgst));
  const inelIgst = n(n(s.total_igst_paid) - n(cf.earned?.igst));

  const gstinValid = biz.gst_number ? isValidGstin(biz.gst_number) : null;

  const allIneligible = fetched && data
    && (data.supplier_summary || []).length > 0
    && (data.supplier_summary || []).every(r => r.itc_status === "INELIGIBLE");

  const allGstIneligible = n(s.eligible_itc_total) === 0 && n(s.total_gst_paid) > 0;

  // Net ITC color: green when positive, amber when zero
  const netItcColor = n(cf.net?.total) > 0 ? "#059669" : "#b45309";

  return (
    <ReportShell>
      <div className="pageWrap">
        <ReportPageIntro
          title="GSTR-2 — Purchase ITC Report"
          subtitle="Monthly purchase-side GST report — track ITC eligibility, reversals, and 180-day payment risk. Share with your CA for GSTR-3B Section 4 filing."
        />

        <ReportCard busy={loading}>
          {/* Filter bar */}
          <div className="g3bFilterBar">
            <div className="g3bFilterRow">
              <div className="g3bFilterField">
                <label className="g3bFieldLabel">Month</label>
                <select className="g3bSelect" value={month} onChange={e => { setMonth(Number(e.target.value)); setFetched(false); setData(null); }}>
                  {buildMonthOptions().map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="g3bFilterField">
                <label className="g3bFieldLabel">Year</label>
                <select className="g3bSelect" value={year} onChange={e => { setYear(Number(e.target.value)); setFetched(false); setData(null); }}>
                  {buildYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="g3bFilterActions">
                <AppButton variant="primary" icon={<BarChart3 size={15}/>} onClick={fetchReport} disabled={loading}>
                  {loading ? "Loading…" : "Generate Report"}
                </AppButton>
                {fetched && data && (
                  <>
                    <AppButton variant="secondary" icon={<RefreshCw size={15}/>} onClick={fetchReport} disabled={loading}>Refresh</AppButton>
                    <AppButton variant="secondary" icon={<FileText size={15}/>} onClick={() => printGstr2Report({ data, year, month })}>Print PDF</AppButton>
                    <AppButton variant="secondary" icon={<Download size={15}/>} onClick={() => exportCsv(data, year, month)}>Export CSV</AppButton>
                  </>
                )}
              </div>
            </div>
          </div>

          {loading && (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <CommonLoading variant="inline" size="md" text="Generating ITC report…" />
            </div>
          )}

          {!loading && !fetched && (
            <div className="g3bEmpty">
              <div className="g3bEmptyIcon"><BarChart3 size={32}/></div>
              <div className="g3bEmptyTitle">Select month and year, then click Generate Report</div>
              <div className="g3bEmptySub">GSTR-2 shows your monthly purchase ITC — eligible ITC from registered suppliers, reversals from returns, and 180-day payment risk. Share with your CA for GSTR-3B Section 4.</div>
            </div>
          )}

          {!loading && fetched && data && (
            <>
              {/* Issue 1: HSN banner = red (critical), GSTIN banner = amber (financial loss) */}
              {s.missing_hsn_count > 0 && (
                <div className="g2bCriticalBanner">
                  <AlertTriangle size={16}/>
                  <div>
                    <strong>Action Required — {s.missing_hsn_count} Purchase Line {s.missing_hsn_count === 1 ? "Item" : "Items"} Missing HSN Code{s.missing_hsn_count !== 1 ? "s" : ""}</strong>
                    <div style={{ fontSize: 12, marginTop: 2 }}>HSN codes are mandatory for ITC claims. Update these items in your purchase invoices before sharing with CA.</div>
                  </div>
                </div>
              )}
              {s.missing_gstin_count > 0 && (
                <div className="g2bWarnBanner">
                  <AlertTriangle size={16}/>
                  <div>
                    <strong>{plural(s.missing_gstin_count, "Supplier")} Without GSTIN — <span className="g2bWarnAmt">₹{n2(s.ineligible_itc_total)}</span> ITC Blocked</strong>
                    <div style={{ fontSize: 12, marginTop: 2 }}>Add supplier GSTIN in the Suppliers module to recover ITC on future purchases from these suppliers.</div>
                  </div>
                </div>
              )}

              {/* Business header */}
              <div className="g2bBizCard">
                <div className="g3bBizLeft">
                  <div className="g3bBizSectionLabel">Business Details</div>
                  {biz.firm_name && <div className="g3bBizName">{biz.firm_name}</div>}
                  {biz.gst_number
                    ? (
                      <div className="g3bBizGstin">
                        GSTIN: <strong>{biz.gst_number}</strong>
                        {gstinValid === false && (
                          <span className="g2bGstinInvalidBadge" title="GSTIN does not match standard 15-character format — verify with your CA">
                            <AlertTriangle size={11}/> Invalid format
                          </span>
                        )}
                      </div>
                    )
                    : <div className="g3bBizGstin g3bGstinMissing"><AlertTriangle size={12}/> GSTIN not set — add it in your profile</div>}
                </div>
                <div className="g3bBizRight">
                  <span className="g3bPeriodLabel">{MONTH_NAMES[month]} {year}</span>
                </div>
              </div>

              {generatedAt && (
                <div className="g3bGeneratedBar">
                  <span>Generated: {generatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — {generatedAt.toLocaleDateString()}</span>
                  <span className="g3bGeneratedNote">New invoices added after this time won't appear — click <strong>Refresh</strong> to recalculate.</span>
                </div>
              )}

              {/* Summary cards — Issues 2, 3, 4: correct icon/color logic */}
              <div className="g2bSummaryRow">
                <div className="g3bStatCard">
                  <div className="g3bStatIcon" style={{ "--ic": "var(--color-primary)" }}><Banknote size={18}/></div>
                  <div className="g3bStatLabel">Total Purchase Value</div>
                  <div className="g3bStatValue">{fmtCurrency(s.total_purchase_value)}</div>
                  <div className="g3bStatNote">{plural(s.total_invoice_count, "invoice")}</div>
                </div>
                <div className="g3bStatCard">
                  <div className="g3bStatIcon" style={{ "--ic": "#f59e0b" }}><TrendingUp size={18}/></div>
                  <div className="g3bStatLabel">Total GST Paid</div>
                  <div className="g3bStatValue" style={{ color: allGstIneligible ? "#b45309" : "var(--color-text)" }}>{fmtCurrency(s.total_gst_paid)}</div>
                  <div className="g3bStatNote">{allGstIneligible ? "All GST paid is ineligible — additional cost" : "Eligible + Ineligible combined"}</div>
                </div>
                {/* Issue 3: Eligible ITC — amber/ShieldX when zero (warning), green/ShieldCheck when positive */}
                <div className="g3bStatCard">
                  <div className="g3bStatIcon" style={{ "--ic": Number(s.eligible_itc_total) > 0 ? "#10b981" : "#f59e0b" }}>
                    {Number(s.eligible_itc_total) > 0 ? <ShieldCheck size={18}/> : <ShieldX size={18}/>}
                  </div>
                  <div className="g3bStatLabel">Eligible ITC</div>
                  <div className="g3bStatValue" style={{ color: Number(s.eligible_itc_total) > 0 ? "#059669" : "#b45309" }}>{fmtCurrency(s.eligible_itc_total)}</div>
                  <div className="g3bStatNote">{Number(s.eligible_itc_total) === 0 ? "No eligible purchases this period" : `${plural(s.eligible_invoice_count, "eligible invoice")}`}</div>
                </div>
                {/* Issue 2: Blocked ITC — red border via g2bBlockedCard */}
                <div className="g3bStatCard g2bBlockedCard">
                  <div className="g3bStatIcon" style={{ "--ic": "#ef4444" }}><ShieldX size={18}/></div>
                  <div className="g3bStatLabel">Blocked / Ineligible ITC</div>
                  <div className="g3bStatValue" style={{ color: "#dc2626" }}>{fmtCurrency(s.ineligible_itc_total)}</div>
                  <div className="g3bStatNote">{plural(s.ineligible_invoice_count, "ineligible invoice")} — additional cost</div>
                </div>
                {/* Issue 4: ITC Reversed — amber when reversals exist, grey when zero */}
                <div className="g3bStatCard">
                  <div className="g3bStatIcon" style={{ "--ic": Number(s.reversal_total) > 0 ? "#f59e0b" : "#9ca3af" }}><RotateCcw size={18}/></div>
                  <div className="g3bStatLabel">ITC Reversed</div>
                  <div className="g3bStatValue" style={{ color: Number(s.reversal_total) > 0 ? "#b45309" : "var(--color-text)" }}>{fmtCurrency(s.reversal_total)}</div>
                  <div className="g3bStatNote">{plural(s.reversal_count, "return")}</div>
                </div>
                <div className="g3bStatCard g3bStatCardPrimary">
                  <div className="g3bStatIcon" style={{ "--ic": "var(--color-primary)" }}><ShieldCheck size={18}/></div>
                  <div className="g3bStatLabel">Net ITC Claimable</div>
                  <div className={`g3bStatValueLg ${Number(s.net_itc_claimable) > 0 ? "g2bNetPositive" : "g2bNetZero"}`}>{fmtCurrency(s.net_itc_claimable)}</div>
                  <div className="g3bStatNote">{Number(s.net_itc_claimable) === 0 ? "Nothing to offset against GST payable" : "After reversals + carry-forward"}</div>
                </div>
              </div>

              {/* ITC Carry-Forward Strip */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">ITC Carry-Forward Summary</span>
                </div>
                <div className="g3bTableScroll">
                  <table className="g3bTable">
                    <thead>
                      <tr>
                        <th></th>
                        <th className="tR">CGST</th><th className="tR">SGST</th>
                        <th className="tR">IGST</th><th className="tR">CESS</th><th className="tR">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Opening Balance (prev month)</td>
                        <AmtCell v={cf.opening?.cgst}/><AmtCell v={cf.opening?.sgst}/>
                        <AmtCell v={cf.opening?.igst}/><AmtCell v={cf.opening?.cess}/><AmtCell v={cf.opening?.total} bold/>
                      </tr>
                      <tr>
                        <td>ITC Earned This Month <span className="g2bBadge g2bBadgeElig" style={{ marginLeft: 6 }}>Eligible Only</span></td>
                        <AmtCell v={cf.earned?.cgst}/><AmtCell v={cf.earned?.sgst}/>
                        <AmtCell v={cf.earned?.igst}/><AmtCell v={cf.earned?.cess}/><AmtCell v={cf.earned?.total} bold/>
                      </tr>
                      {n(s.ineligible_itc_total) > 0 && (
                        <tr>
                          <td><span style={{ color: "#dc2626" }}>GST Paid (Ineligible — not claimable)</span></td>
                          <td className="tR g2bDanger">₹{n2(inelCgst)}</td>
                          <td className="tR g2bDanger">₹{n2(inelSgst)}</td>
                          <td className="tR g2bDanger">₹{n2(inelIgst)}</td>
                          <td className="tR g2bDanger">₹0.00</td>
                          <td className="tR tBold g2bDanger">₹{n2(s.ineligible_itc_total)}</td>
                        </tr>
                      )}
                      <tr>
                        <td>ITC Reversed This Month</td>
                        <AmtCell v={cf.reversed?.cgst}/><AmtCell v={cf.reversed?.sgst}/>
                        <AmtCell v={cf.reversed?.igst}/><AmtCell v={cf.reversed?.cess}/><AmtCell v={cf.reversed?.total} bold/>
                      </tr>
                      {/* Issue 5: Net ITC Claimable row — bold + colored values (green/amber) */}
                      <tr className="g2bNetRow">
                        <td className="tBold">Net ITC Claimable</td>
                        <td className="tR tBold" style={{ color: netItcColor }}>₹{n2(cf.net?.cgst)}</td>
                        <td className="tR tBold" style={{ color: netItcColor }}>₹{n2(cf.net?.sgst)}</td>
                        <td className="tR tBold" style={{ color: netItcColor }}>₹{n2(cf.net?.igst)}</td>
                        <td className="tR tBold" style={{ color: netItcColor }}>₹{n2(cf.net?.cess)}</td>
                        <td className="tR g2bNetTotalCell" style={{ color: netItcColor, fontWeight: 800 }}>₹{n2(cf.net?.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* Issue 6: Info box with left accent border */}
                {allIneligible && (
                  <div className="g3bNoteRow g3bNoteWarn g2bNoteAccent" style={{ margin: "8px 18px 12px", borderRadius: 8 }}>
                    <Info size={14}/>
                    <span>Net ITC Claimable = ₹0.00 because all purchases this period are from suppliers without GSTIN. The ₹{n2(s.total_gst_paid)} shown above is GST paid but <strong>not claimable</strong> — it is an additional business cost.</span>
                  </div>
                )}
              </div>

              {/* Section 1: Supplier-wise ITC summary */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Section 1 — ITC Summary by Supplier</span>
                  <span className="g3bSectionBadge">{plural((data.supplier_summary || []).length, "supplier")}</span>
                </div>
                {(data.supplier_summary || []).length === 0 ? (
                  <div className="g3bEmpty" style={{ padding: "24px" }}><div className="g3bEmptyTitle">No purchase invoices found for this period.</div></div>
                ) : (
                  <div className="g3bTableScroll">
                    <table className="g3bTable">
                      <thead>
                        <tr>
                          <th>#</th><th>Supplier Name</th><th>Supplier GSTIN</th>
                          <th className="tR">Invoices</th><th className="tR">Purchase Value</th>
                          <th className="tR">CGST ITC</th><th className="tR">SGST ITC</th>
                          <th className="tR">IGST ITC</th><th className="tR">CESS ITC</th>
                          <th className="tR">Total ITC</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.supplier_summary || []).map((row, i) => (
                          <tr key={row.vendor_id}>
                            <td>{i + 1}</td>
                            {/* Issue 7: supplier link uses → not ↓ */}
                            <td>
                              <button
                                className="g2bSupplierLink"
                                onClick={() => document.getElementById("g2bSec2")?.scrollIntoView({ behavior: "smooth" })}
                                title={`View invoices for ${row.vendor_name} in Section 2`}
                              >
                                {row.vendor_name} →
                              </button>
                            </td>
                            <td className="g2bMono">
                              {row.vendor_gstin || <span className="g2bNoGstin">No GSTIN</span>}
                              {row.is_composition_dealer && <span className="g2bCompTag">Composition</span>}
                            </td>
                            <td className="tR">{row.invoice_count}</td>
                            {/* Issue 9: Purchase Value in total row uses tR tBold (black), not tHighlight */}
                            <AmtCell v={row.purchase_value}/>
                            {/* Issue 8: CESS ITC — ineligible prop ensures red for ineligible rows */}
                            <AmtCell v={row.cgst_itc} ineligible={row.itc_status === "INELIGIBLE"}/>
                            <AmtCell v={row.sgst_itc} ineligible={row.itc_status === "INELIGIBLE"}/>
                            <AmtCell v={row.igst_itc} ineligible={row.itc_status === "INELIGIBLE"}/>
                            <AmtCell v={row.cess_itc} ineligible={row.itc_status === "INELIGIBLE"}/>
                            <AmtCell v={row.total_itc} bold ineligible={row.itc_status === "INELIGIBLE"}/>
                            <td><ItcBadge status={row.itc_status}/></td>
                          </tr>
                        ))}
                        <tr className="tTotal">
                          <td colSpan={4} className="tBold">{allIneligible ? "Total GST Paid (All — None Claimable)" : "Total (All Suppliers)"}</td>
                          {/* Issue 9: Purchase Value uses tR tBold (black), not tHighlight (purple) */}
                          <td className="tR tBold">₹{n2(s.total_purchase_value)}</td>
                          <AmtCell v={allCgst} bold ineligible={n(s.eligible_itc_total) === 0 && allCgst > 0}/>
                          <AmtCell v={allSgst} bold ineligible={n(s.eligible_itc_total) === 0 && allSgst > 0}/>
                          <AmtCell v={allIgst} bold ineligible={n(s.eligible_itc_total) === 0 && allIgst > 0}/>
                          <AmtCell v={allCess} bold ineligible={n(s.eligible_itc_total) === 0 && allCess > 0}/>
                          <AmtCell v={n(allCgst) + n(allSgst) + n(allIgst) + n(allCess)} bold highlight/>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {/* Issue 6: Note box with left accent border via g2bNoteAccent */}
                <div className="g3bNoteRow g3bNoteWarn g2bNoteAccent" style={{ margin: "8px 18px 12px", borderRadius: 8 }}>
                  <Info size={14}/>
                  <span>
                    {allIneligible
                      ? <>No eligible suppliers this period — all GST shown in <strong style={{ color: "#dc2626" }}>red</strong> is an additional cost, not claimable as ITC. Net ITC Claimable = ₹0.00.</>
                      : <>Ineligible ITC amounts shown in <strong style={{ color: "#dc2626" }}>red</strong> are for reference only — these are additional costs, not claimable as ITC. Total row includes all GST paid (eligible + ineligible).</>}
                  </span>
                </div>
              </div>

              {/* Section 2: Invoice-wise ITC detail */}
              <div className="g3bSection" id="g2bSec2">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Section 2 — Invoice-wise ITC Detail</span>
                  <span className="g3bSectionBadge">{plural((data.invoice_detail || []).length, "invoice")}</span>
                </div>
                <div className="g3bTableScroll">
                  <table className="g3bTable">
                    <thead>
                      <tr>
                        <th>#</th><th>Invoice No</th><th>Date</th><th>Supplier</th><th>GSTIN</th>
                        <th>HSN Code</th><th>Supply Type</th>
                        <th className="tR">Taxable Value</th><th className="tR">CGST</th>
                        <th className="tR">SGST</th><th className="tR">IGST</th>
                        <th>ITC Status</th><th>Payment</th>
                        <th className="tR" title="Days remaining before 180-day ITC reversal deadline. N/A for ineligible invoices.">Days to Reversal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.invoice_detail || []).map((row, i) => (
                        <tr key={row.invoice_id} className={row.missing_hsn_count > 0 ? "g2bWarnRow" : ""}>
                          <td>{i + 1}</td>
                          <td className="tBold">
                            {row.invoice_number}
                            {row.missing_hsn_count > 0 && (
                              <span title={`${row.missing_hsn_count} item(s) missing HSN code — required for ITC claims`} style={{ marginLeft: 4, cursor: "help" }}>
                                <AlertTriangle size={12} style={{ color: "#f59e0b", verticalAlign: "middle" }}/>
                              </span>
                            )}
                            {row.rcm_applicable && <span className="g2bRcmTag">RCM</span>}
                          </td>
                          <td>{fmtDate(row.invoice_date)}</td>
                          <td>{row.vendor_name}</td>
                          <td className="g2bMono">{row.vendor_gstin || <span className="g2bNoGstin">No GSTIN</span>}</td>
                          <td>
                            {row.hsn_code
                              ? <span className="g2bHsnCell">{row.hsn_code}</span>
                              : <span className="g2bHsnMissing" title="HSN code missing — required for ITC claims">Missing ⚠</span>}
                          </td>
                          <td className="g2bSupplyType">
                            {row.supply_type === "INTER_STATE" ? "Inter-State" : "Intra-State"}
                          </td>
                          <AmtCell v={row.taxable_value}/>
                          {/* Issue 12: All tax columns (CGST/SGST/IGST) use same ineligible color treatment */}
                          <AmtCell v={row.cgst_itc} ineligible={row.itc_status === "INELIGIBLE"}/>
                          <AmtCell v={row.sgst_itc} ineligible={row.itc_status === "INELIGIBLE"}/>
                          <AmtCell v={row.igst_itc} ineligible={row.itc_status === "INELIGIBLE"}/>
                          <td><ItcBadge status={row.itc_status}/></td>
                          {/* Issue 11: PAYMENT N/A uses badge, DAYS TO REVERSAL N/A uses muted text — visually distinct */}
                          <td>
                            {row.itc_status === "INELIGIBLE"
                              ? <span className="g2bNaBadge" title="Payment tracking not applicable — ITC already ineligible due to missing GSTIN">N/A — Ineligible</span>
                              : <PayBadge status={row.payment_status}/>}
                          </td>
                          <td className="tR">
                            {row.itc_status === "INELIGIBLE"
                              ? <span className="g2bNaDays" title="Not applicable — if supplier GSTIN is added later, 180-day clock runs from invoice date">N/A</span>
                              : (
                                <span style={{ fontWeight: 600, color: row.days_to_reversal < 0 ? "#dc2626" : row.days_to_reversal <= 30 ? "#b45309" : "#059669" }}>
                                  {row.days_to_reversal < 0 ? `${Math.abs(row.days_to_reversal)}d overdue` : `${row.days_to_reversal}d`}
                                </span>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Issue 10: Legend split into separate bullet points for readability */}
                <div className="g2bLegend">
                  <div className="g2bLegendItem"><span style={{ color: "#f59e0b" }}>⚠</span> Missing HSN code — required for ITC claims</div>
                  <div className="g2bLegendItem"><span className="g2bRcmTag" style={{ fontSize: 10 }}>RCM</span> Reverse Charge Mechanism — consult CA</div>
                  <div className="g2bLegendItem"><span style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>Yellow row</span> Invoice has missing HSN codes</div>
                  <div className="g2bLegendItem"><span className="g2bNaBadge" style={{ fontSize: 10 }}>N/A — Ineligible</span> Payment not tracked (ITC ineligible)</div>
                  <div className="g2bLegendItem"><span className="g2bNaDays">N/A</span> 180-day clock not applicable (no GSTIN)</div>
                  <div className="g2bLegendItem" style={{ color: "var(--color-text-4)" }}>Taxable Value excludes GST</div>
                </div>
              </div>

              {/* Section 3: ITC reversals — always shown */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Section 3 — ITC Reversals (Purchase Returns)</span>
                  <span className="g3bSectionBadge">{plural((data.reversals || []).length, "return")}</span>
                </div>
                {(data.reversals || []).length === 0 ? (
                  <div className="g3bEmpty" style={{ padding: "20px 24px" }}>
                    <div className="g3bEmptyTitle" style={{ color: "#059669" }}>✓ No ITC reversals this period</div>
                    <div className="g3bEmptySub">No confirmed purchase returns in {MONTH_NAMES[month]} {year}.</div>
                  </div>
                ) : (
                  <div className="g3bTableScroll">
                    <table className="g3bTable">
                      <thead>
                        <tr>
                          <th>#</th><th>Return No</th><th>Return Date</th><th>Original Invoice</th>
                          <th>Supplier</th><th>Type</th>
                          <th className="tR">CGST Reversed</th><th className="tR">SGST Reversed</th>
                          <th className="tR">IGST Reversed</th><th className="tR">Total Reversed</th>
                          <th className="tR">Return Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.reversals.map((row, i) => (
                          <tr key={row.return_id}>
                            <td>{i + 1}</td>
                            <td className="tBold">{row.return_number}</td>
                            <td>{fmtDate(row.return_date)}</td>
                            <td>{row.original_invoice_number}</td>
                            <td>{row.vendor_name}</td>
                            <td><span className="g2bBadge g2bBadgeRev">Purchase Return</span></td>
                            <AmtCell v={row.cgst_reversed}/>
                            <AmtCell v={row.sgst_reversed}/>
                            <AmtCell v={row.igst_reversed}/>
                            <AmtCell v={row.total_reversed} bold/>
                            <AmtCell v={row.total_return_amount}/>
                          </tr>
                        ))}
                        <tr className="tTotal">
                          <td colSpan={6} className="tBold">Total Reversed</td>
                          <AmtCell v={cf.reversed?.cgst} bold/>
                          <AmtCell v={cf.reversed?.sgst} bold/>
                          <AmtCell v={cf.reversed?.igst} bold/>
                          <AmtCell v={s.reversal_total} bold highlight/>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section 4: Blocked / Ineligible ITC — always shown */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Section 4 — Blocked / Ineligible ITC</span>
                  <span className="g3bSectionBadge">{plural((data.blocked_itc || []).length, "invoice")}</span>
                </div>
                {(data.blocked_itc || []).length === 0 ? (
                  <div className="g3bEmpty" style={{ padding: "20px 24px" }}>
                    <div className="g3bEmptyTitle" style={{ color: "#059669" }}>✓ No blocked ITC this period</div>
                    <div className="g3bEmptySub">All purchases are from GST-registered suppliers.</div>
                  </div>
                ) : (
                  <>
                    {/* Issue 17: Warning banner outside the card, above the table */}
                    <div className="g2bBlockedWarn">
                      <AlertTriangle size={14}/>
                      <span>Total blocked ITC: <strong style={{ color: "#dc2626" }}>₹{n2(data.blocked_itc_total)}</strong> — This is an additional cost to your business, not recoverable as ITC.</span>
                    </div>
                    <div className="g3bTableScroll">
                      <table className="g3bTable">
                        <thead>
                          <tr>
                            <th>#</th><th>Invoice No</th><th>Date</th><th>Supplier</th>
                            <th>GSTIN Status</th><th className="tR">Purchase Value</th>
                            <th className="tR">CGST Paid</th><th className="tR">SGST Paid</th>
                            <th className="tR">IGST Paid</th><th className="tR">CESS Paid</th>
                            <th className="tR">Total GST</th><th>Reason Blocked</th><th>RCM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.blocked_itc.map((row, i) => (
                            <tr key={row.invoice_id}>
                              <td>{i + 1}</td>
                              <td className="tBold">{row.invoice_number}</td>
                              <td>{fmtDate(row.invoice_date)}</td>
                              <td>{row.vendor_name}</td>
                              <td>
                                {row.vendor_gstin ? <span className="g2bMono">{row.vendor_gstin}</span> : <span className="g2bNoGstin">No GSTIN</span>}
                                {row.is_composition_dealer && <span className="g2bCompTag">Composition</span>}
                              </td>
                              <AmtCell v={row.purchase_value}/>
                              <AmtCell v={row.cgst_paid} danger/>
                              <AmtCell v={row.sgst_paid} danger/>
                              <AmtCell v={row.igst_paid} danger/>
                              <AmtCell v={row.cess_paid} danger/>
                              <AmtCell v={row.gst_paid} bold danger/>
                              <td style={{ fontSize: 12 }}>{row.reason_blocked}</td>
                              {/* Issue 16: RCM uses styled badge for consistency */}
                              <td>
                                {row.rcm_applicable
                                  ? <span className="g2bRcmTag">Check with CA</span>
                                  : <span className="g2bBadge g2bBadgeNoRcm">No RCM</span>}
                              </td>
                            </tr>
                          ))}
                          <tr className="tTotal">
                            <td colSpan={6} className="tBold">Total Blocked ITC</td>
                            <td className="tR tBold g2bDanger">₹{n2((data.blocked_itc || []).reduce((a, r) => a + n(r.cgst_paid), 0))}</td>
                            <td className="tR tBold g2bDanger">₹{n2((data.blocked_itc || []).reduce((a, r) => a + n(r.sgst_paid), 0))}</td>
                            <td className="tR tBold g2bDanger">₹{n2((data.blocked_itc || []).reduce((a, r) => a + n(r.igst_paid), 0))}</td>
                            <td className="tR tBold g2bDanger">₹{n2((data.blocked_itc || []).reduce((a, r) => a + n(r.cess_paid), 0))}</td>
                            <AmtCell v={data.blocked_itc_total} bold danger/>
                            <td colSpan={2}></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="g2bGstinAction">
                      <Info size={13}/>
                      <span>To recover ITC on future purchases from these suppliers — add their GSTIN in the <strong>Suppliers module</strong> (Suppliers → Edit Supplier → GSTIN field).</span>
                    </div>
                  </>
                )}
              </div>

              {/* Section 5: 180-day payment risk — always shown */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Section 5 — 180-Day Payment Risk</span>
                  <span className="g3bSectionBadge">{plural((data.risk_invoices || []).length, "invoice")}</span>
                </div>
                {(data.risk_invoices || []).length === 0 ? (
                  <div className="g3bEmpty" style={{ padding: "20px 24px" }}>
                    <div className="g3bEmptyTitle" style={{ color: "#059669" }}>✓ No payment risk this period</div>
                    {/* Issue 18: Shorter, cleaner sub-text */}
                    <div className="g3bEmptySub">No invoices at risk this period.</div>
                  </div>
                ) : (
                  <>
                    <div className="g3bNoteRow" style={{ margin: "0 18px 12px", borderRadius: 8, background: "#fef3c7", borderColor: "#f59e0b", color: "#92400e" }}>
                      <AlertTriangle size={14}/>
                      <span>Pay these invoices before the reversal date to retain ITC. Total ITC at risk: <strong style={{ color: "#dc2626" }}>₹{n2(data.risk_itc_total)}</strong></span>
                    </div>
                    <div className="g3bTableScroll">
                      <table className="g3bTable">
                        <thead>
                          <tr>
                            <th>#</th><th>Invoice No</th><th>Supplier</th><th>Invoice Date</th>
                            <th>Reversal Due Date</th><th className="tR">Days Remaining</th>
                            <th className="tR">Taxable Value</th><th className="tR">ITC at Risk</th><th>Payment Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.risk_invoices.map((row, i) => (
                            <tr key={row.invoice_id} className={row.days_remaining < 0 ? "g2bRiskRed" : row.days_remaining <= 30 ? "g2bRiskAmber" : "g2bRiskGreen"}>
                              <td>{i + 1}</td>
                              <td className="tBold">{row.invoice_number}</td>
                              <td>{row.vendor_name}</td>
                              <td>{fmtDate(row.invoice_date)}</td>
                              <td>{fmtDate(row.reversal_due_date)}</td>
                              <td className="tR">
                                <span style={{ fontWeight: 700, color: row.days_remaining < 0 ? "#dc2626" : row.days_remaining <= 30 ? "#b45309" : "#059669" }}>
                                  {row.days_remaining < 0 ? `${Math.abs(row.days_remaining)}d overdue` : `${row.days_remaining}d`}
                                </span>
                              </td>
                              <AmtCell v={row.taxable_value}/>
                              <AmtCell v={row.itc_at_risk} danger bold/>
                              <td><PayBadge status={row.payment_status}/></td>
                            </tr>
                          ))}
                          <tr className="tTotal">
                            <td colSpan={7} className="tBold">Total ITC at Risk</td>
                            <AmtCell v={data.risk_itc_total} bold danger/>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {/* Important Notes — Issue 19: no info icon in heading, Issue 20: consistent disclaimer styling */}
              <div className="g3bSection g2bNotesSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Important Notes for CA</span>
                </div>
                <div style={{ padding: "12px 18px 4px" }}>
                  <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>ITC can only be claimed from GST-registered suppliers with valid GSTIN.</li>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>ITC must be reversed if supplier invoice is unpaid beyond 180 days.</li>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>Purchase returns automatically reverse ITC on returned quantities.</li>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>RCM purchases may allow ITC — consult your CA for specific goods.</li>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>This report is system-generated. Cross-check with your actual purchase invoices and books of accounts before sharing with CA.</li>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>IGST ITC can be used to pay IGST, then CGST, then SGST in that order.</li>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>Purchases from unregistered suppliers for specific notified goods (including certain medicines) may attract Reverse Charge Mechanism (RCM) — consult your CA.</li>
                  </ol>
                </div>
                {/* Issue 20: Legal Disclaimer — consistent amber box, no red heading */}
                <div className="g3bDisclaimer" style={{ margin: "8px 18px 16px" }}>
                  <AlertTriangle size={14}/>
                  <span style={{ fontSize: 12 }}>
                    <strong>Legal Disclaimer:</strong> ITC claims in GSTR-3B are verified against supplier GSTR-1 filings on the GST portal. Mismatches may result in department notices. GSTR-3B cannot be revised once filed — verify all figures carefully before sharing with your CA.
                  </span>
                </div>
              </div>
            </>
          )}
        </ReportCard>
      </div>
    </ReportShell>
  );
}