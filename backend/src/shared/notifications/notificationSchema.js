const { query } = require("../db");
const { getNotificationMeta } = require("./notificationCatalog");
const { enrichNotificationsWithOrderStatus } = require("./notificationOrderUtils");

let _hasPriorityColumns = null;
let _hasPreferencesTable = null;

function isUndefinedColumn(err) {
  const msg = String(err?.message || err || "");
  return err?.code === "42703" || /column .* does not exist/i.test(msg);
}

function isUndefinedTable(err) {
  const msg = String(err?.message || err || "");
  return err?.code === "42P01" || /relation .* does not exist/i.test(msg);
}

async function hasPriorityColumns() {
  if (_hasPriorityColumns !== null) return _hasPriorityColumns;
  try {
    await query(`SELECT priority, category FROM user_notifications LIMIT 0`);
    _hasPriorityColumns = true;
  } catch (e) {
    _hasPriorityColumns = isUndefinedColumn(e) ? false : true;
  }
  return _hasPriorityColumns;
}

async function hasPreferencesTable() {
  if (_hasPreferencesTable !== null) return _hasPreferencesTable;
  try {
    await query(`SELECT 1 FROM user_notification_preferences LIMIT 0`);
    _hasPreferencesTable = true;
  } catch (e) {
    _hasPreferencesTable = isUndefinedTable(e) ? false : true;
  }
  return _hasPreferencesTable;
}

/**
 * Standard list SELECT columns + mapper for API responses.
 */
async function listNotificationRows({ userId, accountId, limit, offset, unreadOnly }) {
  const extended = await hasPriorityColumns();
  const rows = await query(
    `
    SELECT
      id,
      account_id,
      user_id,
      type,
      title,
      body,
      payload,
      action_label,
      action_path,
      dedupe_key,
      ${extended ? "priority, category," : ""}
      read_at,
      created_at,
      created_by_user_id
    FROM user_notifications
    WHERE user_id = $1 AND account_id = $2
      ${unreadOnly ? "AND read_at IS NULL" : ""}
    ORDER BY created_at DESC
    LIMIT $3 OFFSET $4
    `,
    [userId, accountId, limit, offset]
  );

  const mapped = (rows.rows || []).map((r) => {
    const meta = getNotificationMeta(r.type);
    return {
      id: r.id,
      account_id: r.account_id,
      user_id: r.user_id,
      type: r.type,
      title: r.title,
      body: r.body,
      payload: r.payload,
      action_label: r.action_label,
      action_path: r.action_path,
      dedupe_key: r.dedupe_key,
      priority: extended ? r.priority || meta.priority : meta.priority,
      category: extended ? r.category || meta.category : meta.category,
      read_at: r.read_at,
      created_at: r.created_at,
      created_by_user_id: r.created_by_user_id,
      supports_order_actions: false,
    };
  });
  return enrichNotificationsWithOrderStatus(mapped);
}

/**
 * Insert one notification row (transaction-safe when `q` is passed from withTransaction).
 */
async function insertNotificationRow(
  q,
  {
    accountId,
    userId,
    type,
    title,
    body,
    payload = {},
    actionPath = null,
    actionLabel = null,
    dedupeKey = null,
    createdByUserId = null,
  }
) {
  const run = q || query;
  const meta = getNotificationMeta(type);
  const extended = await hasPriorityColumns();
  const payloadJson = JSON.stringify(payload || {});

  if (extended) {
    await run(
      `
      INSERT INTO user_notifications (
        account_id, user_id, type, title, body, payload,
        action_label, action_path, dedupe_key, priority, category, created_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
      `,
      [
        accountId,
        userId,
        type,
        title,
        body,
        payloadJson,
        actionLabel,
        actionPath || meta.actionPath,
        dedupeKey,
        meta.priority,
        meta.category,
        createdByUserId,
      ]
    );
    return;
  }

  await run(
    `
    INSERT INTO user_notifications (
      account_id, user_id, type, title, body, payload,
      action_label, action_path, dedupe_key, created_by_user_id
    )
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
    `,
    [
      accountId,
      userId,
      type,
      title,
      body,
      payloadJson,
      actionLabel,
      actionPath || meta.actionPath,
      dedupeKey,
      createdByUserId,
    ]
  );
}

/**
 * Bulk insert for users returned by notifyUsersSubquery (first bind = account_id).
 */
async function insertNotificationsForNotifyUsers(
  accountId,
  notifyUsersSubquerySql,
  {
    type,
    title,
    body,
    payload = {},
    actionLabel = null,
    actionPath = null,
    dedupeKeyExpr = "NULL",
    skipDuplicate = false,
    createdByUserId = null,
  }
) {
  const meta = getNotificationMeta(type);
  const extended = await hasPriorityColumns();
  const payloadJson = JSON.stringify(payload || {});
  const label = actionLabel != null ? String(actionLabel) : null;
  const path = actionPath != null ? String(actionPath) : meta.actionPath;
  const dedupeClause = skipDuplicate
    ? `
    WHERE NOT EXISTS (
      SELECT 1
      FROM user_notifications un
      WHERE un.user_id = nu.id
        AND un.dedupe_key = (${dedupeKeyExpr})
    )`
    : "";

  if (extended) {
    const r = await query(
      `
      INSERT INTO user_notifications (
        account_id, user_id, type, title, body, payload,
        action_label, action_path, dedupe_key, priority, category, created_by_user_id
      )
      SELECT $1, nu.id, $2, $3, $4, $5::jsonb, $6, $7, ${dedupeKeyExpr}, $8, $9, $10
      FROM (${notifyUsersSubquerySql}) nu
      ${dedupeClause}
      RETURNING id
      `,
      [
        accountId,
        type,
        title,
        body,
        payloadJson,
        label,
        path,
        meta.priority,
        meta.category,
        createdByUserId,
      ]
    );
    return (r.rows || []).length;
  }

  const r = await query(
    `
    INSERT INTO user_notifications (
      account_id, user_id, type, title, body, payload,
      action_label, action_path, dedupe_key, created_by_user_id
    )
    SELECT $1, nu.id, $2, $3, $4, $5::jsonb, $6, $7, ${dedupeKeyExpr}, $8
    FROM (${notifyUsersSubquerySql}) nu
    ${dedupeClause}
    RETURNING id
    `,
    [accountId, type, title, body, payloadJson, label, path, createdByUserId]
  );
  return (r.rows || []).length;
}

module.exports = {
  hasPriorityColumns,
  hasPreferencesTable,
  listNotificationRows,
  insertNotificationRow,
  insertNotificationsForNotifyUsers,
  isUndefinedColumn,
  isUndefinedTable,
};
