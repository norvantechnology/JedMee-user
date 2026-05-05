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
    const [settingsRs, salesRs, receiptsRs, paymentsRs] = await Promise.all([
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
      )
    ]);

    const openingCash = n(settingsRs.rows?.[0]?.daily_opening_cash);
    const cashSales = n(salesRs.rows?.[0]?.cash_sales);
    const creditSales = n(salesRs.rows?.[0]?.credit_sales);
    const customerReceipts = n(receiptsRs.rows?.[0]?.customer_receipts);
    const supplierPayments = n(paymentsRs.rows?.[0]?.supplier_payments);

    const totalReceipts = cashSales + creditSales + customerReceipts;
    const totalPayments = supplierPayments;
    const cashReceived = cashSales + customerReceipts;
    const closingCash = openingCash + cashReceived - totalPayments;

    return ok({
      date,
      opening_cash: openingCash,
      receipts: {
        cash_sales: cashSales,
        credit_sales: creditSales,
        customer_receipts: customerReceipts,
        total_receipts: totalReceipts
      },
      payments: {
        supplier_payments: supplierPayments,
        total_payments: totalPayments
      },
      cash_position: {
        opening_cash: openingCash,
        cash_received: cashReceived,
        cash_paid: totalPayments,
        closing_cash: closingCash
      }
    });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
