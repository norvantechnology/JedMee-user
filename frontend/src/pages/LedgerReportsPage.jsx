import { useEffect, useMemo, useState } from "react";
import { useSeoMeta } from "../utils/seo.js";
import { useSearchParams } from "react-router-dom";
import { can } from "../utils/access.js";
import { ReportShell, ReportDenied } from "../components/reports/index.js";
import { CustomerLedgerReportContent } from "./CustomerLedgerPage.jsx";
import { VendorLedgerReportContent } from "./VendorLedgerPage.jsx";
import { UsersRound, Truck } from "../components/ui/AppIcons.jsx";
import "./MergedReportsPage.css";

const TABS = [
  { id: "customer", label: "Customer Ledger", icon: <UsersRound size={15} strokeWidth={2.1} /> },
  { id: "supplier", label: "Supplier Ledger", icon: <Truck size={15} strokeWidth={2.1} /> }
];

function clampTabId(id) {
  const s = String(id || "");
  return TABS.some((t) => t.id === s) ? s : "customer";
}

export default function LedgerReportsPage() {
  useSeoMeta({ title: "Ledger Reports" });
  const canCustomer = can("CUSTOMERS", "VIEW");
  const canSupplier = can("VENDORS", "VIEW");
  const canAny = canCustomer || canSupplier;

  const [params, setParams] = useSearchParams();
  const urlTab = clampTabId(params.get("tab"));
  const [tab, setTab] = useState(urlTab);

  useEffect(() => setTab(urlTab), [urlTab]);

  const activeLabel = useMemo(
    () => TABS.find((t) => t.id === tab)?.label || "Customer Ledger",
    [tab]
  );

  if (!canAny) {
    return (
      <ReportDenied
        title="Ledger"
        message="You don't have permission to view these ledgers."
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
            <h1 className="mrPageTitle">Ledger</h1>
            <p className="mrPageSub">Customer & supplier account statements</p>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="mrTabs" role="tablist" aria-label="Ledger tabs">
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
          {tab === "customer" && <CustomerLedgerReportContent embedded />}
          {tab === "supplier" && <VendorLedgerReportContent   embedded />}
        </div>

      </div>
    </ReportShell>
  );
}
