const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { resolveAnalyticsDay } = require("../../shared/dateFilters");

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function prevYmd(ymd) {
  const s = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const py = dt.getUTCFullYear();
  const pm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const pd = String(dt.getUTCDate()).padStart(2, "0");
  return `${py}-${pm}-${pd}`;
}

/** % change vs prior day; null when prior is zero (avoids misleading ±100% badges). */
function deltaPct(current, previous) {
  const cur = n(current);
  const prev = n(previous);
  if (prev <= 0.0001) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

async function handler(event) {
  const authSales = await requirePermission(event, "SALES_INVOICES", "VIEW");
  const authPurchase = await requirePermission(event, "PURCHASE_INVOICES", "VIEW");
  const auth = authSales.ok ? authSales : authPurchase;
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const { day: date, timeZone } = resolveAnalyticsDay(qs);
  const prevDate = prevYmd(date);
  const canSales = authSales.ok;
  const canPurchases = authPurchase.ok;

  try {
    const calls = [
      query(`SELECT daily_opening_cash FROM account_settings WHERE account_id = $1 LIMIT 1`, [
        ctx.accountId
      ])
    ];

    if (canSales) {
      calls.push(
        query(
          `SELECT
             COALESCE(SUM(CASE WHEN is_walk_in_sale = true THEN total_amount ELSE 0 END),0)::numeric(14,2) AS cash_sales,
             COALESCE(SUM(CASE WHEN is_walk_in_sale = false THEN total_amount ELSE 0 END),0)::numeric(14,2) AS credit_sales,
             COUNT(*)::int AS sales_bills,
             COUNT(*) FILTER (WHERE is_walk_in_sale = true)::int AS sales_bills_cash,
             COUNT(*) FILTER (WHERE is_walk_in_sale = false)::int AS sales_bills_credit,
             COALESCE(SUM(total_gst),0)::numeric(14,2) AS output_gst
           FROM sales_invoices
           WHERE account_id = $1 AND deleted_at IS NULL
             AND status = 'CONFIRMED' AND invoice_date = $2::date`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT COALESCE(SUM(amount),0)::numeric(14,2) AS customer_receipts,
                  COUNT(*)::int AS customer_payment_count
           FROM customer_payments
           WHERE account_id = $1 AND payment_date = $2::date`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT COALESCE(SUM(cp.amount),0)::numeric(14,2) AS collected_on_old_bills
           FROM customer_payments cp
           INNER JOIN sales_invoices si
             ON si.id = cp.sales_invoice_id AND si.account_id = cp.account_id
           WHERE cp.account_id = $1 AND cp.payment_date = $2::date
             AND si.invoice_date <> $2::date`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT COALESCE(SUM(balance_due),0)::numeric(14,2) AS new_credit_outstanding
           FROM sales_invoices
           WHERE account_id = $1 AND deleted_at IS NULL AND status = 'CONFIRMED'
             AND invoice_date = $2::date AND is_walk_in_sale = false AND balance_due > 0.0001`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT
             COALESCE(SUM(sii.taxable_amount), 0)::numeric(14,2) AS total_revenue,
             COALESCE(SUM(
               sii.qty * COALESCE(pb.purchase_rate, 0)
               + CASE
                   WHEN COALESCE(sii.loose_qty, 0) > 0 AND COALESCE(pb.packing_units, 1) > 0
                   THEN (sii.loose_qty / COALESCE(pb.packing_units, 1)) * COALESCE(pb.purchase_rate, 0)
                   ELSE 0
                 END
             ), 0)::numeric(14,2) AS total_cogs
           FROM sales_invoice_items sii
           INNER JOIN sales_invoices si
             ON si.id = sii.sales_invoice_id AND si.account_id = sii.account_id
           LEFT JOIN product_batches pb
             ON pb.id = sii.batch_id AND pb.account_id = sii.account_id
           WHERE sii.account_id = $1 AND si.deleted_at IS NULL
             AND si.status = 'CONFIRMED' AND si.invoice_date = $2::date`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT COALESCE(SUM(total_return_amount),0)::numeric(14,2) AS sales_returns_total,
                  COUNT(*)::int AS sales_return_count
           FROM sales_returns
           WHERE account_id = $1 AND deleted_at IS NULL
             AND status = 'CONFIRMED' AND return_date = $2::date`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT COALESCE(cp.payment_mode::text, 'CASH') AS mode,
                  COALESCE(SUM(cp.amount),0)::numeric(14,2) AS total
           FROM customer_payments cp
           WHERE cp.account_id = $1 AND cp.payment_date = $2::date
           GROUP BY COALESCE(cp.payment_mode::text, 'CASH')
           ORDER BY total DESC`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT id, invoice_number, customer_name, total_amount, amount_paid, balance_due,
                  is_walk_in_sale, payment_status
           FROM sales_invoices
           WHERE account_id = $1 AND deleted_at IS NULL AND status = 'CONFIRMED'
             AND invoice_date = $2::date
           ORDER BY created_at DESC
           LIMIT 8`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT cp.id, cp.amount, cp.payment_mode, si.invoice_number, si.customer_name
           FROM customer_payments cp
           LEFT JOIN sales_invoices si
             ON si.id = cp.sales_invoice_id AND si.account_id = cp.account_id
           WHERE cp.account_id = $1 AND cp.payment_date = $2::date
           ORDER BY cp.created_at DESC
           LIMIT 8`,
          [ctx.accountId, date]
        ),
        // Previous day — for comparison
        query(
          `SELECT
             COALESCE(SUM(CASE WHEN is_walk_in_sale = true THEN total_amount ELSE 0 END),0)::numeric(14,2) AS cash_sales,
             COALESCE(SUM(total_amount),0)::numeric(14,2) AS total_sales
           FROM sales_invoices
           WHERE account_id = $1 AND deleted_at IS NULL
             AND status = 'CONFIRMED' AND invoice_date = $2::date`,
          [ctx.accountId, prevDate]
        ),
        query(
          `SELECT COALESCE(SUM(amount),0)::numeric(14,2) AS customer_receipts
           FROM customer_payments WHERE account_id = $1 AND payment_date = $2::date`,
          [ctx.accountId, prevDate]
        )
      );
    } else {
      calls.push(
        Promise.resolve({ rows: [{}] }),
        Promise.resolve({ rows: [{}] }),
        Promise.resolve({ rows: [{}] }),
        Promise.resolve({ rows: [{}] }),
        Promise.resolve({ rows: [{}] }),
        Promise.resolve({ rows: [{}] }),
        Promise.resolve({ rows: [] }),
        Promise.resolve({ rows: [] }),
        Promise.resolve({ rows: [] }),
        Promise.resolve({ rows: [{}] }),
        Promise.resolve({ rows: [{}] })
      );
    }

    if (canPurchases) {
      calls.push(
        query(
          `SELECT
             (
               COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE account_id = $1 AND payment_date = $2::date),0) +
               COALESCE((SELECT SUM(amount) FROM division_payments WHERE account_id = $1 AND payment_date = $2::date),0)
             )::numeric(14,2) AS supplier_payments,
             (SELECT COUNT(*)::int FROM vendor_payments WHERE account_id = $1 AND payment_date = $2::date) AS vendor_payment_count,
             (SELECT COUNT(*)::int FROM division_payments WHERE account_id = $1 AND payment_date = $2::date) AS division_payment_count`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT COALESCE(SUM(total_amount),0)::numeric(14,2) AS purchase_total,
                  COUNT(*)::int AS purchase_invoice_count,
                  COALESCE(SUM(total_gst),0)::numeric(14,2) AS input_gst
           FROM purchase_invoices
           WHERE account_id = $1 AND deleted_at IS NULL
             AND status = 'CONFIRMED' AND invoice_date = $2::date`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT COALESCE(SUM(total_amount),0)::numeric(14,2) AS purchase_returns_total,
                  COUNT(*)::int AS purchase_return_count
           FROM purchase_returns
           WHERE account_id = $1 AND deleted_at IS NULL
             AND status = 'CONFIRMED' AND return_date = $2::date`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT pi.id, pi.invoice_number, COALESCE(v.name, '') AS vendor_name,
                  pi.total_amount, pi.balance_due, pi.payment_status
           FROM purchase_invoices pi
           LEFT JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id
           WHERE pi.account_id = $1 AND pi.deleted_at IS NULL
             AND pi.status = 'CONFIRMED' AND pi.invoice_date = $2::date
           ORDER BY pi.created_at DESC
           LIMIT 8`,
          [ctx.accountId, date]
        ),
        query(
          `SELECT COALESCE(SUM(amount),0)::numeric(14,2) AS supplier_payments
           FROM vendor_payments WHERE account_id = $1 AND payment_date = $2::date`,
          [ctx.accountId, prevDate]
        )
      );
    } else {
      calls.push(
        Promise.resolve({ rows: [{ supplier_payments: 0, vendor_payment_count: 0, division_payment_count: 0 }] }),
        Promise.resolve({ rows: [{ purchase_total: 0, purchase_invoice_count: 0, input_gst: 0 }] }),
        Promise.resolve({ rows: [{ purchase_returns_total: 0, purchase_return_count: 0 }] }),
        Promise.resolve({ rows: [] }),
        Promise.resolve({ rows: [{ supplier_payments: 0 }] })
      );
    }

    const results = await Promise.all(calls);
    let i = 0;
    const settingsRs = results[i++];
    const salesRs = canSales ? results[i++] : { rows: [{}] };
    const receiptsRs = canSales ? results[i++] : { rows: [{}] };
    const oldBillCollRs = canSales ? results[i++] : { rows: [{}] };
    const newCreditRs = canSales ? results[i++] : { rows: [{}] };
    const profitRs = canSales ? results[i++] : { rows: [{}] };
    const salesReturnsRs = canSales ? results[i++] : { rows: [{}] };
    const payModesRs = canSales ? results[i++] : { rows: [] };
    const recentSalesRs = canSales ? results[i++] : { rows: [] };
    const recentPayRs = canSales ? results[i++] : { rows: [] };
    const prevSalesRs = canSales ? results[i++] : { rows: [{}] };
    const prevReceiptsRs = canSales ? results[i++] : { rows: [{}] };
    const paymentsRs = canPurchases ? results[i++] : { rows: [{}] };
    const purchasesRs = canPurchases ? results[i++] : { rows: [{}] };
    const purchaseReturnsRs = canPurchases ? results[i++] : { rows: [{}] };
    const recentPurchasesRs = canPurchases ? results[i++] : { rows: [] };
    const prevPayRs = canPurchases ? results[i++] : { rows: [{}] };

    const openingCash = n(settingsRs.rows?.[0]?.daily_opening_cash);
    const cashSales = n(salesRs.rows?.[0]?.cash_sales);
    const creditSales = n(salesRs.rows?.[0]?.credit_sales);
    const customerReceipts = n(receiptsRs.rows?.[0]?.customer_receipts);
    const supplierPayments = n(paymentsRs.rows?.[0]?.supplier_payments);
    const vendorPaymentCount = Number(paymentsRs.rows?.[0]?.vendor_payment_count || 0);
    const divisionPaymentCount = Number(paymentsRs.rows?.[0]?.division_payment_count || 0);
    const totalRevenue = n(profitRs.rows?.[0]?.total_revenue);
    const totalCogs = n(profitRs.rows?.[0]?.total_cogs);
    const purchaseReturns = n(purchaseReturnsRs.rows?.[0]?.purchase_returns_total);
    const salesReturns = n(salesReturnsRs.rows?.[0]?.sales_returns_total);
    const purchaseTotal = n(purchasesRs.rows?.[0]?.purchase_total);
    const outputGst = n(salesRs.rows?.[0]?.output_gst);
    const inputGst = n(purchasesRs.rows?.[0]?.input_gst);
    const collectedOnOldBills = n(oldBillCollRs.rows?.[0]?.collected_on_old_bills);
    const newCreditOutstanding = n(newCreditRs.rows?.[0]?.new_credit_outstanding);

    const grossProfit = (totalRevenue - salesReturns) - totalCogs;
    const netRevenue = totalRevenue - salesReturns;
    const profitMarginPct =
      netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 10000) / 100 : 0;

    // Money in = actual receipts (customer_payments), the single source of truth.
    // Walk-in / instant-cash sales already create a customer_payments row at confirm,
    // so adding invoice totals on top would double-count the same cash. Split the
    // receipts into "for today's sales" vs "collected on older bills" for display.
    const totalReceipts = customerReceipts;
    const receiptsForTodaySales = Math.max(0, customerReceipts - collectedOnOldBills);
    const totalSales = cashSales + creditSales;
    const totalPayments = Math.max(0, supplierPayments - purchaseReturns);
    const cashReceived = totalReceipts;
    const cashPaidOut = supplierPayments;
    const closingCash = openingCash + cashReceived - cashPaidOut;

    const salesBills = Number(salesRs.rows?.[0]?.sales_bills || 0);
    const avgBillValue = salesBills > 0 ? Math.round((totalSales / salesBills) * 100) / 100 : 0;

    const prevTotalSales = n(prevSalesRs.rows?.[0]?.total_sales);
    const prevCustomerReceipts = n(prevReceiptsRs.rows?.[0]?.customer_receipts);
    const prevTotalReceipts = prevCustomerReceipts;
    const prevSupplierPayments = n(prevPayRs.rows?.[0]?.supplier_payments);

    // Payment modes from actual customer payments (already includes walk-in auto-settle).
    const paymentModes = [];
    for (const row of payModesRs.rows || []) {
      const mode = String(row.mode || "OTHER").toUpperCase();
      const existing = paymentModes.find((p) => p.mode === mode);
      if (existing) existing.total = n(existing.total) + n(row.total);
      else paymentModes.push({ mode, total: n(row.total), source: "customer_payments" });
    }
    paymentModes.sort((a, b) => b.total - a.total);

    const payModeTotal = paymentModes.reduce((s, p) => s + n(p.total), 0);

    return ok({
      date,
      timezone: timeZone,
      visibility: { sales: canSales, purchases: canPurchases },
      opening_cash: openingCash,
      headline: {
        money_in: totalReceipts,
        money_out: totalPayments,
        purchases_total: purchaseTotal,
        total_sales: totalSales,
        closing_cash: closingCash,
        gross_profit: grossProfit,
        sales_bills: salesBills
      },
      counts: {
        sales_bills: salesBills,
        sales_bills_cash: Number(salesRs.rows?.[0]?.sales_bills_cash || 0),
        sales_bills_credit: Number(salesRs.rows?.[0]?.sales_bills_credit || 0),
        avg_bill_value: avgBillValue,
        customer_payments: Number(receiptsRs.rows?.[0]?.customer_payment_count || 0),
        supplier_payments: vendorPaymentCount + divisionPaymentCount,
        purchase_invoices: Number(purchasesRs.rows?.[0]?.purchase_invoice_count || 0),
        sales_returns: Number(salesReturnsRs.rows?.[0]?.sales_return_count || 0),
        purchase_returns: Number(purchaseReturnsRs.rows?.[0]?.purchase_return_count || 0)
      },
      purchases: canPurchases
        ? {
            total: purchaseTotal,
            invoice_count: Number(purchasesRs.rows?.[0]?.purchase_invoice_count || 0)
          }
        : null,
      credit_activity: canSales
        ? {
            credit_sales: creditSales,
            new_outstanding: newCreditOutstanding,
            collected_on_older_bills: collectedOnOldBills
          }
        : null,
      receipts: {
        cash_sales: cashSales,
        credit_sales: creditSales,
        customer_receipts: customerReceipts,
        received_for_today_sales: receiptsForTodaySales,
        collected_on_older_bills: collectedOnOldBills,
        total_receipts: totalReceipts,
        total_sales: totalSales
      },
      payments: {
        supplier_payments: supplierPayments,
        purchase_returns: purchaseReturns,
        total_payments: totalPayments
      },
      cash_position: {
        opening_cash: openingCash,
        cash_received: cashReceived,
        cash_paid: cashPaidOut,
        closing_cash: closingCash
      },
      profit: {
        total_revenue: totalRevenue,
        sales_returns: salesReturns,
        net_revenue: netRevenue,
        total_cogs: totalCogs,
        gross_profit: grossProfit,
        profit_margin_pct: profitMarginPct
      },
      gst: canSales || canPurchases
        ? {
            output_gst: canSales ? outputGst : 0,
            input_gst: canPurchases ? inputGst : 0,
            net_gst: (canSales ? outputGst : 0) - (canPurchases ? inputGst : 0)
          }
        : null,
      payment_modes: paymentModes,
      payment_modes_total: payModeTotal,
      comparison: {
        prev_date: prevDate,
        receipts: prevTotalReceipts,
        receipts_delta_pct: deltaPct(totalReceipts, prevTotalReceipts),
        receipts_comparable: prevTotalReceipts > 0.0001,
        payments: prevSupplierPayments,
        payments_delta_pct: deltaPct(totalPayments, prevSupplierPayments),
        payments_comparable: prevSupplierPayments > 0.0001,
        prev_total_sales: prevTotalSales,
        sales_delta_pct: deltaPct(totalSales, prevTotalSales),
        sales_comparable: prevTotalSales > 0.0001
      },
      recent: {
        sales: (recentSalesRs.rows || []).map((r) => ({
          id: r.id,
          invoice_number: r.invoice_number,
          customer_name: r.customer_name,
          total_amount: n(r.total_amount),
          amount_paid: n(r.amount_paid),
          balance_due: n(r.balance_due),
          is_walk_in: Boolean(r.is_walk_in_sale),
          payment_status: r.payment_status
        })),
        customer_payments: (recentPayRs.rows || []).map((r) => ({
          id: r.id,
          amount: n(r.amount),
          payment_mode: r.payment_mode,
          invoice_number: r.invoice_number,
          customer_name: r.customer_name
        })),
        purchases: (recentPurchasesRs.rows || []).map((r) => ({
          id: r.id,
          invoice_number: r.invoice_number,
          vendor_name: r.vendor_name,
          total_amount: n(r.total_amount),
          balance_due: n(r.balance_due),
          payment_status: r.payment_status
        }))
      }
    });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", {
      subMessage: String(e.message || "Please try again.")
    });
  }
}

module.exports = { handler };
