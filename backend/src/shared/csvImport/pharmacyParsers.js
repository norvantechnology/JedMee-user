const GST_SLABS = new Set([0, 5, 12, 18, 28]);

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
 * Parse pharmacy-style dates to ISO date string YYYY-MM-DD (expiry month = last day optional;
 * we use first day of month for MM/YYYY as DB date).
 */
function parsePharmacyDateToYmd(dateStr) {
  if (dateStr === null || dateStr === undefined || dateStr === "") return null;
  if (typeof dateStr === "number" && Number.isFinite(dateStr) && dateStr > 20000 && dateStr < 60000) {
    const d = excelSerialToDate(dateStr);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const str = String(dateStr).trim();
  if (!str) return null;

  const formats = [
    [/^(\d{1,2})\/(\d{4})$/, (m) => new Date(Date.UTC(parseInt(m[2], 10), parseInt(m[1], 10) - 1, 1))],
    [/^(\d{1,2})\/(\d{2})$/, (m) => new Date(Date.UTC(2000 + parseInt(m[2], 10), parseInt(m[1], 10) - 1, 1))],
    [/^(\d{1,2})-(\d{4})$/, (m) => new Date(Date.UTC(parseInt(m[2], 10), parseInt(m[1], 10) - 1, 1))],
    [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      (m) => new Date(Date.UTC(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10)))
    ],
    [/^(\d{4})-(\d{2})-(\d{2})$/, (m) => new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)))],
    [
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
      (m) => new Date(Date.UTC(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10)))
    ],
    [/^(\d{2})(\d{4})$/, (m) => new Date(Date.UTC(parseInt(m[2], 10), parseInt(m[1], 10) - 1, 1))]
  ];

  for (const [regex, parse] of formats) {
    const match = str.match(regex);
    if (match) {
      try {
        const date = parse(match);
        if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
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
