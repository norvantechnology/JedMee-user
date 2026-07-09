const { query } = require("../db");
const { dispatchToAccount } = require("../notifications/notificationDispatcher");

function fmtDate(d) {
  if (!d) return "";
  const s = String(d).slice(0, 10);
  return s;
}

function fmtInr(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "₹0";
  return `₹${x.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * Sync critical inventory + payment alerts into user_notifications (deduped).
 * Runs on schedule (daily digest Lambda) and can be triggered after stock changes.
 */
async function runInventoryCriticalAlertsForAccount(accountId) {
  let created = 0;

  // ── Expired batches (P1) ───────────────────────────────────────────────────
  const expiredR = await query(
    `
    SELECT pb.id AS batch_id, pb.batch_no, pb.expiry_date, pb.current_stock,
           p.name AS product_name, p.code AS product_code
    FROM product_batches pb
    JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
    WHERE pb.account_id = $1
      AND pb.deleted_at IS NULL
      AND pb.current_stock > 0
      AND pb.expiry_date IS NOT NULL
      AND pb.expiry_date < CURRENT_DATE
    ORDER BY pb.expiry_date ASC
    LIMIT 30
    `,
    [accountId]
  );

  for (const row of expiredR.rows || []) {
    const name = row.product_name || row.product_code || "Product";
    const batch = row.batch_no || row.batch_id;
    await dispatchToAccount({
      accountId,
      type: "EXPIRED_BATCH",
      title: "Expired batch in stock",
      body: `${name} · Batch ${batch} expired on ${fmtDate(row.expiry_date)}. Remove from sale.`,
      payload: {
        batch_id: row.batch_id,
        product_name: name,
        batch_no: batch,
        expiry_date: row.expiry_date,
        stock: row.current_stock,
      },
      dedupeKey: `expired_batch:${row.batch_id}`,
      skipPush: true,
    });
    created += 1;
  }

  // ── Expiring within 7 days (P2) ────────────────────────────────────────────
  const soonR = await query(
    `
    SELECT pb.id AS batch_id, pb.batch_no, pb.expiry_date, pb.current_stock,
           p.name AS product_name,
           (pb.expiry_date - CURRENT_DATE) AS days_left
    FROM product_batches pb
    JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
    WHERE pb.account_id = $1
      AND pb.deleted_at IS NULL
      AND pb.current_stock > 0
      AND pb.expiry_date IS NOT NULL
      AND pb.expiry_date >= CURRENT_DATE
      AND pb.expiry_date <= CURRENT_DATE + INTERVAL '7 days'
    ORDER BY pb.expiry_date ASC
    LIMIT 40
    `,
    [accountId]
  );

  for (const row of soonR.rows || []) {
    const name = row.product_name || "Product";
    const days = Number(row.days_left ?? 0);
    await dispatchToAccount({
      accountId,
      type: "BATCH_EXPIRING_SOON",
      title: "Expiring soon",
      body: `${name} · Batch ${row.batch_no || row.batch_id} expires in ${days} day(s).`,
      payload: {
        batch_id: row.batch_id,
        product_name: name,
        days_left: days,
        expiry_date: row.expiry_date,
      },
      dedupeKey: `expiry_soon_7d:${row.batch_id}`,
      skipPush: true,
    });
    created += 1;
  }

  // Push one summary if any P1/P2 inventory alerts this run
  if ((expiredR.rows?.length || 0) + (soonR.rows?.length || 0) > 0) {
    const expN = expiredR.rows?.length || 0;
    const soonN = soonR.rows?.length || 0;
    await dispatchToAccount({
      accountId,
      type: "INVENTORY_ALERT_DIGEST",
      title: "Inventory alerts",
      body:
        expN && soonN
          ? `${expN} expired batch(es) and ${soonN} expiring within 7 days.`
          : expN
            ? `${expN} expired batch(es) need attention.`
            : `${soonN} batch(es) expiring within 7 days.`,
      payload: { expired: expN, expiring_soon: soonN },
      dedupeKey: `inventory_digest:${new Date().toISOString().slice(0, 10)}`,
      skipPush: false,
    });
  }

  // ── Out of stock products (P1) ─────────────────────────────────────────────
  const zeroR = await query(
    `
    SELECT p.id AS product_id, p.name AS product_name, p.code AS product_code
    FROM products p
    LEFT JOIN product_batches pb ON pb.product_id = p.id AND pb.account_id = p.account_id AND pb.deleted_at IS NULL
    LEFT JOIN (
      SELECT batch_id, SUM(COALESCE(qty,0)+COALESCE(free_qty,0))::numeric AS q
      FROM inventory_txns WHERE account_id = $1 GROUP BY batch_id
    ) st ON st.batch_id = pb.id
    WHERE p.account_id = $1 AND p.deleted_at IS NULL
    GROUP BY p.id, p.name, p.code
    HAVING COALESCE(SUM(st.q), 0) <= 0
    LIMIT 25
    `,
    [accountId]
  );

  for (const row of zeroR.rows || []) {
    const name = row.product_name || row.product_code || "Product";
    await dispatchToAccount({
      accountId,
      type: "STOCK_ZERO",
      title: "Out of stock",
      body: `${name} has zero stock. Reorder or adjust batches.`,
      payload: { product_id: row.product_id, product_name: name },
      dedupeKey: `stock_zero:${row.product_id}`,
      skipPush: true,
    });
    created += 1;
  }

  // ── Overdue payables (P2) - purchase invoices ──────────────────────────────
  const payR = await query(
    `
    SELECT pi.id, pi.invoice_number, pi.due_date, pi.balance_due,
           COALESCE(v.name, v.short_name, 'Supplier') AS party_name
    FROM purchase_invoices pi
    LEFT JOIN vendors v ON v.id = pi.vendor_id
    WHERE pi.account_id = $1
      AND pi.deleted_at IS NULL
      AND pi.status NOT IN ('CANCELLED', 'DRAFT')
      AND COALESCE(pi.balance_due, 0) > 0
      AND pi.due_date IS NOT NULL
      AND pi.due_date < CURRENT_DATE
    ORDER BY pi.due_date ASC
    LIMIT 25
    `,
    [accountId]
  );

  for (const row of payR.rows || []) {
    const days = Math.floor(
      (Date.now() - new Date(fmtDate(row.due_date)).getTime()) / 86400000
    );
    await dispatchToAccount({
      accountId,
      type: "PAYABLE_OVERDUE",
      title: "Supplier payment overdue",
      body: `${row.party_name} · ${fmtInr(row.balance_due)} overdue by ${days} day(s).`,
      payload: {
        invoice_id: row.id,
        invoice_number: row.invoice_number,
        balance_due: row.balance_due,
        due_date: row.due_date,
      },
      actionPath: "/purchase-invoices",
      dedupeKey: `payable_overdue:${row.id}`,
      skipPush: true,
    });
    created += 1;
  }

  if ((payR.rows?.length || 0) > 0) {
    await dispatchToAccount({
      accountId,
      type: "PAYABLE_OVERDUE",
      title: "Payables overdue",
      body: `${payR.rows.length} supplier invoice(s) past due.`,
      payload: { count: payR.rows.length },
      dedupeKey: `payable_overdue_summary:${new Date().toISOString().slice(0, 10)}`,
      skipPush: false,
    });
  }

  // ── Overdue receivables (P2) - sales invoices ──────────────────────────────
  const recvR = await query(
    `
    SELECT si.id, si.invoice_number, si.due_date, si.balance_due,
           COALESCE(c.name, c.full_name, 'Customer') AS party_name
    FROM sales_invoices si
    LEFT JOIN customers c ON c.id = si.customer_id
    WHERE si.account_id = $1
      AND si.deleted_at IS NULL
      AND si.status NOT IN ('CANCELLED', 'DRAFT')
      AND COALESCE(si.balance_due, 0) > 0
      AND si.due_date IS NOT NULL
      AND si.due_date < CURRENT_DATE
    ORDER BY si.due_date ASC
    LIMIT 25
    `,
    [accountId]
  );

  for (const row of recvR.rows || []) {
    const days = Math.floor(
      (Date.now() - new Date(fmtDate(row.due_date)).getTime()) / 86400000
    );
    await dispatchToAccount({
      accountId,
      type: "RECEIVABLE_OVERDUE",
      title: "Customer payment overdue",
      body: `${row.party_name} · ${fmtInr(row.balance_due)} overdue by ${days} day(s).`,
      payload: {
        invoice_id: row.id,
        invoice_number: row.invoice_number,
        balance_due: row.balance_due,
      },
      actionPath: "/sales-billing",
      dedupeKey: `receivable_overdue:${row.id}`,
      skipPush: true,
    });
    created += 1;
  }

  if ((recvR.rows?.length || 0) > 0) {
    await dispatchToAccount({
      accountId,
      type: "RECEIVABLE_OVERDUE",
      title: "Receivables overdue",
      body: `${recvR.rows.length} customer invoice(s) past due.`,
      payload: { count: recvR.rows.length },
      dedupeKey: `receivable_overdue_summary:${new Date().toISOString().slice(0, 10)}`,
      skipPush: false,
    });
  }

  return { accountId, alerts: created };
}

async function runInventoryCriticalAlertsAllAccounts() {
  const accountsR = await query(
    `SELECT DISTINCT account_id AS id FROM app_users WHERE status = 'APPROVED' AND is_blocked = false`
  );
  const summary = { accounts: 0, alerts: 0, errors: 0 };
  for (const row of accountsR.rows || []) {
    const accountId = String(row.id);
    try {
      const r = await runInventoryCriticalAlertsForAccount(accountId);
      summary.accounts += 1;
      summary.alerts += r.alerts;
    } catch (e) {
      summary.errors += 1;
      console.error("[inventoryCriticalAlerts] account", accountId, e);
    }
  }
  return summary;
}

module.exports = {
  runInventoryCriticalAlertsForAccount,
  runInventoryCriticalAlertsAllAccounts,
};
