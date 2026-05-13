import { useEffect, useMemo, useState } from "react";
import { useSeoMeta } from "../utils/seo.js";
import { useSearchParams } from "react-router-dom";
import { ReportShell, ReportDenied } from "../components/reports/index.js";
import { can } from "../utils/access.js";
import { ProductSupplierReportContent } from "./ProductSupplierReportPage.jsx";
import { MfgStockistReportContent } from "./MfgStockistReportPage.jsx";
import { NonMovingReportContent } from "./NonMovingReportPage.jsx";
import { SalesStockAnalysisContent } from "./SalesStockAnalysisPage.jsx";
import { Package2, Building2, AlertTriangle, TrendingUp } from "../components/ui/AppIcons.jsx";
import "./MergedReportsPage.css";

const TABS = [
  { id: "product-supplier", label: "Product Supplier", icon: <Package2 size={15} strokeWidth={2} /> },
  { id: "mfg-stockist",     label: "Mfg Stockist",     icon: <Building2 size={15} strokeWidth={2} /> },
  { id: "non-moving",       label: "Non Moving",        icon: <AlertTriangle size={15} strokeWidth={2} /> },
  { id: "sales-stock",      label: "Sales & Stock",     icon: <TrendingUp size={15} strokeWidth={2} /> },
];

function clampTabId(id) {
  const s = String(id || "");
  return TABS.some((t) => t.id === s) ? s : "product-supplier";
}

export default function InventoryReportsPage() {
  useSeoMeta({ title: "Inventory Reports" });
  const canPS  = can("PRODUCT_BATCHES", "VIEW");
  const canMfg = can("MFG_COMPANIES", "VIEW") || can("PRODUCT_BATCHES", "VIEW");
  const canAny = canPS || canMfg;

  const [params, setParams] = useSearchParams();
  const urlTab = clampTabId(params.get("tab"));
  const [tab, setTab] = useState(urlTab);

  useEffect(() => { setTab(urlTab); }, [urlTab]);

  const activeLabel = useMemo(
    () => TABS.find((t) => t.id === tab)?.label || "Product Supplier",
    [tab]
  );

  if (!canAny) {
    return (
      <ReportDenied
        title="Inventory Reports"
        message="You don't have permission to view these reports."
      />
    );
  }

  function setActive(nextId) {
    const next = clampTabId(nextId);
    setTab(next);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("tab", next);
        return p;
      },
      { replace: true }
    );
  }

  return (
    <ReportShell>
      <div className="pageWrap">

        {/* ── Page header ── */}
        <div className="mrPageHeader">
          <div className="mrPageHeaderText">
            <h1 className="mrPageTitle">Inventory Reports</h1>
            <p className="mrPageSub">
              Product batches · manufacturers · stock movement
            </p>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="mrTabs" role="tablist" aria-label="Inventory report tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`mrTab${tab === t.id ? " mrTab_active" : ""}`}
              onClick={() => setActive(t.id)}
            >
              <span className="mrTabIcon" aria-hidden="true">{t.icon}</span>
              <span className="mrTabLabel">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="mrBody" role="tabpanel" aria-label={activeLabel}>
          {tab === "product-supplier" && <ProductSupplierReportContent embedded />}
          {tab === "mfg-stockist"     && <MfgStockistReportContent     embedded />}
          {tab === "non-moving"       && <NonMovingReportContent        embedded />}
          {tab === "sales-stock"      && <SalesStockAnalysisContent     embedded />}
        </div>

      </div>
    </ReportShell>
  );
}
