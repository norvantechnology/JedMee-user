const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { resolveSingleDate } = require("../../shared/dateFilters");

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const qs = event?.queryStringParameters || {};
  const date = resolveSingleDate(qs.date);

  try {
    const [settingsRs, salesRs, receiptsRs, paymentsRs, profitRs] = await Promise.all([
      query(`SELECT daily_opening_cash FROM account_settings WHERE account_id = $1 LIMIT 1`, [ctx.accountId]),
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN is_walk_in_sale = true THEN total_amount ELSE 0 END),0)::numeric(14,2) AS cash_sales,
           COALESCE(SUM(CASE WHEN is_walk_in_sale = false THEN total_amount ELSE 0 END),0)::numeric(14,2) AS credit_sales
         FROM sales_invoices
         WHERE account_id = $1
           AND deleted_at IS NULL
           AND status = 'CONFIRMED'
           AND invoice_date = $2`,
        [ctx.accountId, date]
      ),
      query(
        `SELECT COALESCE(SUM(amount),0)::numeric(14,2) AS customer_receipts
         FROM customer_payments
         WHERE account_id = $1 AND payment_date = $2`,
        [ctx.accountId, date]
      ),
      query(
        `SELECT
           (
             COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE account_id = $1 AND payment_date = $2),0) +
             COALESCE((SELECT SUM(amount) FROM division_payments WHERE account_id = $1 AND payment_date = $2),0)
           )::numeric(14,2) AS supplier_payments`,
        [ctx.accountId, date]
      ),
      // Gross profit: revenue (taxable_amount excl. GST) minus COGS (qty × batch purchase_rate)
      // Only confirmed sales on this date; batches without a purchase_rate are treated as 0 cost.
      query(
        `SELECT
           COALESCE(SUM(sii.taxable_amount), 0)::numeric(14,2)                    AS total_revenue,
           COALESCE(SUM(sii.qty * COALESCE(pb.purchase_rate, 0)), 0)::numeric(14,2) AS total_cogs
         FROM sales_invoice_items sii
         JOIN sales_invoices si
           ON si.id = sii.sales_invoice_id AND si.account_id = sii.account_id
         LEFT JOIN product_batches pb
           ON pb.id = sii.batch_id AND pb.account_id = sii.account_id
         WHERE sii.account_id = $1
           AND si.deleted_at IS NULL
           AND si.status = 'CONFIRMED'
           AND si.invoice_date = $2`,
        [ctx.accountId, date]
      )
    ]);

    const openingCash       = n(settingsRs.rows?.[0]?.daily_opening_cash);
    const cashSales         = n(salesRs.rows?.[0]?.cash_sales);
    const creditSales       = n(salesRs.rows?.[0]?.credit_sales);
    const customerReceipts  = n(receiptsRs.rows?.[0]?.customer_receipts);
    const supplierPayments  = n(paymentsRs.rows?.[0]?.supplier_payments);
    const totalRevenue      = n(profitRs.rows?.[0]?.total_revenue);
    const totalCogs         = n(profitRs.rows?.[0]?.total_cogs);
    const grossProfit       = totalRevenue - totalCogs;
    const profitMarginPct   = totalRevenue > 0
      ? Math.round((grossProfit / totalRevenue) * 10000) / 100   // 2 decimal places
      : 0;

    // totalReceipts = actual cash received (cash sales + customer payments).
    // Credit sales are NOT cash — they are accrual entries; adding them here
    // would double-count any credit sale that also has a customer_payment on
    // the same day.  We expose credit_sales separately for informational display.
    const totalReceipts = cashSales + customerReceipts;
    const totalSales    = cashSales + creditSales;          // informational
    const totalPayments = supplierPayments;
    const cashReceived  = cashSales + customerReceipts;
    const closingCash   = openingCash + cashReceived - totalPayments;

    return ok({
      date,
      opening_cash: openingCash,
      receipts: {
        cash_sales:        cashSales,
        credit_sales:      creditSales,      // informational — not in total
        customer_receipts: customerReceipts,
        total_receipts:    totalReceipts,    // cash only
        total_sales:       totalSales        // informational
      },
      payments: {
        supplier_payments: supplierPayments,
        total_payments:    totalPayments
      },
      cash_position: {
        opening_cash:  openingCash,
        cash_received: cashReceived,
        cash_paid:     totalPayments,
        closing_cash:  closingCash
      },
      profit: {
        total_revenue:     totalRevenue,     // sales taxable amount (excl. GST)
        total_cogs:        totalCogs,        // qty × purchase_rate per batch
        gross_profit:      grossProfit,      // revenue − cogs
        profit_margin_pct: profitMarginPct   // % of revenue
      }
    });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
