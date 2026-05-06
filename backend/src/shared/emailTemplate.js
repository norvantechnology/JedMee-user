/**
 * Clean, minimal email template system for JedMee.
 * Design: black-and-white document style matching the PDF print view.
 * Table-based layout for maximum email-client compatibility.
 * Google Fonts (Inter) + system font fallback.
 *
 * Logo: set APP_LOGO_URL env var to a publicly hosted image URL.
 *       e.g. https://cdn.jedmee.com/assets/logo.png
 */

// ─── Brand Palette — minimal, document-like ───────────────────────────────────
const C = {
  primary:      '#5B21B6',   // violet — used only for table headers & accents
  primaryLight: '#EDE9FE',   // very light violet — section label bg
  border:       '#D1D5DB',   // gray border
  borderLight:  '#E5E7EB',   // lighter border
  text:         '#111827',   // near-black body text
  textMid:      '#374151',   // medium gray text
  textMuted:    '#6B7280',   // muted gray
  textLight:    '#9CA3AF',   // light gray (footer)
  altRow:       '#F9FAFB',   // very light gray alternating row
  white:        '#FFFFFF',
  bgPage:       '#F3F4F6',   // light gray page background
  bgCard:       '#FFFFFF',   // white card
  success:      '#059669',
  danger:       '#DC2626',
  warning:      '#D97706',
  successLight: '#D1FAE5',
  dangerLight:  '#FEE2E2',
  warningLight: '#FEF3C7',
};

