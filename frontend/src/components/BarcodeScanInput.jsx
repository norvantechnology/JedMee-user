import { useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { findProductBatchByBarcode } from "../services/productBatchService.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";

/**
 * Hardware scanner (Enter) or typed barcode → lookup batch via API.
 */
export default function BarcodeScanInput({
  label = "Scan barcode",
  placeholder = "Scan or type barcode, press Enter",
  disabled = false,
  onResolved
}) {
  const inputRef = useRef(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookup() {
    const code = String(value || "").trim();
    if (!code || busy || disabled) return;
    setBusy(true);
    try {
      const res = await findProductBatchByBarcode(code);
      if (!(res.status >= 200 && res.status < 300 && res.json?.ok)) {
        emitToast({ type: "error", message: parseApiError(res) || "No product found for this barcode" });
        return;
      }
      const item = res.json?.data?.item;
      if (!item) {
        emitToast({ type: "error", message: "No product found for this barcode" });
        return;
      }
      setValue("");
      await onResolved?.(item, code);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="barcodeScanInput">
      <label className="barcodeScanInput-label">{label}</label>
      <div className="barcodeScanInput-row">
        <input
          ref={inputRef}
          className="raInput barcodeScanInput-field"
          value={value}
          disabled={disabled || busy}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              lookup();
            }
          }}
        />
        <button
          type="button"
          className="btn btnSecondary barcodeScanInput-btn"
          disabled={disabled || busy || !String(value || "").trim()}
          onClick={lookup}
        >
          <ScanLine size={16} aria-hidden />
          <span>{busy ? "…" : "Apply"}</span>
        </button>
      </div>
    </div>
  );
}
