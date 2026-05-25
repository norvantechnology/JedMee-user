import { useState, useCallback } from "react";
import "./GstrB2bB2cPage.css";
import ReportShell from "../components/reports/ReportShell.jsx";
import { ReportPageIntro, ReportCard } from "../components/reports/ReportUi.jsx";
import AppButton from "../components/ui/AppButton.jsx";
import CommonLoading from "../components/CommonLoading.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { fmtCurrency } from "../utils/currency.js";
import { getGstrB2bB2c } from "../services/gstrB2bB2cService.js";
import { printGstrB2bB2cReport } from "../print/gstrB2bB2cPrint.js";
import { useToast } from "../components/ToastProvider.jsx";
import {
  BarChart3, FileText, Download, AlertTriangle, Info,
  RefreshCw, Building2, Users, ShieldCheck, Banknote, CheckCircle,
  RotateCcw,
} from "lucide-react";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PAGE_SIZE = 50;

function n2(v) {
  const num = Number(v);
  return isNaN(num) ? "0.00" : num.toFixed(2);
}

function buildYearOptions() {
  const now = new Date();
  const years = [];
  for (let y = now.getFullYear() + 1; y >= 2020; y--) years.push(y);
  return years;
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function exportCsv(data, period) {
  if (!data) return;
  const b2bList    = data.b2b_invoices || [];
  const b2cSum     = data.b2c_summary  || [];
  const b2cTot     = data.b2c_total    || {};
  const largeB2c   = data.large_b2c    || [];
  const b2bReturns = data.b2b_returns  || [];
  const b2cReturns = data.b2c_returns  || [];
  const rows = [];
  rows.push(["GSTR-1 B2B vs B2C Segregation Report"]);
  rows.push([`Period: ${period?.from_date || ""} to ${period?.to_date || ""}`]);
  rows.push([]);
  rows.push(["SECTION 1 — B2B INVOICES (Report individually in GSTR-1)"]);
  rows.push(["#","Invoice No","Invoice Date","Customer Name","Customer GSTIN","Place of Supply","Taxable Value","CGST","SGST","IGST","Cess","Total Value","GSTIN Issue"]);
  b2bList.forEach((r, i) => rows.push([i+1,r.invoice_number,r.invoice_date,r.customer_name,r.customer_gstin||"",r.place_of_supply||"",n2(r.taxable_value),n2(r.cgst),n2(r.sgst),n2(r.igst),"0.00",n2(r.total_value),r.gstin_issue||""]));
  rows.push([]);
  rows.push(["SECTION 2 — B2C SUMMARY BY GST RATE (Enter in GSTR-1 B2C summary)"]);
  rows.push(["GST Rate","Invoice Count","Taxable Value","CGST","SGST","IGST","Cess","Total Value"]);
  b2cSum.forEach(r => rows.push([`${r.gst_rate}%`,r.invoice_count,n2(r.taxable_value),n2(r.cgst),n2(r.sgst),n2(r.igst),"0.00",n2(r.total_value)]));
  rows.push(["TOTAL",b2cTot.invoice_count||0,n2(b2cTot.taxable_value),n2(b2cTot.cgst),n2(b2cTot.sgst),n2(b2cTot.igst),"0.00",n2(b2cTot.total_value)]);
  rows.push([]);
  if (largeB2c.length > 0) {
    rows.push(["SECTION 3 — LARGE B2C INVOICES >₹2.5 LAKH (Report individually in GSTR-1)"]);
    rows.push(["#","Invoice No","Invoice Date","Customer Name","Taxable Value","CGST","SGST","IGST","Cess","Total Value"]);
    largeB2c.forEach((r, i) => rows.push([i+1,r.invoice_number,r.invoice_date,r.customer_name,n2(r.taxable_value),n2(r.cgst),n2(r.sgst),n2(r.igst),"0.00",n2(r.total_value)]));
    rows.push([]);
  }
  if (b2bReturns.length > 0) {
    rows.push(["SECTION 4 — B2B CREDIT NOTES / RETURNS (CDNR — Report in GSTR-1)"]);
    rows.push(["#","Return No","Return Date","Customer Name","Customer GSTIN","Linked Invoice No","Return Amount"]);
    b2bReturns.forEach((r, i) => rows.push([i+1,r.return_number,r.return_date,r.customer_name,r.customer_gstin||"",r.linked_invoice_number||"",n2(r.return_amount)]));
    rows.push([]);
  }
  if (b2cReturns.length > 0) {
    rows.push(["SECTION 5 — B2C CREDIT NOTES / RETURNS (CDNUR — Report in GSTR-1)"]);
    rows.push(["#","Return No","Return Date","Customer Name","Linked Invoice No","Return Amount"]);
    b2cReturns.forEach((r, i) => rows.push([i+1,r.return_number,r.return_date,r.customer_name,r.linked_invoice_number||"",n2(r.return_amount)]));
  }
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `GSTR1_B2B_B2C_${period?.from_date || "report"}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function AmtCell({ v, bold, highlight }) {
  let cls = "tR";
  if (bold)      cls += " tBold";
  if (highlight) cls += " tHighlight";
  return <td className={cls}>₹{n2(v)}</td>;
}

function GstinChip({ gstin, issue }) {
  if (!gstin) return <span className="b2bGstinCode invalid">—</span>;
  return <span className={`b2bGstinCode${issue ? " invalid" : ""}`}>{gstin}</span>;
}

function IssueBadge({ issue }) {
  if (!issue) return null;
  const label = issue === "MISSING" ? "Missing GSTIN" : issue === "INVALID_FORMAT" ? "Invalid format" : "Suspicious";
  return <span className="b2bIssueBadge"><AlertTriangle size={10} /> {label}</span>;
}

export default function GstrB2bB2cPage() {
  const { taxLabel } = useLocale();
  const { showToast } = useToast();
  const now = new Date();
  const [mode, setMode]         = useState("month");
  const [year, setYear]         = useState(now.getFullYear());
  const [month, setMonth]       = useState(now.getMonth() + 1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate]     = useState("");
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState("all");
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [fetched, setFetched]   = useState(false);
  const [b2bPage, setB2bPage]   = useState(1);

  const fetchReport = useCallback(async () => {
    setLoading(true); setFetched(false); setB2bPage(1);
    try {
      const params = mode === "month" ? { year, month } : { from_date: fromDate, to_date: toDate };
      if (search.trim()) params.search = search.trim();
      const resp = await getGstrB2bB2c(params);
      if (resp.json?.ok) { setData(resp.json.data); setFetched(true); }
      else showToast("error", "Failed to load report", { message: resp.json?.error?.message || "Please try again." });
    } finally { setLoading(false); }
  }, [year, month, mode, fromDate, toDate, search, showToast]);

  const summary    = data?.summary      || {};
  const b2bAll     = data?.b2b_invoices || [];
  const b2cSum     = data?.b2c_summary  || [];
  const b2cTot     = data?.b2c_total    || {};
  const largeB2c   = data?.large_b2c    || [];
  const issues     = data?.gstin_issues || [];
  const biz        = data?.business     || {};
  const period     = data?.period       || {};
  const b2bReturns = data?.b2b_returns  || [];
  const b2cReturns = data?.b2c_returns  || [];

  const showB2b      = filter === "all" || filter === "b2b";
  const showB2c      = filter === "all" || filter === "b2c";
  const showLargeB2c = filter === "all" || filter === "large_b2c";
  const showReturns  = filter === "all" || filter === "returns";
  const showIssues   = (filter === "all" || filter === "b2b") && issues.length > 0;

  const b2bPageCount = Math.max(1, Math.ceil(b2bAll.length / PAGE_SIZE));
  const b2bPagedRows = b2bAll.slice((b2bPage - 1) * PAGE_SIZE, b2bPage * PAGE_SIZE);
  const totalReturns = b2bReturns.length + b2cReturns.length;

  const periodLabel = mode === "month" ? `${MONTH_NAMES[month]} ${year}` : `${fromDate} to ${toDate}`;

  return (
    <ReportShell>
      <div className="pageWrap">
        <ReportPageIntro
          title="GSTR-1 — B2B vs B2C Segregation Report"
          subtitle={`Separates sales into B2B (with GSTIN) and B2C (without GSTIN) for correct ${taxLabel} filing`}
        />
        <ReportCard>
          {/* Filter bar */}
          <div className="b2bFilterBar">
            <div className="b2bFilterRow">
              <div className="b2bFilterField">
                <label className="b2bFieldLabel">Period Type</label>
                <select className="b2bSelect" value={mode} onChange={e => { setMode(e.target.value); setFetched(false); setData(null); }}>
                  <option value="month">Month / Year</option>
                  <option value="range">Custom Date Range</option>
                </select>
              </div>
              {mode === "month" ? (
                <>
                  <div className="b2bFilterField">
                    <label className="b2bFieldLabel">Month</label>
                    <select className="b2bSelect" value={month} onChange={e => { setMonth(Number(e.target.value)); setFetched(false); setData(null); }}>
                      {MONTH_NAMES.slice(1).map((name, i) => <option key={i+1} value={i+1}>{name}</option>)}
                    </select>
                  </div>
                  <div className="b2bFilterField">
                    <label className="b2bFieldLabel">Year</label>
                    <select className="b2bSelect" value={year} onChange={e => { setYear(Number(e.target.value)); setFetched(false); setData(null); }}>
                      {buildYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="b2bFilterField">
                    <label className="b2bFieldLabel">From Date</label>
                    <input type="date" className="b2bDateInput" value={fromDate} onChange={e => { setFromDate(e.target.value); setFetched(false); setData(null); }} />
                  </div>
                  <div className="b2bFilterField">
                    <label className="b2bFieldLabel">To Date</label>
                    <input type="date" className="b2bDateInput" value={toDate} onChange={e => { setToDate(e.target.value); setFetched(false); setData(null); }} />
                  </div>
                </>
              )}
              <div className="b2bFilterField">
                <label className="b2bFieldLabel">Search</label>
                <input type="text" className="b2bSearchInput" placeholder="Customer, invoice no, GSTIN…" value={search}
                  onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchReport()} />
              </div>
              <div className="b2bFilterActions">
                <AppButton variant="primary" icon={<BarChart3 size={15} />} onClick={fetchReport} disabled={loading}>
                  {loading ? "Loading…" : "Generate Report"}
                </AppButton>
                {fetched && data && (
                  <>
                    <AppButton variant="secondary" icon={<RefreshCw size={15} />} onClick={fetchReport} disabled={loading}>Refresh</AppButton>
                    <AppButton variant="secondary" icon={<FileText size={15} />} onClick={() => printGstrB2bB2cReport({ data, taxLabel })}>Print PDF</AppButton>
                    <AppButton variant="secondary" icon={<Download size={15} />} onClick={() => exportCsv(data, period)}>Export CSV</AppButton>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Filter pills */}
          {fetched && data && (
            <div className="b2bFilterPills">
              {[
                { key: "all",       label: "All" },
                { key: "b2b",       label: `B2B (${summary.b2b_count || 0})` },
                { key: "b2c",       label: `B2C (${summary.b2c_count || 0})` },
                { key: "large_b2c", label: `Large B2C (${summary.large_b2c_count || 0})`, warn: true },
                { key: "returns",   label: `Returns (${totalReturns})` },
              ].map(p => (
                <button key={p.key} className={`b2bPill${filter === p.key ? " active" : ""}${p.warn ? " warn" : ""}`} onClick={() => setFilter(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <CommonLoading variant="inline" size="md" text="Generating B2B/B2C report…" />
            </div>
          )}

          {/* Empty state */}
          {!loading && !fetched && (
            <div className="b2bEmpty">
              <div className="b2bEmptyIcon"><BarChart3 size={32} /></div>
              <div className="b2bEmptyTitle">Select period and click Generate Report</div>
              <div className="b2bEmptySub">This report separates your sales into B2B (customers with GSTIN) and B2C (no GSTIN) for correct GSTR-1 filing. Share with your CA.</div>
            </div>
          )}

          {/* Report body */}
          {!loading && fetched && data && (
            <>
              {/* Business header */}
              <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-border)", background: "color-mix(in srgb, var(--color-primary) 4%, var(--color-card))", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  {biz.firm_name && <div style={{ fontWeight: 700, fontSize: 15 }}>{biz.firm_name}</div>}
                  {biz.gst_number ? (
                    <div style={{ fontSize: 13, color: "var(--color-text-3)" }}>
                      GSTIN: <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--color-text)" }}>{biz.gst_number}</span>
                      {!biz.gstin_valid && <span style={{ marginLeft: 8, color: "var(--color-danger, #ef4444)", fontSize: 11 }}><AlertTriangle size={11} style={{ verticalAlign: "middle" }} /> Invalid format</span>}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--color-warning-dark, #b45309)" }}><AlertTriangle size={11} /> GSTIN not set — add it in your profile</div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{periodLabel}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-4)" }}>{period.from_date} to {period.to_date}</div>
                </div>
              </div>

              {/* Summary cards */}
              <div className="b2bSummaryRow">
                <div className="b2bStatCard b2bCardB2b">
                  <div className="b2bStatIcon" style={{ "--ic": "#3b82f6" }}><Building2 size={18} /></div>
                  <div className="b2bStatLabel">B2B Invoices</div>
                  <div className="b2bStatValue">{summary.b2b_count || 0}</div>
                  <div className="b2bStatSub">{fmtCurrency(summary.b2b_value)}</div>
                  {summary.gstin_issue_count > 0 && <div className="b2bStatWarn">{summary.gstin_issue_count} GSTIN issue(s)</div>}
                  {summary.b2b_return_count > 0 && <div className="b2bStatWarn" style={{ color: "var(--color-warning-dark, #b45309)" }}>{summary.b2b_return_count} return(s) — ₹{n2(summary.b2b_return_total)}</div>}
                </div>
                <div className="b2bStatCard b2bCardB2c">
                  <div className="b2bStatIcon" style={{ "--ic": "#8b5cf6" }}><Users size={18} /></div>
                  <div className="b2bStatLabel">B2C Invoices</div>
                  <div className="b2bStatValue">{summary.b2c_count || 0}</div>
                  <div className="b2bStatSub">{fmtCurrency(summary.b2c_value)}</div>
                  {summary.large_b2c_count > 0 && <div className="b2bStatWarn">{summary.large_b2c_count} large B2C (&gt;₹2.5L)</div>}
                  {summary.b2c_return_count > 0 && <div className="b2bStatWarn" style={{ color: "var(--color-warning-dark, #b45309)" }}>{summary.b2c_return_count} return(s) — ₹{n2(summary.b2c_return_total)}</div>}
                </div>
                <div className="b2bStatCard">
                  <div className="b2bStatIcon" style={{ "--ic": "#f59e0b" }}><ShieldCheck size={18} /></div>
                  <div className="b2bStatLabel">{taxLabel} from B2B</div>
                  <div className="b2bStatValue">{fmtCurrency(summary.b2b_gst)}</div>
                </div>
                <div className="b2bStatCard b2bCardGst">
                  <div className="b2bStatIcon" style={{ "--ic": "var(--color-primary)" }}><Banknote size={18} /></div>
                  <div className="b2bStatLabel">{taxLabel} from B2C</div>
                  <div className="b2bStatValue">{fmtCurrency(summary.b2c_gst)}</div>
                </div>
              </div>

              {/* GSTIN issues warning */}
              {showIssues && (
                <div className="b2bSection" style={{ margin: "0 20px 16px", borderColor: "color-mix(in srgb, var(--color-danger, #ef4444) 40%, transparent)" }}>
                  <div className="b2bSectionHead">
                    <span className="b2bSectionTitle">⚠ GSTIN Issues — Resolve Before Filing</span>
                    <span className="b2bSectionBadge b2bSectionBadgeWarn">{issues.length} invoice(s)</span>
                  </div>
                  <div className="b2bWarnBanner">
                    <AlertTriangle size={15} />
                    <span>These B2B invoices have missing, invalid, or suspicious GSTINs. Resolve them before sharing with your CA. Update the customer GSTIN in their profile, then use the re-tag option.</span>
                  </div>
                  <div className="b2bTableScroll">
                    <table className="b2bTable">
                      <thead><tr><th>Invoice No</th><th>Date</th><th>Customer</th><th>GSTIN</th><th>Issue</th></tr></thead>
                      <tbody>
                        {issues.map(r => (
                          <tr key={r.id} className="b2bIssueRow">
                            <td style={{ fontWeight: 600 }}>{r.invoice_number}</td>
                            <td>{fmtDate(r.invoice_date)}</td>
                            <td>{r.customer_name}</td>
                            <td><GstinChip gstin={r.customer_gstin} issue={r.gstin_issue} /></td>
                            <td><IssueBadge issue={r.gstin_issue} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* B2B invoices table */}
              {showB2b && (
                <div className="b2bSection">
                  <div className="b2bSectionHead">
                    <span className="b2bSectionTitle">B2B Invoices — Report Individually in GSTR-1</span>
                    <span className="b2bSectionBadge">{b2bAll.length} invoices</span>
                  </div>
                  <div className="b2bInfoBanner">
                    <Info size={14} />
                    <span>Each B2B invoice must be entered individually in the B2B section of GSTR-1. Ensure all GSTINs are valid before filing.</span>
                  </div>
                  {b2bAll.length === 0 ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-4)", fontSize: 13 }}>No B2B invoices for this period.</div>
                  ) : (
                    <>
                      <div className="b2bTableScroll">
                        <table className="b2bTable">
                          <thead>
                            <tr>
                              <th>#</th><th>Invoice No</th><th>Date</th><th>Customer</th><th>GSTIN</th>
                              <th>Place of Supply</th><th className="tR">Taxable Value</th>
                              <th className="tR">CGST</th><th className="tR">SGST</th><th className="tR">IGST</th>
                              <th className="tR">Cess</th><th className="tR">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {b2bPagedRows.map((r, idx) => (
                              <tr key={r.id} className={r.gstin_issue ? "b2bIssueRow" : ""}>
                                <td style={{ color: "var(--color-text-4)", fontSize: 12 }}>{(b2bPage - 1) * PAGE_SIZE + idx + 1}</td>
                                <td style={{ fontWeight: 600 }}>{r.invoice_number}</td>
                                <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.invoice_date)}</td>
                                <td>{r.customer_name}</td>
                                <td>
                                  <GstinChip gstin={r.customer_gstin} issue={r.gstin_issue} />
                                  {r.gstin_issue && <div style={{ marginTop: 2 }}><IssueBadge issue={r.gstin_issue} /></div>}
                                </td>
                                <td>{r.place_of_supply || "—"}</td>
                                <AmtCell v={r.taxable_value} />
                                <AmtCell v={r.cgst} />
                                <AmtCell v={r.sgst} />
                                <AmtCell v={r.igst} />
                                <AmtCell v={0} />
                                <AmtCell v={r.total_value} bold />
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {b2bPageCount > 1 && (
                        <div className="b2bPagination">
                          <span>Showing {(b2bPage - 1) * PAGE_SIZE + 1}–{Math.min(b2bPage * PAGE_SIZE, b2bAll.length)} of {b2bAll.length}</span>
                          <div className="b2bPagBtns">
                            <button className="b2bPagBtn" disabled={b2bPage === 1} onClick={() => setB2bPage(p => p - 1)}>← Prev</button>
                            <button className="b2bPagBtn" disabled={b2bPage === b2bPageCount} onClick={() => setB2bPage(p => p + 1)}>Next →</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* B2C summary table */}
              {showB2c && (
                <div className="b2bSection">
                  <div className="b2bSectionHead">
                    <span className="b2bSectionTitle">B2C Summary — Grouped by {taxLabel} Rate</span>
                    <span className="b2bSectionBadge">{summary.b2c_count || 0} invoices</span>
                  </div>
                  <div className="b2bInfoBanner">
                    <Info size={14} />
                    <span>Enter these totals in the B2C summary section of GSTR-1. Only rows with non-zero values need to be entered.</span>
                  </div>
                  <div className="b2bTableScroll">
                    <table className="b2bTable">
                      <thead>
                        <tr>
                          <th>GST Rate</th><th className="tR">Invoice Count</th><th className="tR">Taxable Value</th>
                          <th className="tR">CGST</th><th className="tR">SGST</th><th className="tR">IGST</th>
                          <th className="tR">Cess</th><th className="tR">Total Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b2cSum.map(r => (
                          <tr key={r.gst_rate} style={r.invoice_count === 0 ? { opacity: 0.4 } : {}}>
                            <td style={{ fontWeight: 600 }}>{r.gst_rate}%</td>
                            <td className="tR">{r.invoice_count}</td>
                            <AmtCell v={r.taxable_value} />
                            <AmtCell v={r.cgst} />
                            <AmtCell v={r.sgst} />
                            <AmtCell v={r.igst} />
                            <AmtCell v={0} />
                            <AmtCell v={r.total_value} />
                          </tr>
                        ))}
                        <tr className="tTotal">
                          <td className="tBold">Total</td>
                          <td className="tR tBold">{b2cTot.invoice_count || 0}</td>
                          <AmtCell v={b2cTot.taxable_value} bold />
                          <AmtCell v={b2cTot.cgst} bold />
                          <AmtCell v={b2cTot.sgst} bold />
                          <AmtCell v={b2cTot.igst} bold />
                          <AmtCell v={0} bold />
                          <AmtCell v={b2cTot.total_value} bold highlight />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Large B2C section */}
              {showLargeB2c && (
                <div className="b2bSection" style={largeB2c.length > 0 ? { borderColor: "color-mix(in srgb, var(--color-danger, #ef4444) 40%, transparent)" } : {}}>
                  <div className="b2bSectionHead">
                    <span className="b2bSectionTitle">Large B2C Invoices (&gt;₹2.5 Lakh)</span>
                    <span className={`b2bSectionBadge${largeB2c.length > 0 ? " b2bSectionBadgeWarn" : ""}`}>{largeB2c.length} invoice(s)</span>
                  </div>
                  {largeB2c.length === 0 ? (
                    <div className="b2bSuccessBanner">
                      <CheckCircle size={16} />
                      <span>No large B2C invoices (&gt;₹2.5 lakh) this period.</span>
                    </div>
                  ) : (
                    <>
                      <div className="b2bWarnBanner">
                        <AlertTriangle size={15} />
                        <span>These invoices exceed ₹2.5 lakh and must be reported individually in GSTR-1 — not in the B2C summary section.</span>
                      </div>
                      <div className="b2bTableScroll">
                        <table className="b2bTable">
                          <thead>
                            <tr>
                              <th>#</th><th>Invoice No</th><th>Date</th><th>Customer</th>
                              <th className="tR">Taxable Value</th><th className="tR">CGST</th>
                              <th className="tR">SGST</th><th className="tR">IGST</th>
                              <th className="tR">Cess</th><th className="tR">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {largeB2c.map((r, idx) => (
                              <tr key={r.id}>
                                <td style={{ color: "var(--color-text-4)", fontSize: 12 }}>{idx + 1}</td>
                                <td style={{ fontWeight: 600 }}>{r.invoice_number}</td>
                                <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.invoice_date)}</td>
                                <td>{r.customer_name}</td>
                                <AmtCell v={r.taxable_value} />
                                <AmtCell v={r.cgst} />
                                <AmtCell v={r.sgst} />
                                <AmtCell v={r.igst} />
                                <AmtCell v={0} />
                                <AmtCell v={r.total_value} bold highlight />
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Credit Notes / Returns section */}
              {showReturns && (b2bReturns.length > 0 || b2cReturns.length > 0) && (
                <div className="b2bSection">
                  <div className="b2bSectionHead">
                    <span className="b2bSectionTitle">Credit Notes / Returns — CDNR (B2B) &amp; CDNUR (B2C)</span>
                    <span className="b2bSectionBadge">{totalReturns} return(s)</span>
                  </div>
                  <div className="b2bInfoBanner">
                    <Info size={14} />
                    <span>B2B returns (CDNR) and B2C returns (CDNUR) must be reported separately in GSTR-1. These are credit notes issued against confirmed sales invoices.</span>
                  </div>

                  {/* B2B Returns */}
                  {b2bReturns.length > 0 && (
                    <>
                      <div style={{ padding: "8px 18px", fontWeight: 700, fontSize: 12, color: "var(--color-text-3)", background: "var(--color-surface, #fbf8ff)", borderBottom: "1px solid var(--color-border)" }}>
                        B2B Returns (CDNR) — {b2bReturns.length} return(s)
                      </div>
                      <div className="b2bTableScroll">
                        <table className="b2bTable">
                          <thead>
                            <tr>
                              <th>#</th><th>Return No</th><th>Date</th><th>Customer</th>
                              <th>GSTIN</th><th>Linked Invoice</th><th className="tR">Return Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {b2bReturns.map((r, idx) => (
                              <tr key={r.id}>
                                <td style={{ color: "var(--color-text-4)", fontSize: 12 }}>{idx + 1}</td>
                                <td style={{ fontWeight: 600 }}>{r.return_number}</td>
                                <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.return_date)}</td>
                                <td>{r.customer_name}</td>
                                <td><GstinChip gstin={r.customer_gstin} /></td>
                                <td style={{ color: "var(--color-text-3)", fontSize: 12 }}>{r.linked_invoice_number || "—"}</td>
                                <AmtCell v={r.return_amount} bold />
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {/* B2C Returns */}
                  {b2cReturns.length > 0 && (
                    <>
                      <div style={{ padding: "8px 18px", fontWeight: 700, fontSize: 12, color: "var(--color-text-3)", background: "var(--color-surface, #fbf8ff)", borderBottom: "1px solid var(--color-border)", borderTop: b2bReturns.length > 0 ? "1px solid var(--color-border)" : "none" }}>
                        B2C Returns (CDNUR) — {b2cReturns.length} return(s)
                      </div>
                      <div className="b2bTableScroll">
                        <table className="b2bTable">
                          <thead>
                            <tr>
                              <th>#</th><th>Return No</th><th>Date</th><th>Customer</th>
                              <th>Linked Invoice</th><th className="tR">Return Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {b2cReturns.map((r, idx) => (
                              <tr key={r.id}>
                                <td style={{ color: "var(--color-text-4)", fontSize: 12 }}>{idx + 1}</td>
                                <td style={{ fontWeight: 600 }}>{r.return_number}</td>
                                <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.return_date)}</td>
                                <td>{r.customer_name}</td>
                                <td style={{ color: "var(--color-text-3)", fontSize: 12 }}>{r.linked_invoice_number || "—"}</td>
                                <AmtCell v={r.return_amount} bold />
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {showReturns && totalReturns === 0 && (
                <div className="b2bSection">
                  <div className="b2bSectionHead">
                    <span className="b2bSectionTitle">Credit Notes / Returns</span>
                    <span className="b2bSectionBadge">0</span>
                  </div>
                  <div className="b2bSuccessBanner">
                    <CheckCircle size={16} />
                    <span>No credit notes or returns for this period.</span>
                  </div>
                </div>
              )}

              {/* Notes section */}
              <div className="b2bSection b2bNotesSection" style={{ margin: "0 20px 20px" }}>
                <div className="b2bSectionHead">
                  <span className="b2bSectionTitle">Important Notes for CA</span>
                </div>
                <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="b2bNoteRow b2bNoteInfo">
                    <Info size={14} />
                    <span>B2B invoices are reported individually in GSTR-1. Ensure all customer GSTINs are valid before filing.</span>
                  </div>
                  <div className="b2bNoteRow b2bNoteInfo">
                    <Info size={14} />
                    <span>B2C invoices above ₹2.5 lakh must be reported individually — they appear in the Large B2C section above.</span>
                  </div>
                  <div className="b2bNoteRow b2bNoteInfo">
                    <Info size={14} />
                    <span>Place of Supply determines whether CGST+SGST or IGST applies. Verify customer state in their profile.</span>
                  </div>
                  <div className="b2bNoteRow b2bNoteInfo">
                    <Info size={14} />
                    <span>This report is system-generated from your invoices. Cross-check with your books before sharing with CA.</span>
                  </div>
                  {issues.length > 0 && (
                    <div className="b2bNoteRow b2bNoteWarn">
                      <AlertTriangle size={14} />
                      <span><strong>{issues.length} B2B invoice(s) have GSTIN issues.</strong> Resolve these before sharing with CA.</span>
                    </div>
                  )}
                  <div className="b2bNoteRow b2bNoteWarn">
                    <AlertTriangle size={14} />
                    <span><strong>Disclaimer:</strong> GSTR-1 cannot be easily revised after filing. Verify all GSTIN values and invoice amounts carefully before submission.</span>
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