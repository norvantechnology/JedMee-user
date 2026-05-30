import BarcodeDisplay from "./BarcodeDisplay.jsx";
import { printBarcodeLabel } from "../utils/printBarcodeLabel.js";
import { IconPrint } from "./ui/AppIcons.jsx";

/**
 * Prominent scannable barcode block for view modals (batch detail).
 */
export default function BarcodeLabelSection({
  value,
  productName,
  batchNo,
  prominent = false,
  className = "",
}) {
  const text = String(value || "").trim();
  if (!text) {
    return (
      <div className={`barcodeLabelSection barcodeLabelSection_empty ${className}`.trim()}>
        <p className="barcodeLabelSection_emptyText">
          No barcode set. Edit this batch to add a barcode for scanning.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`barcodeLabelSection${prominent ? " barcodeLabelSection_prominent" : ""} ${className}`.trim()}
      aria-label={`Barcode ${text}`}
    >
      <div className="barcodeLabelSection_head">Scan barcode</div>
      <BarcodeDisplay value={text} height={prominent ? 72 : 56} className="barcodeLabelSection_code" />
      <button
        type="button"
        className="btn btnSecondary barcodeLabelSection_print"
        onClick={() =>
          printBarcodeLabel({
            value: text,
            productName: productName || undefined,
            batchNo: batchNo || undefined,
          })
        }
      >
        <IconPrint />
        Print barcode
      </button>
    </div>
  );
}
