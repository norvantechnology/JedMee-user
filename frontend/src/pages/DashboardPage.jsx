import { useEffect, useMemo, useRef, useState } from "react";
import { useSeoMeta } from "../utils/seo.js";
import AppShell from "../layouts/AppShell.jsx";
import { readAuth, onAuthChanged } from "../services/authStorage.js";
import { can } from "../utils/access.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import "../components/StructuredForm.css";
import "./DashboardPage.css";
import { todayYmdLocal } from "../utils/date.js";
import { daysUntil, fmtCurrency, ymd } from "../utils/format.js";
import CommonDatePicker from "../components/CommonDatePicker.jsx";
import CommonLoading from "../components/CommonLoading.jsx";
import CommonModal from "../components/CommonModal.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { getDashboardSummary } from "../services/dashboardService.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { useNavigate } from "react-router-dom";
import {
  BarChart3, CreditCard, FileSpreadsheet,
  IconAlert, IconChevronsDown, IconChevronsUp, IconChevronRight,
  IconDashZap, IconLedger, IconNonMoving, IconNearExpiry,
  IconPlus, IconStockAlert, Package2, RotateCcw, Search, UsersRound
} from "../components/ui/AppIcons.jsx";
import LineAreaChart from "../components/charts/LineAreaChart.jsx";
import BarChart from "../components/charts/BarChart.jsx";
import DonutChart from "../components/charts/DonutChart.jsx";
import SparklineChart from "../components/charts/SparklineChart.jsx";

/* ─── helpers ─── */
function pct(part, total) {
  const p = Number(part), t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
  return (p / t) * 100;
}

function pillClassForStatus(status) {
  const s = String(status || "").toUpperCase();
  if (s === "CONFIRMED" || s === "PAID")  return "green";
  if (s === "DRAFT")                       return "gray";
  if (s === "CANCELLED" || s === "UNPAID") return "red";
  if (s === "PARTIAL")                     return "amber";
  return "gray";
}

