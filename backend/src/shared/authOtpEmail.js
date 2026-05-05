/**
 * Shared OTP email content + send helper (signup verify + password reset).
 * TTL minutes come from env so handlers stay in sync with copy and DB expiry.
 */
const { sendMail, isSmtpConfigured, isDryRun } = require("./mailOut");
const { appBrandDisplayName } = require("./brand");

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

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildOtpMail({ otp, purpose, ttlMinutes }) {
  const safeOtp = escapeHtml(otp);
  const subject =
    purpose === "password_reset"
      ? `${BRAND_DISPLAY}: Password reset code`
      : `${BRAND_DISPLAY}: Email verification code`;

  const textCommon =
    purpose === "password_reset"
      ? `Your password reset code is ${otp}. It expires in ${ttlMinutes} minutes. If you did not request a reset, you can ignore this email.`
      : `Your email verification code is ${otp}. It expires in ${ttlMinutes} minutes. If you did not create an account, you can ignore this email.`;

  const html = `
  <div style="font-family:system-ui,Segoe UI,sans-serif;line-height:1.45;color:#1a1a1a;">
    <p style="font-size:15px;margin:0 0 12px;">${purpose === "password_reset" ? "Use this code to reset your password:" : "Use this code to verify your email:"}</p>
    <p style="font-size:28px;font-weight:800;letter-spacing:0.25em;margin:0 0 16px;">${safeOtp}</p>
    <p style="font-size:13px;color:#555;margin:0;">Expires in <strong>${ttlMinutes}</strong> minutes.</p>
    <p style="font-size:12px;color:#888;margin:16px 0 0;">— ${escapeHtml(BRAND_DISPLAY)}</p>
  </div>`;

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
