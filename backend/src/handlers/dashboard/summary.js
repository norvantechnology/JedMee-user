const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { resolveDateRange, todayYmdInTimeZone } = require("../../shared/dateFilters");

function hasView(perms, resource) {
  const r = String(resource || "").toUpperCase();
  return Boolean(perms?.[r]?.VIEW);
}

function toNum(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function clampLimit(v, fallback, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function monthStartYmd(ymd) {
  const s = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return `${s.slice(0, 8)}01`;
}

function ymdFromDow(dateObj) {
  const d = new Date(dateObj);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function last7DaysYmd(toYmd) {
  const ms = Date.parse(`${String(toYmd || "").slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms)) return [];
  const out = [];
  for (let i = 6; i >= 0; i--) out.push(ymdFromDow(new Date(ms - i * 86400000)));
  return out;
}

async function handler(event) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const istToday = todayYmdInTimeZone("Asia/Kolkata");
  const range = resolveDateRange(qs);
  const dateFrom = range.from || monthStartYmd(istToday);
  const dateTo = range.to || istToday;
  const recentLimit = clampLimit(qs.recent_limit, 6, 3, 20);
  const expiryDays = clampLimit(qs.expiry_days, 30, 7, 180);

  const perms = ctx.permissions || {};
  const canSales = hasView(perms, "SALES_INVOICES");
  const canPurchases = hasView(perms, "PURCHASE_INVOICES");
  const canCustomers = hasView(perms, "CUSTOMERS");
  const canVendors = hasView(perms, "VENDORS");
  const canBatches = hasView(perms, "PRODUCT_BATCHES");
  const canReturns = hasView(perms, "SALES_RETURNS");

  try {
    const settingsRes = await query(
      `SELECT non_moving_threshold_days, near_expiry_days
         FROM account_settings WHERE account_id = $1 LIMIT 1`,
      [ctx.accountId]
    );
    const settings = settingsRes.rows?.[0] || {};
    const nonMovingDays = Number(settings.non_moving_threshold_days || 90);
    const nearExpiryDays = Number(settings.near_expiry_days || expiryDays);

    const calls = [];

    // Sales KPIs + trends
    calls.push(
      canSales
        ? query(
            `
            WITH sales_today AS (
              SELECT
                COALESCE(SUM(total_amount),0)::numeric(14,2) AS total,
                COUNT(*)::int AS bills,
                COALESCE(SUM(CASE WHEN payment_status = 'PAID'::sales_payment_status THEN 1 ELSE 0 END),0)::int AS bills_paid,
                COALESCE(SUM(CASE WHEN payment_status = 'UNPAID'::sales_payment_status THEN 1 ELSE 0 END),0)::int AS bills_unpaid,
                COALESCE(SUM(CASE WHEN payment_status = 'PARTIAL'::sales_payment_status THEN 1 ELSE 0 END),0)::int AS bills_partial,
                COALESCE(SUM(balance_due),0)::numeric(14,2) AS balance_due
              FROM sales_invoices
              WHERE account_id = $1 AND deleted_at IS NULL
                AND status = 'CONFIRMED'::sales_invoice_status
                AND invoice_date = $2::date
            ),
            sales_range AS (
              SELECT
                COALESCE(SUM(total_amount),0)::numeric(14,2) AS total,
                COALESCE(SUM(balance_due),0)::numeric(14,2) AS balance_due,
                COUNT(*)::int AS bills
              FROM sales_invoices
              WHERE account_id = $1 AND deleted_at IS NULL
                AND status = 'CONFIRMED'::sales_invoice_status
                AND invoice_date BETWEEN $3::date AND $4::date
            ),
            sales_prev_day AS (
              SELECT COALESCE(SUM(total_amount),0)::numeric(14,2) AS total
              FROM sales_invoices
              WHERE account_id = $1 AND deleted_at IS NULL
                AND status = 'CONFIRMED'::sales_invoice_status
                AND invoice_date = ($2::date - INTERVAL '1 day')::date
            ),
            recent_sales AS (
              SELECT
                id, invoice_number, customer_name, invoice_date,
                (SELECT COUNT(*)::int FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id) AS item_count,
                total_amount, amount_paid, balance_due, status, payment_status
              FROM sales_invoices si
              WHERE account_id = $1 AND deleted_at IS NULL
              ORDER BY created_at DESC
              LIMIT $5
            ),
            sales_trend AS (
              SELECT d::date AS day,
                     COALESCE(SUM(si.total_amount),0)::numeric(14,2) AS sales_total
              FROM generate_series(($4::date - INTERVAL '29 days')::date, $4::date, INTERVAL '1 day') d
              LEFT JOIN sales_invoices si
                ON si.account_id = $1 AND si.deleted_at IS NULL
               AND si.status = 'CONFIRMED'::sales_invoice_status
               AND si.invoice_date = d::date
              GROUP BY d
              ORDER BY d
            ),
            sales_week AS (
              SELECT d::date AS day,
                     COALESCE(SUM(si.total_amount),0)::numeric(14,2) AS sales_total
              FROM generate_series(($4::date - INTERVAL '6 days')::date, $4::date, INTERVAL '1 day') d
              LEFT JOIN sales_invoices si
                ON si.account_id = $1 AND si.deleted_at IS NULL
               AND si.status = 'CONFIRMED'::sales_invoice_status
               AND si.invoice_date = d::date
              GROUP BY d
              ORDER BY d
            )
            SELECT
              (SELECT row_to_json(sales_today) FROM sales_today) AS sales_today,
              (SELECT row_to_json(sales_range) FROM sales_range) AS sales_range,
              (SELECT row_to_json(sales_prev_day) FROM sales_prev_day) AS sales_prev_day,
              (SELECT json_agg(recent_sales ORDER BY invoice_date DESC) FROM recent_sales) AS recent_sales,
              (SELECT json_agg(sales_trend ORDER BY day) FROM sales_trend) AS sales_trend,
              (SELECT json_agg(sales_week ORDER BY day) FROM sales_week) AS sales_week
            `,
            [ctx.accountId, istToday, dateFrom, dateTo, recentLimit]
          )
        : Promise.resolve({ rows: [{ sales_today: null, sales_range: null, sales_prev_day: null, recent_sales: [], sales_trend: [], sales_week: [] }] })
    );

    // Purchase totals + trend
    calls.push(
      canPurchases
        ? query(
            `
            WITH pur_today AS (
              SELECT
                COALESCE(SUM(total_amount),0)::numeric(14,2) AS total,
                COUNT(*)::int AS invoices,
                COALESCE(SUM(balance_due),0)::numeric(14,2) AS balance_due
              FROM purchase_invoices
              WHERE account_id = $1 AND deleted_at IS NULL
                AND status = 'CONFIRMED'::purchase_invoice_status
                AND invoice_date = $2::date
            ),
            pur_range AS (
              SELECT
                COALESCE(SUM(total_amount),0)::numeric(14,2) AS total,
                COALESCE(SUM(balance_due),0)::numeric(14,2) AS balance_due,
                COUNT(*)::int AS invoices
              FROM purchase_invoices
              WHERE account_id = $1 AND deleted_at IS NULL
                AND status = 'CONFIRMED'::purchase_invoice_status
                AND invoice_date BETWEEN $3::date AND $4::date
            ),
            pur_trend AS (
              SELECT d::date AS day,
                     COALESCE(SUM(pi.total_amount),0)::numeric(14,2) AS purchase_total
              FROM generate_series(($4::date - INTERVAL '29 days')::date, $4::date, INTERVAL '1 day') d
              LEFT JOIN purchase_invoices pi
                ON pi.account_id = $1 AND pi.deleted_at IS NULL
               AND pi.status = 'CONFIRMED'::purchase_invoice_status
               AND pi.invoice_date = d::date
              GROUP BY d
              ORDER BY d
            )
            SELECT
              (SELECT row_to_json(pur_today) FROM pur_today) AS pur_today,
              (SELECT row_to_json(pur_range) FROM pur_range) AS pur_range,
              (SELECT json_agg(pur_trend ORDER BY day) FROM pur_trend) AS pur_trend
            `,
            [ctx.accountId, istToday, dateFrom, dateTo]
          )
        : Promise.resolve({ rows: [{ pur_today: null, pur_range: null, pur_trend: [] }] })
    );

    // Payment mode donut (sales invoices payment_mode)
    calls.push(
      canSales
        ? query(
            `
            SELECT COALESCE(payment_mode, 'CASH') AS mode,
                   COALESCE(SUM(total_amount),0)::numeric(14,2) AS total
            FROM sales_invoices
            WHERE account_id = $1 AND deleted_at IS NULL
              AND status = 'CONFIRMED'::sales_invoice_status
              AND invoice_date BETWEEN $2::date AND $3::date
            GROUP BY COALESCE(payment_mode, 'CASH')
            ORDER BY total DESC
            `,
            [ctx.accountId, dateFrom, dateTo]
          )
        : Promise.resolve({ rows: [] })
    );

    // Top products (by sales total)
    calls.push(
      canSales
        ? query(
            `
            SELECT
              sii.product_id,
              MAX(sii.product_name) AS product_name,
              COALESCE(SUM(sii.line_total),0)::numeric(14,2) AS total
            FROM sales_invoice_items sii
            INNER JOIN sales_invoices si
              ON si.id = sii.sales_invoice_id AND si.account_id = sii.account_id
            WHERE sii.account_id = $1
              AND si.deleted_at IS NULL
              AND si.status = 'CONFIRMED'::sales_invoice_status
              AND si.invoice_date BETWEEN $2::date AND $3::date
            GROUP BY sii.product_id
            ORDER BY total DESC
            LIMIT 8
            `,
            [ctx.accountId, dateFrom, dateTo]
          )
        : Promise.resolve({ rows: [] })
    );

    // Top customers (billed + balance)
    calls.push(
      canSales && canCustomers
        ? query(
            `
            SELECT
              customer_id,
              MAX(customer_name) AS customer_name,
              COALESCE(SUM(total_amount),0)::numeric(14,2) AS billed,
              COALESCE(SUM(balance_due),0)::numeric(14,2) AS balance,
              CASE
                WHEN COALESCE(SUM(balance_due),0) <= 0.0001 THEN 'PAID'
                WHEN COALESCE(SUM(amount_paid),0) > 0.0001 THEN 'PARTIAL'
                ELSE 'UNPAID'
              END AS pay_status
            FROM sales_invoices
            WHERE account_id = $1 AND deleted_at IS NULL
              AND status = 'CONFIRMED'::sales_invoice_status
              AND invoice_date BETWEEN $2::date AND $3::date
            GROUP BY customer_id
            ORDER BY billed DESC
            LIMIT 8
            `,
            [ctx.accountId, dateFrom, dateTo]
          )
        : Promise.resolve({ rows: [] })
    );

    // Expiry watch (batches expiring soon)
    calls.push(
      canBatches
        ? query(
            `
            SELECT
              pb.id AS batch_id,
              p.name AS product_name,
              pb.batch_no,
              pb.current_stock,
              pb.expiry_date
            FROM product_batches pb
            INNER JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
            WHERE pb.account_id = $1
              AND pb.deleted_at IS NULL
              AND pb.current_stock > 0
              AND pb.expiry_date IS NOT NULL
              AND pb.expiry_date::date <= (CURRENT_DATE + ($2::int || ' days')::interval)
            ORDER BY pb.expiry_date ASC NULLS LAST, pb.current_stock DESC
            LIMIT 10
            `,
            [ctx.accountId, expiryDays]
          )
        : Promise.resolve({ rows: [] })
    );

    // Supplier payables summary (top vendors by balance_due)
    calls.push(
      canPurchases && canVendors
        ? query(
            `
            SELECT
              purchase_invoices.vendor_id AS vendor_id,
              MAX(v.name) AS vendor_name,
              COALESCE(SUM(balance_due),0)::numeric(14,2) AS outstanding,
              COALESCE(SUM(CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN balance_due ELSE 0 END),0)::numeric(14,2) AS overdue
            FROM purchase_invoices
            LEFT JOIN vendors v ON v.id = purchase_invoices.vendor_id AND v.account_id = purchase_invoices.account_id
            WHERE purchase_invoices.account_id = $1 AND purchase_invoices.deleted_at IS NULL
              AND status = 'CONFIRMED'::purchase_invoice_status
              AND balance_due > 0
            GROUP BY purchase_invoices.vendor_id
            ORDER BY outstanding DESC
            LIMIT 8
            `,
            [ctx.accountId]
          )
        : Promise.resolve({ rows: [] })
    );

    // Recent purchases
    calls.push(
      canPurchases
        ? query(
            `
            SELECT
              pi.id,
              pi.invoice_number,
              pi.invoice_date,
              COALESCE(v.name, '') AS vendor_name,
              (SELECT COUNT(*)::int FROM purchase_invoice_items pii WHERE pii.purchase_invoice_id = pi.id) AS item_count,
              pi.total_amount,
              pi.amount_paid,
              pi.balance_due,
              pi.status,
              pi.payment_status
            FROM purchase_invoices pi
            LEFT JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id
            WHERE pi.account_id = $1 AND pi.deleted_at IS NULL
            ORDER BY pi.created_at DESC
            LIMIT $2
            `,
            [ctx.accountId, recentLimit]
          )
        : Promise.resolve({ rows: [] })
    );

    // Recent sales returns
    calls.push(
      canReturns
        ? query(
            `
            SELECT
              sr.id,
              sr.return_number,
              sr.customer_name,
              sr.return_date,
              (SELECT COUNT(*)::int FROM sales_return_items sri WHERE sri.sales_return_id = sr.id) AS item_count,
              sr.total_return_amount,
              sr.status
            FROM sales_returns sr
            WHERE sr.account_id = $1
            ORDER BY sr.created_at DESC
            LIMIT $2
            `,
            [ctx.accountId, recentLimit]
          )
        : Promise.resolve({ rows: [] })
    );

    // Low stock (products where current stock <= threshold)
    calls.push(
      canBatches
        ? query(
            `
            WITH prod_stock AS (
              SELECT
                p.id AS product_id,
                p.name AS product_name,
                COUNT(pb.id)::int AS batches,
                COALESCE(SUM(pb.current_stock),0)::numeric(14,3) AS qty
              FROM products p
              LEFT JOIN product_batches pb
                ON pb.product_id = p.id
               AND pb.account_id = p.account_id
               AND pb.deleted_at IS NULL
              WHERE p.account_id = $1 AND p.deleted_at IS NULL
              GROUP BY p.id
            )
            SELECT *
            FROM prod_stock
            WHERE qty > 0
              AND qty <= (
                SELECT COALESCE(p2.low_stock_threshold,0)
                FROM products p2
                WHERE p2.id = prod_stock.product_id AND p2.account_id = $1
                LIMIT 1
              )
            ORDER BY qty ASC, product_name ASC
            LIMIT 20
            `,
            [ctx.accountId]
          )
        : Promise.resolve({ rows: [] })
    );

    // Non-moving count (reuse logic similar to /dashboard/alerts)
    calls.push(
      canBatches
        ? query(
            `
            WITH last_sale AS (
              SELECT batch_id, MAX(created_at) AS last_sale_at
              FROM inventory_txns
              WHERE account_id = $1 AND txn_type = 'SALE'
              GROUP BY batch_id
            )
            SELECT COUNT(*)::int AS c
            FROM product_batches pb
            LEFT JOIN last_sale ls ON ls.batch_id = pb.id
            WHERE pb.account_id = $1
              AND pb.deleted_at IS NULL
              AND pb.current_stock > 0
              AND (ls.last_sale_at IS NULL OR ls.last_sale_at < now() - ($2::int || ' days')::interval)
            `,
            [ctx.accountId, nonMovingDays]
          )
        : Promise.resolve({ rows: [{ c: 0 }] })
    );

    // Overdue receivables (sales)
    calls.push(
      canSales
        ? query(
            `
            SELECT
              COALESCE(SUM(balance_due),0)::numeric(14,2) AS amount,
              COUNT(*)::int AS invoices
            FROM sales_invoices
            WHERE account_id = $1 AND deleted_at IS NULL
              AND status = 'CONFIRMED'::sales_invoice_status
              AND balance_due > 0
              AND due_date IS NOT NULL
              AND due_date < CURRENT_DATE
            `,
            [ctx.accountId]
          )
        : Promise.resolve({ rows: [{ amount: 0, invoices: 0 }] })
    );

    // Overdue payables (purchases)
    calls.push(
      canPurchases
        ? query(
            `
            SELECT
              COALESCE(SUM(balance_due),0)::numeric(14,2) AS amount,
              COUNT(*)::int AS invoices
            FROM purchase_invoices
            WHERE account_id = $1 AND deleted_at IS NULL
              AND status = 'CONFIRMED'::purchase_invoice_status
              AND balance_due > 0
              AND due_date IS NOT NULL
              AND due_date < CURRENT_DATE
            `,
            [ctx.accountId]
          )
        : Promise.resolve({ rows: [{ amount: 0, invoices: 0 }] })
    );

    // Stock summary (bottom table)
    calls.push(
      canBatches
        ? query(
            `
            WITH batch_agg AS (
              SELECT
                pb.product_id,
                COUNT(pb.id)::int AS batch_count,
                COALESCE(SUM(pb.current_stock),0)::numeric(14,3) AS total_qty,
                MAX(CASE WHEN pb.expiry_date IS NOT NULL AND pb.expiry_date::date <= (CURRENT_DATE + ($2::int || ' days')::interval) THEN 1 ELSE 0 END)::int AS has_near_exp
              FROM product_batches pb
              WHERE pb.account_id = $1
                AND pb.deleted_at IS NULL
              GROUP BY pb.product_id
            ),
            non_moving AS (
              SELECT product_id, 1 AS has_non_moving
              FROM non_moving_alerts
              WHERE account_id = $1 AND days_non_moving >= $3::int AND current_stock > 0
              GROUP BY product_id
            )
            SELECT
              p.id AS product_id,
              p.name AS product_name,
              COALESCE(ba.batch_count,0)::int AS batch_count,
              COALESCE(ba.total_qty,0)::numeric(14,3) AS total_qty,
              COALESCE(ba.has_near_exp,0)::int AS has_near_exp,
              COALESCE(nm.has_non_moving,0)::int AS has_non_moving
            FROM products p
            LEFT JOIN batch_agg ba ON ba.product_id = p.id
            LEFT JOIN non_moving nm ON nm.product_id = p.id
            WHERE p.account_id = $1 AND p.deleted_at IS NULL
            ORDER BY COALESCE(ba.total_qty,0) DESC, p.name ASC
            LIMIT 20
            `,
            [ctx.accountId, nearExpiryDays, nonMovingDays]
          )
        : Promise.resolve({ rows: [] })
    );

    const [
      salesPack,
      purchasePack,
      payModes,
      topProducts,
      topCustomers,
      expiryWatch,
      supplierPayables,
      recentPurchases,
      recentReturns,
      lowStock,
      nonMovingCount,
      overdueRecv,
      overduePay,
      stockSummary
    ] = await Promise.all(calls);

    const salesRow = salesPack.rows?.[0] || {};
    const purchaseRow = purchasePack.rows?.[0] || {};

    const salesToday = salesRow.sales_today || null;
    const salesPrev = salesRow.sales_prev_day || null;
    const salesRange = salesRow.sales_range || null;
    const purToday = purchaseRow.pur_today || null;
    const purRange = purchaseRow.pur_range || null;

    const todaySales = toNum(salesToday?.total);
    const yesterdaySales = toNum(salesPrev?.total);
    const todaySalesDeltaPct = yesterdaySales > 0 ? ((todaySales - yesterdaySales) / yesterdaySales) * 100 : null;

    const grossProfit = canSales && canPurchases ? Math.max(0, toNum(salesRange?.total) - toNum(purRange?.total)) : null;

    const days7 = last7DaysYmd(dateTo);
    const weekMap = new Map((salesRow.sales_week || []).map((r) => [String(r.day).slice(0, 10), toNum(r.sales_total)]));
    const salesWeek = days7.map((d) => ({ day: d, sales_total: weekMap.get(d) ?? 0 }));

    const stockSummaryRows = (stockSummary.rows || []).map((r) => {
      const totalQty = toNum(r.total_qty);
      const health =
        totalQty <= 0.0001 ? "NO_STOCK" :
        Number(r.has_near_exp || 0) ? "NEAR_EXP" :
        Number(r.has_non_moving || 0) ? "NON_MOVING" :
        "GOOD";
      const healthLabel = health === "NO_STOCK" ? "No Stock" : health === "NEAR_EXP" ? "Near Exp" : health === "NON_MOVING" ? "Non-Moving" : "Good";
      return {
        product_id: r.product_id,
        product_name: r.product_name,
        batch_count: Number(r.batch_count || 0),
        total_qty: r.total_qty,
        health,
        health_label: healthLabel
      };
    });

    return ok({
      meta: {
        account_id: ctx.accountId,
        ist_today: istToday,
        range: { from: dateFrom, to: dateTo },
        visibility: {
          sales: canSales,
          purchases: canPurchases,
          customers: canCustomers,
          vendors: canVendors,
          batches: canBatches,
          returns: canReturns
        },
        thresholds: {
          non_moving_days: nonMovingDays,
          near_expiry_days: nearExpiryDays
        }
      },
      alerts: {
        near_expiry_batches: canBatches ? Number((expiryWatch.rows || []).length) : 0,
        non_moving_items: canBatches ? Number(nonMovingCount.rows?.[0]?.c || 0) : 0,
        low_stock_products: canBatches ? Number((lowStock.rows || []).length) : 0,
        overdue_payables_invoices: canPurchases ? Number(overduePay.rows?.[0]?.invoices || 0) : 0
      },
      kpis: {
        today_sales: canSales ? { value: todaySales, prev_value: yesterdaySales, delta_pct: todaySalesDeltaPct } : null,
        range_sales: canSales ? { value: toNum(salesRange?.total) } : null,
        receivables: canSales ? { value: toNum(salesRange?.balance_due), invoices: toNum(salesRange?.bills) } : null,
        today_cash_like: canSales
          ? {
              value: null,
              note: "Derived on client from payment mode split (optional)."
            }
          : null,
        today_purchases: canPurchases ? { value: toNum(purToday?.total), invoices: toNum(purToday?.invoices) } : null,
        gross_profit: grossProfit != null ? { value: grossProfit } : null,
        payables: canPurchases ? { value: toNum(purRange?.balance_due) } : null,
        bills_today: canSales ? { value: toNum(salesToday?.bills), confirmed: toNum(salesToday?.bills), drafts: 0, returns: null } : null
      },
      widgets: {
        recent_sales: canSales ? salesRow.recent_sales || [] : [],
        recent_purchases: canPurchases ? recentPurchases.rows || [] : [],
        recent_returns: canReturns ? recentReturns.rows || [] : [],
        sales_trend_30d: canSales ? salesRow.sales_trend || [] : [],
        sales_week_7d: canSales ? salesWeek : [],
        purchase_trend_30d: canPurchases ? purchaseRow.pur_trend || [] : [],
        payment_modes: canSales ? (payModes.rows || []) : [],
        top_products: canSales ? (topProducts.rows || []) : [],
        top_customers: canSales && canCustomers ? (topCustomers.rows || []) : [],
        expiry_watch: canBatches ? (expiryWatch.rows || []) : [],
        low_stock: canBatches ? lowStock.rows || [] : [],
        stock_summary: canBatches ? stockSummaryRows : [],
        supplier_payables: canPurchases && canVendors ? (supplierPayables.rows || []) : [],
        overdue_receivables: canSales ? overdueRecv.rows?.[0] || { amount: 0, invoices: 0 } : { amount: 0, invoices: 0 },
        overdue_payables: canPurchases ? overduePay.rows?.[0] || { amount: 0, invoices: 0 } : { amount: 0, invoices: 0 },
        non_moving_count: canBatches ? Number(nonMovingCount.rows?.[0]?.c || 0) : 0,
        alerts: [
          ...(canBatches
            ? (expiryWatch.rows || []).slice(0, 2).map((x) => ({
                kind: "EXPIRY",
                severity: "red",
                title: `${x.product_name}  Batch ${x.batch_no}`,
                subtitle: `Expires: ${String(x.expiry_date || "").slice(0, 10)} · Stock: ${toNum(x.current_stock)}`,
                badge: "Exp Soon"
              }))
            : []),
          ...(canBatches
            ? (lowStock.rows || []).slice(0, 2).map((x) => ({
                kind: "LOW_STOCK",
                severity: "amber",
                title: `${x.product_name}  Low stock`,
                subtitle: `Stock: ${toNum(x.total_stock)} · Threshold: ${toNum(x.threshold)}`,
                badge: "Low Stock"
              }))
            : []),
          ...(canSales && toNum(overdueRecv.rows?.[0]?.amount) > 0
            ? [
                {
                  kind: "RECEIVABLES",
                  severity: "blue",
                  title: `Overdue Receivables  ${toNum(overdueRecv.rows?.[0]?.invoices)} invoices`,
                  subtitle: `Amount: ₹${toNum(overdueRecv.rows?.[0]?.amount).toFixed(2)}`,
                  badge: "Overdue"
                }
              ]
            : []),
          ...(canPurchases && toNum(overduePay.rows?.[0]?.amount) > 0
            ? [
                {
                  kind: "PAYABLES",
                  severity: "red",
                  title: `Overdue Payables  ${toNum(overduePay.rows?.[0]?.invoices)} invoices`,
                  subtitle: `Amount: ₹${toNum(overduePay.rows?.[0]?.amount).toFixed(2)}`,
                  badge: "Due"
                }
              ]
            : [])
        ]
      },
      permissions: ctx.permissions || {}
    });
  } catch (e) {
    void actorId;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };

