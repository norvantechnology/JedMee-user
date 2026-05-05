/** Shared parsing for vendor create/update handlers. */

function clean(v) {
  const s = String(v ?? "").trim();
  return s || "";
}

function normalizeCountryCode(v) {
  const s = clean(v);
  if (!s) return "";
  if (!/^\+\d{1,4}$/.test(s)) return "";
  return s;
}

function normalizePhoneNumber(v) {
  const s = clean(v).replace(/\D+/g, "");
  if (!s) return "";
  if (!/^\d{7,15}$/.test(s)) return "";
  return s;
}

/**
 * Same value as migration 011 generated `phone`, but as a SQL expression so
 * list/create/update work whether or not that column exists in the database.
 */
const VENDOR_PHONE_EXPR = `NULLIF(COALESCE(phone_country_code, '') || COALESCE(phone_number, ''), '')`;

/** SELECT / RETURNING projection (includes computed `phone`, not a physical column). */
const VENDOR_ROW_COLUMNS = [
  "id",
  "code",
  "name",
  "short_name",
  "rack_number",
  "main_company",
  "credit_days",
  "mfg_company_id",
  "vendor_type",
  "phone_country_code",
  "phone_number",
  `(${VENDOR_PHONE_EXPR}) AS phone`,
  "email",
  "address",
  "notes",
  "is_active",
  "created_at",
  "updated_at"
].join(", ");

const VENDOR_TYPES = new Set(["WHOLESALER", "DISTRIBUTOR", "DIRECT_MFG", "OTHER"]);

function normalizeVendorType(v) {
  const s = clean(v).toUpperCase();
  if (!s) return null;
  return VENDOR_TYPES.has(s) ? s : null;
}

module.exports = {
  clean,
  normalizeCountryCode,
  normalizePhoneNumber,
  normalizeVendorType,
  VENDOR_TYPES,
  VENDOR_PHONE_EXPR,
  VENDOR_ROW_COLUMNS
};
