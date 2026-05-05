const { fail } = require("./response");

/**
 * Map Node/pg transient network errors to a 503 response (DNS, timeout, refused).
 * @returns {ReturnType<fail> | null}
 */
function mapDbConnectivityError(err) {
  const c = err && typeof err === "object" ? String(err.code || "") : "";
  if (
    c === "EAI_AGAIN" ||
    c === "ENOTFOUND" ||
    c === "ECONNREFUSED" ||
    c === "ETIMEDOUT" ||
    c === "ESOCKETTIMEDOUT"
  ) {
    return fail(503, "SERVICE_UNAVAILABLE", "Database temporarily unavailable.", {
      subMessage: "Check your network connection and try again."
    });
  }
  return null;
}

module.exports = { mapDbConnectivityError };
