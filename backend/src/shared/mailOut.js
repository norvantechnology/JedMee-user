/**
 * Outbound email via SMTP (env). If SMTP is not set, OTP flows still store hashes but sendMail dry-runs.
 *
 * Gmail example (use an App Password if 2FA is on):
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_SECURE=0
 *   SMTP_USER=you@gmail.com  SMTP_PASS=app-password  SMTP_FROM="JedMee <you@gmail.com>"
 *
 * MEDICO_EMAIL_DRY_RUN=1 → do not open SMTP, log and return success (for local / tests).
 */
let transporter;
function isSmtpConfigured() {
  return Boolean(String(process.env.SMTP_HOST || "").trim() && String(process.env.SMTP_FROM || "").trim());
}
function isDryRun() {
  return String(process.env.MEDICO_EMAIL_DRY_RUN || "").toLowerCase() === "1" || String(process.env.MEDICO_EMAIL_DRY_RUN || "").toLowerCase() === "true";
}

function getTransporter() {
  if (transporter) return transporter;
  const host = String(process.env.SMTP_HOST || "").trim();
  if (!host) return null;
  // eslint-disable-next-line global-require
  const nodemailer = require("nodemailer");
  const port = Number.parseInt(String(process.env.SMTP_PORT || "587"), 10) || 587;
  const secure = String(process.env.SMTP_SECURE || "0") === "1" || port === 465;
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "");
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user
      ? {
          auth: { user, pass }
        }
      : {})
  });
  return transporter;
}

/** Send outbound mail; optional `attachments` like nodemailer (filename, content Buffer, contentType). */
async function sendMail(p) {
  const to = String(p.to || "").trim();
  const subject = String(p.subject || "").trim();
  if (!to || !subject) return { ok: false, dryRun: false, error: "Missing to or subject" };

  const attachMeta = Array.isArray(p.attachments)
    ? p.attachments.map((a) => ({
        filename: a.filename || "attachment",
        bytes: Buffer.isBuffer(a.content) ? a.content.length : typeof a.content === "string" ? a.content.length : 0
      }))
    : [];

  if (isDryRun()) {
    // eslint-disable-next-line no-console
    console.log("[medico:mail] dry run  would send:", { to, subject, htmlLen: (p.html || "").length, attachments: attachMeta });
    return { ok: true, dryRun: true };
  }
  if (!isSmtpConfigured()) {
    // eslint-disable-next-line no-console
    console.log("[medico:mail] SMTP not set  would send (no message delivered):", {
      to,
      subject,
      htmlLen: (p.html || "").length,
      attachments: attachMeta
    });
    return { ok: true, dryRun: true };
  }

  const t = getTransporter();
  if (!t) return { ok: false, dryRun: false, error: "SMTP not configured" };
  const from = String(process.env.SMTP_FROM || "").trim();
  try {
    await t.sendMail({
      from,
      to,
      subject,
      text: p.text || undefined,
      html: p.html || undefined,
      attachments: p.attachments && p.attachments.length ? p.attachments : undefined
    });
    return { ok: true, dryRun: false };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[medico:mail] send failed", e?.message || e);
    return { ok: false, dryRun: false, error: String(e?.message || "Send failed") };
  }
}

module.exports = { sendMail, isSmtpConfigured, isDryRun };
