/**
 * Firebase Cloud Messaging (FCM) service.
 *
 * Initialises Firebase Admin SDK once per Lambda cold start.
 * Provides a reusable sendPushNotification() that:
 *   - Looks up all FCM tokens for the given user IDs
 *   - Sends a multicast push notification
 *   - Automatically removes invalid / expired tokens from the DB
 *
 * Environment variables required:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY   (the full PEM key, newlines as \n)
 */

const { query } = require("./db");

let _app = null;
let _messaging = null;

function getMessaging() {
  if (_messaging) return _messaging;

  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey  = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.warn("[fcm] Firebase env vars not set — push notifications disabled.");
    return null;
  }

  try {
    // Lazy-require so the module is only loaded when Firebase is configured.
    const admin = require("firebase-admin");

    if (!_app) {
      _app = admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
    }

    _messaging = admin.messaging(_app);
    return _messaging;
  } catch (err) {
    console.error("[fcm] Failed to initialise Firebase Admin SDK:", err);
    return null;
  }
}

/**
 * Fetch all FCM tokens for the given user IDs.
 * Returns an array of { token, userId } objects.
 */
async function getTokensForUsers(userIds) {
  if (!userIds || !userIds.length) return [];
  const r = await query(
    `SELECT token, user_id FROM fcm_tokens WHERE user_id = ANY($1::uuid[])`,
    [userIds]
  );
  return (r.rows || []).map((row) => ({ token: row.token, userId: String(row.user_id) }));
}

/**
 * Remove a list of invalid FCM tokens from the database.
 */
async function removeInvalidTokens(tokens) {
  if (!tokens || !tokens.length) return;
  try {
    await query(`DELETE FROM fcm_tokens WHERE token = ANY($1::text[])`, [tokens]);
    console.log(`[fcm] Removed ${tokens.length} invalid token(s).`);
  } catch (err) {
    console.error("[fcm] Failed to remove invalid tokens:", err);
  }
}

/**
 * Send a push notification to one or more users.
 *
 * @param {object} opts
 * @param {string[]}  opts.userIds     - Array of user UUIDs to notify.
 * @param {string}    opts.title       - Short notification title.
 * @param {string}    opts.body        - Notification body text.
 * @param {object}    [opts.data]      - Optional key-value data payload (string values only).
 * @param {string}    [opts.type]      - Notification type constant (e.g. "LOW_STOCK_PRODUCT").
 * @param {string}    [opts.actionPath]- Deep-link path for tap navigation.
 * @param {boolean}   [opts.dataOnly]  - When true, sends a data-only message (no FCM notification
 *                                       field). Required for Android action buttons in background.
 *                                       title/body are included in the data payload instead.
 */
async function sendPushNotification({ userIds, title, body, data = {}, type = "", actionPath = "", dataOnly = false }) {
  const messaging = getMessaging();
  if (!messaging) return; // Firebase not configured — skip silently.

  let tokenRows;
  try {
    tokenRows = await getTokensForUsers(userIds);
  } catch (err) {
    console.error("[fcm] Failed to fetch FCM tokens:", err);
    return;
  }

  if (!tokenRows.length) return; // No registered devices.

  const tokens = tokenRows.map((r) => r.token);

  // Build the data payload — all values must be strings for FCM.
  const dataPayload = {
    type: String(type || ""),
    actionPath: String(actionPath || ""),
    // For data-only messages, include title/body so the mobile app can display them.
    ...(dataOnly ? { title: String(title || ""), body: String(body || "") } : {}),
    ...Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
    ),
  };

  // FCM sendEachForMulticast supports up to 500 tokens per call.
  const BATCH = 500;
  const invalidTokens = [];

  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    try {
      // Data-only messages omit the `notification` field so FCM does NOT
      // auto-display a notification. The mobile background handler shows a
      // local notification with action buttons instead.
      const message = dataOnly
        ? {
            tokens: batch,
            data: dataPayload,
            android: {
              priority: "high",
              // data-only: no notification block — prevents FCM auto-display
            },
            apns: {
              headers: { "apns-priority": "10" },
              payload: { aps: { "content-available": 1 } },
            },
          }
        : {
            tokens: batch,
            notification: { title, body },
            data: dataPayload,
            android: {
              priority: "high",
              notification: {
                channelId: "jedmee_default",
                sound: "default",
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: "default",
                  badge: 1,
                },
              },
            },
          };

      const response = await messaging.sendEachForMulticast(message);

      // Collect tokens that FCM says are invalid / unregistered.
      response.responses.forEach((res, idx) => {
        if (!res.success) {
          const code = res.error?.code || "";
          if (
            code === "messaging/invalid-registration-token" ||
            code === "messaging/registration-token-not-registered"
          ) {
            invalidTokens.push(batch[idx]);
          } else {
            console.warn(`[fcm] Token send failed (${code}):`, res.error?.message);
          }
        }
      });

      console.log(
        `[fcm] Sent batch ${Math.floor(i / BATCH) + 1}: ` +
        `${response.successCount} ok, ${response.failureCount} failed.`
      );
    } catch (err) {
      console.error("[fcm] sendEachForMulticast error:", err);
    }
  }

  if (invalidTokens.length) {
    await removeInvalidTokens(invalidTokens);
  }
}

/**
 * Send a push notification to ALL approved, non-blocked users of an account.
 *
 * @param {string} accountId
 * @param {object} opts  - Same as sendPushNotification opts (without userIds).
 */
async function sendPushToAccount(accountId, opts) {
  try {
    const r = await query(
      `SELECT id FROM app_users WHERE account_id = $1 AND status = 'APPROVED' AND is_blocked = false`,
      [accountId]
    );
    const userIds = (r.rows || []).map((row) => String(row.id));
    if (!userIds.length) return;
    await sendPushNotification({ ...opts, userIds });
  } catch (err) {
    console.error("[fcm] sendPushToAccount error:", err);
  }
}

module.exports = { sendPushNotification, sendPushToAccount, getTokensForUsers };