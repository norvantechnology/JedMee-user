import { useEffect, useMemo, useState } from "react";
import "./SalesStockAnalysisPage.css";
import { useSeoMeta } from "../utils/seo.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import { can } from "../utils/access.js";
import { getSalesStockAnalysisReport } from "../services/reportService.js";
import {
  ReportShell,
  ReportDenied,
  ReportCard,
  ReportToolbar,
  ReportToolbarPrim,
  ReportToolbarFilters,
  ReportSearchInput,
  ReportCountChip,
  ReportListEmpty,
  ReportTableScroll,
  ReportPaneBody,
  filterReportItemsBySearch,
} from "../components/reports/index.js";
import { fmtDateIndian, fmtQty } from "../utils/format.js";
import { fmtCurrency } from "../utils/currency.js";
import {
  Package2,
  BarChart3,
  BadgeIndianRupee,
  Layers,
  TrendingUp,
} from "../components/ui/AppIcons.jsx";
import CommonDatePicker from "../components/CommonDatePicker.jsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstOfMonthYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, iconBg = "ssaIconBg_primary" }) {
  return (
    <div className="ssaStatCard">
      <div className={`ssaStatIcon ${iconBg}`}>{icon}</div>
      <div className="ssaStatBody">
        <div className="ssaStatVal">{value}</div>
        <div className="ssaStatLbl">{label}</div>
        {sub ? <div className="ssaStatSub">{sub}</div> : null}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SalesStockAnalysisContent({ embedded = false } = {}) {
  const canView = can("SALES_INVOICES", "VIEW");

  const [busy, setBusy]         = useState(false);
  const [fromDate, setFromDate] = useState(firstOfMonthYmd());
  const [toDate, setToDate]     = useState(todayYmd());
  const [items, setItems]       = useState([]);
  const [summary, setSummary]   = useState(null);
  const [search, setSearch]     = useState("");
  const [appliedFrom, setAppliedFrom] = useState(firstOfMonthYmd());
  const [appliedTo, setAppliedTo]     = useState(todayYmd());

  async function refresh(from, to) {
    setBusy(true);
    const resp = await getSalesStockAnalysisReport({ from_date: from, to_date: to });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      const data = resp.json?.data || {};
      setItems(Array.isArray(data.items) ? data.items : []);
      setSummary(data.summary || null);
      setAppliedFrom(data.from_date || from);
      setAppliedTo(data.to_date || to);
    } else if (resp.status !== 401) {
      emitToast({ type: "error", message: parseApiError(resp) });
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!canView) return;
    refresh(fromDate, toDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const filtered = useMemo(
    () =>
      filterReportItemsBySearch(items, search, (r) =>
        [r.product_name, r.drug_name, r.product_code, r.mfg_name].filter(Boolean)
      ),
    [items, search]
  );

  if (!canView) {
    return (
      <ReportDenied
        title="Sales & Stock Analysis"
        message="You don't have permission to view this report."
      />
    );
  }

  function handleApply() {
    if (!fromDate || !toDate) {
      emitToast({ type: "error", message: "Please select both From and To dates." });
      return;
    }
    if (fromDate > toDate) {
      emitToast({ type: "error", message: "From date cannot be after To date." });
      return;
    }
    refresh(fromDate, toDate);
  }

  const dateRangeLabel = `${fmtDateIndian(appliedFrom)} – ${fmtDateIndian(appliedTo)}`;

  const body = (
    <div className={embedded ? "" : "pageWrap"}>

      {/* ── Summary stat cards ── */}
      {summary && !busy ? (
        <div className="ssaStatsRow">
          <StatCard
            icon={<Package2 size={18} strokeWidth={2} />}
            label="Products Sold"
            value={summary.total_products}
            sub={dateRangeLabel}
            iconBg="ssaIconBg_primary"
          />
          <StatCard
            icon={<BarChart3 size={18} strokeWidth={2} />}
            label="Total Qty Sold"
            value={fmtQty(summary.total_qty_sold)}
            sub="strips"
            iconBg="ssaIconBg_blue"
          />
          <StatCard
            icon={<BadgeIndianRupee size={18} strokeWidth={2} />}
            label="Total Revenue"
            value={fmtCurrency(summary.total_revenue)}
            sub="taxable amount"
            iconBg="ssaIconBg_green"
          />
          <StatCard
            icon={<Layers size={18} strokeWidth={2} />}
            label="Stock in Hand"
            value={fmtQty(summary.total_stock)}
            sub="strips"
            iconBg="ssaIconBg_amber"
          />
        </div>
      ) : null}

      <ReportCard busy={busy}>
        {/* ── Toolbar ── */}
        <ReportToolbar>
          <ReportToolbarPrim>
            <ReportSearchInput
              placeholder="Search product, drug name or manufacturer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {!busy && (
              <ReportCountChip>{`${filtered.length} product(s)`}</ReportCountChip>
            )}
          </ReportToolbarPrim>

          <ReportToolbarFilters>
            <div className="ssaFilterRow">
              {/* From date */}
              <label className="ssaDateLabel">From</label>
              <CommonDatePicker
                value={fromDate}
                onChange={(val) => setFromDate(val)}
                ariaLabel="From date"
                size="sm"
                disabled={busy}
                className="ssaDatePicker"
              />

              <span className="ssaDateSep" aria-hidden="true">→</span>

              {/* To date */}
              <label className="ssaDateLabel">To</label>
              <CommonDatePicker
                value={toDate}
                onChange={(val) => setToDate(val)}
                ariaLabel="To date"
                size="sm"
                disabled={busy}
                className="ssaDatePicker"
              />

              <button
                className="sfmBtnPrimary ssaApplyBtn"
                type="button"
                onClick={handleApply}
                disabled={busy}
              >
                <TrendingUp size={14} strokeWidth={2.2} aria-hidden="true" />
                Apply
              </button>
            </div>
          </ReportToolbarFilters>
        </ReportToolbar>

        {/* ── Table ── */}
        <ReportPaneBody>
          {!busy && filtered.length === 0 ? (
            <ReportListEmpty>
              {items.length === 0
                ? "No confirmed sales found for the selected date range."
                : "No products match your search."}
            </ReportListEmpty>
          ) : !busy ? (
            <ReportTableScroll>
              <div className="ssaTableWrap">
              <table className="rptBatchTable ssaTable">
                <thead>
                  {/* Group header row */}
                  <tr className="ssaGroupRow">
                    <th colSpan={3} className="ssaGroupEmpty" />
                    <th colSpan={3} className="ssaGroupHeader ssaGroupSales">
                      Sales Performance
                    </th>
                    <th colSpan={3} className="ssaGroupHeader ssaGroupStock">
                      Stock Status
                    </th>
                  </tr>
                  {/* Column header row */}
                  <tr>
                    <th className="ssaColIdx">#</th>
                    <th className="ssaColProduct">Product</th>
                    <th className="ssaColMfg">Manufacturer</th>
                    <th className="rptNum ssaColSales">Qty Sold</th>
                    <th className="rptNum ssaColSales">Loose Sold</th>
                    <th className="rptNum ssaColSales ssaColInvoices">Invoices</th>
                    <th className="rptNum ssaColRevenue">Revenue</th>
                    <th className="rptNum ssaColStock">Stock (Strips)</th>
                    <th className="rptNum ssaColStock">Loose Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => {
                    const stockOut  = r.current_stock === 0 && r.loose_stock === 0;
                    const stockLow  = !stockOut && r.qty_sold > 0 && r.current_stock < r.qty_sold * 0.2;
                    const rowClass  = stockOut ? "ssaRow_out" : stockLow ? "ssaRow_low" : "";
                    const chipClass = stockOut
                      ? "rptExpiryChip is-expired"
                      : stockLow
                      ? "rptExpiryChip is-soon"
                      : "rptExpiryChip is-ok";

                    return (
                      <tr key={r.product_id} className={rowClass}>
                        <td className="ssaColIdx ssaIdxVal">{idx + 1}</td>
                        <td>
                          <div className="rptVendorContact">
                            <span className="rptVendorName">{r.product_name || r.product_code || "—"}</span>
                            {r.drug_name ? (
                              <span className="rptVendorAddress">{r.drug_name}</span>
                            ) : null}
                            {r.product_code ? (
                              <span className="rptVendorAddress ssaCodePill">{r.product_code}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="ssaMfgCell">{r.mfg_name || <span className="ssaMuted">—</span>}</td>
                        {/* ── Sales group ── */}
                        <td className="rptNum ssaNumVal ssaColSales">{fmtQty(r.qty_sold)}</td>
                        <td className="rptNum ssaNumVal ssaMuted ssaColSales">
                          {r.loose_sold > 0 ? fmtQty(r.loose_sold) : "—"}
                        </td>
                        <td className="rptNum ssaNumVal ssaColSales ssaColInvoices">{r.invoice_count}</td>
                        {/* ── Revenue ── */}
                        <td className="rptNum ssaNumVal ssaRevenue ssaColRevenue">{fmtCurrency(r.revenue)}</td>
                        {/* ── Stock group ── */}
                        <td className="rptNum ssaColStock">
                          <span className={chipClass}>{fmtQty(r.current_stock)}</span>
                        </td>
                        <td className="rptNum ssaNumVal ssaMuted ssaColStock">
                          {r.loose_stock > 0 ? fmtQty(r.loose_stock) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </ReportTableScroll>
          ) : null}
        </ReportPaneBody>
      </ReportCard>

      {/* ── Legend ── */}
      {!busy && filtered.length > 0 ? (
        <div className="ssaLegend">
          <span className="ssaLegendItem">
            <span className="rptExpiryChip is-ok">12</span>
            <span>Adequate stock</span>
          </span>
          <span className="ssaLegendItem">
            <span className="rptExpiryChip is-soon">3</span>
            <span>Low — stock &lt; 20% of qty sold</span>
          </span>
          <span className="ssaLegendItem">
            <span className="rptExpiryChip is-expired">0</span>
            <span>Out of stock</span>
          </span>
        </div>
      ) : null}
    </div>
  );

  return embedded ? body : <ReportShell>{body}</ReportShell>;
}

export default function SalesStockAnalysisPage() {
  useSeoMeta({ title: "Sales & Stock Analysis" });
  return <SalesStockAnalysisContent embedded={false} />;
}