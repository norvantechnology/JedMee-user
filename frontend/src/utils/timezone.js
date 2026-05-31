/**
 * Screen timezone for API date filters and analytics.
 * DB stores UTC instants; civil dates (invoice_date) follow the user's calendar.
 */

/** IANA timezone from the browser (e.g. Asia/Kolkata). */
export function screenTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Local calendar today YYYY-MM-DD in the screen timezone. */
export function todayYmdInScreenZone() {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: screenTimeZone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

/**
 * Merge timezone into API query params (unless already set).
 * @param {Record<string, unknown>} [params]
 * @returns {Record<string, string>}
 */
export function withScreenTimezone(params = {}) {
  const out = { ...params };
  const hasTz =
    out.timezone != null && String(out.timezone).trim() !== "" ||
    out.tz != null && String(out.tz).trim() !== "";
  if (!hasTz) {
    out.timezone = screenTimeZone();
  }
  return Object.fromEntries(
    Object.entries(out)
      .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
      .map(([k, v]) => [k, String(v)])
  );
}
