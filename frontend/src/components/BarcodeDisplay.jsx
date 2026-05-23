import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/**
 * Renders a scannable Code 128 barcode from batch barcode text.
 */
export default function BarcodeDisplay({ value, height = 56, className = "" }) {
  const svgRef = useRef(null);
  const text = String(value || "").trim();

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !text) return;
    try {
      JsBarcode(el, text, {
        format: "CODE128",
        displayValue: true,
        fontSize: 13,
        height: height,
        margin: 8,
        background: "#ffffff",
        lineColor: "#0f172a",
      });
    } catch {
      el.innerHTML = "";
    }
  }, [text, height]);

  if (!text) {
    return <span className="barcodeDisplayEmpty">No barcode set</span>;
  }

  return (
    <div className={`barcodeDisplay ${className}`.trim()} aria-label={`Barcode ${text}`}>
      <svg ref={svgRef} role="img" />
    </div>
  );
}
