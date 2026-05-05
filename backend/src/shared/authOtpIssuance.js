/**
 * Single place to issue 6-digit OTPs for email verification and password reset:
 * generate → persist hashed → send email → rollback row if SMTP delivery fails.
 */
const { query } = require("./db");
const { generateNumericOtp, makeSalt, hashOtp } = require("./otp");
const {
  sendAuthOtpToEmail,
  emailVerifyTtlMinutes,
  passwordResetTtlMinutes,
  logDevOtp,
  isSmtpConfigured,
  isDryRun
} = require("./authOtpEmail");

function smtpDeliveryRequired() {
  return isSmtpConfigured() && !isDryRun();
}

async function issueEmailVerificationOtp(normalizedEmail) {
  const userRes = await query(
    `SELECT id, email, email_verified FROM app_users WHERE email = $1 LIMIT 1`,
    [normalizedEmail]
  );
  const user = userRes.rows[0];
  if (!user) {
    return { ok: false, code: "USER_NOT_FOUND", message: "No account found for this email. Please sign up first." };
  }
  if (user.email_verified) {
    return { ok: false, code: "ALREADY_VERIFIED", message: "This email is already verified. Please sign in." };
  }

  const otp = generateNumericOtp(6);
  const salt = makeSalt(16);
  const otpHash = hashOtp(otp, salt);
  const ttlMin = emailVerifyTtlMinutes();
  const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

  await query(
    `
    INSERT INTO email_verification_otps (user_id, otp_hash, otp_salt, expires_at)
    VALUES ($1, $2, $3, $4::timestamptz)
    ON CONFLICT (user_id) DO UPDATE SET
      otp_hash = EXCLUDED.otp_hash,
      otp_salt = EXCLUDED.otp_salt,
      expires_at = EXCLUDED.expires_at,
      created_at = now()
    `,
    [user.id, otpHash, salt, expiresAt.toISOString()]
  );

  const mailResult = await sendAuthOtpToEmail(user.email, {
    otp,
    purpose: "email_verify",
    ttlMinutes: ttlMin
  });
  logDevOtp(user.email, "email_verify", otp);

  if (!mailResult.ok && smtpDeliveryRequired()) {
    await query(`DELETE FROM email_verification_otps WHERE user_id = $1`, [user.id]);
    return {
      ok: false,
      code: "EMAIL_SEND_FAILED",
      message: mailResult.error || "Could not send email. Please try again later."
    };
  }

  const otpExpiresInSec = Math.max(60, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));

  return {
    ok: true,
    email: user.email,
    roleEcho: null,
    otpExpiresInSec,
    metaMessage:
      mailResult.dryRun || !smtpDeliveryRequired()
        ? `Verification code issued (email simulation — configure SMTP for delivery). Valid ${ttlMin} min.`
        : `We sent a 6-digit code to your email. It is valid for ${ttlMin} minutes.`
  };
}

async function issuePasswordResetOtp(normalizedEmail) {
  const userRes = await query(`SELECT id, email FROM app_users WHERE email = $1 LIMIT 1`, [normalizedEmail]);
  const user = userRes.rows[0];
  if (!user) {
    return {
      ok: false,
      code: "EMAIL_NOT_REGISTERED",
      message: "This email is not registered. Please sign up first."
    };
  }

  const otp = generateNumericOtp(6);
  const salt = makeSalt(16);
  const otpHash = hashOtp(otp, salt);
  const ttlMin = passwordResetTtlMinutes();
  const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

  await query(
    `
    INSERT INTO password_reset_tokens (user_id, otp_hash, otp_salt, expires_at, created_at, used_at)
    VALUES ($1, $2, $3, $4::timestamptz, now(), NULL)
    ON CONFLICT (user_id) DO UPDATE SET
      otp_hash = EXCLUDED.otp_hash,
      otp_salt = EXCLUDED.otp_salt,
      expires_at = EXCLUDED.expires_at,
      created_at = now(),
      used_at = NULL
    `,
    [user.id, otpHash, salt, expiresAt.toISOString()]
  );

  const mailResult = await sendAuthOtpToEmail(user.email, {
    otp,
    purpose: "password_reset",
    ttlMinutes: ttlMin
  });
  logDevOtp(user.email, "password_reset", otp);

  if (!mailResult.ok && smtpDeliveryRequired()) {
    await query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [user.id]);
    return {
      ok: false,
      code: "EMAIL_SEND_FAILED",
      message: mailResult.error || "Could not send email. Please try again later."
    };
  }

  const otpExpiresInSec = Math.max(60, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));

  return {
    ok: true,
    email: user.email,
    otpExpiresInSec,
    metaMessage:
      mailResult.dryRun || !smtpDeliveryRequired()
        ? `Reset code issued (email simulation — configure SMTP). Valid ${ttlMin} min.`
        : `We sent a 6-digit code to your email. It is valid for ${ttlMin} minutes.`
  };
}

module.exports = { issueEmailVerificationOtp, issuePasswordResetOtp };
