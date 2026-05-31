import { screenTimeZone, todayYmdInScreenZone, withScreenTimezone } from "./timezone.js";

export { screenTimeZone, todayYmdInScreenZone, withScreenTimezone };

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Local calendar date as YYYY-MM-DD in the screen timezone. */
export function todayYmdLocal(d = new Date()) {
  if (!d || d.getTime() === Date.now()) {
    return todayYmdInScreenZone();
  }
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

export function isValidYmd(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Add calendar days to a YYYY-MM-DD string. Returns "" if input invalid. */
export function addDaysYmd(ymd, days) {
  const s = String(ymd || "").trim();
  if (!isValidYmd(s)) return "";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d + Number(days || 0));
  return todayYmdLocal(dt);
}

