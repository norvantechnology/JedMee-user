function clean(v) {
  return String(v ?? "").trim();
}

function cleanUpper(v) {
  return clean(v).toUpperCase();
}

function splitEmails(v) {
  // Accept: array, comma-separated, newline-separated.
  if (Array.isArray(v)) return v.map((x) => clean(x)).filter(Boolean);
  const s = clean(v);
  if (!s) return [];
  return s
    .split(/[\n,;]+/g)
    .map((x) => clean(x))
    .filter(Boolean);
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

function validateEmailList(list, fieldName, errs) {
  const out = [];
  for (const raw of list || []) {
    const e = clean(raw).toLowerCase();
    if (!e) continue;
    if (!isEmail(e)) {
      errs.push(`${fieldName} contains an invalid email: ${raw}`);
      continue;
    }
    out.push(e);
  }
  // de-dupe preserving order
  const seen = new Set();
  const deduped = [];
  for (const e of out) {
    if (seen.has(e)) continue;
    seen.add(e);
    deduped.push(e);
  }
  return deduped;
}

function nInt(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const x = Number.parseInt(String(v).trim(), 10);
  return Number.isFinite(x) ? x : null;
}

function nMoney(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const x = Number(String(v).trim());
  return Number.isFinite(x) ? x : null;
}

function normalizeLimitInt(v) {
  const x = nInt(v);
  if (x == null) return 0;
  return Math.max(0, x);
}

function normalizeLimitMoney(v) {
  const x = nMoney(v);
  if (x == null) return 0;
  return Math.max(0, x);
}

const MFG_COMPANY_COLUMNS = [
  "id",
  "code",
  "name",
  "short_name",
  "rack_no",
  "main_company_id",
  "mr_emails",
  "cf_emails",
  "mfg_emails",
  "other_emails",
  "sale_lock",
  "purchase_order_lock",
  "stock_report_lock",
  "prevent_free_qty",
  "prevent_discount",
  "prevent_net_rate",
  "prevent_return_product",
  "prevent_expiry_damage_product",
  "out_bill_limit",
  "out_day_limit",
  "credit_limit",
  "COALESCE((password_hash IS NOT NULL AND length(password_hash) > 0), false) AS is_password_protected",
  "created_at",
  "updated_at"
].join(", ");

module.exports = {
  clean,
  cleanUpper,
  splitEmails,
  validateEmailList,
  nInt,
  nMoney,
  normalizeLimitInt,
  normalizeLimitMoney,
  MFG_COMPANY_COLUMNS
};

