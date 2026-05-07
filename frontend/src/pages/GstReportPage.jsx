import { useState } from "react";
import "./GstReportPage.css";
import { useSeoMeta } from "../utils/seo.js";
import AppShell from "../layouts/AppShell.jsx";
import { AppButton } from "../components/ui/buttons.jsx";
import { readAuth } from "../services/authStorage.js";
import { apiGet } from "../services/apiClient.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { fmtMoney } from "../utils/format.js";
import { downloadCsvFile } from "../components/reports/reportExport.js";
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

export default function GstReportPage() {
  useSeoMeta({ title: "GSTR-1 Summary Report" });
  const auth = readAuth();
  const user = auth?.user || null;

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
    const r = await apiGet(`/reports/gst-r1?from_date=${fromDate}&to_date=${toDate}`);
    setLoading(false);
    if (r.status >= 200 && r.status < 300) {
      setData(r.json || null);
    } else {
      emitToast({ type: "error", message: parseApiError(r) });
    }
  }

  function exportCsv() {
    if (!data?.hsn_summary?.length) return;
    const cols = [
      { key: "hsn_code",      label: "HSN Code" },
      { key: "gst_rate",      label: "GST Rate %" },
      { key: "invoice_count", label: "Invoices" },
      { key: "taxable_value", label: "Taxable Value" },
      { key: "cgst",          label: "CGST" },
      { key: "sgst",          label: "SGST" },
      { key: "igst",          label: "IGST" },
      { key: "total_value",   label: "Total Value" },
    ];
    downloadCsvFile(`GSTR1_${fromDate}_${toDate}.csv`, cols, data.hsn_summary);
  }

  const s = data?.summary || {};

  return (
    <AppShell
      userName={user?.full_name || "User"}
      userEmail={user?.email || auth?.email || ""}
      userBusinessName={user?.firm_name || ""}
      userGstNumber={user?.gst_number || ""}
      variant="user"
    >
      <div className="pageWrap">

        {/* ── Page header ── */}
        <div className="raTop">
          <div>
            <div className="raTitle">GSTR-1 Summary Report</div>
            <div className="raSub">HSN-wise outward supply summary for GST filing</div>
          </div>
        </div>

        {/* ── Filter bar ── */}
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
              <AppButton variant="primary" onClick={loadReport} disabled={loading}>
                <BarChart3 size={15} style={{ marginRight: 6, flexShrink: 0 }} />
                {loading ? "Loading…" : "Generate Report"}
              </AppButton>
              {data && (
                <AppButton variant="secondary" onClick={exportCsv} disabled={!data?.hsn_summary?.length}>
                  <Download size={15} style={{ marginRight: 6, flexShrink: 0 }} />
                  Export CSV
                </AppButton>
              )}
            </div>
          </div>
        </div>

        {/* ── Summary stat cards ── */}
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

            {/* ── HSN Summary table ── */}
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
                        <th className="tR">GST Rate</th>
                        <th className="tR">Invoices</th>
                        <th className="tR">Taxable Value</th>
                        <th className="tR">CGST</th>
                        <th className="tR">SGST</th>
                        <th className="tR">IGST</th>
                        <th className="tR">Total Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.hsn_summary.map((r, i) => (
                        <tr key={i}>
                          <td><span className="gstCode">{r.hsn_code}</span></td>
                          <td className="tR">{r.gst_rate}%</td>
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

            {/* ── B2B table ── */}
            {data.b2b?.length > 0 && (
              <div className="pageCard gstTableCard">
                <div className="gstTableHeader">
                  <Building2 size={15} style={{ marginRight: 7, opacity: 0.7, flexShrink: 0 }} />
                  B2B Supplies — Customers with GSTIN
                </div>
                <div className="gstTableScroll">
                  <table className="gstTable">
                    <thead>
                      <tr>
                        <th>GSTIN</th>
                        <th>Customer</th>
                        <th className="tR">Invoices</th>
                        <th className="tR">Total Tax</th>
                        <th className="tR">Total Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.b2b.map((r, i) => (
                        <tr key={i}>
                          <td><span className="gstCode">{r.gstin}</span></td>
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

            {/* ── B2C summary ── */}
            <div className="pageCard gstB2cCard">
              <div className="gstTableHeader" style={{ marginBottom: 16 }}>
                <UsersRound size={15} style={{ marginRight: 7, opacity: 0.7, flexShrink: 0 }} />
                B2C Supplies — Walk-in / No GSTIN
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

        {/* ── Empty state ── */}
        {!data && !loading && (
          <div className="pageCard gstEmpty">
            <div className="gstEmptyIcon">
              <BarChart3 size={36} />
            </div>
            <div className="gstEmptyTitle">Select a date range and click Generate Report</div>
            <div className="gstEmptySub">GSTR-1 summary with HSN-wise breakdown and B2B/B2C split</div>
          </div>
        )}

      </div>
    </AppShell>
  );
}