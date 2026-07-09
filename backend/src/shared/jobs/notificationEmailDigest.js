const { query } = require("../db");
const { sendMail } = require("../mailOut");
const { getNotificationMeta } = require("../notifications/notificationCatalog");

/**
 * Daily email digest: unread P2+ notifications from the last 24h for users who opted in.
 */
async function runNotificationEmailDigest() {
  if (!String(process.env.SMTP_HOST || "").trim()) {
    return { skipped: true, reason: "smtp_not_configured" };
  }

  const usersR = await query(
    `
    SELECT u.id AS user_id, u.email, u.full_name, u.account_id,
           COALESCE(p.email_digest_enabled, true) AS email_digest_enabled
    FROM app_users u
    LEFT JOIN user_notification_preferences p ON p.user_id = u.id
    WHERE u.status = 'APPROVED'
      AND u.is_blocked = false
      AND u.email IS NOT NULL
      AND TRIM(u.email) <> ''
    `
  );

  let sent = 0;
  let skipped = 0;

  for (const row of usersR.rows || []) {
    if (row.email_digest_enabled === false) {
      skipped += 1;
      continue;
    }

    const notifR = await query(
      `
      SELECT type, title, body, priority, category, created_at
      FROM user_notifications
      WHERE user_id = $1
        AND account_id = $2
        AND created_at >= now() - interval '24 hours'
        AND priority IN ('P1', 'P2', 'P3')
      ORDER BY
        CASE priority WHEN 'P1' THEN 0 WHEN 'P2' THEN 1 WHEN 'P3' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT 20
      `,
      [row.user_id, row.account_id]
    );

    const items = notifR.rows || [];
    if (!items.length) {
      skipped += 1;
      continue;
    }

    const lines = items
      .map((n) => {
        const meta = getNotificationMeta(n.type);
        return `• [${n.priority || meta.priority}] ${n.title}${n.body ? ` - ${n.body}` : ""}`;
      })
      .join("\n");

    const name = row.full_name || "there";
    const subject = `JedMee daily alert summary (${items.length} item${items.length === 1 ? "" : "s"})`;
    const text =
      `Hi ${name},\n\n` +
      `Here is your daily pharmacy alert summary:\n\n${lines}\n\n` +
      `Open the JedMee app for full details.\n\n- JedMee`;

    try {
      await sendMail({
        to: row.email,
        subject,
        text,
        html: `<p>Hi ${name},</p><p>Your daily alert summary:</p><pre style="font-family:sans-serif;white-space:pre-wrap">${lines.replace(/</g, "&lt;")}</pre><p>Open the JedMee app for details.</p>`,
      });
      sent += 1;
    } catch (e) {
      console.error("[notificationEmailDigest] send failed", row.email, e);
    }
  }

  return { sent, skipped, users: usersR.rows?.length || 0 };
}

module.exports = { runNotificationEmailDigest };
