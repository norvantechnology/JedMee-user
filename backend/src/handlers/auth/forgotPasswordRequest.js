const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { isEmailLike, normalizeEmail } = require("../../shared/validation");
const { issuePasswordResetOtp } = require("../../shared/authOtpIssuance");

async function handler(event) {
  const body = parseJsonBody(event);
  const email = normalizeEmail(body.email);

  if (!email) return fail(400, "VALIDATION_ERROR", "email is required");
  if (!isEmailLike(email)) return fail(400, "VALIDATION_ERROR", "email is invalid");

  const result = await issuePasswordResetOtp(email);
  if (!result.ok) {
    if (result.code === "EMAIL_NOT_REGISTERED") return fail(404, "EMAIL_NOT_REGISTERED", result.message);
    if (result.code === "EMAIL_SEND_FAILED") return fail(503, "EMAIL_SEND_FAILED", result.message);
    return fail(500, "INTERNAL_ERROR", "Could not send reset code.");
  }

  return ok(
    { otp_sent: true, email: result.email },
    {
      message: result.metaMessage,
      otpExpiresInSec: result.otpExpiresInSec
    }
  );
}

module.exports = { handler };
