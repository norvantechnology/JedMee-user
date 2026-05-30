import JsBarcode from "jsbarcode";

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Open a print-friendly barcode label (Code 128) in a new window.
 */
export function printBarcodeLabel({ value, productName, batchNo }) {
  const text = String(value || "").trim();
  if (!text) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, text, {
      format: "CODE128",
      displayValue: true,
      fontSize: 14,
      height: 64,
      margin: 10,
      width: 2,
      background: "#ffffff",
      lineColor: "#0f172a",
    });
  } catch {
    return;
  }

  const title = [productName, batchNo ? `Batch ${batchNo}` : ""].filter(Boolean).join(" · ");
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;

  w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Barcode label</title>
<style>
  body { font-family: system-ui, sans-serif; text-align: center; padding: 16px; margin: 0; }
  h1 { font-size: 14px; font-weight: 600; margin: 0 0 12px; color: #0f172a; }
  svg { max-width: 100%; height: auto; }
  @media print {
    @page { size: 80mm 45mm; margin: 4mm; }
    body { padding: 0; }
  }
</style></head><body>
${title ? `<h1>${escHtml(title)}</h1>` : ""}
${svg.outerHTML}
<script>window.onload = function() { window.print(); };</script>
</body></html>`);
  w.document.close();
}
