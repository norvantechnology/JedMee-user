/**
 * Screen-timezone helpers for APIs and reports.
 *
 * Storage: persist instants as UTC (`timestamptz` / ISO Z). Civil dates
 * (`invoice_date`, `payment_date`) are calendar dates in the user's timezone
 * when captured on the client.
 *
 * Clients must send `timezone` (IANA, e.g. Asia/Kolkata) or `tz` on requests.
 * Fallback: `tz_offset_minutes` (e.g. 330 for IST), then UTC.
 */

const DEFAULT_TIME_ZONE = "UTC";

const IANA_RE = /^[A-Za-z_]+\/[A-Za-z0-9_+-]+$/;

function clean(v) {
  return String(v ?? "").trim();
}

function pickFirstQueryParam(qs, keys) {
  if (!qs || typeof qs !== "object") return undefined;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(qs, k)) {
      const v = qs[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    const lowerKey = String(k).toLowerCase();
    const match = Object.keys(qs).find((key) => String(key).toLowerCase() === lowerKey);
    if (match) {
      const v = qs[match];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return undefined;
}

/** Parse fixed offset labels: UTC, UTC+5:30, GMT+05:30 */
function parseOffsetMinutes(label) {
  const s = clean(label).toUpperCase().replace(/\s/g, "");
  if (s === "UTC" || s === "GMT" || s === "Z") return 0;
  const m = s.match(/^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number(m[2]);
  const mins = Number(m[3] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return sign * (hours * 60 + mins);
}

function isOffsetTimeZone(tz) {
  return parseOffsetMinutes(tz) !== null;
}

function isValidIanaTimeZone(tz) {
  const s = clean(tz);
  if (!s || !IANA_RE.test(s)) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: s }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve client screen timezone from query string.
 * @returns {string} IANA id or UTC±HH:MM label
 */
function resolveClientTimeZone(qs = {}, fallback = DEFAULT_TIME_ZONE) {
  const raw =
    pickFirstQueryParam(qs, ["timezone", "timeZone", "tz", "time_zone"]) ||
    pickFirstQueryParam(qs, ["client_timezone", "clientTimezone"]);
  const tz = clean(raw);
  if (tz && (isValidIanaTimeZone(tz) || isOffsetTimeZone(tz))) return tz;

  const offRaw = pickFirstQueryParam(qs, ["tz_offset_minutes", "tzOffsetMinutes", "timezone_offset"]);
  const off = Number(offRaw);
  if (Number.isFinite(off)) {
    const sign = off >= 0 ? "+" : "-";
    const abs = Math.abs(Math.trunc(off));
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `UTC${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const fb = clean(fallback);
  if (fb && (isValidIanaTimeZone(fb) || isOffsetTimeZone(fb))) return fb;
  return DEFAULT_TIME_ZONE;
}

/** Calendar today (YYYY-MM-DD) in [timeZone]. */
function todayYmdInTimeZone(timeZone = DEFAULT_TIME_ZONE) {
  const off = parseOffsetMinutes(timeZone);
  if (off !== null) {
    return todayYmdFromOffsetMinutes(off);
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return todayYmdFromOffsetMinutes(0);
  }
}

function todayYmdFromOffsetMinutes(offsetMinutes) {
  const shifted = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** First day of month for civil Y-M in [timeZone] (month 1–12). */
function monthStartYmd(year, month, _timeZone) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Last day of month for civil Y-M (month 1–12). */
function monthEndYmd(year, month, _timeZone) {
  const last = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** UTC ISO bounds for filtering a local civil date on a timestamptz column. */
function utcBoundsForLocalDate(ymd, timeZone) {
  const date = clean(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { startUtc: null, endUtc: null };
  }
  const off = parseOffsetMinutes(timeZone);
  if (off !== null) {
    const [y, m, d] = date.split("-").map(Number);
    const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - off * 60 * 1000;
    const endMs = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - off * 60 * 1000;
    return {
      startUtc: new Date(startMs).toISOString(),
      endUtc: new Date(endMs).toISOString()
    };
  }
  try {
    const startLocal = `${date}T00:00:00`;
    const endLocal = `${date}T23:59:59.999`;
    const startUtc = localDateTimeInZoneToUtc(startLocal, timeZone);
    const endUtc = localDateTimeInZoneToUtc(endLocal, timeZone);
    return { startUtc, endUtc };
  } catch {
    return utcBoundsForLocalDate(date, "UTC+00:00");
  }
}

/** Best-effort: local wall time in [timeZone] → UTC ISO (for timestamptz filters). */
function localDateTimeInZoneToUtc(localIsoWithoutZ, timeZone) {
  const off = parseOffsetMinutes(timeZone);
  if (off !== null) {
    const m = String(localIsoWithoutZ).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - off * 60 * 1000;
    return new Date(ms).toISOString();
  }
  const guess = new Date(`${localIsoWithoutZ}Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const target = Date.parse(localIsoWithoutZ.replace(" ", "T"));
  if (!Number.isFinite(target)) return null;
  let utc = target;
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(utc));
    const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    const delta = target - asUtc;
    utc += delta;
    if (Math.abs(delta) < 1000) break;
  }
  return new Date(utc).toISOString();
}

/**
 * SQL: local calendar date from timestamptz (stored UTC).
 * [tzParamIndex] is the query param index for the timezone string.
 */
function sqlLocalDateFromTimestamptz(columnExpr, tzParamIndex) {
  return `(${columnExpr} AT TIME ZONE 'UTC' AT TIME ZONE $${tzParamIndex})::date`;
}

/** Now as UTC ISO string for DB writes. */
function nowUtcIso() {
  return new Date().toISOString();
}

module.exports = {
  DEFAULT_TIME_ZONE,
  clean,
  pickFirstQueryParam,
  resolveClientTimeZone,
  isValidIanaTimeZone,
  isOffsetTimeZone,
  parseOffsetMinutes,
  todayYmdInTimeZone,
  todayYmdFromOffsetMinutes,
  monthStartYmd,
  monthEndYmd,
  utcBoundsForLocalDate,
  localDateTimeInZoneToUtc,
  sqlLocalDateFromTimestamptz,
  nowUtcIso
};
