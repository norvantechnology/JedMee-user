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
import { useLocation, useNavigate } from "react-router-dom";
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
  const location   = useLocation();
  const [autoTick, setAutoTick]           = useState(0);
  const [trendChartType, setTrendChartType]   = useState("LINE");
  const [weekChartType, setWeekChartType]     = useState("BAR");
  const [payChartType, setPayChartType]       = useState("DONUT");
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
    // Week start: Monday of current week (ISO week)
    const todayDate = new Date(`${today}T00:00:00`);
    const dayOfWeek = todayDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(todayDate);
    weekStart.setDate(todayDate.getDate() - daysToMonday);
    const weekStartYmd = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
    const ranges = {
      TODAY:   { from: today,                          to: today },
      WEEK:    { from: weekStartYmd,                   to: today },
      MONTH:   { from: `${today.slice(0, 8)}01`,       to: today },
      QUARTER: { from: quarterStartYmd(today),          to: today },
      YEAR:    { from: `${today.slice(0, 4)}-01-01`,   to: today },
    };
    const { from, to } = ranges[p] || { from: "", to: today };
    setDateFrom(from);
    setDateTo(to);
    void refresh(from, to);
  }

  async function refresh(nextFrom, nextTo) {
    const seq = ++reqSeqRef.current;
    setBusy(true); setAnimateBars(false);
    const params = { dateFrom: nextFrom || undefined, dateTo: nextTo || undefined };
    if (nextFrom && nextFrom === nextTo) params.date = nextFrom;
    const r = await getDashboardSummary(params);
    if (seq !== reqSeqRef.current) return;
    if (r.status >= 200 && r.status < 300 && r.json?.ok) setData(r.json?.data || null);
    else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
    setBusy(false);
  }

  useEffect(() => {
    if (!dateFrom && preset === "MONTH") applyPreset("MONTH");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live data when returning to dashboard from another route.
  useEffect(() => {
    if (location.pathname !== "/dashboard") return;
    const from = String(dateFrom || "").trim();
    const to = String(dateTo || "").trim();
    if (!from || !to) return;
    void refresh(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Live data when the browser tab becomes visible again.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      if (location.pathname !== "/dashboard") return;
      const from = String(dateFrom || "").trim();
      const to = String(dateTo || "").trim();
      if (!from || !to) return;
      void refresh(from, to);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, dateFrom, dateTo]);

  // Live data when switching recent-activity tabs (Sales / Purchases / Returns).
  useEffect(() => {
    const from = String(dateFrom || "").trim();
    const to = String(dateTo || "").trim();
    if (!from || !to) return;
    void refresh(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentTab]);

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

  // ── New analytics derived data ──────────────────────────────────────────────
  const pendingOrders = useMemo(() => data?.widgets?.pending_orders || { incoming_count: 0, incoming_value: 0, my_count: 0, my_value: 0 }, [data]);
  const momComparison = useMemo(() => data?.widgets?.mom_comparison || null, [data]);
  const overdueAging  = useMemo(() => data?.widgets?.overdue_aging  || null, [data]);
  const topMfg        = useMemo(() => {
    const rows = Array.isArray(data?.widgets?.top_manufacturers) ? data.widgets.top_manufacturers : [];
    return { rows, max: Math.max(1, ...rows.map((r) => Number(r.total || 0))) };
  }, [data]);
  const invoicePayStatus = useMemo(() => data?.widgets?.invoice_pay_status || null, [data]);
  const expiryRisk    = useMemo(() => data?.widgets?.expiry_value_at_risk || null, [data]);
  const nonMovingVal  = useMemo(() => data?.widgets?.non_moving_value || null, [data]);
  const stockCoverage = useMemo(() => Array.isArray(data?.widgets?.stock_coverage) ? data.widgets.stock_coverage : [], [data]);

  const hasPendingOrders = (pendingOrders.incoming_count > 0) || (pendingOrders.my_count > 0);
  const hasMom           = momComparison != null && (momComparison.last_month > 0 || momComparison.same_month_last_year > 0);
  const hasAging         = overdueAging != null && (overdueAging.bucket_0_30?.amount > 0 || overdueAging.bucket_31_60?.amount > 0 || overdueAging.bucket_61_90?.amount > 0 || overdueAging.bucket_90_plus?.amount > 0);
  const hasTopMfg        = topMfg.rows.length > 0;
  const hasPayStatus     = invoicePayStatus != null && invoicePayStatus.total_invoices > 0;
  const hasExpiryRisk    = expiryRisk != null && expiryRisk.value_30d > 0;
  const hasNonMovingVal  = nonMovingVal != null && nonMovingVal.count > 0;
  const hasStockCoverage = stockCoverage.length > 0;

  // Purchase-to-sales ratio (derived, matches active preset KPIs)
  const purchaseToSalesRatio = useMemo(() => {
    const sales = preset === "TODAY"
      ? Number(data?.kpis?.today_sales?.value || 0)
      : Number(data?.kpis?.range_sales?.value || 0);
    const pur = preset === "TODAY"
      ? Number(data?.kpis?.today_purchases?.value || 0)
      : Number(data?.kpis?.range_purchases?.value || 0);
    if (sales <= 0) return null;
    return Math.round((pur / sales) * 100);
  }, [data, preset]);

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
                    { label: "Today",    key: "TODAY" },
                    { label: "Week",     key: "WEEK" },
                    { label: "Month",    key: "MONTH" },
                    { label: "Quarter",  key: "QUARTER" },
                    { label: "Year",     key: "YEAR" },
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
                        <span className="kpi-card-label">{preset === "TODAY" ? "Today's Sales" : "Period Sales"}</span>
                        <div className="kpi-card-icon">
                          <FileSpreadsheet aria-hidden="true" size={16} strokeWidth={2.2} />
                        </div>
                      </div>
                      <div className="kpi-card-value">
                        {preset === "TODAY"
                          ? (fmtCurrency(data.kpis?.today_sales?.value || 0) || fmtCurrency(0))
                          : (fmtCurrency(data.kpis?.range_sales?.value || 0) || fmtCurrency(0))}
                      </div>
                      <div className="kpi-card-footer">
                        {preset === "TODAY" ? (
                          <>
                            <span className="kpi-badge kpi-badge-up">
                              <IconChevronsUp />
                              {data.kpis?.today_sales?.delta_pct != null ? `${Number(data.kpis.today_sales.delta_pct).toFixed(1)}%` : ""}
                            </span>
                            <span className="kpi-card-sub">vs {fmtCurrency(data.kpis?.today_sales?.prev_value || 0) || fmtCurrency(0)} yesterday</span>
                          </>
                        ) : (
                          <>
                            <span className="kpi-badge kpi-badge-neutral">{ymd(data.meta?.range?.from)} → {ymd(data.meta?.range?.to)}</span>
                            <span className="kpi-card-sub">selected range</span>
                          </>
                        )}
                      </div>
                      {kpiSparklines.periodSales.length >= 2 && (
                        <div className="kpi-sparkline">
                          <SparklineChart values={kpiSparklines.periodSales} color="var(--color-primary)" height={36} width={110} area />
                        </div>
                      )}
                    </div>
                  )}

                  {canSales && (
                    <div className="kpi-card kpi-warning" style={{ "--i": 1 }}>
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
                        <span className="kpi-card-sub">total outstanding</span>
                      </div>
                    </div>
                  )}

                  {canPurchases && (
                    <div className="kpi-card kpi-violet" style={{ "--i": 2 }}>
                      <div className="kpi-card-glow" />
                      <div className="kpi-card-header">
                        <span className="kpi-card-label">{preset === "TODAY" ? "Today's Purchases" : "Period Purchases"}</span>
                        <div className="kpi-card-icon">
                          <Package2 aria-hidden="true" size={16} strokeWidth={2.2} />
                        </div>
                      </div>
                      <div className="kpi-card-value">
                        {preset === "TODAY"
                          ? (fmtCurrency(data.kpis?.today_purchases?.value || 0) || fmtCurrency(0))
                          : (fmtCurrency(data.kpis?.range_purchases?.value || 0) || fmtCurrency(0))}
                      </div>
                      <div className="kpi-card-footer">
                        <span className="kpi-badge kpi-badge-neutral">
                          {preset === "TODAY"
                            ? `${Number(data.kpis?.today_purchases?.invoices || 0)} invoices`
                            : `${Number(data.kpis?.range_purchases?.invoices || 0)} invoices`}
                        </span>
                        <span className="kpi-card-sub">{preset === "TODAY" ? "today" : "selected range"}</span>
                      </div>
                      {kpiSparklines.purchases.length >= 2 && (
                        <div className="kpi-sparkline">
                          <SparklineChart values={kpiSparklines.purchases} color="var(--color-secondary)" height={36} width={110} area />
                        </div>
                      )}
                    </div>
                  )}

                  {canSales && canPurchases && data.kpis?.gross_profit != null && (
                    <div className="kpi-card kpi-success" style={{ "--i": 3 }}>
                      <div className="kpi-card-glow" />
                      <div className="kpi-card-header">
                        <span className="kpi-card-label">Gross Profit</span>
                        <div className="kpi-card-icon">
                          <BarChart3 aria-hidden="true" size={16} strokeWidth={2.2} />
                        </div>
                      </div>
                      <div className="kpi-card-value kpi-val-success">{fmtCurrency(data.kpis.gross_profit.value) || fmtCurrency(0)}</div>
                      <div className="kpi-card-footer">
                        <span className="kpi-badge kpi-badge-neutral">
                          {(() => {
                            const sales = preset === "TODAY"
                              ? Number(data.kpis?.today_sales?.value || 0)
                              : Number(data.kpis?.range_sales?.value || 0);
                            const profit = Number(data.kpis.gross_profit.value || 0);
                            return sales > 0 ? `${((profit / sales) * 100).toFixed(1)}% margin` : "0.0% margin";
                          })()}
                        </span>
                        <span className="kpi-card-sub">sales − purchases</span>
                      </div>
                    </div>
                  )}

                  {canPurchases && (
                    <div className="kpi-card" style={{ "--i": 4, borderLeft: "3px solid var(--color-danger)" }}>
                      <div className="kpi-card-glow" />
                      <div className="kpi-card-header">
                        <span className="kpi-card-label">Payables</span>
                        <div className="kpi-card-icon">
                          <CreditCard aria-hidden="true" size={16} strokeWidth={2.2} />
                        </div>
                      </div>
                      <div className="kpi-card-value" style={{ color: "var(--color-danger)" }}>{fmtCurrency(data.kpis?.payables?.value || 0) || fmtCurrency(0)}</div>
                      <div className="kpi-card-footer">
                        <span className="kpi-badge kpi-badge-down">
                          <IconChevronsDown />
                          {Number(data.kpis?.payables?.invoices || 0)} invoices
                        </span>
                        <span className="kpi-card-sub">total outstanding</span>
                      </div>
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

                {/* ══ PENDING ORDERS WIDGET ══ */}
                {hasPendingOrders && (
                  <div className="dash-row">
                    <div className="panel panel-full panel-orders-banner">
                      <div className="panel-header">
                        <div className="panel-title">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                          Pending Orders
                        </div>
                        <button className="panel-action" onClick={() => navigate("/orders")}>View All <IconChevronRight /></button>
                      </div>
                      <div className="orders-banner-grid">
                        {pendingOrders.incoming_count > 0 && (
                          <div className="orders-banner-card orders-incoming" onClick={() => navigate("/orders?tab=incoming&status=PENDING")} role="button" tabIndex={0}>
                            <div className="orders-banner-icon">
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                            </div>
                            <div className="orders-banner-info">
                              <span className="orders-banner-count">{pendingOrders.incoming_count}</span>
                              <span className="orders-banner-label">Incoming Orders</span>
                              <span className="orders-banner-val">{fmtCurrency(pendingOrders.incoming_value) || fmtCurrency(0)}</span>
                            </div>
                            <div className="orders-banner-cta">Accept <IconChevronRight /></div>
                          </div>
                        )}
                        {pendingOrders.my_count > 0 && (
                          <div className="orders-banner-card orders-my" onClick={() => navigate("/orders?tab=my&status=PENDING")} role="button" tabIndex={0}>
                            <div className="orders-banner-icon">
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                            </div>
                            <div className="orders-banner-info">
                              <span className="orders-banner-count">{pendingOrders.my_count}</span>
                              <span className="orders-banner-label">My Pending Orders</span>
                              <span className="orders-banner-val">{fmtCurrency(pendingOrders.my_value) || fmtCurrency(0)}</span>
                            </div>
                            <div className="orders-banner-cta">Track <IconChevronRight /></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ══ MONTH-OVER-MONTH + COLLECTION EFFICIENCY ══ */}
                {(hasMom || hasPayStatus || purchaseToSalesRatio != null) && (
                  <div className="dash-row dash-row-3col">

                    {/* Month-over-Month */}
                    {hasMom && (
                      <div className="panel">
                        <div className="panel-header">
                          <div className="panel-title">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            Month-over-Month
                          </div>
                        </div>
                        <div className="panel-body mom-grid">
                          <div className="mom-row">
                            <span className="mom-label">Current period</span>
                            <span className="mom-val">{fmtCurrency(momComparison.current_period) || fmtCurrency(0)}</span>
                          </div>
                          <div className="mom-row">
                            <span className="mom-label">Last month</span>
                            <span className="mom-val">{fmtCurrency(momComparison.last_month) || fmtCurrency(0)}</span>
                            {momComparison.mom_delta_pct != null && (
                              <span className={`mom-delta ${momComparison.mom_delta_pct >= 0 ? "up" : "down"}`}>
                                {momComparison.mom_delta_pct >= 0 ? "▲" : "▼"} {Math.abs(momComparison.mom_delta_pct).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <div className="mom-row">
                            <span className="mom-label">Same month last year</span>
                            <span className="mom-val">{fmtCurrency(momComparison.same_month_last_year) || fmtCurrency(0)}</span>
                            {momComparison.yoy_delta_pct != null && (
                              <span className={`mom-delta ${momComparison.yoy_delta_pct >= 0 ? "up" : "down"}`}>
                                {momComparison.yoy_delta_pct >= 0 ? "▲" : "▼"} {Math.abs(momComparison.yoy_delta_pct).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Collection Efficiency */}
                    {hasPayStatus && (
                      <div className="panel">
                        <div className="panel-header">
                          <div className="panel-title">
                            <CreditCard aria-hidden="true" size={15} strokeWidth={2.2} />
                            Collection Efficiency
                          </div>
                        </div>
                        <div className="panel-body">
                          <div className="collection-pct-ring">
                            <svg viewBox="0 0 80 80" width="80" height="80">
                              <circle cx="40" cy="40" r="32" fill="none" stroke="var(--color-border)" strokeWidth="8"/>
                              <circle cx="40" cy="40" r="32" fill="none"
                                stroke={invoicePayStatus.collection_pct >= 80 ? "var(--color-success)" : invoicePayStatus.collection_pct >= 50 ? "var(--color-warning-strong)" : "var(--color-danger)"}
                                strokeWidth="8"
                                strokeDasharray={`${(invoicePayStatus.collection_pct / 100) * 201} 201`}
                                strokeLinecap="round"
                                transform="rotate(-90 40 40)"
                              />
                              <text x="40" y="44" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--color-text)">{invoicePayStatus.collection_pct}%</text>
                            </svg>
                            <div className="collection-stats">
                              <div className="coll-stat"><span className="coll-dot green"/><span>Paid: {invoicePayStatus.paid}</span></div>
                              <div className="coll-stat"><span className="coll-dot amber"/><span>Partial: {invoicePayStatus.partial}</span></div>
                              <div className="coll-stat"><span className="coll-dot red"/><span>Unpaid: {invoicePayStatus.unpaid}</span></div>
                            </div>
                          </div>
                          <div className="collection-amounts">
                            <div className="coll-amount-row">
                              <span>Billed</span><span>{fmtCurrency(invoicePayStatus.total_billed) || fmtCurrency(0)}</span>
                            </div>
                            <div className="coll-amount-row">
                              <span>Collected</span><span className="green-text">{fmtCurrency(invoicePayStatus.total_collected) || fmtCurrency(0)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Purchase-to-Sales Ratio */}
                    {purchaseToSalesRatio != null && (
                      <div className="panel">
                        <div className="panel-header">
                          <div className="panel-title">
                            <BarChart3 aria-hidden="true" size={15} strokeWidth={2.2} />
                            Purchase / Sales Ratio
                          </div>
                        </div>
                        <div className="panel-body ratio-body">
                          <div className="ratio-gauge">
                            <div className="ratio-track">
                              <div className="ratio-fill" style={{ width: `${Math.min(100, purchaseToSalesRatio)}%`, background: purchaseToSalesRatio > 90 ? "var(--color-danger)" : purchaseToSalesRatio > 70 ? "var(--color-warning-strong)" : "var(--color-success)" }} />
                            </div>
                            <span className="ratio-pct">{purchaseToSalesRatio}%</span>
                          </div>
                          <p className="ratio-desc">
                            For every ₹100 sold, <strong>₹{purchaseToSalesRatio}</strong> was spent on purchases.
                            {purchaseToSalesRatio > 90 ? " ⚠️ High cost ratio." : purchaseToSalesRatio < 50 ? " ✅ Healthy margin." : " Moderate margin."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ══ OVERDUE AGING + TOP MANUFACTURERS ══ */}
                {(hasAging || hasTopMfg) && (
                  <div className="dash-row dash-row-50-50">

                    {/* Overdue Aging Buckets */}
                    {hasAging && (
                      <div className="panel">
                        <div className="panel-header">
                          <div className="panel-title">
                            <span className="icon-danger"><IconAlert /></span>
                            Overdue Receivables Aging
                          </div>
                          <button className="panel-action" onClick={() => navigate("/reports/ledger?tab=customer")}>Ledger <IconChevronRight /></button>
                        </div>
                        <div className="panel-body aging-body">
                          {[
                            { label: "0–30 days",  data: overdueAging.bucket_0_30,   color: "var(--color-warning-strong)" },
                            { label: "31–60 days", data: overdueAging.bucket_31_60,  color: "var(--color-warning-strong)" },
                            { label: "61–90 days", data: overdueAging.bucket_61_90,  color: "var(--color-danger)" },
                            { label: "90+ days",   data: overdueAging.bucket_90_plus, color: "var(--color-danger)" },
                          ].map(({ label, data: bd, color }) => {
                            const totalAging = (overdueAging.bucket_0_30?.amount || 0) + (overdueAging.bucket_31_60?.amount || 0) + (overdueAging.bucket_61_90?.amount || 0) + (overdueAging.bucket_90_plus?.amount || 0);
                            const w = totalAging > 0 ? pct(bd?.amount || 0, totalAging) : 0;
                            return (
                              <div key={label} className="aging-row">
                                <div className="aging-meta">
                                  <span className="aging-label">{label}</span>
                                  <span className="aging-count">{bd?.count || 0} inv</span>
                                  <span className="aging-amount">{fmtCurrency(bd?.amount || 0) || fmtCurrency(0)}</span>
                                </div>
                                <div className="aging-track">
                                  <div className="aging-fill" style={{ width: `${w}%`, background: color }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Top Manufacturers */}
                    {hasTopMfg && (
                      <div className="panel">
                        <div className="panel-header">
                          <div className="panel-title">
                            <Package2 aria-hidden="true" size={15} strokeWidth={2.2} />
                            Top Manufacturers
                          </div>
                          <button className="panel-action" onClick={() => navigate("/mfg-companies")}>All <IconChevronRight /></button>
                        </div>
                        <div className="panel-body prod-bars">
                          {topMfg.rows.slice(0, 6).map((m, idx) => (
                            <div key={String(m.mfg_id || idx)} className="prod-bar-row" style={{ "--delay": `${idx * 60}ms` }}>
                              <div className="prod-bar-meta">
                                <span className="prod-bar-name">{m.mfg_name}</span>
                                <span className="prod-bar-val">{fmtCurrency(m.total) || fmtCurrency(0)}</span>
                              </div>
                              <div className="prod-bar-track">
                                <div className="prod-bar-fill" style={{ width: animateBars ? `${(Number(m.total || 0) / topMfg.max) * 100}%` : "0%", background: progColors[idx % progColors.length], transitionDelay: `${idx * 60}ms` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ══ EXPIRY VALUE AT RISK + NON-MOVING VALUE + STOCK COVERAGE ══ */}
                {(hasExpiryRisk || hasNonMovingVal || hasStockCoverage) && (
                  <div className="dash-row dash-row-3col">

                    {/* Expiry Value at Risk */}
                    {hasExpiryRisk && (
                      <div className="panel">
                        <div className="panel-header">
                          <div className="panel-title">
                            <span className="icon-danger"><IconNearExpiry /></span>
                            Expiry Value at Risk
                          </div>
                          <button className="panel-action" onClick={() => navigate("/quality-master")}>Batches <IconChevronRight /></button>
                        </div>
                        <div className="panel-body expiry-risk-body">
                          {[
                            { label: "Within 30 days", val: expiryRisk.value_30d, batches: expiryRisk.batches_30d, cls: "red" },
                            { label: "Within 60 days", val: expiryRisk.value_60d, batches: expiryRisk.batches_60d, cls: "amber" },
                            { label: "Within 90 days", val: expiryRisk.value_90d, batches: 0, cls: "gray" },
                          ].map(({ label, val, batches, cls }) => (
                            <div key={label} className="expiry-risk-row">
                              <div className={`expiry-risk-pip ${cls}`} />
                              <div className="expiry-risk-info">
                                <span className="expiry-risk-label">{label}</span>
                                {batches > 0 && <span className="expiry-risk-batches">{batches} batches</span>}
                              </div>
                              <span className="expiry-risk-val">{fmtCurrency(val) || fmtCurrency(0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Non-Moving Stock Value */}
                    {hasNonMovingVal && (
                      <div className="panel">
                        <div className="panel-header">
                          <div className="panel-title">
                            <span className="icon-amber"><IconNonMoving /></span>
                            Non-Moving Stock Value
                          </div>
                          <button className="panel-action" onClick={() => navigate("/reports/inventory?tab=non-moving")}>Report <IconChevronRight /></button>
                        </div>
                        <div className="panel-body non-moving-body">
                          <div className="nm-big-val">{fmtCurrency(nonMovingVal.value) || fmtCurrency(0)}</div>
                          <div className="nm-sub">{nonMovingVal.count} batches not sold in {data?.meta?.thresholds?.non_moving_days || 90}+ days</div>
                          <div className="nm-hint">Capital locked in slow-moving inventory. Consider clearance pricing.</div>
                        </div>
                      </div>
                    )}

                    {/* Stock Coverage Days */}
                    {hasStockCoverage && (
                      <div className="panel">
                        <div className="panel-header">
                          <div className="panel-title">
                            <Package2 aria-hidden="true" size={15} strokeWidth={2.2} />
                            Stock Coverage Days
                          </div>
                          <button className="panel-action" onClick={() => navigate("/quality-master")}>Products <IconChevronRight /></button>
                        </div>
                        <div className="table-wrap">
                          <table className="data-table">
                            <thead><tr><th>Product</th><th className="r">Stock</th><th className="r">Days Left</th></tr></thead>
                            <tbody>
                              {stockCoverage.slice(0, 6).map((r) => (
                                <tr key={String(r.product_id)}>
                                  <td className="td-bold">{r.product_name}</td>
                                  <td className="r">{Number(r.total_stock || 0)}</td>
                                  <td className="r">
                                    <span className={`status-pill ${r.coverage_days <= 7 ? "red" : r.coverage_days <= 30 ? "amber" : "green"}`}>
                                      {r.coverage_days}d
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}