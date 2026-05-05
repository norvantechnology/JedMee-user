const bcrypt = require("bcryptjs");
const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { isEmailLike, normalizeEmail } = require("../../shared/validation");
const { verifyOtpHash } = require("../../shared/otp");

async function handler(event) {
  const body = parseJsonBody(event);
  const email = normalizeEmail(body.email);
  const otp = String(body.otp || "").trim();
  const newPassword = String(body.newPassword || "");

  if (!email) return fail(400, "VALIDATION_ERROR", "email is required");
  if (!isEmailLike(email)) return fail(400, "VALIDATION_ERROR", "email is invalid");
  if (!otp) return fail(400, "VALIDATION_ERROR", "otp is required");
  if (!/^\d{6}$/.test(otp)) return fail(400, "VALIDATION_ERROR", "otp must be 6 digits");
  if (!newPassword) return fail(400, "VALIDATION_ERROR", "newPassword is required");
  if (newPassword.length < 8) return fail(400, "VALIDATION_ERROR", "newPassword must be at least 8 characters");

  const res = await query(
    `
    SELECT u.id, t.otp_hash AS reset_password_otp_hash, t.otp_salt AS reset_password_otp_salt, t.expires_at AS reset_password_otp_expires_at
    FROM app_users u
    JOIN password_reset_tokens t ON t.user_id = u.id
    WHERE u.email = $1
      AND t.used_at IS NULL
    LIMIT 1
    `,
    [email]
  );

  const row = res.rows[0];
  if (!row) return fail(400, "INVALID_OTP", "Invalid OTP or expired OTP");
  if (!row.reset_password_otp_hash || !row.reset_password_otp_salt || !row.reset_password_otp_expires_at) {
    return fail(400, "INVALID_OTP", "Invalid OTP or expired OTP");
  }
  if (new Date(row.reset_password_otp_expires_at).getTime() < Date.now()) {
    return fail(400, "OTP_EXPIRED", "OTP expired. Please request a new OTP.");
  }
  if (!verifyOtpHash(otp, row.reset_password_otp_salt, row.reset_password_otp_hash)) {
    return fail(400, "INVALID_OTP", "Invalid OTP or expired OTP");
  }

  const cost = Number(process.env.BCRYPT_COST || 12);
  const passwordHash = await bcrypt.hash(newPassword, cost);

  await query(
    `
    UPDATE app_users
    SET password_hash = $2
    WHERE id = $1
    `,
    [row.id, passwordHash]
  );

  await query(`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [row.id]);

  return ok({ password_reset: true }, { message: "Password reset successful. Please login." });
}

module.exports = { handler };

