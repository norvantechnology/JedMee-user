const { query } = require("../../shared/db");
const { sendPushToAccount } = require("../../shared/fcm");

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

/**
 * Insert an in-app notification row and fire a push notification.
 *
 * @param {object} q              - Transaction query function.
 * @param {string} accountId      - Target account ID.
 * @param {string} userId         - Target user ID.
 * @param {string} type           - Notification type constant.
 * @param {string} title          - Short title.
 * @param {string} body           - Body text.
 * @param {object} [payload]      - JSON payload stored in DB.
 * @param {string} [actionPath]   - Deep-link path for tap navigation.
 * @param {string} [actionLabel]  - CTA label.
 * @param {object} [extraData]    - Extra key-value pairs added to the FCM data payload
 *                                  (e.g. { orderId, orderNumber }). All values are stringified.
 * @param {boolean} [dataOnly]    - When true, sends a data-only FCM message so the mobile
 *                                  background handler can show a local notification with
 *                                  action buttons (required for Android action buttons).
 */
async function createInAppNotification(
  q, accountId, userId, type, title, body,
  payload = null, actionPath = null, actionLabel = null,
  extraData = {}, dataOnly = false
) {
  await q(
    `
    INSERT INTO user_notifications (
      account_id, user_id, type, title, body, payload, action_path, action_label, created_by_user_id
    )
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$2)
    `,
    [accountId, userId, type, title, body, JSON.stringify(payload || {}), actionPath || null, actionLabel || null]
  );
  // Fire push notification to all active users of the account (fire-and-forget —
  // push failure must never roll back the DB transaction).
  sendPushToAccount(accountId, {
    title,
    body,
    type,
    actionPath: actionPath || "",
    data: extraData,
    dataOnly,
  }).catch((err) =>
    console.error(`[orders:createInAppNotification] Push failed (${type}):`, err)
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

