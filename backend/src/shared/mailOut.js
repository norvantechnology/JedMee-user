/**
 * Outbound email via SMTP (env). If SMTP is not set, OTP flows still store hashes but sendMail dry-runs.
 *
 * Gmail example (use an App Password if 2FA is on):
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=587  SMTP_SECURE=0
 *   SMTP_USER=you@gmail.com  SMTP_PASS=app-password  SMTP_FROM="JedMee <you@gmail.com>"
 *
 * MEDICO_EMAIL_DRY_RUN=1 → do not open SMTP, log and return success (for local / tests).
 *
 * Anti-spam headers added:
 *   - Message-ID (unique per message, required by RFC 5322)
 *   - List-Unsubscribe (reduces spam score)
 *   - X-Mailer (identifies sender software)
 *   - Precedence: bulk (signals automated mail)
 *   - Auto-Submitted: auto-generated
 *   - Proper From format: "Brand Name <address@domain.com>"
 */
const crypto = require('crypto');

let transporter;

function isSmtpConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST || '').trim() &&
    String(process.env.SMTP_FROM || '').trim()
  );
}

function isDryRun() {
  const v = String(process.env.MEDICO_EMAIL_DRY_RUN || '').toLowerCase();
  return v === '1' || v === 'true';
}

function getTransporter() {
  if (transporter) return transporter;
  const host = String(process.env.SMTP_HOST || '').trim();
  if (!host) return null;
  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  const port   = Number.parseInt(String(process.env.SMTP_PORT || '587'), 10) || 587;
  const secure = String(process.env.SMTP_SECURE || '0') === '1' || port === 465;
  const user   = String(process.env.SMTP_USER || '').trim();
  const pass   = String(process.env.SMTP_PASS || '');
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user ? { auth: { user, pass } } : {}),
    // Improve deliverability: pool connections, set timeouts
    pool: true,
    maxConnections: 3,
    socketTimeout: 30000,
    greetingTimeout: 15000,
    connectionTimeout: 15000,
  });
  return transporter;
}

/**
 * Extract the domain from the SMTP_FROM address for Message-ID generation.
 * e.g. "JedMee <noreply@jedmee.com>" → "jedmee.com"
 */
function senderDomain() {
  const from = String(process.env.SMTP_FROM || '').trim();
  const match = from.match(/<([^>]+)>/) || from.match(/(\S+@\S+)/);
  if (match) {
    const addr = match[1];
    const parts = addr.split('@');
    return parts.length === 2 ? parts[1] : 'mail.jedmee.com';
  }
  return 'mail.jedmee.com';
}

/**
 * Generate a unique RFC 5322 Message-ID.
 */
function generateMessageId() {
  const rand = crypto.randomBytes(16).toString('hex');
  const ts   = Date.now().toString(36);
  return `<${ts}.${rand}@${senderDomain()}>`;
}

/**
 * Ensure From is in "Display Name <address>" format.
 * If SMTP_FROM is just an address, wrap it with the brand name.
 */
function buildFrom() {
  const raw   = String(process.env.SMTP_FROM || '').trim();
  const brand = String(process.env.APP_BRAND_NAME || 'JedMee').trim();
  // Already has display name
  if (raw.includes('<')) return raw;
  // Just an address - wrap it
  return `"${brand}" <${raw}>`;
}

/**
 * Build anti-spam / deliverability headers.
 * These headers significantly reduce the chance of landing in spam:
 *   1. Message-ID   - unique ID, required by RFC 5322; missing = spam signal
 *   2. List-Unsubscribe - tells Gmail/Outlook this is bulk mail (good thing)
 *   3. X-Mailer     - identifies the sending software
 *   4. Precedence   - "bulk" tells MTAs this is automated
 *   5. Auto-Submitted - RFC 3834 automated mail marker
 */
function buildAntiSpamHeaders(to) {
  const brand = String(process.env.APP_BRAND_NAME || 'JedMee').trim();
  const from  = buildFrom();
  // Extract reply-to address from From
  const replyMatch = from.match(/<([^>]+)>/);
  const replyAddr  = replyMatch ? replyMatch[1] : '';

  return {
    'Message-ID':       generateMessageId(),
    'X-Mailer':         `${brand} Mailer/1.0`,
    'Precedence':       'bulk',
    'Auto-Submitted':   'auto-generated',
    'X-Auto-Response-Suppress': 'OOF, AutoReply',
    ...(replyAddr ? { 'List-Unsubscribe': `<mailto:${replyAddr}?subject=unsubscribe>` } : {}),
  };
}

/**
 * Send outbound mail; optional `attachments` like nodemailer (filename, content Buffer, contentType).
 *
 * @param {{ to: string, subject: string, text?: string, html?: string, attachments?: Array }} p
 */
async function sendMail(p) {
  const to      = String(p.to      || '').trim();
  const subject = String(p.subject || '').trim();
  if (!to || !subject) return { ok: false, dryRun: false, error: 'Missing to or subject' };

  const attachMeta = Array.isArray(p.attachments)
    ? p.attachments.map((a) => ({
        filename: a.filename || 'attachment',
        bytes: Buffer.isBuffer(a.content)
          ? a.content.length
          : typeof a.content === 'string' ? a.content.length : 0,
      }))
    : [];

  if (isDryRun()) {
    // eslint-disable-next-line no-console
    console.log('[medico:mail] dry-run - would send:', { to, subject, htmlLen: (p.html || '').length, attachments: attachMeta });
    return { ok: true, dryRun: true };
  }

  if (!isSmtpConfigured()) {
    // eslint-disable-next-line no-console
    console.log('[medico:mail] SMTP not configured - skipping send:', { to, subject, htmlLen: (p.html || '').length, attachments: attachMeta });
    return { ok: true, dryRun: true };
  }

  const t = getTransporter();
  if (!t) return { ok: false, dryRun: false, error: 'SMTP not configured' };

  const from    = buildFrom();
  const headers = buildAntiSpamHeaders(to);

  try {
    await t.sendMail({
      from,
      to,
      subject,
      text:        p.text || undefined,
      html:        p.html || undefined,
      attachments: p.attachments && p.attachments.length ? p.attachments : undefined,
      headers,
      // Envelope from = same as From address (important for SPF alignment)
      envelope: {
        from: from.match(/<([^>]+)>/)?.[1] || from,
        to,
      },
    });
    return { ok: true, dryRun: false };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[medico:mail] send failed:', e?.message || e);
    return { ok: false, dryRun: false, error: String(e?.message || 'Send failed') };
  }
}

module.exports = { sendMail, isSmtpConfigured, isDryRun };
