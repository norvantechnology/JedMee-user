/** Shared copy for OTP request flows (avoid hardcoded “123456” toasts). */

export function otpRequestSuccessMessage(meta) {
  const m = meta && typeof meta.message === "string" ? meta.message.trim() : "";
  return m || "Check your email for the 6-digit code.";
}

/** Backend sends `meta.otpExpiresInSec` after issuing an OTP. */
export function otpExpiresSecondsFromMeta(meta, fallbackSeconds = 900) {
  const n = Number(meta?.otpExpiresInSec ?? meta?.otp_expires_in_sec);
  if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), 86400);
  return fallbackSeconds;
}
