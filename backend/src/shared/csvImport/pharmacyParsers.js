const GST_SLABS = new Set([0, 5, 12, 18, 28]);

/** Short month name → 0-based month index (handles English abbreviations). */
const MONTH_ABBR = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

function clean(v) {
  return String(v ?? "").trim();
}

function parseBool(value, defaultValue = false) {
  if (value === null || value === undefined || value === "") return defaultValue;
  const str = value.toString().toLowerCase().trim();
  if (["true", "1", "yes", "y", "t", "on", "active"].includes(str)) return true;
  if (["false", "0", "no", "n", "f", "off", "inactive"].includes(str)) return false;
  return defaultValue;
}

/** Excel serial date (approximate, UTC). */
function excelSerialToDate(serial) {
  const utc = (serial - 25569) * 86400 * 1000;
  return new Date(utc);
}

/**
 * Parse pharmacy-style dates to ISO date string YYYY-MM-DD.
 * Supports all common formats from Marg, Busy, KMS, Tally, Excel exports:
 *   MM/YYYY, MM/YY, MM-YYYY, MM-YY
 *   DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD
 *   MMYYYY (6-digit)
 *   MMM-YY, MMM-YYYY  (e.g. Jun-29, Jun-2029)
 *   DD-MMM-YYYY, DD-MMM-YY  (e.g. 30-Jun-2029, 30-Jun-29)
 *   DD/MMM/YYYY  (e.g. 30/Jun/2029)
 *   Excel serial numbers
 */
function parsePharmacyDateToYmd(dateStr) {
  if (dateStr === null || dateStr === undefined || dateStr === "") return null;
  if (typeof dateStr === "number" && Number.isFinite(dateStr) && dateStr > 20000 && dateStr < 60000) {
    const d = excelSerialToDate(dateStr);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const str = String(dateStr).trim();
  if (!str) return null;

  // Helper: resolve 2-digit year → 4-digit (00-49 → 2000s, 50-99 → 1900s)
  const y2 = (y) => (y < 50 ? 2000 + y : 1900 + y);

  const formats = [
    // YYYY-MM-DD  (ISO)
    [/^(\d{4})-(\d{2})-(\d{2})$/, (m) => new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))],
    // YYYY/MM/DD
    [/^(\d{4})\/(\d{2})\/(\d{2})$/, (m) => new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))],
    // DD/MM/YYYY
    [/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (m) => new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))],
    // DD-MM-YYYY
    [/^(\d{1,2})-(\d{1,2})-(\d{4})$/, (m) => new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))],
    // MM/YYYY  (expiry month/year — use 1st of month)
    [/^(\d{1,2})\/(\d{4})$/, (m) => new Date(Date.UTC(+m[2], +m[1] - 1, 1))],
    // MM-YYYY
    [/^(\d{1,2})-(\d{4})$/, (m) => new Date(Date.UTC(+m[2], +m[1] - 1, 1))],
    // MM/YY
    [/^(\d{1,2})\/(\d{2})$/, (m) => new Date(Date.UTC(y2(+m[2]), +m[1] - 1, 1))],
    // MM-YY  (e.g. 06-29)
    [/^(\d{1,2})-(\d{2})$/, (m) => new Date(Date.UTC(y2(+m[2]), +m[1] - 1, 1))],
    // MMYYYY  (6-digit, e.g. 062029)
    [/^(\d{2})(\d{4})$/, (m) => new Date(Date.UTC(+m[2], +m[1] - 1, 1))],
    // DD-MMM-YYYY  (e.g. 30-Jun-2029)
    [/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/, (m) => {
      const mo = MONTH_ABBR[m[2].toLowerCase()];
      return mo !== undefined ? new Date(Date.UTC(+m[3], mo, +m[1])) : null;
    }],
    // DD-MMM-YY  (e.g. 30-Jun-29)
    [/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/, (m) => {
      const mo = MONTH_ABBR[m[2].toLowerCase()];
      return mo !== undefined ? new Date(Date.UTC(y2(+m[3]), mo, +m[1])) : null;
    }],
    // DD/MMM/YYYY  (e.g. 30/Jun/2029)
    [/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/, (m) => {
      const mo = MONTH_ABBR[m[2].toLowerCase()];
      return mo !== undefined ? new Date(Date.UTC(+m[3], mo, +m[1])) : null;
    }],
    // MMM-YYYY  (e.g. Jun-2029)
    [/^([A-Za-z]{3})-(\d{4})$/, (m) => {
      const mo = MONTH_ABBR[m[1].toLowerCase()];
      return mo !== undefined ? new Date(Date.UTC(+m[2], mo, 1)) : null;
    }],
    // MMM-YY  (e.g. Jun-29) — very common in Marg ERP exports
    [/^([A-Za-z]{3})-(\d{2})$/, (m) => {
      const mo = MONTH_ABBR[m[1].toLowerCase()];
      return mo !== undefined ? new Date(Date.UTC(y2(+m[2]), mo, 1)) : null;
    }],
    // MMM/YY  (e.g. Jun/29)
    [/^([A-Za-z]{3})\/(\d{2})$/, (m) => {
      const mo = MONTH_ABBR[m[1].toLowerCase()];
      return mo !== undefined ? new Date(Date.UTC(y2(+m[2]), mo, 1)) : null;
    }]
  ];

  for (const [regex, parse] of formats) {
    const match = str.match(regex);
    if (match) {
      try {
        const date = parse(match);
        if (date && !Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
      } catch {
        /* continue */
      }
    }
  }

  const tryNative = new Date(str);
  if (!Number.isNaN(tryNative.getTime())) return tryNative.toISOString().slice(0, 10);

  throw new Error(`Cannot parse date: "${dateStr}"`);
}

function parseGst(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (!GST_SLABS.has(i)) return null;
  return i;
}

function parseNumber(v, def = null) {
  if (v === null || v === undefined || v === "") return def;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : def;
}

module.exports = {
  clean,
  parseBool,
  parsePharmacyDateToYmd,
  parseGst,
  parseNumber,
  GST_SLABS
};
