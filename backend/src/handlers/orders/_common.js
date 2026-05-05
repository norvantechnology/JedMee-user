const { query } = require("../../shared/db");

function clean(v) {
  return String(v ?? "").trim();
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

async function getAccountContextForUser(userId) {
  const r = await query(
    `
    SELECT
      u.id,
      u.account_id,
      u.firm_name,
      u.full_name,
      u.phone_country_code,
      u.phone_number,
      u.email,
      u.address,
      u.city,
      u.state,
      u.pin_code,
      u.gst_number,
      u.drug_license_1_number,
      ur.code AS role_code
    FROM app_users u
    JOIN app_users au ON au.id = u.account_id
    JOIN roles ur ON ur.id = au.role_id
    WHERE u.id = $1
    LIMIT 1
    `,
    [userId]
  );
  return r.rows?.[0] || null;
}

async function getAccountProfile(accountId) {
  const r = await query(
    `
    SELECT
      u.id,
      u.firm_name,
      u.full_name,
      ur.code AS role_code
    FROM app_users u
    JOIN roles ur ON ur.id = u.role_id
    WHERE u.id = $1
    LIMIT 1
    `,
    [accountId]
  );
  return r.rows?.[0] || null;
}

function localFinancialYearString(d = new Date()) {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const fyStart = month >= 4 ? year : year - 1;
  return `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
}

async function nextOrderNumber(q, wholesalerAccountId) {
  const fy = localFinancialYearString();
  await q(
    `
    INSERT INTO invoice_counters (account_id, financial_year)
    VALUES ($1, $2)
    ON CONFLICT (account_id) DO NOTHING
    `,
    [wholesalerAccountId, fy]
  );
  const lock = await q(
    `
    SELECT financial_year, order_counter
    FROM invoice_counters
    WHERE account_id = $1
    FOR UPDATE
    `,
    [wholesalerAccountId]
  );
  const row = lock.rows?.[0] || { financial_year: fy, order_counter: 0 };
  const activeFy = String(row.financial_year || fy) === fy ? fy : fy;
  const next = Number(row.order_counter || 0) + 1;
  await q(
    `
    UPDATE invoice_counters
    SET financial_year = $2,
        order_counter = $3,
        updated_at = now()
    WHERE account_id = $1
    `,
    [wholesalerAccountId, activeFy, next]
  );
  return `ORD-${activeFy}-${String(next).padStart(4, "0")}`;
}

async function createInAppNotification(q, accountId, userId, type, title, body, payload = null) {
  await q(
    `
    INSERT INTO user_notifications (
      account_id, user_id, type, title, body, payload, created_by_user_id
    )
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$2)
    `,
    [accountId, userId, type, title, body, JSON.stringify(payload || {})]
  );
}

const TERMINAL_STATUSES = new Set(["REJECTED", "CANCELLED", "DELIVERED"]);

module.exports = {
  clean,
  n,
  round2,
  getAccountContextForUser,
  getAccountProfile,
  nextOrderNumber,
  createInAppNotification,
  TERMINAL_STATUSES
};

