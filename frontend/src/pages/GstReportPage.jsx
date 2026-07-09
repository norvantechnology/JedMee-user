import { useState, useCallback } from "react";
import "./GstReportPage.css";
import "./Gstr3bPage.css";
import "./Gstr2Page.css";
import ReportShell from "../components/reports/ReportShell.jsx";
import { ReportPageIntro, ReportCard } from "../components/reports/ReportUi.jsx";
import AppButton from "../components/ui/AppButton.jsx";
import CommonLoading from "../components/CommonLoading.jsx";
import { apiGet } from "../services/apiClient.js";
import { printGstReport } from "../print/gstReportPrint.js";
import { useToast } from "../components/ToastProvider.jsx";
import {
  BarChart3, Download, FileText, RefreshCw, AlertTriangle, Info,
  Building2, Users, Banknote, Receipt,
} from "lucide-react";

const MONTH_NAMES = ["","January","February","March","April","May","June","July","August","September","October","November","December"];
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function n2(v) { const x = Number(v); return isNaN(x) ? "0.00" : x.toFixed(2); }
function fmtAmt(v) { return `₹${n2(v)}`; }
function isValidGstin(g) { return g && GSTIN_REGEX.test(g.trim().toUpperCase()); }
function fmtDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
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

function GstinChip({ gstin, issue }) {
  if (!gstin) return <span style={{ color: "#ef4444", fontSize: 12 }}>-</span>;
  return <span className={`gstCode${issue ? " gstCodeInvalid" : ""}`}>{gstin}</span>;
}

function IssueBadge({ issue }) {
  if (!issue) return null;
  const label = issue === "MISSING" ? "Missing GSTIN" : issue === "INVALID_FORMAT" ? "Invalid format" : "Suspicious";
  return <span className="gstIssueBadge"><AlertTriangle size={10}/> {label}</span>;
}

