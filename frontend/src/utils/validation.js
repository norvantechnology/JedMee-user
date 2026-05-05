export function isEmailLike(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

export function normalizePhoneDigits(v) {
  return String(v || "").replace(/\D+/g, "");
}

export function isPhoneDigitsValid(digits) {
  return /^\d{7,15}$/.test(String(digits || ""));
}

export function isCountryCodeLike(v) {
  return /^\+\d{1,4}$/.test(String(v || "").trim());
}

