const { query } = require("../db");
const { sendPushNotification } = require("../fcm");
const { getNotificationMeta, shouldSendPush } = require("./notificationCatalog");
const { notifyUsersSubquery } = require("../jobs/lowStockDailyDigest");
const {
  hasPriorityColumns,
  hasPreferencesTable,
  insertNotificationRow,
} = require("./notificationSchema");

/**
 * Users eligible for inventory-style alerts (owner + PRODUCT_BATCHES VIEW).
 */
async function getInventoryNotifyUserIds(accountId) {
  const r = await query(
    `SELECT id FROM (${notifyUsersSubquery()}) nu`,
    [accountId]
  );
  return (r.rows || []).map((row) => String(row.id));
}

/**
 * All approved users on an account.
 */
async function getAccountUserIds(accountId) {
  const r = await query(
    `SELECT id FROM app_users WHERE account_id = $1 AND status = 'APPROVED' AND is_blocked = false`,
    [accountId]
  );
  return (r.rows || []).map((row) => String(row.id));
}

async function getUserPrefs(userId) {
  if (!(await hasPreferencesTable())) return null;
  try {
    const r = await query(
      `SELECT push_enabled, email_digest_enabled, push_critical_only
       FROM user_notification_preferences WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    return r.rows?.[0] || null;
  } catch (_) {
    return null;
  }
}

/** Keep only users who should receive a push for this notification type. */
async function filterUserIdsForPush(userIds, type) {
  if (!userIds?.length) return [];
  const out = [];
  for (const userId of userIds) {
    const prefs = await getUserPrefs(userId);
    if (shouldSendPush(type, prefs)) out.push(userId);
  }
  return out;
}

/**
 * Insert or refresh a single in-app notification (dedupe when key provided).
 */
async function upsertInAppNotification({
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
}) {
  const meta = getNotificationMeta(type);
  const payloadJson = JSON.stringify(payload || {});
  const extended = await hasPriorityColumns();

  if (dedupeKey && extended) {
    await query(
      `
      INSERT INTO user_notifications (
        account_id, user_id, type, title, body, payload,
        action_label, action_path, dedupe_key, priority, category, created_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (account_id, user_id, dedupe_key)
      DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        payload = EXCLUDED.payload,
        action_label = EXCLUDED.action_label,
        action_path = EXCLUDED.action_path,
        priority = EXCLUDED.priority,
        category = EXCLUDED.category
      WHERE user_notifications.read_at IS NULL
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

  if (dedupeKey && !extended) {
    await query(
      `
      INSERT INTO user_notifications (
        account_id, user_id, type, title, body, payload,
        action_label, action_path, dedupe_key, created_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
      ON CONFLICT (account_id, user_id, dedupe_key) DO NOTHING
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
    return;
  }

  await insertNotificationRow(null, {
    accountId,
    userId,
    type,
    title,
    body,
    payload,
    actionPath,
    actionLabel,
    dedupeKey,
    createdByUserId,
  });
}

/**
 * Dispatch notification to one user + optional push.
 */
async function dispatchToUser({
  accountId,
  userId,
  type,
  title,
  body,
  payload,
  actionPath,
  actionLabel,
  dedupeKey,
  extraData = {},
  dataOnly,
  skipPush = false,
}) {
  const meta = getNotificationMeta(type);
  await upsertInAppNotification({
    accountId,
    userId,
    type,
    title,
    body,
    payload,
    actionPath: actionPath || meta.actionPath,
    actionLabel,
    dedupeKey,
  });

  if (skipPush) return;

  const prefs = await getUserPrefs(userId);
  if (!shouldSendPush(type, prefs)) return;

  const pushUserIds = [userId];
  sendPushNotification({
    userIds: pushUserIds,
    title,
    body,
    type,
    actionPath: actionPath || meta.actionPath || "",
    data: { priority: meta.priority, category: meta.category, ...extraData },
    dataOnly: dataOnly ?? meta.dataOnly ?? false,
  }).catch((err) => console.error(`[notify] push failed (${type}):`, err));
}

/**
 * Fan-out to inventory-eligible users (or all account users when forAllUsers).
 */
async function dispatchToAccount({
  accountId,
  type,
  title,
  body,
  payload,
  actionPath,
  actionLabel,
  dedupeKey,
  extraData = {},
  dataOnly,
  inventoryAudience = true,
  skipPush = false,
}) {
  const userIds = inventoryAudience
    ? await getInventoryNotifyUserIds(accountId)
    : await getAccountUserIds(accountId);

  for (const userId of userIds) {
    const key = dedupeKey ? `${dedupeKey}` : null;
    await upsertInAppNotification({
      accountId,
      userId,
      type,
      title,
      body,
      payload,
      actionPath,
      actionLabel,
      dedupeKey: key,
    });
  }

  if (skipPush) return { userIds, pushed: false };

  const meta = getNotificationMeta(type);
  const pushTypes = new Set(["NEW_ORDER", "LOW_STOCK_DAILY", "ADMIN_BROADCAST", "INVENTORY_ALERT_DIGEST"]);
  const anyPush =
    meta.push &&
    (meta.priority === "P1" ||
      meta.priority === "P2" ||
      pushTypes.has(String(type || "").toUpperCase()));
  if (!anyPush) return { userIds, pushed: false };

  const pushUserIds = await filterUserIdsForPush(userIds, type);
  if (!pushUserIds.length) return { userIds, pushed: false };

  sendPushNotification({
    userIds: pushUserIds,
    title,
    body,
    type,
    actionPath: actionPath || meta.actionPath || "",
    data: { priority: meta.priority, category: meta.category, ...extraData },
    dataOnly: dataOnly ?? meta.dataOnly ?? false,
  }).catch((err) => console.error(`[notify] account push failed (${type}):`, err));

  return { userIds, pushed: true };
}

module.exports = {
  dispatchToUser,
  dispatchToAccount,
  upsertInAppNotification,
  getInventoryNotifyUserIds,
  getAccountUserIds,
  filterUserIdsForPush,
  getUserPrefs,
};
