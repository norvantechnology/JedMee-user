function clean(v) {
  return String(v ?? "").trim();
}

/**
 * User-friendly division label for dropdowns across the app.
 * Format: "Division Name (CODE)  Manufacturer"
 */
export function formatDivisionLabel(row) {
  const name = clean(row?.name || row?.division_name || row?.division_label);
  const code = clean(row?.code || row?.division_code);
  const mfg = clean(row?.mfg_company_name || row?.division_mfg_name || row?.mfg_short_name);

  const head = `${name || "Division"}${code ? ` (${code})` : ""}`.trim();
  return mfg ? `${head}  •  ${mfg}` : head;
}

export function toDivisionOption(row) {
  return {
    value: row?.id,
    label: formatDivisionLabel(row)
  };
}

