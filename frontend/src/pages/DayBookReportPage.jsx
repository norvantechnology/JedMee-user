import { AsyncButton } from "../components/ui/buttons.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { useEffect, useState } from "react";
import { can } from "../utils/access.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { getDayBookReport } from "../services/reportService.js";
import { fmtDateIndian, fmtMoneyINR } from "../utils/format.js";
import { todayYmdLocal } from "../utils/date.js";
import {
  ReportShell,
  ReportDenied
} from "../components/reports/index.js";
import {
  IconDayBook,
  IconPsCalendar,
  IconPayment,
  IconWallet,
  IconReceipt
} from "../components/ui/AppIcons.jsx";
import "./DayBookReportPage.css";

export default function DayBookReportPage() {
  useSeoMeta({ title: "Day Book Report" });
  const canView = can("SALES_INVOICES", "VIEW");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(todayYmdLocal());
  const [data, setData] = useState(null);

  async function refresh(d) {
    setBusy(true);
    const r = await getDayBookReport({ date: d });
    if (r.status >= 200 && r.status < 300 && r.json?.ok) setData(r.json?.data || null);
    else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
    setBusy(false);
  }

  useEffect(() => {
    if (!canView) return;
    refresh(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  if (!canView) return <ReportDenied title="Day Book" message="You don't have permission to view this report." />;

  const rec  = data?.receipts      || {};
  const pay  = data?.payments      || {};
  const cash = data?.cash_position || {};
  const money = (v) => fmtMoneyINR(v) || "₹0.00";
  const displayDate = fmtDateIndian(data?.date || date);

  return (
    <ReportShell>
      <div className="pageWrap">
        <div className="dbPage">

          {/* ── Page header ── */}
          <div className="dbHeader">
            <div className="dbHeaderLeft">
              <h1 className="dbTitle">Day Book</h1>
              <p className="dbSub">Daily cash flow summary</p>
            </div>
            <div className="dbDateBadge">
              <IconPsCalendar width={13} height={13} />
              {displayDate}
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div className="dbToolbar">
            <div className="dbFilterGroup">
              <span className="dbFilterGroupIcon">
                <IconPsCalendar width={14} height={14} />
              </span>
              <input
                id="day-book-date"
                type="date"
                className="dbDateInput"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="dbTodayBtn"
              onClick={() => {
                const t = todayYmdLocal();
                setDate(t);
                refresh(t);
              }}
            >
              Today
            </button>
            <AsyncButton
              variant="primary"
              size="sm"
              type="button"
              onClick={() => refresh(date)}
              loading={busy}
              loadingText="Loading…"
            >
              Apply
            </AsyncButton>
          </div>

          {/* ── Summary stat cards ── */}
          <div className="dbSummaryRow" aria-label="Day summary">
            <div className="dbSumCard">
              <div className="dbSumIcon dbSumIcon_in">
                <IconReceipt width={22} height={22} />
              </div>
              <div className="dbSumText">
                <div className="dbSumVal dbSumVal_in">{money(rec.total_receipts)}</div>
                <div className="dbSumLbl">Total Receipts</div>
              </div>
            </div>
            <div className="dbSumCard">
              <div className="dbSumIcon dbSumIcon_out">
                <IconPayment width={22} height={22} />
              </div>
              <div className="dbSumText">
                <div className="dbSumVal dbSumVal_out">{money(pay.total_payments)}</div>
                <div className="dbSumLbl">Total Payments</div>
              </div>
            </div>
            <div className="dbSumCard">
              <div className="dbSumIcon dbSumIcon_cash">
                <IconWallet width={22} height={22} />
              </div>
              <div className="dbSumText">
                <div className="dbSumVal dbSumVal_cash">{money(cash.closing_cash)}</div>
                <div className="dbSumLbl">Closing Cash</div>
              </div>
            </div>
          </div>

          {/* ── Two-column grid: Money In / Money Out ── */}
          <div className="dbGrid">

            {/* Money In */}
            <div className="dbSection">
              <div className="dbSectionHdr">
                <div className="dbSectionHdrIcon dbSectionHdrIcon_in">
                  <IconReceipt width={14} height={14} />
                </div>
                <h2 className="dbSectionTitle">Money In — Receipts</h2>
              </div>
              <div className="dbSectionBody">
                <div className="dbRow">
                  <span className="dbRowLabel">Cash Sales</span>
                  <span className="dbRowValue">{money(rec.cash_sales)}</span>
                </div>
                <div className="dbRow">
                  <span className="dbRowLabel">Credit Sales</span>
                  <span className="dbRowValue">{money(rec.credit_sales)}</span>
                </div>
                <div className="dbRow">
                  <span className="dbRowLabel">Customer Payments</span>
                  <span className="dbRowValue">{money(rec.customer_receipts)}</span>
                </div>
                <div className="dbRow dbRow_total dbRow_total_in">
                  <span className="dbRowLabel">Total Receipts</span>
                  <span className="dbRowValue">{money(rec.total_receipts)}</span>
                </div>
              </div>
            </div>

            {/* Money Out */}
            <div className="dbSection">
              <div className="dbSectionHdr">
                <div className="dbSectionHdrIcon dbSectionHdrIcon_out">
                  <IconPayment width={14} height={14} />
                </div>
                <h2 className="dbSectionTitle">Money Out — Payments</h2>
              </div>
              <div className="dbSectionBody">
                <div className="dbRow">
                  <span className="dbRowLabel">Supplier Payments</span>
                  <span className="dbRowValue">{money(pay.supplier_payments)}</span>
                </div>
                <div className="dbRow dbRow_total dbRow_total_out">
                  <span className="dbRowLabel">Total Payments</span>
                  <span className="dbRowValue">{money(pay.total_payments)}</span>
                </div>
              </div>
            </div>

          </div>

          {/* ── Cash Position ── */}
          <div className="dbCashCard">
            <div className="dbCashHdr">
              <div className="dbCashHdrIcon">
                <IconDayBook width={14} height={14} />
              </div>
              <h2 className="dbCashTitle">Cash Position</h2>
            </div>
            <div className="dbCashBody">
              <div className="dbCashEquation">
                <div className="dbCashChip">
                  <span className="dbCashChipVal">{money(cash.opening_cash)}</span>
                  <span className="dbCashChipLbl">Opening Cash</span>
                </div>
                <span className="dbCashOp dbCashOp_plus">+</span>
                <div className="dbCashChip">
                  <span className="dbCashChipVal">{money(cash.cash_received)}</span>
                  <span className="dbCashChipLbl">Cash Received</span>
                </div>
                <span className="dbCashOp dbCashOp_minus">−</span>
                <div className="dbCashChip">
                  <span className="dbCashChipVal">{money(cash.cash_paid)}</span>
                  <span className="dbCashChipLbl">Cash Paid</span>
                </div>
                <span className="dbCashOp dbCashOp_eq">=</span>
              </div>
              <div className="dbCashResult">
                <span className="dbCashResultLabel">Closing Cash (Expected)</span>
                <span className="dbCashResultVal">{money(cash.closing_cash)}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </ReportShell>
  );
}
