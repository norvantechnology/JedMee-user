import { useState } from "react";
import "./GstReportPage.css";
import { useSeoMeta } from "../utils/seo.js";
import ReportShell, { ReportDenied } from "../components/reports/ReportShell.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { AppButton } from "../components/ui/buttons.jsx";
import { can } from "../utils/access.js";
import { apiGet } from "../services/apiClient.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { fmtMoney } from "../utils/format.js";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Building2,
  UsersRound,
  BadgeIndianRupee,
  IconReceipt,
  IconWallet,
  IconGST,
} from "../components/ui/AppIcons.jsx";

function defaultDates() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, "0")}` };
}

/** Format a numeric value to 2 decimal places for display / CSV. */
function n2(v) {
  const num = Number(v);
  return isNaN(num) ? "0.00" : num.toFixed(2);
}

/** Escape a single CSV cell value. */
function csvCell(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a multi-section GSTR-1 CSV string suitable for CA filing. */
function buildGstCsv({ data, fromDate, toDate, taxLabel, taxIdLabel }) {
  const s = data.summary || {};
  const rows = [];

  // Report header
  rows.push(`\uFEFF${taxLabel} Summary Report (GSTR-1)`);
  rows.push(`Period,${fromDate} to ${toDate}`);
  rows.push("");

  // Overall summary
  rows.push("SUMMARY");
  rows.push("Total Invoices,Taxable Value,Total Tax,Total Value");
  rows.push(
    [s.total_invoices || 0, n2(s.total_taxable), n2(s.total_tax), n2(s.total_value)].join(",")
  );
  rows.push("");

  // HSN-wise Summary — GSTR-1 Table 12
  rows.push("HSN-WISE SUMMARY (Table 12)");
  rows.push(
    ["HSN Code", `${taxLabel} Rate %`, "No. of Invoices", "Taxable Value", "CGST", "SGST", "IGST", "Total Value"].join(",")
  );
  for (const r of data.hsn_summary || []) {
    rows.push(
      [csvCell(r.hsn_code), n2(r.gst_rate), r.invoice_count, n2(r.taxable_value), n2(r.cgst), n2(r.sgst), n2(r.igst), n2(r.total_value)].join(",")
    );
  }
  rows.push("");

  // B2B Supplies — GSTR-1 Table 4
  rows.push(`B2B SUPPLIES - Customers with ${taxIdLabel} (Table 4)`);
  rows.push([`${taxIdLabel}`, "Customer Name", "No. of Invoices", "Total Tax", "Total Value"].join(","));
  for (const r of data.b2b || []) {
    rows.push(
      [csvCell(r.gstin || r.tax_id || ""), csvCell(r.customer_name || ""), r.invoice_count, n2(r.total_tax), n2(r.total_value)].join(",")
    );
  }
  rows.push("");

  // B2C Summary — GSTR-1 Table 5/7
  rows.push(`B2C SUPPLIES - Walk-in / No ${taxIdLabel} (Table 5/7)`);
  rows.push("No. of Invoices,Total Tax,Total Value");
  const b2c = data.b2c || {};
  rows.push([b2c.invoice_count || 0, n2(b2c.total_tax), n2(b2c.total_value)].join(","));

  return rows.join("\n");
}

export default function GstReportPage() {
  const { taxLabel, taxIdLabel } = useLocale();
  useSeoMeta({ title: `${taxLabel} Summary Report` });
  const canView = can("REPORTS", "VIEW");

  const def = defaultDates();
  const [fromDate, setFromDate] = useState(def.from);
  const [toDate, setToDate] = useState(def.to);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadReport() {
    if (!fromDate || !toDate) {
      emitToast({ type: "warning", message: "Please select both From Date and To Date." });
      return;
    }
    setLoading(true);
    setData(null);
    // FE-08: pass optional division/manufacturer filters
    const params = new URLSearchParams({ from_date: fromDate, to_date: toDate });
    const r = await apiGet(`/reports/gst-r1?${params.toString()}`);
    setLoading(false);
    if (r.status >= 200 && r.status < 300) {
      setData(r.json?.data || null);
    } else {
      emitToast({ type: "error", message: parseApiError(r) });
    }
  }

  function exportCsv() {
    if (!data) return;
    const csv = buildGstCsv({ data, fromDate, toDate, taxLabel, taxIdLabel });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GSTR1_${fromDate}_${toDate}.csv`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const s = data?.summary || {};

  if (!canView) {
    return (
      <ReportDenied
        title={`${taxLabel} Summary Report`}
        message="You don't have permission to view this report."
      />
    );
  }

  return (
    <ReportShell>
      <div className="pageWrap">

        {/* Page header */}
        <div className="raTop">
          <div>
            <div className="raTitle">{taxLabel} Summary Report</div>
            <div className="raSub">HSN-wise outward supply summary for {taxLabel} filing</div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="pageCard gstFilterBar">
          <div className="gstFilterRow">
            <div className="gstFilterField">
              <label className="gstFieldLabel">From Date</label>
              <input
                type="date"
                className="gstDateInput"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="gstFilterField">
              <label className="gstFieldLabel">To Date</label>
              <input
                type="date"
                className="gstDateInput"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="gstFilterActions">
              <AppButton
                variant="primary"
                onClick={loadReport}
                disabled={loading}
                icon={<BarChart3 size={15} />}
              >
                {loading ? "Loading\u2026" : "Generate Report"}
              </AppButton>
              {data && (
                <AppButton
                  variant="secondary"
                  onClick={exportCsv}
                  icon={<Download size={15} />}
                >
                  Export CSV
                </AppButton>
              )}
            </div>
          </div>
        </div>

        {/* Summary stat cards */}
        {data && (
          <>
            <div className="gstStatRow">
              <div className="gstStatCard">
                <div className="gstStatIcon" style={{ "--ic": "var(--color-primary)" }}>
                  <IconReceipt width={18} height={18} />
                </div>
                <div className="gstStatLabel">Total Invoices</div>
                <div className="gstStatValue" style={{ color: "var(--color-primary)" }}>
                  {s.total_invoices || 0}
                </div>
              </div>

              <div className="gstStatCard">
                <div className="gstStatIcon" style={{ "--ic": "var(--color-info)" }}>
                  <BadgeIndianRupee size={18} />
                </div>
                <div className="gstStatLabel">Taxable Value</div>
                <div className="gstStatValue" style={{ color: "var(--color-info)" }}>
                  {fmtMoney(s.total_taxable || 0)}
                </div>
              </div>

              <div className="gstStatCard">
                <div className="gstStatIcon" style={{ "--ic": "var(--color-warning)" }}>
                  <IconGST width={18} height={18} />
                </div>
                <div className="gstStatLabel">Total Tax</div>
                <div className="gstStatValue" style={{ color: "var(--color-warning)" }}>
                  {fmtMoney(s.total_tax || 0)}
                </div>
              </div>

              <div className="gstStatCard">
                <div className="gstStatIcon" style={{ "--ic": "var(--color-success)" }}>
                  <IconWallet width={18} height={18} />
                </div>
                <div className="gstStatLabel">Total Value</div>
                <div className="gstStatValue" style={{ color: "var(--color-success)" }}>
                  {fmtMoney(s.total_value || 0)}
                </div>
              </div>
            </div>

            {/* HSN Summary table */}
            <div className="pageCard gstTableCard">
              <div className="gstTableHeader">
                <FileSpreadsheet size={15} style={{ marginRight: 7, opacity: 0.7, flexShrink: 0 }} />
                HSN-wise Summary
              </div>
              {!data.hsn_summary?.length ? (
                <div className="gstTableEmpty">No data for selected period</div>
              ) : (
                <div className="gstTableScroll">
                  <table className="gstTable">
                    <thead>
                      <tr>
                        <th>HSN Code</th>
                        <th className="tR">{taxLabel} Rate</th>
                        <th className="tR">Invoices</th>
                        <th className="tR">Taxable Value</th>
                        <th className="tR">CGST</th>
                        <th className="tR">SGST</th>
                        {/* FE-07: IGST column shown only when inter-state tracking is enabled.
                            Currently all sales are treated as intra-state (IGST = 0).
                            The column is retained for future inter-state support. */}
                        <th className="tR" title="IGST applies to inter-state sales. Currently all sales are treated as intra-state — IGST will be 0 until inter-state tracking is enabled.">
                          IGST ⓘ
                        </th>
                        <th className="tR">Total Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.hsn_summary.map((r, i) => (
                        <tr key={i}>
                          <td><span className="gstCode">{r.hsn_code || "—"}</span></td>
                          <td className="tR">{n2(r.gst_rate)}%</td>
                          <td className="tR">{r.invoice_count}</td>
                          <td className="tR">{fmtMoney(r.taxable_value)}</td>
                          <td className="tR">{fmtMoney(r.cgst)}</td>
                          <td className="tR">{fmtMoney(r.sgst)}</td>
                          <td className="tR">{fmtMoney(r.igst)}</td>
                          <td className="tR gstTotalCell">{fmtMoney(r.total_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* B2B table */}
            {data.b2b?.length > 0 && (
              <div className="pageCard gstTableCard">
                <div className="gstTableHeader">
                  <Building2 size={15} style={{ marginRight: 7, opacity: 0.7, flexShrink: 0 }} />
                  B2B Supplies &mdash; Customers with {taxIdLabel}
                </div>
                <div className="gstTableScroll">
                  <table className="gstTable">
                    <thead>
                      <tr>
                        <th>{taxIdLabel}</th>
                        <th>Customer</th>
                        <th className="tR">Invoices</th>
                        <th className="tR">Total Tax</th>
                        <th className="tR">Total Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.b2b.map((r, i) => (
                        <tr key={i}>
                          <td><span className="gstCode">{r.gstin || r.tax_id}</span></td>
                          <td>{r.customer_name}</td>
                          <td className="tR">{r.invoice_count}</td>
                          <td className="tR">{fmtMoney(r.total_tax)}</td>
                          <td className="tR gstTotalCell">{fmtMoney(r.total_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* B2C summary */}
            <div className="pageCard gstB2cCard">
              <div className="gstTableHeader">
                <UsersRound size={15} style={{ marginRight: 7, opacity: 0.7, flexShrink: 0 }} />
                B2C Supplies &mdash; Walk-in / No {taxIdLabel}
              </div>
              <div className="gstB2cRow">
                <div className="gstB2cItem">
                  <span className="gstB2cLabel">Invoices</span>
                  <div className="gstB2cValue">{data.b2c?.invoice_count || 0}</div>
                </div>
                <div className="gstB2cItem">
                  <span className="gstB2cLabel">Total Tax</span>
                  <div className="gstB2cValue">{fmtMoney(data.b2c?.total_tax || 0)}</div>
                </div>
                <div className="gstB2cItem">
                  <span className="gstB2cLabel">Total Value</span>
                  <div className="gstB2cValue">{fmtMoney(data.b2c?.total_value || 0)}</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Empty state */}
        {!data && !loading && (
          <div className="pageCard gstEmpty">
            <div className="gstEmptyIcon">
              <BarChart3 size={36} />
            </div>
            <div className="gstEmptyTitle">Select a date range and click Generate Report</div>
            <div className="gstEmptySub">
              Tax summary with HSN-wise breakdown and B2B / B2C split for GSTR-1 filing
            </div>
          </div>
        )}

      </div>
    </ReportShell>
  );
}