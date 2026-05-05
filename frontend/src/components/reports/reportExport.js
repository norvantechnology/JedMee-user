/** Build a CSV string with UTF-8 BOM for Excel-friendly open. */
export function buildCsvString(columns, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => esc(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => esc(typeof c.value === "function" ? c.value(row) : row[c.key])).join(",")
  );
  return `\uFEFF${[header, ...lines].join("\n")}`;
}

export function downloadCsvFile(filename, columns, rows) {
  const csv = buildCsvString(columns, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