// ─── HTML escape ──────────────────────────────────────────────────────────────
function E(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Logo URL from env ────────────────────────────────────────────────────────
function brandLogoUrl() {
  return String(process.env.APP_LOGO_URL || '').trim();
}

// ─── Invisible preheader spacer ───────────────────────────────────────────────
function preheaderSpacer() {
  return Array(160).fill('&#847;&nbsp;').join('');
}

// ─── Professional inline SVG icons ───────────────────────────────────────────
const ICONS = {
  /** 48×48 rounded badge — envelope */
  email: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;"><tr><td align="center">
    <div style="display:inline-block;width:56px;height:56px;border-radius:12px;background:#F3F4F6;border:1px solid #E5E7EB;text-align:center;line-height:56px;">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;display:inline-block;">
        <rect x="3" y="7" width="22" height="15" rx="2" stroke="#374151" stroke-width="1.8" fill="none"/>
        <path d="M3 10l11 7 11-7" stroke="#374151" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      </svg>
    </div>
  </td></tr></table>`,

  /** 48×48 rounded badge — lock */
  lock: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;"><tr><td align="center">
    <div style="display:inline-block;width:56px;height:56px;border-radius:12px;background:#F3F4F6;border:1px solid #E5E7EB;text-align:center;line-height:56px;">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;display:inline-block;">
        <rect x="6" y="13" width="16" height="11" rx="2" stroke="#374151" stroke-width="1.8" fill="none"/>
        <path d="M10 13v-3.5a4 4 0 0 1 8 0V13" stroke="#374151" stroke-width="1.8" stroke-linecap="round" fill="none"/>
        <circle cx="14" cy="18.5" r="1.5" fill="#374151"/>
      </svg>
    </div>
  </td></tr></table>`,

  /** 48×48 rounded badge — invoice/receipt */
  invoice: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;"><tr><td align="center">
    <div style="display:inline-block;width:56px;height:56px;border-radius:12px;background:#F3F4F6;border:1px solid #E5E7EB;text-align:center;line-height:56px;">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;display:inline-block;">
        <rect x="5" y="3" width="18" height="22" rx="2" stroke="#374151" stroke-width="1.8" fill="none"/>
        <path d="M9 9h10M9 13h10M9 17h6" stroke="#374151" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </div>
  </td></tr></table>`,

  /** 48×48 rounded badge — ledger/book */
  ledger: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px;"><tr><td align="center">
    <div style="display:inline-block;width:56px;height:56px;border-radius:12px;background:#F3F4F6;border:1px solid #E5E7EB;text-align:center;line-height:56px;">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;display:inline-block;">
        <rect x="4" y="3" width="20" height="22" rx="2" stroke="#374151" stroke-width="1.8" fill="none"/>
        <path d="M4 7h20" stroke="#374151" stroke-width="1.8"/>
        <path d="M9 12h4M9 16h4M9 20h4M16 12h3M16 16h3M16 20h3" stroke="#374151" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </div>
  </td></tr></table>`,

  /** Inline 14×14 shield — for security notice */
  shield: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;display:inline-block;margin-right:4px;position:relative;top:-1px;">
    <path d="M6.5 1L1 3v3.25C1 9.25 3.5 12 6.5 12.5c3-.5 5.5-3.25 5.5-6.25V3L6.5 1z" stroke="#374151" stroke-width="1.3" fill="none" stroke-linejoin="round"/>
    <path d="M4 6.5l2 2 3-3" stroke="#374151" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  /** Inline 14×14 check circle */
  check: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;display:inline-block;margin-right:4px;position:relative;top:-1px;">
    <circle cx="6.5" cy="6.5" r="5.5" stroke="#059669" stroke-width="1.3" fill="none"/>
    <path d="M4 6.5l2 2 3-3" stroke="#059669" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  /** Inline 14×14 info circle */
  info: `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;display:inline-block;margin-right:4px;position:relative;top:-1px;">
    <circle cx="6.5" cy="6.5" r="5.5" stroke="#374151" stroke-width="1.3" fill="none"/>
    <path d="M6.5 6v4" stroke="#374151" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="6.5" cy="4" r="0.7" fill="#374151"/>
  </svg>`,
};

// ─── Base wrapper ─────────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.preheader    Short preview text shown in inbox list
 * @param {string} opts.headerLabel  Small uppercase label (shown below logo)
 * @param {string} opts.headerTitle  Main document title
 * @param {string} [opts.headerSub]  Optional subtitle
 * @param {string} opts.body         Inner HTML for the white card body
 * @param {string} [opts.brandName]  Brand name shown in header and footer
 * @returns {string} Full HTML email string
 */
function emailBase({ preheader = '', headerLabel = '', headerTitle = '', headerSub = '', body = '', brandName = 'JedMee' }) {
  const safePreheader = E(preheader);
  const safeBrand     = E(brandName);
  const safeLabel     = E(headerLabel);
  const safeTitle     = E(headerTitle);
  const safeSub       = headerSub ? E(headerSub) : '';
  const logoUrl       = brandLogoUrl();

  // ── Logo / brand header (white, clean) ───────────────────────────────────
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${safeBrand}" height="32" style="height:32px;width:auto;display:block;border:0;" />`
    : `<span style="font-family:'Inter',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;color:#111827;letter-spacing:-0.5px;">${safeBrand}</span>`;

  const labelHtml = safeLabel
    ? `<p style="margin:16px 0 4px;font-size:11px;font-weight:600;color:#6B7280;letter-spacing:0.1em;text-transform:uppercase;font-family:'Inter',Helvetica,Arial,sans-serif;">${safeLabel}</p>`
    : '';

  const titleHtml = safeTitle
    ? `<h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;font-family:'Inter',Helvetica,Arial,sans-serif;">${safeTitle}</h1>`
    : '';

  const subHtml = safeSub
    ? `<p style="margin:0;font-size:13px;color:#6B7280;font-family:'Inter',Helvetica,Arial,sans-serif;">${safeSub}</p>`
    : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width,initial-scale=1">',
    '  <meta http-equiv="X-UA-Compatible" content="IE=edge">',
    '  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">',
    `  <title>${safeTitle || safeBrand}</title>`,
    '  <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->',
    '  <style>',
    `    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`,
    `    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}`,
    `    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}`,
    `    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;display:block}`,
    `    body{margin:0!important;padding:0!important;background-color:#F3F4F6;font-family:'Inter',Helvetica,Arial,sans-serif;}`,
    `    a{color:#5B21B6;text-decoration:none}`,
    `    a:hover{text-decoration:underline}`,
    `    @media only screen and (max-width:620px){`,
    `      .em-wrap{padding:12px 8px!important}`,
    `      .em-card{border-radius:8px!important}`,
    `      .em-header{padding:20px 20px 16px!important}`,
    `      .em-body{padding:20px!important}`,
    `      .em-footer{padding:16px 20px!important}`,
    `      .em-otp-digit{width:36px!important;height:48px!important;line-height:48px!important;font-size:24px!important}`,
    `      .em-amount{font-size:24px!important}`,
    `      .em-hide{display:none!important;max-height:0!important;overflow:hidden!important}`,
    `      h1.em-title{font-size:18px!important}`,
    `      .em-tbl td,.em-tbl th{padding:6px 8px!important;font-size:11px!important}`,
    `      .em-meta-row td{display:block!important;padding:2px 0!important}`,
    `    }`,
    '  </style>',
    '</head>',
    `<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:'Inter',Helvetica,Arial,sans-serif;">`,

    // Preheader
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#F3F4F6;line-height:1px;">${safePreheader} ${preheaderSpacer()}</div>`,

    // Outer wrapper
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F4F6;">`,
    `  <tr><td align="center" class="em-wrap" style="padding:28px 16px;">`,

    // Card
    `    <table role="presentation" class="em-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;border-radius:8px;overflow:hidden;border:1px solid #D1D5DB;background:#FFFFFF;">`,

    // ── Header (white, clean) ──
    `      <tr>`,
    `        <td class="em-header" style="background:#FFFFFF;padding:24px 32px 20px;border-bottom:1px solid #E5E7EB;">`,
    `          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    `            <tr>`,
    `              <td valign="middle">${logoHtml}</td>`,
    `              <td align="right" valign="middle" class="em-hide">`,
    `                <span style="font-size:11px;color:#9CA3AF;font-family:'Inter',Helvetica,Arial,sans-serif;">${safeBrand}</span>`,
    `              </td>`,
    `            </tr>`,
    `          </table>`,
    labelHtml,
    titleHtml,
    subHtml,
    `        </td>`,
    `      </tr>`,

    // ── Body ──
    `      <tr>`,
    `        <td class="em-body" style="background:#FFFFFF;padding:28px 32px;">`,
    body,
    `        </td>`,
    `      </tr>`,

    // ── Footer ──
    `      <tr>`,
    `        <td class="em-footer" style="background:#F9FAFB;padding:20px 32px;border-top:1px solid #E5E7EB;">`,
    `          <p style="margin:0;font-size:11px;color:#9CA3AF;line-height:1.7;font-family:'Inter',Helvetica,Arial,sans-serif;">`,
    `            <strong style="color:#6B7280;">${safeBrand}</strong> &mdash; This is an automated message. Please do not reply to this email.<br>`,
    `            &copy; ${new Date().getFullYear()} ${safeBrand}. All rights reserved.`,
    `          </p>`,
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

/**
 * Summary card — clean bordered box (no colored background).
 */
function summaryCard({ label, value, valueColor, badge, subtext }) {
  const badgeHtml = badge
    ? `<span style="display:inline-block;margin-left:10px;padding:2px 10px;border-radius:4px;background:#F3F4F6;border:1px solid #D1D5DB;color:#374151;font-size:11px;font-weight:600;vertical-align:middle;font-family:'Inter',Helvetica,Arial,sans-serif;">${E(badge)}</span>`
    : '';
  const subtextHtml = subtext
    ? `<p style="margin:6px 0 0;font-size:12px;color:#6B7280;font-family:'Inter',Helvetica,Arial,sans-serif;">${E(subtext)}</p>`
    : '';
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #D1D5DB;border-radius:6px;margin-bottom:20px;">`,
    `  <tr><td style="padding:16px 20px;">`,
    `    <p style="margin:0 0 4px;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;font-family:'Inter',Helvetica,Arial,sans-serif;">${E(label)}</p>`,
    `    <p class="em-amount" style="margin:0;font-size:28px;font-weight:700;color:${valueColor || C.text};line-height:1.1;font-family:'Inter',Helvetica,Arial,sans-serif;">${value}${badgeHtml}</p>`,
    subtextHtml,
    `  </td></tr>`,
    `</table>`,
  ].join('\n');
}

