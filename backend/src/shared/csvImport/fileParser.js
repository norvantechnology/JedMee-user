const XLSX = require("xlsx");

/** Minimal RFC4180-style CSV parser. */
function parseCsvText(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuote = false;
  const s = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuote) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuote = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuote = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (c === "\r") continue;
    field += c;
  }
  row.push(field);
  if (row.some((x) => String(x).length > 0)) rows.push(row);
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => String(h ?? "").trim());
  const data = [];
  for (let r = 1; r < rows.length; r += 1) {
    const line = rows[r];
    const obj = {};
    let any = false;
    for (let c = 0; c < headers.length; c += 1) {
      const key = headers[c] || `col_${c}`;
      const val = line[c] != null ? line[c] : "";
      if (String(val).trim() !== "") any = true;
      obj[key] = val;
    }
    if (any) data.push(obj);
  }
  return { headers, rows: data };
}

function parseXlsxBuffer(buf) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const name = wb.SheetNames[0];
  if (!name) return { headers: [], rows: [] };
  const sheet = wb.Sheets[name];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  if (!aoa.length) return { headers: [], rows: [] };
  const headers = (aoa[0] || []).map((h) => String(h ?? "").trim());
  const data = [];
  for (let r = 1; r < aoa.length; r += 1) {
    const line = aoa[r] || [];
    const obj = {};
    let any = false;
    for (let c = 0; c < headers.length; c += 1) {
      const key = headers[c] || `col_${c}`;
      const val = line[c] != null ? line[c] : "";
      if (String(val).trim() !== "") any = true;
      obj[key] = val;
    }
    if (any) data.push(obj);
  }
  return { headers, rows: data };
}

function parseImportFile(buffer, filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return parseXlsxBuffer(buffer);
  }
  const text = buffer.toString("utf8");
  return parseCsvText(text);
}

module.exports = { parseCsvText, parseXlsxBuffer, parseImportFile };
