import { AsyncButton } from "../components/ui/buttons.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "../context/LocaleContext.jsx";
import { can } from "../utils/access.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { getDayBookReport } from "../services/reportService.js";
import { fmtDateIndian, fmtCurrency } from "../utils/format.js";
import { todayYmdInScreenZone } from "../utils/timezone.js";
import { ReportShell, ReportDenied } from "../components/reports/index.js";
import {
  IconDayBook,
  IconPsCalendar,
  IconPayment,
  IconWallet,
  IconReceipt,
  IconTrendUp,
  IconChevronRight,
  AlertTriangle,
} from "../components/ui/AppIcons.jsx";
import "./DayBookReportPage.css";

function money(v) {
  return fmtCurrency(v) || fmtCurrency(0);
}

function DeltaBadge({ pct, comparable, prevValue }) {
  const prev = Number(prevValue ?? 0);
  if (comparable === false || prev <= 0.0001) {
    return (
      <span className="dbDelta dbDelta_flat">
        No cash comparison — yesterday had no money received
      </span>
    );
  }
  if (pct == null || !Number.isFinite(pct)) return null;
  const up = pct > 0;
  const flat = pct === 0;
  const cls = flat ? "dbDelta_flat" : up ? "dbDelta_up" : "dbDelta_down";
  const arrow = flat ? "—" : up ? "▲" : "▼";
  return (
    <span className={`dbDelta ${cls}`}>
      {arrow} {Math.abs(pct).toFixed(1)}% vs yesterday
    </span>
  );
}

function Row({ label, value, note, total, muted }) {
  return (
    <div className={`dbRow${total ? " dbRow_total" : ""}${muted ? " dbRow_muted" : ""}`}>
      <span className="dbRowLabel">
        {label}
        {note ? <span className="dbInfoBadge">{note}</span> : null}
      </span>
      <span className="dbRowValue">{value}</span>
    </div>
  );
}

function RecentList({ title, empty, children, onViewAll }) {
  return (
    <div className="dbRecentBlock">
      <div className="dbRecentHdr">
        <h3 className="dbRecentTitle">{title}</h3>
        {onViewAll ? (
          <button type="button" className="dbLinkBtn" onClick={onViewAll}>
            View all <IconChevronRight width={12} height={12} />
          </button>
        ) : null}
      </div>
      {empty ? <p className="dbRecentEmpty">{empty}</p> : <ul className="dbRecentList">{children}</ul>}
    </div>
  );
}