/**
 * Two-column meta row (e.g. "Date: 2024-01-01 | Status: CONFIRMED")
 */
function metaRow(pairs) {
  const cells = pairs
    .filter(([, v]) => v)
    .map(([k, v]) =>
      `<td style="padding:0 20px 0 0;font-size:13px;color:#374151;white-space:nowrap;font-family:'Inter',Helvetica,Arial,sans-serif;">` +
      `<span style="color:#9CA3AF;">${E(k)}</span>&nbsp;` +
      `<strong style="color:#111827;font-weight:600;">${E(v)}</strong></td>`
    )
    .join('');
  return cells
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="em-meta-row" style="margin-bottom:16px;"><tr>${cells}</tr></table>`
    : '';
}

/** Section heading — simple, clean */
function sectionHeading(text) {
  return `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.1em;font-family:'Inter',Helvetica,Arial,sans-serif;border-left:3px solid #5B21B6;padding-left:8px;">${E(text)}</p>`;
}

/** Horizontal divider */
function divider() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td style="border-top:1px solid #E5E7EB;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

/** Greeting paragraph */
function greeting(name) {
  return `<p style="margin:0 0 14px;font-size:14px;color:#111827;line-height:1.7;font-family:'Inter',Helvetica,Arial,sans-serif;">Hi <strong style="font-weight:600;">${E(name || 'there')}</strong>,</p>`;
}

/** Body paragraph */
function para(text, opts = {}) {
  const color = opts.color || C.textMid;
  const size  = opts.size  || '14px';
  const align = opts.align || 'left';
  return `<p style="margin:0 0 14px;font-size:${size};color:${color};line-height:1.75;text-align:${align};font-family:'Inter',Helvetica,Arial,sans-serif;">${text}</p>`;
}

/**
 * Notice / alert box — clean bordered style.
 */
function noticeBox({ type = 'info', text }) {
  const map = {
    info:    { bg: '#F9FAFB', border: '#D1D5DB', color: '#374151', icon: ICONS.shield },
    success: { bg: '#F0FDF4', border: '#BBF7D0', color: '#059669', icon: ICONS.check  },
    warning: { bg: '#FFFBEB', border: '#FDE68A', color: '#D97706', icon: ICONS.info   },
    danger:  { bg: '#FFF5F5', border: '#FECACA', color: '#DC2626', icon: ICONS.info   },
  };
  const s = map[type] || map.info;
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${s.bg};border:1px solid ${s.border};border-radius:6px;margin-bottom:14px;">`,
    `  <tr><td style="padding:12px 16px;">`,
    `    <p style="margin:0;font-size:13px;color:${s.color};line-height:1.7;font-family:'Inter',Helvetica,Arial,sans-serif;">`,
    `      ${s.icon}${E(text)}`,
    `    </p>`,
    `  </td></tr>`,
    `</table>`,
  ].join('\n');
}

module.exports = { emailBase, summaryCard, metaRow, sectionHeading, divider, greeting, para, noticeBox, E, C, ICONS };