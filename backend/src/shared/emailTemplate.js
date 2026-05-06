/**
 * Premium branded email template system for JedMee.
 * Table-based layout for maximum email-client compatibility (Gmail, Outlook, Apple Mail, mobile).
 * Inline styles + <style> block for media queries.
 */

// ─── Brand Palette ────────────────────────────────────────────────────────────
const C = {
  primary:     '#5B21B6',
  primaryDark: '#4C1D95',
  accent:      '#7C3AED',
  accentLight: '#EDE9FE',
  border:      '#DDD6FE',
  textDark:    '#1E1B4B',
  textMid:     '#4B5563',
  textMuted:   '#9CA3AF',
  success:     '#059669',
  danger:      '#DC2626',
  neutral:     '#6B7280',
  white:       '#FFFFFF',
  bgPage:      '#F5F3FF',
  bgCard:      '#FFFFFF',
  bgAlt:       '#FAF9FF',
};

// ─── HTML escape ──────────────────────────────────────────────────────────────
function E(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Invisible spacers to pad preheader so inbox preview doesn't bleed body text
function preheaderSpacer() {
  return Array(160).fill('&#847;&nbsp;').join('');
}

// ─── Base wrapper ─────────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.preheader   Short preview text shown in inbox list
 * @param {string} opts.headerLabel Small uppercase label above the title
 * @param {string} opts.headerTitle Main heading in the coloured header band
 * @param {string} [opts.headerSub] Optional subtitle line in the header
 * @param {string} opts.body        Inner HTML for the white card body
 * @param {string} [opts.brandName] Sender / brand name shown in footer
 * @returns {string} Full HTML email string
 */
function emailBase({ preheader = '', headerLabel = '', headerTitle = '', headerSub = '', body = '', brandName = 'JedMee' }) {
  const safePreheader = E(preheader);
  const safeBrand     = E(brandName);
  const safeLabel     = E(headerLabel);
  const safeTitle     = E(headerTitle);
  const safeSub       = headerSub ? E(headerSub) : '';

  const headerSubHtml = safeSub
    ? `<p style="margin:6px 0 0;color:rgba(255,255,255,0.72);font-size:13px;line-height:1.4;">${safeSub}</p>`
    : '';

  const labelHtml = safeLabel
    ? `<p style="margin:0 0 6px;color:rgba(255,255,255,0.65);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;">${safeLabel}</p>`
    : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="en" xmlns="http://www.w3.org/1999/xhtml">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width,initial-scale=1">',
    '  <meta http-equiv="X-UA-Compatible" content="IE=edge">',
    '  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">',
    `  <title>${safeTitle || safeBrand}</title>`,
    '  <style>',
    `    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}`,
    `    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}`,
    `    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}`,
    `    body{margin:0!important;padding:0!important;background-color:${C.bgPage}}`,
    `    a{color:${C.accent};text-decoration:none}`,
    `    a:hover{text-decoration:underline}`,
    `    @media only screen and (max-width:620px){`,
    `      .em-wrap{padding:16px 8px!important}`,
    `      .em-card{border-radius:12px!important}`,
    `      .em-header{padding:28px 20px!important}`,
    `      .em-body{padding:24px 16px!important}`,
    `      .em-footer{padding:16px!important}`,
    `      .em-otp{font-size:36px!important;letter-spacing:0.15em!important}`,
    `      .em-amount{font-size:26px!important}`,
    `      .em-hide{display:none!important}`,
    `      h1.em-title{font-size:20px!important}`,
    `      .em-tbl td,.em-tbl th{padding:8px 10px!important;font-size:12px!important}`,
    `    }`,
    '  </style>',
    '</head>',
    `<body style="margin:0;padding:0;background-color:${C.bgPage};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">`,

    // Preheader
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${C.bgPage};line-height:1px;">${safePreheader} ${preheaderSpacer()}</div>`,

    // Outer wrapper
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.bgPage};">`,
    `  <tr><td align="center" class="em-wrap" style="padding:32px 16px;">`,

    // Card
    `    <table role="presentation" class="em-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(91,33,182,0.13);">`,

    // ── Header ──
    `      <tr>`,
    `        <td class="em-header" style="background:linear-gradient(135deg,${C.primary} 0%,${C.primaryDark} 100%);padding:36px 32px;">`,
    `          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    `            <tr>`,
    `              <td>`,
    `                ${labelHtml}`,
    `                <h1 class="em-title" style="margin:0;color:${C.white};font-size:24px;font-weight:700;line-height:1.25;letter-spacing:-0.01em;">${safeTitle}</h1>`,
    `                ${headerSubHtml}`,
    `              </td>`,
    `              <td align="right" valign="top" class="em-hide" style="padding-left:16px;white-space:nowrap;">`,
    `                <span style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:8px;padding:6px 14px;color:${C.white};font-size:12px;font-weight:600;letter-spacing:0.04em;">${safeBrand}</span>`,
    `              </td>`,
    `            </tr>`,
    `          </table>`,
    `        </td>`,
    `      </tr>`,

    // ── Body ──
    `      <tr>`,
    `        <td class="em-body" style="background:${C.bgCard};padding:32px;">`,
    body,
    `        </td>`,
    `      </tr>`,

    // ── Footer ──
    `      <tr>`,
    `        <td class="em-footer" style="background:${C.bgAlt};padding:20px 32px;border-top:1px solid ${C.border};">`,
    `          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    `            <tr>`,
    `              <td style="font-size:11px;color:${C.textMuted};line-height:1.6;">`,
    `                <strong style="color:${C.textMid};font-size:12px;">${safeBrand}</strong><br>`,
    `                This is an automated message. Please do not reply to this email.<br>`,
    `                &copy; ${new Date().getFullYear()} ${safeBrand}. All rights reserved.`,
    `              </td>`,
    `            </tr>`,
    `          </table>`,
    `        </td>`,
    `      </tr>`,

    `    </table>`,
    `  </td></tr>`,
    `</table>`,
    '</body>',
    '</html>',
  ].join('\n');
}

// ─── Reusable block builders ──────────────────────────────────────────────────

/** Highlighted summary card (balance, total, etc.) */
function summaryCard({ label, value, valueColor, badge }) {
  const badgeHtml = badge
    ? `<span style="display:inline-block;margin-left:8px;padding:2px 10px;border-radius:20px;background:${C.accentLight};color:${C.accent};font-size:11px;font-weight:700;vertical-align:middle;">${E(badge)}</span>`
    : '';
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bgAlt};border:1px solid ${C.border};border-radius:12px;margin-bottom:24px;">`,
    `  <tr><td style="padding:20px 24px;">`,
    `    <p style="margin:0 0 6px;font-size:11px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">${E(label)}</p>`,
    `    <p class="em-amount" style="margin:0;font-size:30px;font-weight:800;color:${valueColor || C.textDark};line-height:1.1;">${value}${badgeHtml}</p>`,
    `  </td></tr>`,
    `</table>`,
  ].join('\n');
}

