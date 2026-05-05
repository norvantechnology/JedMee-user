const { fail } = require("./response");

/**
 * Map known Postgres errors from vendors CRUD to HTTP responses.
 * @returns {ReturnType<fail> | null}
 */
function mapVendorPgError(err) {
  if (!err || typeof err !== "object") return null;
  const code = err.code;
  const msg = String(err.message || "");
  const constraint = String(err.constraint || "");

  if (code === "23505") {
    if (constraint === "vendors_account_code_key" || msg.includes("vendors_account_code_key")) {
      return fail(409, "CODE_EXISTS", "Vendor code already exists", {
        subMessage: "Please use a different vendor code."
      });
    }
  }
  if (code === "23503") {
    return fail(400, "BAD_REQUEST", "Invalid account or user reference.", {
      subMessage: "Please refresh and try again, or contact support if this persists."
    });
  }
  if (code === "23502") {
    return fail(400, "VALIDATION_ERROR", "Required value is missing.", {
      subMessage: String(err.column || msg || "Check your input and try again.")
    });
  }
  if (code === "42703") {
    return fail(500, "INTERNAL_ERROR", "Database schema mismatch.", {
      subMessage: "A required column is missing. Run migrations and retry."
    });
  }
  if (code === "42P01") {
    return fail(500, "INTERNAL_ERROR", "Database not ready.", {
      subMessage: "The vendors table was not found. Run migrations and retry."
    });
  }
  return null;
}

function logVendorPgError(context, err) {
  if (process.env.STAGE !== "local" && process.env.DEBUG !== "1") return;
  console.error(`[vendors:${context}]`, err?.code, err?.message, err?.detail, err?.constraint);
}

module.exports = { mapVendorPgError, logVendorPgError };
