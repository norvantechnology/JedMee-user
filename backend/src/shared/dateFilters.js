function clean(v) {
  return String(v ?? "").trim();
}

function isYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function normalizeYmd(v) {
  const s = clean(v);
  return isYmd(s) ? s : "";
}

function getQueryParam(qs, key) {
  if (!qs || typeof qs !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(qs, key)) return qs[key];
  const lowerKey = String(key).toLowerCase();
  const match = Object.keys(qs).find((k) => String(k).toLowerCase() === lowerKey);
  return match ? qs[match] : undefined;
}

function pickFirstQueryParam(qs, keys) {
  for (const k of keys) {
    const v = getQueryParam(qs, k);
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function resolveDateRange(qs = {}) {
  const fromRaw = pickFirstQueryParam(qs, ["date_from", "dateFrom", "from"]);
  const toRaw = pickFirstQueryParam(qs, ["date_to", "dateTo", "to"]);
  const from = normalizeYmd(fromRaw);
  const to = normalizeYmd(toRaw);
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

function applyDateRangeDate(wh, ps, columnExpr, range) {
  if (range.from) {
    ps.push(range.from);
    wh.push(`${columnExpr} >= $${ps.length}::date`);
  }
  if (range.to) {
    ps.push(range.to);
    wh.push(`${columnExpr} <= $${ps.length}::date`);
  }
}

function todayYmdInTimeZone(timeZone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function resolveSingleDate(value, fallbackTimeZone = "Asia/Kolkata") {
  const date = normalizeYmd(value);
  return date || todayYmdInTimeZone(fallbackTimeZone);
}

module.exports = {
  clean,
  normalizeYmd,
  getQueryParam,
  pickFirstQueryParam,
  resolveDateRange,
  applyDateRangeDate,
  resolveSingleDate,
  todayYmdInTimeZone
};