function quarterStartYmd(ymdStr) {
  const s = String(ymdStr || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return "";
  const q0 = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(q0).padStart(2, "0")}-01`;
}

function monthEndYmd(ymdStr) {
  const s = String(ymdStr || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return "";
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function quarterEndYmd(ymdStr) {
  const s = String(ymdStr || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return "";
  const qEndMonth = Math.ceil(m / 3) * 3; // 3, 6, 9, or 12
  const lastDay = new Date(y, qEndMonth, 0).getDate();
  return `${y}-${String(qEndMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function smoothPath(points) {
  const pts = Array.isArray(points)
    ? points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    : [];
  if (pts.length < 2) return "";
  const d = [`M${pts[0].x},${pts[0].y}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.25;
    d.push(
      `C${p1.x + (p2.x - p0.x) * t},${p1.y + (p2.y - p0.y) * t} ` +
      `${p2.x - (p3.x - p1.x) * t},${p2.y - (p3.y - p1.y) * t} ` +
      `${p2.x},${p2.y}`
    );
  }
  return d.join(" ");
}

export default function DashboardPage() {
  useSeoMeta({ title: "Dashboard" });
  const auth       = readAuth();
  const user       = auth?.user || null;
  const isRetailer = isRetailerAuth(auth);
  const [, setAuthRev]            = useState(0);
  const [busy, setBusy]           = useState(false);
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState(todayYmdLocal());
  const [preset, setPreset]       = useState("MONTH");
  const [data, setData]           = useState(null);
  const [recentTab, setRecentTab] = useState("SALES");
  const [q, setQ]                 = useState("");
  const [animateBars, setAnimateBars]     = useState(false);
  const navigate   = useNavigate();
  const [autoTick, setAutoTick]           = useState(0);
  const [trendChartType, setTrendChartType]   = useState("LINE");
  const [weekChartType, setWeekChartType]     = useState("BAR");
  const [payChartType, setPayChartType]       = useState("DONUT");
  const [profitChartType, setProfitChartType] = useState("AREA");
  const [filterOpen, setFilterOpen]         = useState(false);
  const searchRef  = useRef(null);
  const reqSeqRef  = useRef(0);

  useEffect(() => onAuthChanged(() => setAuthRev((n) => n + 1)), []);

  const visibility   = data?.meta?.visibility || {};
  const canSales     = Boolean(visibility.sales);
  const canPurchases = Boolean(visibility.purchases);
  const canBatches   = Boolean(visibility.batches);
  const canReturns   = Boolean(visibility.returns);

  const qaConfig = useMemo(() => ({
    NEW_BILL:       { title: "New Bill",       subtitle: "Create a new sales bill quickly.",       path: "/sales-billing?new=1",        canOpen: Boolean(canSales) },
    NEW_PURCHASE:   { title: "New Purchase",   subtitle: "Create a new purchase invoice quickly.", path: "/purchase-invoices?new=1",    canOpen: Boolean(canPurchases) },
    SALES_RETURN:   { title: "Sales Return",   subtitle: "Create a new sales return entry.",       path: "/sales-returns?new=1",        canOpen: Boolean(canReturns) },
    RECORD_PAYMENT: { title: "Record Payment", subtitle: isRetailer ? "Record supplier payment." : "Record customer payment.",
                      path: isRetailer ? "/division-payments?new=1" : "/customer-payments?new=1", canOpen: true },
  }), [isRetailer, canSales, canPurchases, canReturns]);

  function openQuickAction(kind) {
    const cfg = qaConfig[kind];
    if (!cfg?.canOpen) { emitToast({ type: "warning", message: "You do not have permission for this action." }); return; }
    if (cfg?.path) navigate(cfg.path);
  }
  function onQaKeyDown(e, kind) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault(); e.stopPropagation();
    openQuickAction(kind);
  }

  function applyPreset(p) {
    setPreset(p);
    const today = todayYmdLocal();
    const ranges = {
      TODAY:   { from: today,                          to: today },
      MONTH:   { from: `${today.slice(0, 8)}01`,       to: monthEndYmd(today) },
      QUARTER: { from: quarterStartYmd(today),          to: quarterEndYmd(today) },
      YEAR:    { from: `${today.slice(0, 4)}-01-01`,   to: `${today.slice(0, 4)}-12-31` },
    };
    const { from, to } = ranges[p] || { from: "", to: today };
    setDateFrom(from);
    setDateTo(to);
    void refresh(from, to);
  }

  async function refresh(nextFrom, nextTo) {
    const seq = ++reqSeqRef.current;
    setBusy(true); setAnimateBars(false);
    const r = await getDashboardSummary({ dateFrom: nextFrom || undefined, dateTo: nextTo || undefined });
    if (seq !== reqSeqRef.current) return;
    if (r.status >= 200 && r.status < 300 && r.json?.ok) setData(r.json?.data || null);
    else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
    setBusy(false);
  }

  useEffect(() => {
    if (!dateFrom && preset === "MONTH") applyPreset("MONTH");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const from = String(dateFrom || "").trim(), to = String(dateTo || "").trim();
    if (!from || !to) return;
    const t = setTimeout(() => { setAutoTick((n) => n + 1); void refresh(from, to); }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = String(document.activeElement?.tagName || "").toLowerCase();
        if (!["input", "textarea", "select"].includes(tag)) { e.preventDefault(); searchRef.current?.focus?.(); }
      }
      if (e.key === "Escape" && String(q || "").trim()) { e.preventDefault(); setQ(""); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [q]);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => setAnimateBars(true), 250);
    return () => clearTimeout(t);
  }, [data]);

  /* ─── derived data ─── */
  const payMode = useMemo(() => {
    const rows  = Array.isArray(data?.widgets?.payment_modes) ? data.widgets.payment_modes : [];
    const total = rows.reduce((acc, r) => acc + Number(r.total || 0), 0);
    return { total, rows: rows.map((r) => ({ mode: String(r.mode || "CASH"), total: Number(r.total || 0) })) };
  }, [data]);

  const weekBars = useMemo(() => {
    const rows = Array.isArray(data?.widgets?.sales_week_7d) ? data.widgets.sales_week_7d : [];
    return { rows, max: Math.max(1, ...rows.map((r) => Number(r.sales_total || 0))) };
  }, [data]);

  const topProducts = useMemo(() => {
    const rows = Array.isArray(data?.widgets?.top_products) ? data.widgets.top_products : [];
    return { rows, max: Math.max(1, ...rows.map((r) => Number(r.total || 0))) };
  }, [data]);

  const trendSeries = useMemo(() => {
    const sales = Array.isArray(data?.widgets?.sales_trend_30d)    ? data.widgets.sales_trend_30d    : [];
    const pur   = Array.isArray(data?.widgets?.purchase_trend_30d) ? data.widgets.purchase_trend_30d : [];
    const max   = Math.max(1, ...sales.map((x) => Number(x.sales_total || 0)), ...pur.map((x) => Number(x.purchase_total || 0)));
    return { sales, pur, max };
  }, [data]);

  const queryText = String(q || "").trim().toLowerCase();
  const match = (v) => String(v || "").toLowerCase().includes(queryText);

  const filteredTopProducts = useMemo(() =>
    queryText ? topProducts.rows.filter((r) => match(r.product_name)) : topProducts.rows,
    [topProducts.rows, queryText]);

  const filteredTopCustomers = useMemo(() => {
    const rows = Array.isArray(data?.widgets?.top_customers) ? data.widgets.top_customers : [];
    return queryText ? rows.filter((r) => match(r.customer_name)) : rows;
  }, [data, queryText]);

  const filteredRecent = useMemo(() => {
    const rows = recentTab === "SALES"     ? (data?.widgets?.recent_sales     || [])
               : recentTab === "PURCHASES" ? (data?.widgets?.recent_purchases || [])
               :                             (data?.widgets?.recent_returns   || []);
    return queryText
      ? rows.filter((r) => match(r.invoice_number) || match(r.return_number) || match(r.customer_name) || match(r.vendor_name) || match(r.party_name))
      : rows;
  }, [data, recentTab, queryText]);

  /* ─── colour helpers ─── */
  const payColor = (m) => {
    const s = String(m || "").toUpperCase();
    if (s === "UPI")    return "var(--color-success)";
    if (s === "CARD")   return "var(--color-warning-strong)";
    if (s === "CREDIT") return "var(--color-secondary)";
    return "var(--color-primary)";
  };
  const progColors = [
    "var(--color-primary)",
    "var(--color-success)",
    "var(--color-warning-strong)",
    "var(--color-secondary)",
    "var(--color-success-strong)"
  ];

  const trendChartData = useMemo(() => {
    const sales = Array.isArray(trendSeries?.sales) ? trendSeries.sales : [];
    const pur   = Array.isArray(trendSeries?.pur)   ? trendSeries.pur   : [];
    const n     = Math.max(sales.length, pur.length, 0);
    const labels = Array.from({ length: n }).map((_, i) => {
      const d = sales[i]?.day || pur[i]?.day || "";
      return d ? ymd(d) : `#${i + 1}`;
    });
    return {
      lineSeries: [
        { id: "sales",    label: "Sales",    color: "var(--color-primary)",        values: labels.map((xLabel, i) => ({ xLabel, y: Number(sales[i]?.sales_total    || 0) })) },
        { id: "purchase", label: "Purchase", color: "var(--color-warning-strong)", values: labels.map((xLabel, i) => ({ xLabel, y: Number(pur[i]?.purchase_total   || 0) })) },
      ],
      barGroups: labels.map((xLabel, i) => ({
        xLabel,
        series: [
          { id: "sales",    label: "Sales",    color: "var(--color-primary)",        y: Number(sales[i]?.sales_total    || 0) },
          { id: "purchase", label: "Purchase", color: "var(--color-warning-strong)", y: Number(pur[i]?.purchase_total   || 0) },
        ]
      }))
    };
  }, [trendSeries]);

  const kpiSparklines = useMemo(() => {
    const week  = Array.isArray(data?.widgets?.sales_week_7d)      ? data.widgets.sales_week_7d      : [];
    const s30   = Array.isArray(data?.widgets?.sales_trend_30d)    ? data.widgets.sales_trend_30d    : [];
    const p30   = Array.isArray(data?.widgets?.purchase_trend_30d) ? data.widgets.purchase_trend_30d : [];
    return {
      todaySales:  week.map((r) => Number(r.sales_total    || 0)),
      periodSales: s30.map((r)  => Number(r.sales_total    || 0)),
      purchases:   p30.map((r)  => Number(r.purchase_total || 0)),
    };
  }, [data]);

  /* ─── render ─── */
  return (
    <AppShell
     
      userName={user?.full_name || "User"}
      userEmail={user?.email || auth?.email || ""}
      userBusinessName={user?.firm_name || ""}
      userGstNumber={user?.gst_number || ""}
      variant="user"
    >
      <div className="pageWrap pageWrapDash">
        <div className="dashRoot">

          {/* ══ TICKER STRIP ══ */}
          <div className="dash-ticker" role="marquee" aria-label="Alerts ticker">
            <div className="ticker-label">
              <IconAlert />
              <span>Alerts</span>
            </div>
            <div className="dash-ticker-track">
              <div className="dash-ticker-inner">
                {[
                  { label: "Near Expiry",      val: data?.alerts?.near_expiry_batches ?? 0,          unit: "batches",  icon: <IconNearExpiry /> },
                  { label: "Non‑Moving Stock", val: data?.alerts?.non_moving_items ?? 0,             unit: "items",    icon: <IconNonMoving /> },
                  { label: "Receivables",      val: fmtCurrency(data?.kpis?.receivables?.value || 0) || fmtCurrency(0), unit: "pending",  icon: <CreditCard aria-hidden="true" /> },
                  { label: "Low Stock",        val: data?.alerts?.low_stock_products ?? 0,           unit: "products", icon: <IconStockAlert /> },
                  { label: "Overdue Payables", val: data?.alerts?.overdue_payables_invoices ?? 0,    unit: "invoices", icon: <IconLedger /> },
                  /* duplicate for seamless loop */
                  { label: "Near Expiry",      val: data?.alerts?.near_expiry_batches ?? 0,          unit: "batches",  icon: <IconNearExpiry /> },
                  { label: "Non‑Moving Stock", val: data?.alerts?.non_moving_items ?? 0,             unit: "items",    icon: <IconNonMoving /> },
                  { label: "Receivables",      val: fmtCurrency(data?.kpis?.receivables?.value || 0) || fmtCurrency(0), unit: "pending",  icon: <CreditCard aria-hidden="true" /> },
                  { label: "Low Stock",        val: data?.alerts?.low_stock_products ?? 0,           unit: "products", icon: <IconStockAlert /> },
                  { label: "Overdue Payables", val: data?.alerts?.overdue_payables_invoices ?? 0,    unit: "invoices", icon: <IconLedger /> },
                ].map(({ label, val, unit, icon }, i) => (
                  <div key={i} className="ticker-chip">
                    <span className="ticker-chip-icon">{icon}</span>
                    <span className="ticker-chip-label">{label}</span>
                    <span className="ticker-chip-val">{val} {unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ══ MAIN CONTENT ══ */}
          <div className="dash-body">

            {/* ── Command Bar ── */}
            <header className="dash-header">
              <div className="dash-header-left">
                <h1 className="dash-page-title">{NAV_LABELS.dashboard}</h1>
              </div>

              <div className="dash-header-center">
                <div className="dash-search-wrap">
                  <Search aria-hidden="true" size={15} strokeWidth={2.4} />
                  <input
                    ref={searchRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search… press /"
                    aria-label="Search dashboard"
                    className="dash-search-input"
                  />
                  {q && (
                    <button className="dash-search-clear" onClick={() => setQ("")} aria-label="Clear search">✕</button>
                  )}
                </div>
              </div>

              <div className="dash-header-right">
                <div className="preset-tabs" role="group" aria-label="Date presets">
                  {[
                    { label: "Today",   key: "TODAY" },
                    { label: "Month",   key: "MONTH" },
                    { label: "Quarter", key: "QUARTER" },
                    { label: "Year",    key: "YEAR" },
                  ].map(({ label, key }) => (
                    <button
                      key={key}
                      className={`preset-tab ${preset === key ? "active" : ""}`}
                      onClick={() => applyPreset(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  className="filter-toggle-btn"
                  onClick={() => setFilterOpen((v) => !v)}
                  aria-expanded={filterOpen}
                  aria-label="Toggle date filter"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
                  </svg>
                  Filter
                </button>

                <button
                  className={`refresh-btn ${busy ? "spinning" : ""}`}
                  onClick={() => refresh(dateFrom, dateTo)}
                  disabled={busy}
                  aria-label="Refresh dashboard"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M8 16H3v5"/>
                  </svg>
                  {busy ? "Updating…" : "Refresh"}
                </button>
              </div>
            </header>

            {/* Date range drawer */}
            {filterOpen && (
              <div className="date-drawer">
                <div className="date-drawer-inner">
                  <span className="date-drawer-label">Custom range</span>
                  <CommonDatePicker value={dateFrom} onChange={setDateFrom} ariaLabel="From date" size="sm" />
                  <span className="date-drawer-sep">→</span>
                  <CommonDatePicker value={dateTo}   onChange={setDateTo}   ariaLabel="To date"   size="sm" />
                </div>
              </div>
            )}

            {/* Loading bar */}
            {busy && (
              <div className="dash-progress-bar" role="progressbar" aria-label="Loading">
                <div className="dash-progress-fill" />
              </div>
            )}

            {/* ── Initial loading ── */}
            {busy && !data && (
              <div className="dash-skeleton-grid">
                {[1,2,3,4].map(i => <div key={i} className="skeleton-kpi" />)}
              </div>
            )}

            {!busy && !data && (
              <div className="dash-empty-state">
                <EmptyState title="No data" message="No data available for the selected range." />
              </div>
            )}

            {data && (
              <div className={`dash-content ${busy ? "dash-busy" : ""}`}>

                {/* ══ KPI STRIP ══ */}
                <section className="kpi-strip" aria-label="Key metrics">
                  {canSales && (
                    <div className="kpi-card kpi-primary" style={{ "--i": 0 }}>
                      <div className="kpi-card-glow" />
                      <div className="kpi-card-header">
                        <span className="kpi-card-label">Today's Sales</span>
                        <div className="kpi-card-icon">
                          <FileSpreadsheet aria-hidden="true" size={16} strokeWidth={2.2} />
                        </div>
                      </div>
                      <div className="kpi-card-value">{fmtCurrency(data.kpis?.today_sales?.value || 0) || fmtCurrency(0)}</div>
                      <div className="kpi-card-footer">
                        <span className="kpi-badge kpi-badge-up">
                          <IconChevronsUp />
                          {data.kpis?.today_sales?.delta_pct != null ? `${Number(data.kpis.today_sales.delta_pct).toFixed(1)}%` : ""}
                        </span>
                        <span className="kpi-card-sub">vs {fmtCurrency(data.kpis?.today_sales?.prev_value || 0) || fmtCurrency(0)} yesterday</span>
                      </div>
                      {kpiSparklines.todaySales.length >= 2 && (
                        <div className="kpi-sparkline">
                          <SparklineChart values={kpiSparklines.todaySales} color="var(--color-primary)" height={36} width={110} area />
                        </div>
                      )}
                    </div>
                  )}

                  {canSales && (
                    <div className="kpi-card kpi-success" style={{ "--i": 1 }}>
                      <div className="kpi-card-glow" />
                      <div className="kpi-card-header">
                        <span className="kpi-card-label">Period Sales</span>
                        <div className="kpi-card-icon">
                          <BarChart3 aria-hidden="true" size={16} strokeWidth={2.2} />
                        </div>
                      </div>
                      <div className="kpi-card-value kpi-val-success">{fmtCurrency(data.kpis?.range_sales?.value || 0) || fmtCurrency(0)}</div>
                      <div className="kpi-card-footer">
                        <span className="kpi-badge kpi-badge-neutral">{ymd(data.meta?.range?.from)} → {ymd(data.meta?.range?.to)}</span>
                        <span className="kpi-card-sub">selected range</span>
                      </div>
                      {kpiSparklines.periodSales.length >= 2 && (
                        <div className="kpi-sparkline">
                          <SparklineChart values={kpiSparklines.periodSales} color="var(--color-success)" height={36} width={110} area />
                        </div>
                      )}
                    </div>
                  )}

                  {canSales && (
                    <div className="kpi-card kpi-warning" style={{ "--i": 2 }}>
                      <div className="kpi-card-glow" />
                      <div className="kpi-card-header">
                        <span className="kpi-card-label">Receivables</span>
                        <div className="kpi-card-icon">
                          <CreditCard aria-hidden="true" size={16} strokeWidth={2.2} />
                        </div>
                      </div>
                      <div className="kpi-card-value kpi-val-warning">{fmtCurrency(data.kpis?.receivables?.value || 0) || fmtCurrency(0)}</div>
                      <div className="kpi-card-footer">
                        <span className="kpi-badge kpi-badge-down">
                          <IconChevronsDown />
                          {Number(data.kpis?.receivables?.invoices || 0)} invoices
                        </span>
                        <span className="kpi-card-sub">balance due</span>
                      </div>
                    </div>
                  )}

                  {canPurchases && (
                    <div className="kpi-card kpi-violet" style={{ "--i": 3 }}>
                      <div className="kpi-card-glow" />
                      <div className="kpi-card-header">
                        <span className="kpi-card-label">Today's Purchases</span>
                        <div className="kpi-card-icon">
                          <Package2 aria-hidden="true" size={16} strokeWidth={2.2} />
                        </div>
                      </div>
                      <div className="kpi-card-value">{fmtCurrency(data.kpis?.today_purchases?.value || 0) || fmtCurrency(0)}</div>
                      <div className="kpi-card-footer">
                        <span className="kpi-badge kpi-badge-neutral">{Number(data.kpis?.today_purchases?.invoices || 0)} invoices</span>
                        <span className="kpi-card-sub">today</span>
                      </div>
                      {kpiSparklines.purchases.length >= 2 && (
                        <div className="kpi-sparkline">
                          <SparklineChart values={kpiSparklines.purchases} color="var(--color-secondary)" height={36} width={110} area />
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* ══ QUICK ACTIONS ══ */}
                <section className="qa-section" aria-label="Quick actions">
                  <div className="section-header">
                    <div className="section-title">
                      <IconDashZap />
                      Quick Actions
                    </div>
                  </div>
                  <div className="qa-rail">
                    {[
                      { kind: "NEW_BILL",       label: "New Bill",       sub: "Sales billing",       icon: <IconPlus />,                                                     accent: "var(--color-primary)" },
                      { kind: "NEW_PURCHASE",   label: "New Purchase",   sub: "Purchase invoice",    icon: <Package2 aria-hidden="true" size={18} strokeWidth={2.2} />,       accent: "var(--color-success)" },
                      { kind: "SALES_RETURN",   label: "Sales Return",   sub: "Return entry",        icon: <RotateCcw aria-hidden="true" size={18} strokeWidth={2.2} />,      accent: "var(--color-warning-strong)" },
                      { kind: "RECORD_PAYMENT", label: "Record Payment", sub: "Log payment",         icon: <CreditCard aria-hidden="true" size={18} strokeWidth={2.2} />,     accent: "var(--color-success-strong)" },
                    ].map(({ kind, label, sub, icon, accent }, idx) => (
                      <div
                        key={kind}
                        className="qa-tile"
                        role="button" tabIndex={0}
                        style={{ "--qa-accent": accent, "--qa-i": idx }}
                        onClick={() => openQuickAction(kind)}
                        onKeyDown={(e) => onQaKeyDown(e, kind)}
                      >
                        <div className="qa-tile-icon">{icon}</div>
                        <div className="qa-tile-text">
                          <span className="qa-tile-label">{label}</span>
                          <span className="qa-tile-sub">{sub}</span>
                        </div>
                        <div className="qa-tile-arrow">
                          <IconChevronRight />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* ══ TREND + ALERTS ══ */}
                <div className="dash-row dash-row-60-40">

                  {/* Trend chart */}
                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">
                        <BarChart3 aria-hidden="true" size={15} strokeWidth={2.2} />
                        Sales Trend  Last 30 Days
                      </div>
                      <div className="panel-controls">
                        <div className="chart-legend">
                          {[["var(--color-primary)", "Sales"], ["var(--color-warning-strong)", "Purchase"]].map(([c, l]) => (
                            <span key={l} className="legend-item">
                              <span className="legend-dot" style={{ background: c }} />
                              {l}
                            </span>
                          ))}
                        </div>
                        <div className="seg-ctrl" aria-label="Chart type">
                          {[["LINE","Line"],["AREA","Area"],["BAR","Bar"]].map(([v,l]) => (
                            <button key={v} className={`seg-btn ${trendChartType===v?"active":""}`} onClick={()=>setTrendChartType(v)}>{l}</button>
                          ))}
                        </div>
                        <button className="panel-action" onClick={() => navigate("/reports/day-book")}>
                          Day Book <IconChevronRight />
                        </button>
                      </div>
                    </div>
                    <div className="panel-body">
                      {trendChartType === "BAR" ? (
                        <BarChart height={200} groups={trendChartData.barGroups} variant="GROUPED" yFormatter={(v) => fmtCurrency(v) || fmtCurrency(0)} />
                      ) : (
                        <LineAreaChart height={200} series={trendChartData.lineSeries} variant={trendChartType === "AREA" ? "AREA" : "LINE"} yFormatter={(v) => fmtCurrency(v) || fmtCurrency(0)} />
                      )}
                      <div className="chart-axis-labels">
                        <span>{ymd(data.meta?.range?.from)}</span>
                        <span>{ymd(data.meta?.range?.to)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Alerts */}
                  <div className="panel panel-alerts">
                    <div className="panel-header">
                      <div className="panel-title">
                        <span className="icon-danger"><IconAlert /></span>
                        Alerts
                      </div>
                      <button className="panel-action" onClick={() => navigate("/reports/inventory?tab=non-moving")}>
                        View all <IconChevronRight />
                      </button>
                    </div>
                    <div className="alert-list">
                      {(Array.isArray(data.widgets?.alerts) ? data.widgets.alerts : []).slice(0, 6).map((a, idx) => (
                        <div key={`${a.kind||"alert"}-${idx}`} className="alert-row">
                          <div className={`alert-pip ${a.severity || "amber"}`} />
                          <div className="alert-info">
                            <div className="alert-name">{a.title || "Alert"}</div>
                            <div className="alert-meta">{a.subtitle || ""}</div>
                          </div>
                          <div className={`alert-badge ${a.severity || "amber"}`}>{a.badge || ""}</div>
                        </div>
                      ))}
                      {(!Array.isArray(data.widgets?.alerts) || data.widgets.alerts.length === 0) && (
                        <div className="panel-body"><EmptyState title="No alerts" message="No alerts for this range." /></div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ══ WEEKLY + PAYMENT MODES ══ */}
                <div className="dash-row dash-row-50-50">

                  {/* Weekly sales */}
                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">
                        <BarChart3 aria-hidden="true" size={15} strokeWidth={2.2} />
                        Daily Sales  This Week
                      </div>
                      <div className="panel-controls">
                        <div className="seg-ctrl" aria-label="Weekly chart type">
                          {[["BAR","Bar"],["LINE","Line"]].map(([v,l]) => (
                            <button key={v} className={`seg-btn ${weekChartType===v?"active":""}`} onClick={()=>setWeekChartType(v)}>{l}</button>
                          ))}
                        </div>
                        <button className="panel-action" onClick={() => navigate("/reports/day-book")}>Day Book <IconChevronRight /></button>
                      </div>
                    </div>
                    <div className="panel-body">
                      {weekChartType === "LINE" ? (
                        <LineAreaChart
                          height={160}
                          series={[{
                            id: "week_sales", label: "Sales", color: "var(--color-primary)",
                            values: (weekBars.rows || []).map((r) => ({
                              xLabel: ymd(r.day)?.slice(5) || String(r.day || ""),
                              y: Number(r.sales_total || 0)
                            }))
                          }]}
                          variant="LINE"
                          yFormatter={(v) => fmtCurrency(v) || fmtCurrency(0)}
                        />
                      ) : (
                        <BarChart
                          height={160}
                          groups={(weekBars.rows || []).map((r) => ({
                            xLabel: ymd(r.day)?.slice(8, 10) || String(r.day || ""),
                            series: [{ id: "sales", label: "Sales", color: "var(--color-primary)", y: Number(r.sales_total || 0) }]
                          }))}
                          variant="GROUPED"
                          yFormatter={(v) => fmtCurrency(v) || fmtCurrency(0)}
                        />
                      )}
                    </div>
                  </div>

                  {/* Payment modes */}
                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">
                        <CreditCard aria-hidden="true" size={15} strokeWidth={2.2} />
                        Payment Modes
                      </div>
                      <div className="seg-ctrl" aria-label="Payment chart type">
                        {[["DONUT","Donut"],["BAR","Bar"],["STACKED","Stack"]].map(([v,l]) => (
                          <button key={v} className={`seg-btn ${payChartType===v?"active":""}`} onClick={()=>setPayChartType(v)}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <div className="panel-body">
                      {payChartType === "BAR" ? (
                        <BarChart height={180} groups={payMode.rows.map((x) => ({ xLabel: String(x.mode), series: [{ id: String(x.mode), label: String(x.mode), color: payColor(x.mode), y: Number(x.total || 0) }] }))} variant="GROUPED" yFormatter={(v) => fmtCurrency(v) || fmtCurrency(0)} />
                      ) : payChartType === "STACKED" ? (
                        <BarChart height={180} groups={[{ xLabel: "Total", series: payMode.rows.map((x) => ({ id: String(x.mode), label: String(x.mode), color: payColor(x.mode), y: Number(x.total || 0) })) }]} variant="STACKED" yFormatter={(v) => fmtCurrency(v) || fmtCurrency(0)} />
                      ) : (
                        <DonutChart height={180} slices={payMode.rows.map((x) => ({ id: String(x.mode), label: String(x.mode), value: Number(x.total || 0), color: payColor(x.mode) }))} centerLabel={fmtCurrency(payMode.total || 0) || fmtCurrency(0)} valueFormatter={(v) => fmtCurrency(v) || fmtCurrency(0)} />
                      )}
                    </div>
                  </div>
                </div>

                {/* ══ REVENUE BREAKDOWN ══ */}
                <div className="dash-row">
                  <div className="panel panel-full">
                    <div className="panel-header">
                      <div className="panel-title">
                        <BarChart3 aria-hidden="true" size={15} strokeWidth={2.2} />
                        Revenue Breakdown — Sales vs Purchases
                      </div>
                      <div className="panel-controls">
                        <div className="chart-legend">
                          {[["var(--color-primary)", "Sales"], ["var(--color-warning-strong)", "Purchases"]].map(([c, l]) => (
                            <span key={l} className="legend-item">
                              <span className="legend-dot" style={{ background: c }} />
                              {l}
                            </span>
                          ))}
                        </div>
                        <div className="seg-ctrl" aria-label="Revenue chart type">
                          {[["GROUPED","Grouped"],["STACKED","Stacked"],["AREA","Area"]].map(([v,l]) => (
                            <button key={v} className={`seg-btn ${profitChartType===v?"active":""}`} onClick={()=>setProfitChartType(v)}>{l}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="panel-body">
                      {profitChartType === "AREA" ? (
                        <LineAreaChart height={180} series={trendChartData.lineSeries} variant="AREA" yFormatter={(v) => fmtCurrency(v) || fmtCurrency(0)} />
                      ) : (
                        <BarChart
                          height={180}
                          groups={trendChartData.barGroups}
                          variant={profitChartType === "STACKED" ? "STACKED" : "GROUPED"}
                          yFormatter={(v) => fmtCurrency(v) || fmtCurrency(0)}
                        />
                      )}
                      <div className="chart-axis-labels">
                        <span>{ymd(data.meta?.range?.from)}</span>
                        <span>{ymd(data.meta?.range?.to)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ══ TOP PRODUCTS + TOP CUSTOMERS + EXPIRY ══ */}
                <div className="dash-row dash-row-3col">

                  {/* Top products */}
                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">
                        <Package2 aria-hidden="true" size={15} strokeWidth={2.2} />
                        Top Products
                      </div>
                      <button className="panel-action" onClick={() => navigate("/quality-master")}>All <IconChevronRight /></button>
                    </div>
                    <div className="panel-body prod-bars">
                      {filteredTopProducts.slice(0, 5).map((p, idx) => (
                        <div key={String(p.product_id || idx)} className="prod-bar-row" style={{ "--delay": `${idx * 60}ms` }}>
                          <div className="prod-bar-meta">
                            <span className="prod-bar-name">{p.product_name}</span>
                            <span className="prod-bar-val">{fmtCurrency(p.total) || fmtCurrency(0)}</span>
                          </div>
                          <div className="prod-bar-track">
                            <div
                              className="prod-bar-fill"
                              style={{
                                width: animateBars ? `${(Number(p.total || 0) / topProducts.max) * 100}%` : "0%",
                                background: progColors[idx % progColors.length],
                                transitionDelay: `${idx * 60}ms`
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      {filteredTopProducts.length === 0 && <EmptyState title="No products" message="No products match your search." />}
                    </div>
                  </div>

                  {/* Top customers */}
                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">
                        <UsersRound aria-hidden="true" size={15} strokeWidth={2.2} />
                        Top Customers
                      </div>
                      <button className="panel-action" onClick={() => navigate("/reports/ledger?tab=customer")}>Ledger <IconChevronRight /></button>
                    </div>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr><th>Customer</th><th className="r">Billed</th><th className="r">Balance</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {filteredTopCustomers.slice(0, 5).map((c) => (
                            <tr key={String(c.customer_id)}>
                              <td className="td-bold">{c.customer_name}</td>
                              <td className="r">{fmtCurrency(c.billed) || fmtCurrency(0)}</td>
                              <td className="r">{fmtCurrency(c.balance) || fmtCurrency(0)}</td>
                              <td>
                                <span className={`status-pill ${String(c.pay_status||"").toUpperCase()==="PAID"?"green":String(c.pay_status||"").toUpperCase()==="UNPAID"?"red":"amber"}`}>
                                  {c.pay_status ? (String(c.pay_status)[0] + String(c.pay_status).slice(1).toLowerCase()) : ""}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {filteredTopCustomers.length === 0 && (
                            <tr><td colSpan={4}><EmptyState title="No customers" message="No data found." /></td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Expiry watch */}
                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">
                        <span className="icon-danger"><IconAlert /></span>
                        Expiry Watch
                      </div>
                      <button className="panel-action" onClick={() => navigate("/quality-master")}>All Batches <IconChevronRight /></button>
                    </div>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr><th>Product · Batch</th><th className="r">Stock</th><th className="r">Expires</th><th>Days</th></tr>
                        </thead>
                        <tbody>
                          {(Array.isArray(data.widgets?.expiry_watch) ? data.widgets.expiry_watch : []).slice(0, 5).map((b) => {
                            const d = daysUntil(b.expiry_date);
                            const cls = d != null && d <= 14 ? "red" : d != null && d <= 45 ? "amber" : "green";
                            return (
                              <tr key={String(b.batch_id)}>
                                <td className="td-bold">{`${b.product_name} ${b.batch_no}`}</td>
                                <td className="r">{Number(b.current_stock || 0)}</td>
                                <td className="r">{ymd(b.expiry_date)}</td>
                                <td><span className={`status-pill ${cls}`}>{d == null ? "" : `${d}d`}</span></td>
                              </tr>
                            );
                          })}
                          {(!canBatches || !Array.isArray(data.widgets?.expiry_watch) || data.widgets.expiry_watch.length === 0) && (
                            <tr><td colSpan={4}><EmptyState title="No expiry data" message={canBatches ? "No expiring batches." : "No batch permission."} /></td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* ══ RECENT TRANSACTIONS ══ */}
                <div className="panel panel-transactions">
                  <div className="panel-header">
                    <div className="panel-title">
                      <FileSpreadsheet aria-hidden="true" size={15} strokeWidth={2.2} />
                      Recent Transactions
                    </div>
                    <div className="panel-controls">
                      <div className="seg-ctrl">
                        <button className={`seg-btn ${recentTab==="SALES"?"active":""}`}     onClick={()=>setRecentTab("SALES")}>Sales</button>
                        <button className={`seg-btn ${recentTab==="PURCHASES"?"active":""}`} onClick={()=>setRecentTab("PURCHASES")}>Purchases</button>
                        <button className={`seg-btn ${recentTab==="RETURNS"?"active":""}`}   onClick={()=>setRecentTab("RETURNS")}>Returns</button>
                      </div>
                      <button className="panel-action"
                        onClick={() => navigate(recentTab==="SALES" ? "/sales-billing" : recentTab==="PURCHASES" ? "/purchase-invoices" : "/sales-returns")}>
                        View All <IconChevronRight />
                      </button>
                    </div>
                  </div>
                  <div className="table-scroll-wrap">
                    <table className="data-table data-table-lg">
                      <thead>
                        <tr>
                          <th>#</th><th>Invoice</th><th>Party</th><th>Date</th>
                          <th>Items</th><th className="r">Total</th><th className="r">Paid</th>
                          <th className="r">Balance</th><th>Status</th><th>Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecent.slice(0, 6).map((x, i) => (
                          <tr key={String(x.id || i)}>
                            <td className="td-num">{i + 1}</td>
                            <td className="td-bold">{x.invoice_number || x.return_number || ""}</td>
                            <td>{x.customer_name || x.vendor_name || x.party_name || ""}</td>
                            <td>{ymd(x.invoice_date || x.return_date)}</td>
                            <td>{Number(x.item_count || 0)}</td>
                            <td className="r">{fmtCurrency(x.total_amount || x.total_return_amount || 0) || fmtCurrency(0)}</td>
                            <td className="r">{fmtCurrency(x.amount_paid || 0) || fmtCurrency(0)}</td>
                            <td className="r">{fmtCurrency(x.balance_due || 0) || fmtCurrency(0)}</td>
                            <td><span className={`status-pill ${pillClassForStatus(x.status)}`}>{String(x.status || "")}</span></td>
                            <td><span className={`status-pill ${pillClassForStatus(x.payment_status)}`}>{String(x.payment_status || "")}</span></td>
                          </tr>
                        ))}
                        {filteredRecent.length === 0 && (
                          <tr><td colSpan={10}><EmptyState title="No transactions" message="No rows found." /></td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ══ STOCK SUMMARY + SUPPLIER PAYABLES ══ */}
                <div className="dash-row dash-row-50-50" style={{ marginBottom: 0 }}>

                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">
                        <Package2 aria-hidden="true" size={15} strokeWidth={2.2} />
                        Stock Summary
                      </div>
                      <button className="panel-action" onClick={() => navigate("/quality-master")}>Products <IconChevronRight /></button>
                    </div>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Product</th><th className="r">Batches</th><th className="r">Qty</th><th>Health</th></tr></thead>
                        <tbody>
                          {(Array.isArray(data.widgets?.stock_summary) ? data.widgets.stock_summary : []).slice(0, 5).map((r) => (
                            <tr key={String(r.product_id)}>
                              <td className="td-bold">{r.product_name}</td>
                              <td className="r">{Number(r.batch_count || 0)}</td>
                              <td className="r">{Number(r.total_qty || 0)}</td>
                              <td>
                                <span className={`status-pill ${String(r.health||"").toUpperCase()==="GOOD"?"green":String(r.health||"").toUpperCase()==="NO_STOCK"?"red":"amber"}`}>
                                  {r.health_label || r.health}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {(!Array.isArray(data.widgets?.stock_summary) || data.widgets.stock_summary.length === 0) && (
                            <tr><td colSpan={4}><EmptyState title="No stock data" message="No stock summary available." /></td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-header">
                      <div className="panel-title">
                        <CreditCard aria-hidden="true" size={15} strokeWidth={2.2} />
                        Supplier Payables
                      </div>
                      <button className="panel-action" onClick={() => navigate("/reports/ledger?tab=supplier")}>Supplier Ledger <IconChevronRight /></button>
                    </div>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Supplier</th><th className="r">Outstanding</th><th className="r">Overdue</th><th>Status</th></tr></thead>
                        <tbody>
                          {(Array.isArray(data.widgets?.supplier_payables) ? data.widgets.supplier_payables : []).slice(0, 5).map((r) => (
                            <tr key={String(r.vendor_id)}>
                              <td className="td-bold">{r.vendor_name || ""}</td>
                              <td className="r">{fmtCurrency(r.outstanding) || fmtCurrency(0)}</td>
                              <td className="r">{fmtCurrency(r.overdue) || fmtCurrency(0)}</td>
                              <td><span className={`status-pill ${Number(r.overdue||0)>0?"red":"green"}`}>{Number(r.overdue||0)>0?"Overdue":"Clear"}</span></td>
                            </tr>
                          ))}
                          {(!Array.isArray(data.widgets?.supplier_payables) || data.widgets.supplier_payables.length === 0) && (
                            <tr><td colSpan={4}><EmptyState title="No payables" message="No supplier balances due." /></td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}