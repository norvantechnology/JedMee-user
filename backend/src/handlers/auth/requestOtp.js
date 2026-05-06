const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { isEmailLike, normalizeEmail } = require("../../shared/validation");
const { issueEmailVerificationOtp } = require("../../shared/authOtpIssuance");
const { checkRateLimit, lambdaClientIp } = require("../../shared/rateLimiter");

async function handler(event) {
  const limited = checkRateLimit('otp', lambdaClientIp(event));
  if (limited) return fail(429, 'RATE_LIMITED', limited.message);

  const body = parseJsonBody(event);
  const email = normalizeEmail(body.email);
  const role = body.role ? String(body.role || "").toUpperCase() : "";

  if (!email) return fail(400, "VALIDATION_ERROR", "email is required");
  if (!isEmailLike(email)) return fail(400, "VALIDATION_ERROR", "email is invalid");

  const result = await issueEmailVerificationOtp(email);
  if (!result.ok) {
    if (result.code === "USER_NOT_FOUND") return fail(404, "NOT_FOUND", result.message);
    if (result.code === "ALREADY_VERIFIED") return fail(400, "ALREADY_VERIFIED", result.message);
    if (result.code === "EMAIL_SEND_FAILED") return fail(503, "EMAIL_SEND_FAILED", result.message);
    return fail(500, "INTERNAL_ERROR", "Could not send verification code.");
  }

  return ok(
    { otp_sent: true, email: result.email, role },
    {
      message: result.metaMessage,
      otpExpiresInSec: result.otpExpiresInSec
    }
  );
}

module.exports = { handler };