export default function DayBookReportPage() {
  useSeoMeta({ title: "Day Book" });
  const { taxLabel } = useLocale();
  const navigate = useNavigate();
  const canView = can("SALES_INVOICES", "VIEW") || can("PURCHASE_INVOICES", "VIEW");
  const canSales = can("SALES_INVOICES", "VIEW");
  const canPurchases = can("PURCHASE_INVOICES", "VIEW");

  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(todayYmdInScreenZone());
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("cash");

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

  if (!canView) {
    return <ReportDenied title="Day Book" message="You don't have permission to view this report." />;
  }

  const rec = data?.receipts || {};
  const pay = data?.payments || {};
  const cash = data?.cash_position || {};
  const profit = data?.profit || {};
  const counts = data?.counts || {};
  const purchases = data?.purchases;
  const credit = data?.credit_activity;
  const gst = data?.gst;
  const cmp = data?.comparison || {};
  const headline = data?.headline || {};
  const modes = data?.payment_modes || [];
  const recent = data?.recent || {};

  const displayDate = fmtDateIndian(data?.date || date);
  const isToday = (data?.date || date) === todayYmdInScreenZone();
  const closingNeg = (cash.closing_cash ?? 0) < 0;
  const profitNeg = (profit.gross_profit ?? 0) < 0;

  const storyParts = [];
  if (headline.money_in > 0) storyParts.push(`received ${money(headline.money_in)}`);
  if (headline.money_out > 0) storyParts.push(`paid ${money(headline.money_out)} to suppliers`);
  if (canPurchases && (headline.purchases_total ?? 0) > 0) {
    storyParts.push(`bought stock worth ${money(headline.purchases_total)}`);
  }
  const story =
    storyParts.length > 0
      ? `On this day you ${storyParts.join(", ")}.`
      : "No sales or payments recorded for this day yet.";

  return (
    <ReportShell>
      <div className="pageWrap">
        <div className="dbPage">
          <div className="dbHeader">
            <div className="dbHeaderLeft">
              <h1 className="dbTitle">Day Book</h1>
              <p className="dbSub">Your cash drawer and sales for one day</p>
            </div>
            <div className="dbDateBadge">
              <IconPsCalendar width={13} height={13} />
              {isToday ? `Today · ${displayDate}` : displayDate}
            </div>
          </div>

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
                const t = todayYmdInScreenZone();
                setDate(t);
                refresh(t);
              }}
            >
              Today
            </button>
            <AsyncButton variant="primary" size="sm" type="button" onClick={() => refresh(date)} loading={busy} loadingText="Loading…">
              Load
            </AsyncButton>
          </div>

          {data && (
            <>
              {closingNeg && (
                <div className="dbDeficitAlert" role="alert">
                  <div className="dbDeficitAlertHdr">
                    <AlertTriangle width={22} height={22} aria-hidden="true" />
                    <div>
                      <div className="dbDeficitAlertTitle">Cash deficit today</div>
                      <div className="dbDeficitAlertAmt">{money(cash.closing_cash)}</div>
                    </div>
                  </div>
                  <p className="dbDeficitAlertBody">
                    {money(cash.cash_received)} received in cash · {money(cash.cash_paid)} paid to suppliers
                  </p>
                  <p className="dbDeficitAlertNote">
                    More went out of the drawer than came in today. Check supplier payments and opening cash.
                  </p>
                </div>
              )}

              <div className={`dbSummaryCard${closingNeg ? " dbSummaryCard_warn" : ""}`}>
                <p className="dbStory">{story}</p>
                <p className="dbStoryNote">Cash totals include walk-in sales and customer collections only — credit bills are shown separately.</p>
                <div className="dbSummaryClosing">
                  <span className="dbSummaryClosingLbl">Expected cash at end of day</span>
                  <span className={`dbSummaryClosingVal${closingNeg ? " dbSummaryClosingVal_neg" : ""}`}>
                    {money(cash.closing_cash)}
                  </span>
                  {(cash.opening_cash ?? 0) > 0.01 && (
                    <span className="dbSummaryOpening">Started with {money(cash.opening_cash)} in the drawer</span>
                  )}
                </div>
                <DeltaBadge
                  pct={cmp.receipts_delta_pct}
                  comparable={cmp.receipts_comparable}
                  prevValue={cmp.receipts}
                />
              </div>

              <div className="dbTabs" role="tablist">
                {["cash", "business", "lists"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    className={`dbTab${tab === t ? " dbTab_active" : ""}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "cash" ? "Money" : t === "business" ? "Sales & purchases" : "Today’s bills"}
                  </button>
                ))}
              </div>

              {tab === "cash" && (
                <div className="dbGrid">
                  <div className="dbSection">
                    <div className="dbSectionHdr">
                      <div className="dbSectionHdrIcon dbSectionHdrIcon_in">
                        <IconReceipt width={14} height={14} />
                      </div>
                      <h2 className="dbSectionTitle">Money in</h2>
                    </div>
                    <div className="dbSectionBody">
                      <Row
                        label="Received for today’s sales"
                        value={money(rec.received_for_today_sales ?? rec.cash_sales)}
                      />
                      {(rec.collected_on_older_bills ?? credit?.collected_on_older_bills ?? 0) > 0 && (
                        <Row
                          label="Collected on older bills"
                          value={money(rec.collected_on_older_bills ?? credit?.collected_on_older_bills)}
                          muted
                          note="not new sales"
                        />
                      )}
                      <Row label="Total money in" value={money(rec.total_receipts)} total />
                      {(credit?.new_outstanding ?? 0) > 0 && (
                        <Row
                          label="Credit not yet collected"
                          value={money(credit.new_outstanding)}
                          muted
                          note="not in drawer"
                        />
                      )}
                    </div>
                  </div>

                  <div className="dbSection">
                    <div className="dbSectionHdr">
                      <div className="dbSectionHdrIcon dbSectionHdrIcon_out">
                        <IconPayment width={14} height={14} />
                      </div>
                      <h2 className="dbSectionTitle">Money out</h2>
                    </div>
                    <div className="dbSectionBody">
                      <Row label="Paid to suppliers" value={money(pay.supplier_payments)} />
                      {(pay.purchase_returns ?? 0) > 0 && (
                        <Row
                          label="Supplier credits (returns)"
                          value={`− ${money(pay.purchase_returns)}`}
                          muted
                          note="reduces what you owe"
                        />
                      )}
                      <Row label="Net paid out" value={money(pay.total_payments)} total />
                    </div>
                  </div>

                  {modes.length > 0 && (
                    <div className="dbSection dbSection_full">
                      <div className="dbSectionHdr">
                        <div className="dbSectionHdrIcon dbSectionHdrIcon_in">
                          <IconWallet width={14} height={14} />
                        </div>
                        <h2 className="dbSectionTitle">How customers paid today</h2>
                      </div>
                      <div className="dbModeChips">
                        {modes.map((m) => (
                          <span key={m.mode} className="dbModeChip">
                            {m.mode} · {money(m.total)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "business" && (
                <>
                  <div className="dbSummaryRow">
                    {canSales && (
                      <div className="dbSumCard">
                        <div className="dbSumVal">{money(rec.total_sales ?? headline.total_sales ?? 0)}</div>
                        <div className="dbSumLbl">Total sales</div>
                        <div className="dbSumSub">All confirmed bills</div>
                      </div>
                    )}
                    {canSales && (
                      <div className="dbSumCard">
                        <div className="dbSumVal">{counts.sales_bills ?? 0}</div>
                        <div className="dbSumLbl">Sales bills</div>
                        {(counts.avg_bill_value ?? 0) > 0 && (
                          <div className="dbSumSub">Avg {money(counts.avg_bill_value)}</div>
                        )}
                      </div>
                    )}
                    {canPurchases && purchases && (
                      <div className="dbSumCard">
                        <div className="dbSumVal">{purchases.invoice_count ?? 0}</div>
                        <div className="dbSumLbl">Purchase bills</div>
                        <div className="dbSumSub">{money(purchases.total)}</div>
                      </div>
                    )}
                    {canSales && (
                      <div className="dbSumCard">
                        <div className={`dbSumVal ${profitNeg ? "dbSumVal_out" : "dbSumVal_profit"}`}>
                          {money(profit.gross_profit)}
                        </div>
                        <div className="dbSumLbl">Profit on sales</div>
                        <div className="dbSumSub">{Number(profit.profit_margin_pct ?? 0).toFixed(1)}% margin</div>
                      </div>
                    )}
                  </div>

                  {canSales && (
                    <div className="dbProfitCard">
                      <div className="dbSectionHdr">
                        <div className={`dbSectionHdrIcon ${profitNeg ? "dbSectionHdrIcon_out" : "dbSectionHdrIcon_profit"}`}>
                          <IconTrendUp width={14} height={14} />
                        </div>
                        <h2 className="dbSectionTitle">Profit on today’s sales</h2>
                      </div>
                      <div className="dbSectionBody">
                        <Row label={`Sales value (before ${taxLabel})`} value={money(profit.total_revenue)} />
                        {(profit.sales_returns ?? 0) > 0 && (
                          <Row label="Sales returns" value={`− ${money(profit.sales_returns)}`} muted />
                        )}
                        <Row label="Cost of goods sold" value={`− ${money(profit.total_cogs)}`} />
                        <Row label="Profit" value={money(profit.gross_profit)} total />
                      </div>
                      <p className="dbProfitNote">Profit = sales value minus cost of items sold. Excludes rent, salaries, and other expenses.</p>
                    </div>
                  )}

                  {canPurchases && purchases && (purchases.total ?? 0) > 0 && (
                    <div className="dbSection dbSection_full">
                      <div className="dbSectionHdr">
                        <h2 className="dbSectionTitle">Stock purchased today</h2>
                      </div>
                      <div className="dbSectionBody">
                        <Row label="Purchase bills" value={String(purchases.invoice_count ?? 0)} />
                        <Row label="Total purchase value" value={money(purchases.total)} total />
                      </div>
                    </div>
                  )}

                  {credit && (credit.credit_sales ?? 0) > 0 && (
                    <div className="dbSection dbSection_full">
                      <div className="dbSectionBody">
                        <Row label="Sold on credit today" value={money(credit.credit_sales)} />
                        <Row label="Still due from today’s credit bills" value={money(credit.new_outstanding)} muted />
                      </div>
                    </div>
                  )}

                  {gst && (gst.output_gst > 0 || gst.input_gst > 0) && (
                    <div className="dbSection dbSection_full">
                      <div className="dbSectionHdr">
                        <h2 className="dbSectionTitle">{taxLabel} today</h2>
                      </div>
                      <div className="dbSectionBody">
                        {canSales && <Row label={`${taxLabel} on sales`} value={money(gst.output_gst)} />}
                        {canPurchases && <Row label={`${taxLabel} on purchases`} value={money(gst.input_gst)} />}
                        <Row label={`Net ${taxLabel}`} value={money(gst.net_gst)} total />
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === "lists" && (
                <div className="dbLists">
                  {canSales && (
                    <RecentList
                      title="Sales bills today"
                      empty="No sales bills on this day."
                      onViewAll={() => navigate("/sales-billing")}
                    >
                      {(recent.sales || []).map((inv) => (
                        <li key={inv.id}>
                          <button
                            type="button"
                            className="dbRecentItem"
                            onClick={() => navigate(`/sales-billing/edit/${inv.id}`)}
                          >
                            <span className="dbRecentMain">
                              {inv.invoice_number} · {inv.customer_name || "Customer"}
                            </span>
                            <span className="dbRecentAmt">{money(inv.total_amount)}</span>
                          </button>
                        </li>
                      ))}
                    </RecentList>
                  )}
                  {canSales && (
                    <RecentList
                      title="Customer payments today"
                      empty="No customer payments on this day."
                      onViewAll={() => navigate("/customer-payments")}
                    >
                      {(recent.customer_payments || []).map((p) => (
                        <li key={p.id}>
                          <span className="dbRecentItem dbRecentItem_static">
                            <span className="dbRecentMain">
                              {p.payment_mode} · {p.invoice_number || "Payment"}
                            </span>
                            <span className="dbRecentAmt">{money(p.amount)}</span>
                          </span>
                        </li>
                      ))}
                    </RecentList>
                  )}
                  {canPurchases && (
                    <RecentList
                      title="Purchase bills today"
                      empty="No purchase bills on this day."
                      onViewAll={() => navigate("/purchase-invoices")}
                    >
                      {(recent.purchases || []).map((inv) => (
                        <li key={inv.id}>
                          <button
                            type="button"
                            className="dbRecentItem"
                            onClick={() => navigate(`/purchase-invoices/edit/${inv.id}`)}
                          >
                            <span className="dbRecentMain">
                              {inv.invoice_number} · {inv.vendor_name || "Supplier"}
                            </span>
                            <span className="dbRecentAmt">{money(inv.total_amount)}</span>
                          </button>
                        </li>
                      ))}
                    </RecentList>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ReportShell>
  );
}
