import { useEffect, useRef } from "react";
import { clean } from "./format.js";

/** True when the editor is creating or editing a DRAFT invoice (not confirmed). */
export function isDraftInvoiceEdit(editing) {
  if (!editing?.id) return true;
  return String(editing.status || "").toUpperCase() === "DRAFT";
}

/** Sales: at least one line with product, batch, and qty ready for API save. */
export function salesItemsReadyForAutoSave(items) {
  return (items || []).filter(
    (it) =>
      clean(it.productId) &&
      clean(it.batchId) &&
      Number(it.qty || 0) >= 1
  );
}

/** Purchase: lines that meet minimum backend requirements (incomplete rows skipped). */
export function purchaseItemsReadyForAutoSave(items) {
  return (items || []).filter((it) => {
    if (!clean(it.productId)) return false;
    if (!clean(it.batchId) && !Boolean(it.isNewBatch)) return false;
    if (!(Number(it.qty || 0) > 0)) return false;
    if (Boolean(it.isNewBatch) && !clean(it.batchNo)) return false;
    if (!(Number(it.purchaseRate || 0) > 0)) return false;
    if (!(Number(it.mrp || 0) > 0)) return false;
    return true;
  });
}

/**
 * Debounced silent auto-save for sales / purchase draft editors.
 *
 * @param {object} opts
 * @param {boolean} opts.enabled       Editor open and draft-eligible
 * @param {boolean} opts.ready         Minimum fields/lines present for save
 * @param {boolean} opts.loading       Skip while modal/screen is loading data
 * @param {*}       opts.watchValue    Form snapshot - typically JSON.stringify(form)
 * @param {() => Promise<void>} opts.onSave  Silent save callback
 * @param {number}  [opts.delay=800]    Debounce ms
 */
export function useDraftAutoSave({
  enabled,
  ready,
  loading,
  watchValue,
  onSave,
  delay = 800,
}) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const timerRef = useRef(null);
  const skipNextRef = useRef(true);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    const wasEnabled = enabledRef.current;
    enabledRef.current = enabled;
    if (wasEnabled && !enabled && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      void onSaveRef.current?.();
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      skipNextRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    if (loading || !ready) return;

    // Skip the first stable tick after open/load so we don't re-save fetched data.
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void onSaveRef.current?.();
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, ready, loading, watchValue, delay]);
}
