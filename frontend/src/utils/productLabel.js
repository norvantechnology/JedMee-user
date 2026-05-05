function clean(v) {
  return String(v ?? "").trim();
}

/**
 * User-friendly product label for dropdowns across the app.
 * Format: "Product Name [CODE] - Manufacturer"
 */
export function formatProductLabel(row) {
  const name = clean(row?.name || row?.product_name || row?.productName);
  const code = clean(row?.code || row?.product_code || row?.productCode).toUpperCase();
  const manufacturer = clean(
    row?.mfg_short ||
    row?.mfg_name ||
    row?.mfg_company_name ||
    row?.manufacturer_name ||
    row?.manufacturerName
  );

  const head = `${name || "Product"}${code ? ` [${code}]` : ""}`.trim();
  return manufacturer ? `${head} - ${manufacturer}` : head;
}

export function toProductOption(row) {
  return {
    value: row?.id,
    label: formatProductLabel(row)
  };
}

