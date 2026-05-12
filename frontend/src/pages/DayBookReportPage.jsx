import { AsyncButton } from "../components/ui/buttons.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { useEffect, useState } from "react";
import { useLocale } from "../context/LocaleContext.jsx";
import { can } from "../utils/access.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { getDayBookReport } from "../services/reportService.js";
import { fmtDateIndian, fmtCurrency } from "../utils/format.js";
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
  IconReceipt,
  IconTrendUp,
  AlertTriangle,
} from "../components/ui/AppIcons.jsx";
import "./DayBookReportPage.css";

export default function DayBookReportPage() {
  useSeoMeta({ title: "Day Book Report" });
  const { taxLabel } = useLocale();
  // FE-03 fix: Day Book shows both sales and purchase data.
  // Allow access if the user can view either sales invoices or purchase invoices.
  const canView = can("SALES_INVOICES", "VIEW") || can("PURCHASE_INVOICES", "VIEW");
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

  const rec    = data?.receipts      || {};
  const pay    = data?.payments      || {};
  const cash   = data?.cash_position || {};
  const profit = data?.profit        || {};
  // FE-09: purchase returns and sales returns
  const hasPurchaseReturns = (pay.purchase_returns ?? 0) > 0;
  const hasSalesReturns    = (profit.sales_returns ?? 0) > 0;
  const money = (v) => fmtCurrency(v) || fmtCurrency(0);
  const pct   = (v) => `${Number(v ?? 0).toFixed(1)}%`;
  const displayDate = fmtDateIndian(data?.date || date);
  const closingNeg  = (cash.closing_cash ?? 0) < 0;
  const profitNeg   = (profit.gross_profit ?? 0) < 0;

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
                <div className="dbSumLbl">Cash Receipts</div>
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
            <div className="dbSumCard">
              <div className={`dbSumIcon ${profitNeg ? "dbSumIcon_out" : "dbSumIcon_profit"}`}>
                <IconTrendUp width={22} height={22} />
              </div>
              <div className="dbSumText">
                <div className={`dbSumVal ${profitNeg ? "dbSumVal_out" : "dbSumVal_profit"}`}>
                  {money(profit.gross_profit)}
                </div>
                <div className="dbSumLbl">Gross Profit</div>
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
                <h2 className="dbSectionTitle">Money In — Cash Receipts</h2>
              </div>
              <div className="dbSectionBody">
                <div className="dbRow">
                  <span className="dbRowLabel">Cash Sales</span>
                  <span className="dbRowValue">{money(rec.cash_sales)}</span>
                </div>
                <div className="dbRow">
                  <span className="dbRowLabel">Customer Payments</span>
                  <span className="dbRowValue">{money(rec.customer_receipts)}</span>
                </div>
                <div className="dbRow dbRow_total dbRow_total_in">
                  <span className="dbRowLabel">Total Cash Receipts</span>
                  <span className="dbRowValue">{money(rec.total_receipts)}</span>
                </div>
                {/* Informational: credit sales are not cash — shown separately */}
                {(rec.credit_sales ?? 0) > 0 && (
                  <div className="dbRow dbRow_info">
                    <span className="dbRowLabel dbRowLabel_info">
                      Credit Sales Today
                      <span className="dbInfoBadge">not cash</span>
                    </span>
                    <span className="dbRowValue dbRowValue_info">{money(rec.credit_sales)}</span>
                  </div>
                )}
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
                {/* FE-09: Purchase returns reduce outstanding payables */}
                {hasPurchaseReturns && (
                  <div className="dbRow dbRow_info">
                    <span className="dbRowLabel dbRowLabel_info">
                      Purchase Returns
                      <span className="dbInfoBadge">reduces payables</span>
                    </span>
                    <span className="dbRowValue dbRowValue_info">− {money(pay.purchase_returns)}</span>
                  </div>
                )}
                <div className="dbRow dbRow_total dbRow_total_out">
                  <span className="dbRowLabel">Net Payments</span>
                  <span className="dbRowValue">{money(pay.total_payments)}</span>
                </div>
              </div>
            </div>

          </div>

          {/* ── Profit Summary ── */}
          <div className="dbProfitCard">
            <div className="dbSectionHdr">
              <div className={`dbSectionHdrIcon ${profitNeg ? "dbSectionHdrIcon_out" : "dbSectionHdrIcon_profit"}`}>
                <IconTrendUp width={14} height={14} />
              </div>
              <h2 className="dbSectionTitle">Gross Profit — Today's Sales</h2>
              {(profit.profit_margin_pct != null) && (
                <span className={`dbProfitMarginBadge ${profitNeg ? "dbProfitMarginBadge_neg" : ""}`}>
                  {pct(profit.profit_margin_pct)} margin
                </span>
              )}
            </div>
            <div className="dbSectionBody">
              <div className="dbRow">
                <span className="dbRowLabel">Sales Revenue (excl. {taxLabel})</span>
                <span className="dbRowValue">{money(profit.total_revenue)}</span>
              </div>
              {/* FE-09: Sales returns reduce revenue */}
              {hasSalesReturns && (
                <div className="dbRow dbRow_info">
                  <span className="dbRowLabel dbRowLabel_info">
                    Sales Returns
                    <span className="dbInfoBadge">reduces revenue</span>
                  </span>
                  <span className="dbRowValue dbRowValue_info">− {money(profit.sales_returns)}</span>
                </div>
              )}
              {hasSalesReturns && (
                <div className="dbRow">
                  <span className="dbRowLabel">Net Revenue</span>
                  <span className="dbRowValue">{money(profit.net_revenue)}</span>
                </div>
              )}
              <div className="dbRow">
                <span className="dbRowLabel">Cost of Goods Sold (COGS)</span>
                <span className="dbRowValue dbRowValue_cogs">− {money(profit.total_cogs)}</span>
              </div>
              <div className={`dbRow dbRow_total ${profitNeg ? "dbRow_total_out" : "dbRow_total_in"}`}>
                <span className="dbRowLabel">Gross Profit</span>
                <span className="dbRowValue">{money(profit.gross_profit)}</span>
              </div>
            </div>
            <div className="dbProfitNote">
              Gross profit = net sales revenue (excl. {taxLabel} and returns) − purchase cost of items sold.
              Does not include overheads, salaries, or other expenses.
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
              {/* Clean table-style rows instead of confusing equation chips */}
              <div className="dbCashRows">
                <div className="dbCashRow">
                  <span className="dbCashRowLabel">Opening Cash</span>
                  <span className="dbCashRowVal">{money(cash.opening_cash)}</span>
                </div>
                <div className="dbCashRow dbCashRow_plus">
                  <span className="dbCashRowLabel">
                    <span className="dbCashRowOp dbCashRowOp_plus">+</span>
                    Cash Received
                  </span>
                  <span className="dbCashRowVal dbCashRowVal_in">{money(cash.cash_received)}</span>
                </div>
                <div className="dbCashRow dbCashRow_minus">
                  <span className="dbCashRowLabel">
                    <span className="dbCashRowOp dbCashRowOp_minus">−</span>
                    Cash Paid Out
                  </span>
                  <span className="dbCashRowVal dbCashRowVal_out">{money(cash.cash_paid)}</span>
                </div>
              </div>
              <div className={`dbCashResult${closingNeg ? " dbCashResult_neg" : ""}`}>
                <span className="dbCashResultLabel">Closing Cash (Expected)</span>
                <span className="dbCashResultVal">{money(cash.closing_cash)}</span>
              </div>
              {closingNeg && (
                <div className="dbCashWarning">
                  <AlertTriangle size={14} aria-hidden="true" />
                  Closing cash is negative — cash paid out exceeds cash received today.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </ReportShell>
  );
}