/** Two-column meta row (e.g. "Date: 2024-01-01 | Status: CONFIRMED") */
function metaRow(pairs) {
  const cells = pairs
    .filter(([, v]) => v)
    .map(([k, v]) => `<td style="padding:0 16px 0 0;font-size:13px;color:${C.textMid};white-space:nowrap;"><span style="color:${C.textMuted};">${E(k)}:</span> <strong style="color:${C.textDark};">${E(v)}</strong></td>`)
    .join('');
  return cells
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;"><tr>${cells}</tr></table>`
    : '';
}

/** Section heading inside the body */
function sectionHeading(text) {
  return `<p style="margin:0 0 12px;font-size:11px;font-weight:700;color:${C.accent};text-transform:uppercase;letter-spacing:0.1em;">${E(text)}</p>`;
}

/** Divider line */
function divider() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td style="border-top:1px solid ${C.border};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

/** Greeting paragraph */
function greeting(name) {
  return `<p style="margin:0 0 16px;font-size:15px;color:${C.textDark};line-height:1.6;">Dear <strong>${E(name || 'Valued Customer')}</strong>,</p>`;
}

/** Body paragraph */
function para(text, opts = {}) {
  const color = opts.color || C.textMid;
  const size  = opts.size  || '14px';
  return `<p style="margin:0 0 16px;font-size:${size};color:${color};line-height:1.7;">${text}</p>`;
}

module.exports = { emailBase, summaryCard, metaRow, sectionHeading, divider, greeting, para, E, C };