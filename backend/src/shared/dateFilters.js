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
 * Single civil date from query (e.g. day book).
 * @param {string} value - YYYY-MM-DD or empty
 * @param {object|string} qsOrTimeZone - query object or IANA/offset timezone
 */
function resolveSingleDate(value, qsOrTimeZone = {}) {
  const timeZone =
    typeof qsOrTimeZone === "string"
      ? qsOrTimeZone
      : resolveClientTimeZone(qsOrTimeZone || {});
  const date = normalizeYmd(value);
  return date || todayYmdInTimeZone(timeZone);
}

module.exports = {
  clean,
  normalizeYmd,
  getQueryParam,
  pickFirstQueryParam,
  resolveDateRange,
  applyDateRangeDate,
  resolveSingleDate,
  resolveClientTimeZone,
  todayYmdInTimeZone
};
