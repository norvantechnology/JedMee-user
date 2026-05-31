const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireApprovedUser } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const {
  resolveDateRange,
  resolveAnalyticsDay,
  todayYmdInTimeZone,
  resolveClientTimeZone
} = require("../../shared/dateFilters");

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
  const timeZone = resolveClientTimeZone(qs);
  const clientToday = todayYmdInTimeZone(timeZone);
  const range = resolveDateRange(qs);
  const dateFrom = range.from || monthStartYmd(clientToday);
  const dateTo = range.to || clientToday;
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
                AND status = 'CONFIRMED'::sales_invoice_status
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
            [ctx.accountId, analyticsDay, dateFrom, dateTo, recentLimit]
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
            pur_prev_day AS (
              SELECT
                COALESCE(SUM(total_amount),0)::numeric(14,2) AS total
              FROM purchase_invoices
              WHERE account_id = $1 AND deleted_at IS NULL
                AND status = 'CONFIRMED'::purchase_invoice_status
                AND invoice_date = ($2::date - INTERVAL '1 day')::date
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
              (SELECT row_to_json(pur_prev_day) FROM pur_prev_day) AS pur_prev_day,
              (SELECT row_to_json(pur_range) FROM pur_range) AS pur_range,
              (SELECT json_agg(pur_trend ORDER BY day) FROM pur_trend) AS pur_trend
            `,
            [ctx.accountId, analyticsDay, dateFrom, dateTo]
          )
        : Promise.resolve({ rows: [{ pur_today: null, pur_prev_day: null, pur_range: null, pur_trend: [] }] })
    );

    // Payment mode donut (from customer_payments on confirmed sales in range)
    calls.push(
      canSales
        ? query(
            `
            SELECT COALESCE(cp.payment_mode::text, 'CASH') AS mode,
                   COALESCE(SUM(cp.amount),0)::numeric(14,2) AS total
            FROM customer_payments cp
            JOIN sales_invoices si ON si.id = cp.sales_invoice_id AND si.account_id = cp.account_id
            WHERE cp.account_id = $1
              AND si.deleted_at IS NULL
              AND si.status = 'CONFIRMED'::sales_invoice_status
              AND si.invoice_date BETWEEN $2::date AND $3::date
              AND COALESCE(cp.allocation_type, 'INVOICE') = 'INVOICE'
            GROUP BY COALESCE(cp.payment_mode::text, 'CASH')
            ORDER BY total DESC
            `,
            [ctx.accountId, dateFrom, dateTo]
          )
        : Promise.resolve({ rows: [] })
    );

    // Payment modes — previous calendar month (for share trend vs current period)
    calls.push(
      canSales
        ? query(
            `
            SELECT COALESCE(cp.payment_mode::text, 'CASH') AS mode,
                   COALESCE(SUM(cp.amount),0)::numeric(14,2) AS total
            FROM customer_payments cp
            JOIN sales_invoices si ON si.id = cp.sales_invoice_id AND si.account_id = cp.account_id
            WHERE cp.account_id = $1
              AND si.deleted_at IS NULL
              AND si.status = 'CONFIRMED'::sales_invoice_status
              AND si.invoice_date BETWEEN
                date_trunc('month', $2::date - INTERVAL '1 month')::date
                AND (date_trunc('month', $2::date) - INTERVAL '1 day')::date
              AND COALESCE(cp.allocation_type, 'INVOICE') = 'INVOICE'
            GROUP BY COALESCE(cp.payment_mode::text, 'CASH')
            ORDER BY total DESC
            `,
            [ctx.accountId, dateTo]
          )
        : Promise.resolve({ rows: [] })
    );

    // Sales by ISO day of week (Mon=1 … Sun=7) for selected period
    calls.push(
      canSales
        ? query(
            `
            SELECT
              EXTRACT(ISODOW FROM invoice_date)::int AS dow,
              COALESCE(SUM(total_amount),0)::numeric(14,2) AS total
            FROM sales_invoices
            WHERE account_id = $1 AND deleted_at IS NULL
              AND status = 'CONFIRMED'::sales_invoice_status
              AND invoice_date BETWEEN $2::date AND $3::date
            GROUP BY EXTRACT(ISODOW FROM invoice_date)::int
            ORDER BY dow
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
              COALESCE(SUM(sii.line_total),0)::numeric(14,2) AS total,
              COALESCE(SUM(sii.qty),0)::numeric(14,3) AS qty_sold
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
              AND pi.status = 'CONFIRMED'::purchase_invoice_status
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
                COALESCE(SUM(pb.current_stock),0)::numeric(14,3) AS qty,
                COALESCE(p.low_stock_threshold,0)::numeric(14,3) AS threshold
              FROM products p
              LEFT JOIN product_batches pb
                ON pb.product_id = p.id
               AND pb.account_id = p.account_id
               AND pb.deleted_at IS NULL
              WHERE p.account_id = $1 AND p.deleted_at IS NULL
              GROUP BY p.id, p.name, p.low_stock_threshold
            )
            SELECT *
            FROM prod_stock
            WHERE qty > 0
              AND threshold > 0
              AND qty <= threshold
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

    // Purchase invoices due today (unpaid balance, due_date = today)
    calls.push(
      canPurchases
        ? query(
            `
            SELECT
              pi.id,
              pi.invoice_number,
              COALESCE(v.name, '') AS vendor_name,
              pi.balance_due,
              pi.due_date
            FROM purchase_invoices pi
            LEFT JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id
            WHERE pi.account_id = $1 AND pi.deleted_at IS NULL
              AND pi.status = 'CONFIRMED'::purchase_invoice_status
              AND pi.balance_due > 0
              AND pi.due_date = CURRENT_DATE
            ORDER BY pi.balance_due DESC
            LIMIT 10
            `,
            [ctx.accountId]
          )
        : Promise.resolve({ rows: [] })
    );

    // Total outstanding receivables (all-time, not date-filtered) — balance sheet item
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
            `,
            [ctx.accountId]
          )
        : Promise.resolve({ rows: [{ amount: 0, invoices: 0 }] })
    );

    // Total outstanding payables (all-time, not date-filtered) — balance sheet item
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

    // ── NEW ANALYTICS QUERIES ────────────────────────────────────────────────

    // Pending orders (incoming for wholesaler + my orders for retailer)
    calls.push(
      query(
        `
        SELECT
          COUNT(CASE WHEN wholesaler_account_id = $1 AND status = 'PENDING' THEN 1 END)::int AS incoming_count,
          COALESCE(SUM(CASE WHEN wholesaler_account_id = $1 AND status = 'PENDING' THEN total_amount ELSE 0 END),0)::numeric(14,2) AS incoming_value,
          COUNT(CASE WHEN retailer_account_id = $1 AND status = 'PENDING' THEN 1 END)::int AS my_count,
          COALESCE(SUM(CASE WHEN retailer_account_id = $1 AND status = 'PENDING' THEN total_amount ELSE 0 END),0)::numeric(14,2) AS my_value
        FROM orders
        WHERE (wholesaler_account_id = $1 OR retailer_account_id = $1)
          AND status = 'PENDING'
        `,
        [ctx.accountId]
      )
    );

    // Month-over-month: last month + same month last year sales
    calls.push(
      canSales
        ? query(
            `
            SELECT
              COALESCE(SUM(CASE
                WHEN invoice_date BETWEEN
                  date_trunc('month', $2::date - INTERVAL '1 month')::date
                  AND (date_trunc('month', $2::date) - INTERVAL '1 day')::date
                THEN total_amount ELSE 0 END),0)::numeric(14,2) AS last_month_sales,
              (SELECT COALESCE(SUM(pi.total_amount),0)::numeric(14,2)
               FROM purchase_invoices pi
               WHERE pi.account_id = $1 AND pi.deleted_at IS NULL
                 AND pi.status = 'CONFIRMED'::purchase_invoice_status
                 AND pi.invoice_date BETWEEN
                   date_trunc('month', $2::date - INTERVAL '1 month')::date
                   AND (date_trunc('month', $2::date) - INTERVAL '1 day')::date
              ) AS last_month_purchases,
              COALESCE(SUM(CASE
                WHEN invoice_date BETWEEN
                  date_trunc('month', $2::date - INTERVAL '13 months')::date
                  AND (date_trunc('month', $2::date - INTERVAL '12 months') - INTERVAL '1 day')::date
                THEN total_amount ELSE 0 END),0)::numeric(14,2) AS same_month_last_year,
              COALESCE(SUM(CASE
                WHEN invoice_date BETWEEN
                  date_trunc('month', $2::date)::date AND $2::date
                THEN total_amount ELSE 0 END),0)::numeric(14,2) AS current_month_to_date
            FROM sales_invoices
            WHERE account_id = $1 AND deleted_at IS NULL
              AND status = 'CONFIRMED'
            `,
            [ctx.accountId, dateTo]
          )
        : Promise.resolve({ rows: [{ last_month_sales: 0, last_month_purchases: 0, same_month_last_year: 0, current_month_to_date: 0 }] })
    );

    // Overdue receivables aging buckets (0-30, 31-60, 61-90, 90+ days)
    calls.push(
      canSales
        ? query(
            `
            SELECT
              COALESCE(SUM(CASE WHEN (CURRENT_DATE - due_date) BETWEEN 1 AND 30 THEN balance_due ELSE 0 END),0)::numeric(14,2) AS bucket_0_30,
              COALESCE(SUM(CASE WHEN (CURRENT_DATE - due_date) BETWEEN 31 AND 60 THEN balance_due ELSE 0 END),0)::numeric(14,2) AS bucket_31_60,
              COALESCE(SUM(CASE WHEN (CURRENT_DATE - due_date) BETWEEN 61 AND 90 THEN balance_due ELSE 0 END),0)::numeric(14,2) AS bucket_61_90,
              COALESCE(SUM(CASE WHEN (CURRENT_DATE - due_date) > 90 THEN balance_due ELSE 0 END),0)::numeric(14,2) AS bucket_90_plus,
              COUNT(CASE WHEN (CURRENT_DATE - due_date) BETWEEN 1 AND 30 THEN 1 END)::int AS count_0_30,
              COUNT(CASE WHEN (CURRENT_DATE - due_date) BETWEEN 31 AND 60 THEN 1 END)::int AS count_31_60,
              COUNT(CASE WHEN (CURRENT_DATE - due_date) BETWEEN 61 AND 90 THEN 1 END)::int AS count_61_90,
              COUNT(CASE WHEN (CURRENT_DATE - due_date) > 90 THEN 1 END)::int AS count_90_plus
            FROM sales_invoices
            WHERE account_id = $1 AND deleted_at IS NULL
              AND status = 'CONFIRMED'
              AND balance_due > 0
              AND due_date IS NOT NULL
              AND due_date < CURRENT_DATE
            `,
            [ctx.accountId]
          )
        : Promise.resolve({ rows: [{ bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0, count_0_30: 0, count_31_60: 0, count_61_90: 0, count_90_plus: 0 }] })
    );

    // Top manufacturers by sales revenue in the period
    calls.push(
      canSales
        ? query(
            `
            SELECT
              mc.id AS mfg_id,
              mc.name AS mfg_name,
              COALESCE(SUM(sii.line_total),0)::numeric(14,2) AS total
            FROM sales_invoice_items sii
            INNER JOIN sales_invoices si
              ON si.id = sii.sales_invoice_id AND si.account_id = sii.account_id
            INNER JOIN products p
              ON p.id = sii.product_id AND p.account_id = sii.account_id
            INNER JOIN mfg_companies mc
              ON mc.id = p.mfg_company_id AND mc.account_id = p.account_id
            WHERE sii.account_id = $1
              AND si.deleted_at IS NULL
              AND si.status = 'CONFIRMED'::sales_invoice_status
              AND si.invoice_date BETWEEN $2::date AND $3::date
            GROUP BY mc.id, mc.name
            ORDER BY total DESC
            LIMIT 8
            `,
            [ctx.accountId, dateFrom, dateTo]
          )
        : Promise.resolve({ rows: [] })
    );

    // Invoice payment status for the selected period
    calls.push(
      canSales
        ? query(
            `
            SELECT
              COUNT(*)::int AS total_invoices,
              SUM(CASE WHEN payment_status = 'PAID'::sales_payment_status THEN 1 ELSE 0 END)::int AS paid,
              SUM(CASE WHEN payment_status = 'PARTIAL'::sales_payment_status THEN 1 ELSE 0 END)::int AS partial,
              SUM(CASE WHEN payment_status = 'UNPAID'::sales_payment_status THEN 1 ELSE 0 END)::int AS unpaid,
              COALESCE(SUM(total_amount),0)::numeric(14,2) AS total_billed,
              COALESCE(SUM(amount_paid),0)::numeric(14,2) AS total_collected
            FROM sales_invoices
            WHERE account_id = $1 AND deleted_at IS NULL
              AND status = 'CONFIRMED'::sales_invoice_status
              AND invoice_date BETWEEN $2::date AND $3::date
            `,
            [ctx.accountId, dateFrom, dateTo]
          )
        : Promise.resolve({ rows: [{ total_invoices: 0, paid: 0, partial: 0, unpaid: 0, total_billed: 0, total_collected: 0 }] })
    );

    // Expiry value at risk (stock value of batches expiring within 30/60/90 days)
    calls.push(
      canBatches
        ? query(
            `
            SELECT
              COALESCE(SUM(CASE WHEN pb.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
                THEN pb.current_stock * COALESCE(pb.mrp,0) ELSE 0 END),0)::numeric(14,2) AS value_30d,
              COALESCE(SUM(CASE WHEN pb.expiry_date <= CURRENT_DATE + INTERVAL '60 days'
                THEN pb.current_stock * COALESCE(pb.mrp,0) ELSE 0 END),0)::numeric(14,2) AS value_60d,
              COALESCE(SUM(CASE WHEN pb.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
                THEN pb.current_stock * COALESCE(pb.mrp,0) ELSE 0 END),0)::numeric(14,2) AS value_90d,
              COUNT(CASE WHEN pb.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 1 END)::int AS batches_30d,
              COUNT(CASE WHEN pb.expiry_date <= CURRENT_DATE + INTERVAL '60 days' THEN 1 END)::int AS batches_60d
            FROM product_batches pb
            WHERE pb.account_id = $1
              AND pb.deleted_at IS NULL
              AND pb.current_stock > 0
              AND pb.expiry_date IS NOT NULL
              AND pb.expiry_date > CURRENT_DATE
            `,
            [ctx.accountId]
          )
        : Promise.resolve({ rows: [{ value_30d: 0, value_60d: 0, value_90d: 0, batches_30d: 0, batches_60d: 0 }] })
    );

    // Non-moving stock value (count + rupee value of non-moving batches)
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
            SELECT
              COUNT(*)::int AS count,
              COALESCE(SUM(pb.current_stock * COALESCE(pb.mrp,0)),0)::numeric(14,2) AS value
            FROM product_batches pb
            LEFT JOIN last_sale ls ON ls.batch_id = pb.id
            WHERE pb.account_id = $1
              AND pb.deleted_at IS NULL
              AND pb.current_stock > 0
              AND (ls.last_sale_at IS NULL OR ls.last_sale_at < now() - ($2::int || ' days')::interval)
            `,
            [ctx.accountId, nonMovingDays]
          )
        : Promise.resolve({ rows: [{ count: 0, value: 0 }] })
    );

    // Stock coverage days (products with lowest days of stock remaining at current sales rate)
    calls.push(
      canBatches && canSales
        ? query(
            `
            WITH period_days AS (
              SELECT GREATEST(1, ($3::date - $2::date + 1)) AS days
            ),
            daily_sales AS (
              SELECT
                sii.product_id,
                COALESCE(SUM(sii.qty),0)::numeric(14,3) / (SELECT days FROM period_days) AS avg_daily_qty
              FROM sales_invoice_items sii
              INNER JOIN sales_invoices si
                ON si.id = sii.sales_invoice_id AND si.account_id = sii.account_id
              WHERE sii.account_id = $1
                AND si.deleted_at IS NULL
                AND si.status = 'CONFIRMED'::sales_invoice_status
                AND si.invoice_date BETWEEN $2::date AND $3::date
              GROUP BY sii.product_id
            ),
            current_stock AS (
              SELECT
                p.id AS product_id,
                p.name AS product_name,
                COALESCE(SUM(pb.current_stock),0)::numeric(14,3) AS total_stock
              FROM products p
              LEFT JOIN product_batches pb
                ON pb.product_id = p.id AND pb.account_id = p.account_id AND pb.deleted_at IS NULL
              WHERE p.account_id = $1 AND p.deleted_at IS NULL
              GROUP BY p.id, p.name
            )
            SELECT
              cs.product_id,
              cs.product_name,
              cs.total_stock,
              ROUND(ds.avg_daily_qty, 3) AS avg_daily_qty,
              ROUND(cs.total_stock / NULLIF(ds.avg_daily_qty, 0))::int AS coverage_days
            FROM current_stock cs
            INNER JOIN daily_sales ds ON ds.product_id = cs.product_id
            WHERE cs.total_stock > 0 AND ds.avg_daily_qty > 0
            ORDER BY coverage_days ASC
            LIMIT 10
            `,
            [ctx.accountId, dateFrom, dateTo]
          )
        : Promise.resolve({ rows: [] })
    );

    const [
      salesPack,
      purchasePack,
      payModes,
      payModesPrev,
      salesByDow,
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
      totalRecv,
      totalPay,
      stockSummary,
      pendingOrders,
      momComparison,
      overdueAging,
      topMfg,
      invoicePayStatus,
      expiryValueAtRisk,
      nonMovingValue,
      stockCoverage,
      purchaseDueToday
    ] = await Promise.all(calls);

    const salesRow = salesPack.rows?.[0] || {};
    const purchaseRow = purchasePack.rows?.[0] || {};

    const salesToday = salesRow.sales_today || null;
    const salesPrev = salesRow.sales_prev_day || null;
    const salesRange = salesRow.sales_range || null;
    const purToday = purchaseRow.pur_today || null;
    const purPrev = purchaseRow.pur_prev_day || null;
    const purRange = purchaseRow.pur_range || null;

    const todaySales = toNum(salesToday?.total);
    const yesterdaySales = toNum(salesPrev?.total);
    const todaySalesDeltaPct = yesterdaySales > 0 ? ((todaySales - yesterdaySales) / yesterdaySales) * 100 : null;

    const todayPurchases = toNum(purToday?.total);
    const yesterdayPurchases = toNum(purPrev?.total);
    const todayPurchasesDeltaPct =
      yesterdayPurchases > 0 ? ((todayPurchases - yesterdayPurchases) / yesterdayPurchases) * 100 : null;

    // Gross profit = period sales revenue − period purchase cost (can be negative; do NOT clamp to 0)
    // Always calculate when canSales is true; use 0 for purchases when canPurchases is false
    const grossProfit = canSales
      ? toNum(salesRange?.total) - (canPurchases ? toNum(purRange?.total) : 0)
      : null;

    // Total outstanding receivables and payables (balance sheet items — not date-filtered)
    const totalRecvRow = totalRecv.rows?.[0] || { amount: 0, invoices: 0 };
    const totalPayRow  = totalPay.rows?.[0]  || { amount: 0, invoices: 0 };

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
        ist_today: clientToday,
        client_today: clientToday,
        analytics_day: analyticsDay,
        timezone: timeZone,
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
        // Receivables = total outstanding balance_due across ALL confirmed sales invoices (balance sheet item)
        receivables: canSales ? { value: toNum(totalRecvRow.amount), invoices: toNum(totalRecvRow.invoices) } : null,
        today_cash_like: canSales
          ? {
              value: null,
              note: "Derived on client from payment mode split (optional)."
            }
          : null,
        today_purchases: canPurchases
          ? {
              value: todayPurchases,
              prev_value: yesterdayPurchases,
              delta_pct: todayPurchasesDeltaPct,
              invoices: toNum(purToday?.invoices)
            }
          : null,
        range_purchases: canPurchases ? { value: toNum(purRange?.total), invoices: toNum(purRange?.invoices) } : null,
        gross_profit: grossProfit != null ? { value: grossProfit } : null,
        // Payables = total outstanding balance_due across ALL confirmed purchase invoices (balance sheet item)
        payables: canPurchases ? { value: toNum(totalPayRow.amount), invoices: toNum(totalPayRow.invoices) } : null,
        bills_today: canSales ? { value: toNum(salesToday?.bills), confirmed: toNum(salesToday?.bills), drafts: 0, returns: null } : null,
        invoice_count: canSales ? { value: Number(salesRange?.bills || 0) } : null,
        avg_order_value:
          canSales && Number(salesRange?.bills || 0) > 0
            ? { value: toNum(salesRange?.total) / Number(salesRange.bills) }
            : null
      },
      widgets: {
        recent_sales: canSales ? salesRow.recent_sales || [] : [],
        recent_purchases: canPurchases ? recentPurchases.rows || [] : [],
        recent_returns: canReturns ? recentReturns.rows || [] : [],
        sales_trend_30d: canSales ? salesRow.sales_trend || [] : [],
        sales_week_7d: canSales ? salesWeek : [],
        purchase_trend_30d: canPurchases ? purchaseRow.pur_trend || [] : [],
        payment_modes: canSales ? (payModes.rows || []) : [],
        payment_modes_prev: canSales ? (payModesPrev.rows || []) : [],
        sales_by_dow: canSales ? (salesByDow.rows || []) : [],
        top_products: canSales ? (topProducts.rows || []) : [],
        top_customers: canSales && canCustomers ? (topCustomers.rows || []) : [],
        expiry_watch: canBatches ? (expiryWatch.rows || []) : [],
        low_stock: canBatches ? lowStock.rows || [] : [],
        stock_summary: canBatches ? stockSummaryRows : [],
        supplier_payables: canPurchases && canVendors ? (supplierPayables.rows || []) : [],
        overdue_receivables: canSales ? overdueRecv.rows?.[0] || { amount: 0, invoices: 0 } : { amount: 0, invoices: 0 },
        overdue_payables: canPurchases ? overduePay.rows?.[0] || { amount: 0, invoices: 0 } : { amount: 0, invoices: 0 },
        purchase_due_today: canPurchases ? purchaseDueToday.rows || [] : [],
        non_moving_count: canBatches ? Number(nonMovingCount.rows?.[0]?.c || 0) : 0,
        // ── NEW ANALYTICS WIDGETS ──────────────────────────────────────────
        pending_orders: (() => {
          const r = pendingOrders.rows?.[0] || {};
          return {
            incoming_count: Number(r.incoming_count || 0),
            incoming_value: toNum(r.incoming_value),
            my_count: Number(r.my_count || 0),
            my_value: toNum(r.my_value)
          };
        })(),
        mom_comparison: (() => {
          const r = momComparison.rows?.[0] || {};
          const currentPeriodSales = toNum(salesRange?.total);
          const lastMonthSales = toNum(r.last_month_sales);
          const lastMonthPurchases = toNum(r.last_month_purchases);
          const currentPeriodPurchases = canPurchases ? toNum(purRange?.total) : 0;
          const sameMonthLastYear = toNum(r.same_month_last_year);
          const momDeltaPct = lastMonthSales > 0 ? ((currentPeriodSales - lastMonthSales) / lastMonthSales) * 100 : null;
          const purchaseMomDeltaPct =
            lastMonthPurchases > 0
              ? ((currentPeriodPurchases - lastMonthPurchases) / lastMonthPurchases) * 100
              : null;
          const yoyDeltaPct = sameMonthLastYear > 0 ? ((currentPeriodSales - sameMonthLastYear) / sameMonthLastYear) * 100 : null;
          return canSales ? {
            current_period: currentPeriodSales,
            last_month: lastMonthSales,
            last_month_purchases: lastMonthPurchases,
            same_month_last_year: sameMonthLastYear,
            current_month_to_date: toNum(r.current_month_to_date),
            mom_delta_pct: momDeltaPct,
            purchase_mom_delta_pct: purchaseMomDeltaPct,
            yoy_delta_pct: yoyDeltaPct
          } : null;
        })(),
        overdue_aging: (() => {
          const r = overdueAging.rows?.[0] || {};
          return canSales ? {
            bucket_0_30:  { amount: toNum(r.bucket_0_30),  count: Number(r.count_0_30  || 0) },
            bucket_31_60: { amount: toNum(r.bucket_31_60), count: Number(r.count_31_60 || 0) },
            bucket_61_90: { amount: toNum(r.bucket_61_90), count: Number(r.count_61_90 || 0) },
            bucket_90_plus: { amount: toNum(r.bucket_90_plus), count: Number(r.count_90_plus || 0) }
          } : null;
        })(),
        top_manufacturers: canSales ? (topMfg.rows || []).map((r) => ({
          mfg_id: r.mfg_id,
          mfg_name: r.mfg_name,
          total: toNum(r.total)
        })) : [],
        invoice_pay_status: (() => {
          const r = invoicePayStatus.rows?.[0] || {};
          const totalBilled = toNum(r.total_billed);
          const totalCollected = toNum(r.total_collected);
          const collectionPct = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;
          return canSales ? {
            total_invoices: Number(r.total_invoices || 0),
            paid: Number(r.paid || 0),
            partial: Number(r.partial || 0),
            unpaid: Number(r.unpaid || 0),
            total_billed: totalBilled,
            total_collected: totalCollected,
            collection_pct: Math.round(collectionPct * 10) / 10
          } : null;
        })(),
        expiry_value_at_risk: (() => {
          const r = expiryValueAtRisk.rows?.[0] || {};
          return canBatches ? {
            value_30d: toNum(r.value_30d),
            value_60d: toNum(r.value_60d),
            value_90d: toNum(r.value_90d),
            batches_30d: Number(r.batches_30d || 0),
            batches_60d: Number(r.batches_60d || 0)
          } : null;
        })(),
        non_moving_value: (() => {
          const r = nonMovingValue.rows?.[0] || {};
          return canBatches ? {
            count: Number(r.count || 0),
            value: toNum(r.value)
          } : null;
        })(),
        stock_coverage: canBatches && canSales ? (stockCoverage.rows || []).map((r) => ({
          product_id: r.product_id,
          product_name: r.product_name,
          total_stock: toNum(r.total_stock),
          avg_daily_qty: toNum(r.avg_daily_qty),
          coverage_days: Number(r.coverage_days || 0)
        })) : [],
        alerts: (() => {
          const criticalExpiry = canBatches
            ? (expiryWatch.rows || []).filter((x) => {
                const exp = String(x.expiry_date || "").slice(0, 10);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return false;
                const ms = Date.parse(`${exp}T00:00:00Z`);
                const todayMs = Date.parse(`${clientToday}T00:00:00Z`);
                const days = Math.floor((ms - todayMs) / 86400000);
                return days >= 0 && days <= 7;
              })
            : [];
          return [
            ...criticalExpiry.slice(0, 4).map((x) => ({
              kind: "EXPIRY",
              severity: "red",
              title: `${x.product_name} · Batch ${x.batch_no}`,
              subtitle: `Expires ${String(x.expiry_date || "").slice(0, 10)} · Stock ${toNum(x.current_stock)}`,
              badge: "Exp Soon"
            })),
            ...(canBatches
              ? (lowStock.rows || []).slice(0, 3).map((x) => ({
                  kind: "LOW_STOCK",
                  severity: "amber",
                  title: `${x.product_name} · Low stock`,
                  subtitle: `Stock ${toNum(x.qty)} · Threshold ${toNum(x.threshold)}`,
                  badge: "Low Stock"
                }))
              : []),
            ...(canSales && toNum(overdueRecv.rows?.[0]?.amount) > 0
              ? [
                  {
                    kind: "RECEIVABLES",
                    severity: "blue",
                    title: `Overdue invoices · ${toNum(overdueRecv.rows?.[0]?.invoices)} customers`,
                    subtitle: `Outstanding ${toNum(overdueRecv.rows?.[0]?.amount).toFixed(2)}`,
                    badge: "Overdue"
                  }
                ]
              : []),
            ...(canPurchases && toNum(overduePay.rows?.[0]?.amount) > 0
              ? [
                  {
                    kind: "PAYABLES",
                    severity: "red",
                    title: `Overdue payables · ${toNum(overduePay.rows?.[0]?.invoices)} bills`,
                    subtitle: `Due ${toNum(overduePay.rows?.[0]?.amount).toFixed(2)}`,
                    badge: "Overdue"
                  }
                ]
              : []),
            ...(canPurchases
              ? (purchaseDueToday.rows || []).slice(0, 3).map((x) => ({
                  kind: "PAYABLES_DUE_TODAY",
                  severity: "amber",
                  title: `${x.vendor_name || "Supplier"} · ${x.invoice_number || "Purchase"}`,
                  subtitle: `Pay today · ${toNum(x.balance_due).toFixed(2)}`,
                  badge: "Due today"
                }))
              : [])
          ];
        })()
      },
      permissions: ctx.permissions || {}
    });
  } catch (e) {
    void actorId;
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
