const ROLES = ["WHOLESALER", "RETAILER"];

function isValidRole(role) {
  return ROLES.includes(role);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeCountryCode(code) {
  const s = String(code || "").trim();
  return s.startsWith("+") ? s : `+${s}`;
}

function normalizePhoneNumber(n) {
  // Keep only digits (backend should be resilient even if UI sends formatted input).
  return String(n || "").replace(/\D+/g, "").trim();
}

function isEmailLike(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

module.exports = { ROLES, isValidRole, normalizeEmail, normalizeCountryCode, normalizePhoneNumber, isEmailLike };

