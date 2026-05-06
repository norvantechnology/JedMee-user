/**
 * Shared OTP email content + send helper (signup verify + password reset).
 * TTL minutes come from env so handlers stay in sync with copy and DB expiry.
 */
const { sendMail, isSmtpConfigured, isDryRun } = require("./mailOut");
const { appBrandDisplayName } = require("./brand");
const { emailBase, summaryCard, divider, para, E, C } = require("./emailTemplate");

const BRAND_DISPLAY = appBrandDisplayName();

function parsePositiveInt(envKey, fallback) {
  const n = Number.parseInt(String(process.env[envKey] || ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function emailVerifyTtlMinutes() {
  return parsePositiveInt("EMAIL_VERIFY_OTP_TTL_MINUTES", 15);
}

function passwordResetTtlMinutes() {
  return parsePositiveInt("PASSWORD_RESET_OTP_TTL_MINUTES", 15);
}

function buildOtpMail({ otp, purpose, ttlMinutes }) {
  const safeOtp = E(otp);
  const isReset = purpose === "password_reset";

  const subject = isReset
    ? `${BRAND_DISPLAY}: Password Reset Code`
    : `${BRAND_DISPLAY}: Email Verification Code`;

  const textCommon = isReset
    ? `Your password reset code is ${otp}. It expires in ${ttlMinutes} minutes. If you did not request a reset, you can ignore this email.`
    : `Your email verification code is ${otp}. It expires in ${ttlMinutes} minutes. If you did not create an account, you can ignore this email.`;

  // ── OTP digit boxes ──────────────────────────────────────────────────────
  const digits = String(otp || "").split("");
  const digitBoxes = digits.length > 0
    ? digits.map(d =>
        `<td style="padding:0 4px;">` +
        `<span style="display:inline-block;width:44px;height:56px;line-height:56px;text-align:center;` +
        `background:${C.accentLight};border:2px solid ${C.border};border-radius:10px;` +
        `font-size:28px;font-weight:800;color:${C.primary};letter-spacing:0;">${E(d)}</span>` +
        `</td>`
      ).join("")
    : `<td><span class="em-otp" style="display:inline-block;font-size:40px;font-weight:800;` +
      `letter-spacing:0.2em;color:${C.primary};background:${C.accentLight};` +
      `border-radius:12px;padding:14px 28px;">${safeOtp}</span></td>`;

  const otpBlock = [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 8px;">`,
    `  <tr>${digitBoxes}</tr>`,
    `</table>`,
  ].join("\n");

  // ── Purpose icon + heading ───────────────────────────────────────────────
  const icon   = isReset ? "🔐" : "✉️";
  const action = isReset ? "Reset Your Password" : "Verify Your Email";
  const desc   = isReset
    ? "Use the code below to reset your password. This code is valid for a limited time."
    : "Use the code below to verify your email address and activate your account.";

  const body = [
    // Icon + action heading
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">`,
    `  <tr><td align="center">`,
    `    <div style="font-size:40px;line-height:1;margin-bottom:12px;">${icon}</div>`,
    `    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${C.textDark};">${action}</h2>`,
    `    <p style="margin:0;font-size:14px;color:${C.textMid};line-height:1.6;max-width:400px;">${desc}</p>`,
    `  </td></tr>`,
    `</table>`,

    divider(),

    // OTP code section
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">`,
    `  <tr><td align="center">`,
    `    <p style="margin:0 0 16px;font-size:12px;font-weight:600;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.1em;">Your One-Time Code</p>`,
    otpBlock,
    `    <p style="margin:16px 0 0;font-size:13px;color:${C.textMuted};">`,
    `      Expires in <strong style="color:${C.textDark};">${ttlMinutes} minutes</strong>`,
    `    </p>`,
    `  </td></tr>`,
    `</table>`,

    divider(),

    // Security note
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bgAlt};border:1px solid ${C.border};border-radius:10px;">`,
    `  <tr><td style="padding:16px 20px;">`,
    `    <p style="margin:0;font-size:12px;color:${C.textMuted};line-height:1.7;">`,
    `      <strong style="color:${C.textMid};">🔒 Security notice:</strong> `,
    isReset
      ? `If you did not request a password reset, please ignore this email. Your account remains secure.`
      : `If you did not create an account with ${E(BRAND_DISPLAY)}, please ignore this email.`,
    `    </p>`,
    `  </td></tr>`,
    `</table>`,
  ].join("\n");

  const html = emailBase({
    preheader: isReset
      ? `Your password reset code is ${otp} — expires in ${ttlMinutes} minutes`
      : `Your verification code is ${otp} — expires in ${ttlMinutes} minutes`,
    headerLabel: isReset ? "Password Reset" : "Email Verification",
    headerTitle: isReset ? "Reset Your Password" : "Verify Your Email",
    headerSub: E(BRAND_DISPLAY),
    body,
    brandName: BRAND_DISPLAY,
  });

  return { subject, text: textCommon, html };
}

/**
 * @param {string} to
 * @param {{ otp: string; purpose: 'email_verify' | 'password_reset'; ttlMinutes: number }} opts
 */
async function sendAuthOtpToEmail(to, { otp, purpose, ttlMinutes }) {
  const { subject, text, html } = buildOtpMail({ otp, purpose, ttlMinutes });
  return sendMail({ to, subject, text, html });
}

/**
 * Log OTP only when MEDICO_LOG_OTP=1 (local debugging; never enable in production).
 */
function logDevOtp(email, purpose, otp) {
  if (String(process.env.MEDICO_LOG_OTP || "").trim() !== "1") return;
  // eslint-disable-next-line no-console
  console.warn(`[medico:otp] MEDICO_LOG_OTP=1 purpose=${purpose} email=${email} otp=${otp}`);
}

module.exports = {
  sendAuthOtpToEmail,
  emailVerifyTtlMinutes,
  passwordResetTtlMinutes,
  buildOtpMail,
  logDevOtp,
  isSmtpConfigured,
  isDryRun
};