function exportCsv(data, year, month) {
  if (!data) return;
  const biz = data.business || {}, s = data.summary || {};
  const rows = [
    ["GSTR-1 Summary Report"],
    [`Business: ${biz.firm_name || ""}`],
    [`GSTIN: ${biz.gst_number || ""}`],
    [`Period: ${year && month ? `${MONTH_NAMES[month]} ${year}` : `${data.period?.from_date} to ${data.period?.to_date}`}`],
    [`Financial Year: ${data.financial_year || ""}`],
    [`Generated: ${new Date().toLocaleString("en-IN")}`],
    [],
    ["=== OVERALL SUMMARY ==="],
    ["Total Invoices", s.total_invoices, "Taxable Value", s.total_taxable, "Total Tax", s.total_tax, "Total Value", s.total_value],
    [],
    ["=== HSN-WISE SUMMARY ==="],
    ["HSN Code", "GST Rate", "Invoices", "Taxable Value", "CGST", "SGST", "IGST", "CESS", "Total Value"],
    ...(data.hsn_summary || []).map(r => [r.hsn_code, `${n2(r.gst_rate)}%`, r.invoice_count, n2(r.taxable_value), n2(r.cgst), n2(r.sgst), n2(r.igst), "0.00", n2(r.total_value)]),
    [],
    ["=== B2B INVOICES ==="],
    ["#", "Invoice No", "Date", "Customer", "GSTIN", "Place of Supply", "Taxable Value", "CGST", "SGST", "IGST", "CESS", "Total Value"],
    ...(data.b2b_invoices || []).map((r, i) => [i+1, r.invoice_number, fmtDate(r.invoice_date), r.customer_name, r.customer_gstin||"-", r.place_of_supply||"-", n2(r.taxable_value), n2(r.cgst), n2(r.sgst), n2(r.igst), "0.00", n2(r.total_value)]),
    [],
    ["=== B2C SUMMARY BY GST RATE ==="],
    ["GST Rate", "Invoices", "Taxable Value", "CGST", "SGST", "IGST", "CESS", "Total Value"],
    ...(data.b2c_summary || []).map(r => [`${r.gst_rate}%`, r.invoice_count, n2(r.taxable_value), n2(r.cgst), n2(r.sgst), n2(r.igst), "0.00", n2(r.total_value)]),
  ];
  const csv = rows.map(r => r.map(c => `"${String(c??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const period = year && month ? `${MONTH_NAMES[month]}_${year}` : data.period?.from_date || "report";
  a.href = url; a.download = `GSTR1_${period}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function GstReportPage() {
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
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      const r = await apiGet(`/reports/gst-r1?${params.toString()}`);
      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
        setData(r.json.data);
        setFetched(true);
        setGeneratedAt(new Date());
      } else {
        showToast("error", "Failed to load GSTR-1 Report", { message: r.json?.error?.message || "Please try again." });
      }
    } finally { setLoading(false); }
  }, [year, month, showToast]);

  const s   = data?.summary  || {};
  const biz = data?.business || {};
  const gstinValid = biz.gst_number ? isValidGstin(biz.gst_number) : null;

  return (
    <ReportShell>
      <div className="pageWrap">
        <ReportPageIntro
          title="GSTR-1 - GST Summary Report"
          subtitle="Monthly outward supply summary - HSN-wise, B2B and B2C breakup for GSTR-1 filing. Share with your CA."
        />

        <ReportCard busy={loading}>
          {/* Filter bar - Month/Year picker (consistent with GSTR-2 and GSTR-3B) */}
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
                    <AppButton variant="secondary" icon={<FileText size={15}/>} onClick={() => printGstReport({ data, year, month })}>Print PDF</AppButton>
                    <AppButton variant="secondary" icon={<Download size={15}/>} onClick={() => exportCsv(data, year, month)}>Export CSV</AppButton>
                  </>
                )}
              </div>
            </div>
          </div>

          {loading && (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <CommonLoading variant="inline" size="md" text="Generating GSTR-1 report…" />
            </div>
          )}

          {!loading && !fetched && (
            <div className="g3bEmpty">
              <div className="g3bEmptyIcon"><BarChart3 size={32}/></div>
              <div className="g3bEmptyTitle">Select month and year, then click Generate Report</div>
              <div className="g3bEmptySub">GSTR-1 shows your monthly outward supplies - HSN-wise summary, B2B invoices, and B2C breakup for filing. Share with your CA.</div>
            </div>
          )}

          {!loading && fetched && data && (
            <>
              {/* HSN missing warning banner - mandatory compliance */}
              {s.missing_hsn_count > 0 && (
                <div className="g2bCriticalBanner">
                  <AlertTriangle size={16}/>
                  <div>
                    <strong>Action Required - {s.missing_hsn_count} Sales Line Item{s.missing_hsn_count !== 1 ? "s" : ""} Missing HSN Code{s.missing_hsn_count !== 1 ? "s" : ""}</strong>
                    <div style={{ fontSize: 12, marginTop: 2 }}>HSN codes are mandatory for GSTR-1 filing above certain turnover. Update these items in your sales invoices before sharing with CA.</div>
                  </div>
                </div>
              )}
              {/* Invalid GSTIN warning */}
              {s.gstin_issue_count > 0 && (
                <div className="g2bWarnBanner">
                  <AlertTriangle size={16}/>
                  <div>
                    <strong>{s.gstin_issue_count} B2B Invoice{s.gstin_issue_count !== 1 ? "s" : ""} with GSTIN Issues - Resolve Before Filing</strong>
                    <div style={{ fontSize: 12, marginTop: 2 }}>Update customer GSTIN in their profile, then regenerate this report.</div>
                  </div>
                </div>
              )}

              {/* Business details block */}
              <div className="g2bBizCard">
                <div className="g3bBizLeft">
                  <div className="g3bBizSectionLabel">Business Details</div>
                  {biz.firm_name && <div className="g3bBizName">{biz.firm_name}</div>}
                  {biz.gst_number
                    ? (
                      <div className="g3bBizGstin">
                        GSTIN: <strong>{biz.gst_number}</strong>
                        {gstinValid === false && (
                          <span className="g2bGstinInvalidBadge" title="GSTIN does not match standard 15-character format - verify with your CA">
                            <AlertTriangle size={11}/> Invalid format
                          </span>
                        )}
                      </div>
                    )
                    : <div className="g3bBizGstin g3bGstinMissing"><AlertTriangle size={12}/> GSTIN not set - add it in your profile</div>}
                  {data.financial_year && <div style={{ fontSize: 11, color: "var(--color-text-4)", marginTop: 2 }}>Financial Year: {data.financial_year}</div>}
                </div>
                <div className="g3bBizRight">
                  <span className="g3bPeriodLabel">{MONTH_NAMES[month]} {year}</span>
                </div>
              </div>

              {/* Generated-at bar */}
              {generatedAt && (
                <div className="g3bGeneratedBar">
                  <span>Generated: {generatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {generatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className="g3bGeneratedNote">Click <strong>Refresh</strong> to recalculate with latest data.</span>
                </div>
              )}

              {/* Summary cards - consistent icon/color system */}
              <div className="gstStatRow" style={{ padding: "16px 20px" }}>
                <div className="gstStatCard">
                  <div className="gstStatIcon" style={{ "--ic": "var(--color-primary)" }}><Receipt size={18}/></div>
                  <div className="gstStatLabel">Total Invoices</div>
                  <div className="gstStatValue" style={{ color: "var(--color-primary)" }}>{s.total_invoices || 0}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-4)", marginTop: 4 }}>{s.b2b_count || 0} B2B + {s.b2c_count || 0} B2C</div>
                </div>
                <div className="gstStatCard">
                  <div className="gstStatIcon" style={{ "--ic": "#f59e0b" }}><Banknote size={18}/></div>
                  <div className="gstStatLabel">Taxable Value</div>
                  <div className="gstStatValue">{fmtAmt(s.total_taxable)}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-4)", marginTop: 4 }}>Excl. GST</div>
                </div>
                <div className="gstStatCard">
                  <div className="gstStatIcon" style={{ "--ic": "#8b5cf6" }}><Building2 size={18}/></div>
                  <div className="gstStatLabel">Total GST</div>
                  <div className="gstStatValue">{fmtAmt(s.total_tax)}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-4)", marginTop: 4 }}>CGST + SGST + IGST</div>
                </div>
                <div className="gstStatCard" style={{ borderColor: "color-mix(in srgb, var(--color-primary) 30%, transparent)", background: "color-mix(in srgb, var(--color-primary) 4%, var(--color-card))" }}>
                  <div className="gstStatIcon" style={{ "--ic": "var(--color-primary)" }}><Users size={18}/></div>
                  <div className="gstStatLabel">Total Value</div>
                  <div className="gstStatValue" style={{ color: "var(--color-primary)" }}>{fmtAmt(s.total_value)}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-4)", marginTop: 4 }}>Incl. GST</div>
                </div>
              </div>

              {/* HSN-wise Summary */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">HSN-wise Summary (Table 12)</span>
                  <span className="g3bSectionBadge">{(data.hsn_summary || []).length} HSN row{(data.hsn_summary || []).length !== 1 ? "s" : ""}</span>
                </div>
                {s.missing_hsn_count > 0 && (
                  <div className="g3bNoteRow g3bNoteWarn g2bNoteAccent" style={{ margin: "8px 18px 4px", borderRadius: 8 }}>
                    <Info size={14}/>
                    <span>{s.missing_hsn_count} line item{s.missing_hsn_count !== 1 ? "s" : ""} show as <strong>N/A</strong> - HSN code missing. Update in sales invoices before filing.</span>
                  </div>
                )}
                {!(data.hsn_summary || []).length ? (
                  <div className="g3bEmpty" style={{ padding: "24px" }}><div className="g3bEmptyTitle">No data for selected period</div></div>
                ) : (
                  <div className="g3bTableScroll">
                    <table className="g3bTable">
                      <thead>
                        <tr>
                          <th>HSN Code</th>
                          <th className="tR">GST Rate</th>
                          <th className="tR">Invoices</th>
                          <th className="tR">Taxable Value</th>
                          <th className="tR">CGST</th>
                          <th className="tR">SGST</th>
                          <th className="tR">IGST</th>
                          <th className="tR">CESS</th>
                          <th className="tR">Total Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.hsn_summary || []).map((r, i) => (
                          <tr key={i}>
                            <td>
                              {r.hsn_code === "N/A"
                                ? <span style={{ color: "#f59e0b", fontStyle: "italic", fontSize: 12 }}>N/A ⚠</span>
                                : <span className="gstCode">{r.hsn_code}</span>}
                            </td>
                            <td className="tR">{n2(r.gst_rate)}%</td>
                            <td className="tR">{r.invoice_count}</td>
                            <td className="tR">{fmtAmt(r.taxable_value)}</td>
                            <td className="tR">{fmtAmt(r.cgst)}</td>
                            <td className="tR">{fmtAmt(r.sgst)}</td>
                            <td className="tR">{fmtAmt(r.igst)}</td>
                            <td className="tR">{fmtAmt(0)}</td>
                            <td className="tR gstTotalCell">{fmtAmt(r.total_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* B2B Invoices - individual rows with all columns */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">B2B Supplies - Report Individually in GSTR-1 (Table 4)</span>
                  <span className="g3bSectionBadge">{(data.b2b_invoices || []).length} invoice{(data.b2b_invoices || []).length !== 1 ? "s" : ""}</span>
                </div>
                {s.gstin_issue_count > 0 && (
                  <div className="g3bNoteRow g3bNoteWarn g2bNoteAccent" style={{ margin: "8px 18px 4px", borderRadius: 8 }}>
                    <AlertTriangle size={14}/>
                    <span><strong>{s.gstin_issue_count} invoice{s.gstin_issue_count !== 1 ? "s" : ""} have GSTIN issues</strong> - resolve before sharing with CA.</span>
                  </div>
                )}
                {!(data.b2b_invoices || []).length ? (
                  <div className="g3bEmpty" style={{ padding: "24px" }}><div className="g3bEmptyTitle">No B2B invoices for this period</div></div>
                ) : (
                  <div className="g3bTableScroll">
                    <table className="g3bTable">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Invoice No</th>
                          <th>Date</th>
                          <th>Customer</th>
                          <th>GSTIN</th>
                          <th>Place of Supply</th>
                          <th className="tR">Taxable Value</th>
                          <th className="tR">CGST</th>
                          <th className="tR">SGST</th>
                          <th className="tR">IGST</th>
                          <th className="tR">CESS</th>
                          <th className="tR">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.b2b_invoices || []).map((r, i) => (
                          <tr key={r.id} style={r.gstin_issue ? { background: "#fef2f2" } : {}}>
                            <td style={{ color: "var(--color-text-4)", fontSize: 12 }}>{i + 1}</td>
                            <td className="tBold">{r.invoice_number}</td>
                            <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.invoice_date)}</td>
                            <td>{r.customer_name}</td>
                            <td>
                              <GstinChip gstin={r.customer_gstin} issue={r.gstin_issue}/>
                              {r.gstin_issue && <div style={{ marginTop: 2 }}><IssueBadge issue={r.gstin_issue}/></div>}
                            </td>
                            <td style={{ fontSize: 12, color: "var(--color-text-3)" }}>{r.place_of_supply || "-"}</td>
                            <td className="tR">{fmtAmt(r.taxable_value)}</td>
                            <td className="tR">{fmtAmt(r.cgst)}</td>
                            <td className="tR">{fmtAmt(r.sgst)}</td>
                            <td className="tR">{fmtAmt(r.igst)}</td>
                            <td className="tR">{fmtAmt(0)}</td>
                            <td className="tR tBold gstTotalCell">{fmtAmt(r.total_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* B2C Summary - GST-rate wise breakup */}
              <div className="g3bSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">B2C Summary - Grouped by GST Rate (Table 5/7)</span>
                  <span className="g3bSectionBadge">{data.b2c_total?.invoice_count || 0} invoice{(data.b2c_total?.invoice_count || 0) !== 1 ? "s" : ""}</span>
                </div>
                <div className="g3bNoteRow g3bNoteInfo" style={{ margin: "8px 18px 4px", borderRadius: 8 }}>
                  <Info size={14}/>
                  <span>Enter these totals in the B2C summary section of GSTR-1. Only rows with non-zero values need to be entered.</span>
                </div>
                <div className="g3bTableScroll">
                  <table className="g3bTable">
                    <thead>
                      <tr>
                        <th>GST Rate</th>
                        <th className="tR">Invoices</th>
                        <th className="tR">Taxable Value</th>
                        <th className="tR">CGST</th>
                        <th className="tR">SGST</th>
                        <th className="tR">IGST</th>
                        <th className="tR">CESS</th>
                        <th className="tR">Total Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.b2c_summary || []).map(r => (
                        <tr key={r.gst_rate} style={r.invoice_count === 0 ? { opacity: 0.4 } : {}}>
                          <td className="tBold">{r.gst_rate}%</td>
                          <td className="tR">{r.invoice_count}</td>
                          <td className="tR">{fmtAmt(r.taxable_value)}</td>
                          <td className="tR">{fmtAmt(r.cgst)}</td>
                          <td className="tR">{fmtAmt(r.sgst)}</td>
                          <td className="tR">{fmtAmt(r.igst)}</td>
                          <td className="tR">{fmtAmt(0)}</td>
                          <td className="tR gstTotalCell">{fmtAmt(r.total_value)}</td>
                        </tr>
                      ))}
                      <tr className="tTotal">
                        <td className="tBold">Total</td>
                        <td className="tR tBold">{data.b2c_total?.invoice_count || 0}</td>
                        <td className="tR tBold">{fmtAmt(data.b2c_total?.taxable_value)}</td>
                        <td className="tR tBold">{fmtAmt(data.b2c_total?.cgst)}</td>
                        <td className="tR tBold">{fmtAmt(data.b2c_total?.sgst)}</td>
                        <td className="tR tBold">{fmtAmt(data.b2c_total?.igst)}</td>
                        <td className="tR tBold">{fmtAmt(0)}</td>
                        <td className="tR tBold tHighlight">{fmtAmt(data.b2c_total?.total_value)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Large B2C section */}
              {(data.large_b2c || []).length > 0 && (
                <div className="g3bSection" style={{ borderColor: "color-mix(in srgb, #ef4444 40%, transparent)" }}>
                  <div className="g3bSectionHead">
                    <span className="g3bSectionTitle">Large B2C Invoices (&gt;₹2.5 Lakh) - Report Individually</span>
                    <span className="g3bSectionBadge" style={{ background: "#fee2e2", color: "#991b1b" }}>{data.large_b2c.length} invoice{data.large_b2c.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="g3bNoteRow g3bNoteWarn g2bNoteAccent" style={{ margin: "8px 18px 4px", borderRadius: 8 }}>
                    <AlertTriangle size={14}/>
                    <span>These invoices exceed ₹2.5 lakh and must be reported individually in GSTR-1 - not in the B2C summary section.</span>
                  </div>
                  <div className="g3bTableScroll">
                    <table className="g3bTable">
                      <thead>
                        <tr>
                          <th>#</th><th>Invoice No</th><th>Date</th><th>Customer</th>
                          <th className="tR">Taxable Value</th><th className="tR">CGST</th>
                          <th className="tR">SGST</th><th className="tR">IGST</th>
                          <th className="tR">CESS</th><th className="tR">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.large_b2c.map((r, i) => (
                          <tr key={r.id}>
                            <td style={{ color: "var(--color-text-4)", fontSize: 12 }}>{i + 1}</td>
                            <td className="tBold">{r.invoice_number}</td>
                            <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.invoice_date)}</td>
                            <td>{r.customer_name}</td>
                            <td className="tR">{fmtAmt(r.taxable_value)}</td>
                            <td className="tR">{fmtAmt(r.cgst)}</td>
                            <td className="tR">{fmtAmt(r.sgst)}</td>
                            <td className="tR">{fmtAmt(r.igst)}</td>
                            <td className="tR">{fmtAmt(0)}</td>
                            <td className="tR tBold tHighlight">{fmtAmt(r.total_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Important Notes */}
              <div className="g3bSection g2bNotesSection">
                <div className="g3bSectionHead">
                  <span className="g3bSectionTitle">Important Notes for CA</span>
                </div>
                <div style={{ padding: "12px 18px 4px" }}>
                  <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>B2B invoices must be reported individually in GSTR-1. Ensure all customer GSTINs are valid before filing.</li>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>B2C invoices above ₹2.5 lakh must be reported individually - they appear in the Large B2C section above.</li>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>Place of Supply determines whether CGST+SGST or IGST applies. Verify customer state in their profile.</li>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>HSN codes are mandatory for businesses above certain turnover. Update missing HSN codes before filing.</li>
                    <li style={{ fontSize: 13, color: "var(--color-text-2, #6b7280)", lineHeight: 1.5 }}>This report is system-generated from your invoices. Cross-check with your books before sharing with CA.</li>
                  </ol>
                </div>
                <div className="g3bDisclaimer" style={{ margin: "8px 18px 16px" }}>
                  <AlertTriangle size={14}/>
                  <span style={{ fontSize: 12 }}>
                    <strong>Legal Disclaimer:</strong> GSTR-1 cannot be easily revised after filing. Verify all GSTIN values, invoice amounts, and HSN codes carefully before submission to the GST portal.
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