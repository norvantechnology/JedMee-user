const {
  resolveClientTimeZone,
  todayYmdInTimeZone: todayYmdInTz,
  pickFirstQueryParam
} = require("./timezone");

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

function resolveDateRange(qs = {}, options = {}) {
  const timeZone = options.timeZone || resolveClientTimeZone(qs);
  const fromRaw = pickFirstQueryParam(qs, ["date_from", "dateFrom", "from"]);
  const toRaw = pickFirstQueryParam(qs, ["date_to", "dateTo", "to"]);
  let from = normalizeYmd(fromRaw);
  let to = normalizeYmd(toRaw);
  if (from && to && from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from, to, timeZone };
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

function todayYmdInTimeZone(timeZone) {
  return todayYmdInTz(timeZone);
}

/**
 * Civil date for single-day analytics (dashboard KPIs, day book).
 * Order: explicit `date` → single-day range (`dateFrom` === `dateTo`) → calendar today in client TZ.
 */
function resolveAnalyticsDay(qs = {}, options = {}) {
  const timeZone = options.timeZone || resolveClientTimeZone(qs);
  const explicit = normalizeYmd(
    pickFirstQueryParam(qs, ["date", "analytics_date", "analyticsDate"])
  );
  if (explicit) {
    return { day: explicit, timeZone, source: "date" };
  }
  const from = normalizeYmd(pickFirstQueryParam(qs, ["date_from", "dateFrom", "from"]));
  const to = normalizeYmd(pickFirstQueryParam(qs, ["date_to", "dateTo", "to"]));
  if (from && to && from === to) {
    return { day: from, timeZone, source: "range" };
  }
  return { day: todayYmdInTimeZone(timeZone), timeZone, source: "today" };
}

/**
 * Single civil date from query (e.g. day book `date` param).
 * @param {string} value - YYYY-MM-DD or empty
 * @param {object|string} qsOrTimeZone - query object or IANA/offset timezone
 */
function resolveSingleDate(value, qsOrTimeZone = {}) {
  if (typeof qsOrTimeZone === "string") {
    const date = normalizeYmd(value);
    return date || todayYmdInTimeZone(qsOrTimeZone);
  }
  const explicit = normalizeYmd(value);
  if (explicit) return explicit;
  return resolveAnalyticsDay(qsOrTimeZone || {}).day;
}

module.exports = {
  clean,
  normalizeYmd,
  getQueryParam,
  pickFirstQueryParam,
  resolveDateRange,
  applyDateRangeDate,
  resolveAnalyticsDay,
  resolveSingleDate,
  resolveClientTimeZone,
  todayYmdInTimeZone
};
