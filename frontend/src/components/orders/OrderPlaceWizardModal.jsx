import { fmtMoney, fmtCurrency } from "../../utils/format.js";
import { AppButton, AsyncButton } from "../ui/buttons.jsx";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../context/LocaleContext.jsx";
import CommonModal from "../CommonModal.jsx";
import ConfirmDialog from "../ConfirmDialog.jsx";
import ModalFooterShell from "../ui/ModalFooterShell.jsx";
import { IconChevronRight, IconPlaceOrder } from "../ui/AppIcons.jsx";
import { emitToast } from "../../services/toastBus.js";
import { parseApiError } from "../../utils/api.js";
import "./OrderPlaceWizardModal.css";

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function clean(v) {
  return String(v ?? "").trim();
}

function rowMinMax(row) {
  const min = Math.max(1, Number(row?.min_order_qty || 1) || 1);
  const rawMax = row?.max_order_qty == null ? null : Number(row?.max_order_qty || 0);
  const max = rawMax != null && rawMax > 0 ? rawMax : null;
  return { min, max };
}

function calcLine(row, qty) {
  const unitPrice = round2(n(row?.catalog_price || 0));
  const discountPercent = n(row?.retailer_discount_percent || 0);
  const gstPercent = n(row?.sales_gst || 0);
  const q = Math.max(0, n(qty || 0));

  const grossAmount = round2(unitPrice * q);
  const discountAmount = round2((grossAmount * discountPercent) / 100);
  const taxableAmount = round2(grossAmount - discountAmount);
  const gstAmount = round2((taxableAmount * gstPercent) / 100);
  const total = round2(taxableAmount + gstAmount);

  return { unitPrice, discountPercent, gstPercent, qty: q, grossAmount, discountAmount, taxableAmount, gstAmount, total };
}

/** One-line hints under product name (saves vertical space on mobile & laptop). */
function cartMetaSummaryLine(ln, c) {
  const parts = [];
  if (ln.row.product_code) parts.push(String(ln.row.product_code));
  if (ln.row.packing) parts.push(`${ln.row.packing} pack`);
  parts.push(`${fmtCurrency(c.unitPrice)}/unit`);
  if (ln.min && ln.max != null) parts.push(`Qty ${ln.min}–${ln.max}`);
  else if (ln.min) parts.push(`Min ${ln.min}`);
  else if (ln.max != null) parts.push(`Max ${ln.max}`);
  return parts.join(" · ");
}

export default function OrderPlaceWizardModal({
  open,
  onClose,
  mode = "cart", // "single" | "cart"
  singleRow,
  wholesalerAccountId,
  wholesalerName,
  cartItems,
  onAddToCart,
  onOpenCart,
  onPlaceOrder
}) {
  const [step, setStep] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState([]);
  const [notes, setNotes] = useState("");

  const safeWholesalerAccountId = useMemo(() => clean(wholesalerAccountId), [wholesalerAccountId]);
  const safeWholesalerName = useMemo(() => clean(wholesalerName), [wholesalerName]);

  const normalized = useMemo(() => {
    const src = mode === "single" ? [{ row: singleRow, qty: undefined }] : (Array.isArray(cartItems) ? cartItems : []);
    const out = [];
    for (const it of src) {
      const row = it?.row || it;
      if (!row?.id) continue;
      const { min, max } = rowMinMax(row);
      const qty = Math.max(min, Number(it?.qty ?? min) || min);
      const ok = qty >= min && (!max || qty <= max);
      out.push({ row, qty, min, max, ok });
    }
    return out;
  }, [cartItems, mode, singleRow]);

  const { taxLabel } = useLocale();
  const totals = useMemo(() => {
    const t = { gross: 0, discount: 0, gst: 0, total: 0 };
    for (const ln of lines) {
      const c = calcLine(ln.row, ln.qty);
      t.gross += c.grossAmount;
      t.discount += c.discountAmount;
      t.gst += c.gstAmount;
      t.total += c.total;
    }
    return {
      gross: round2(t.gross),
      discount: round2(t.discount),
      gst: round2(t.gst),
      total: round2(t.total)
    };
  }, [lines]);

  const qtyOk = useMemo(() => lines.length > 0 && lines.every((ln) => ln.ok && ln.qty > 0), [lines]);

  function reset() {
    setStep(1);
    setConfirmOpen(false);
    setBusy(false);
    setLines([]);
    setNotes("");
  }

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setConfirmOpen(false);
    setBusy(false);
    setNotes("");
    setLines(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, normalized.length]);

  async function doPlaceOrder() {
    if (!safeWholesalerAccountId) return;
    if (!qtyOk) {
      emitToast({ type: "error", message: "Please enter valid quantities for all selected products." });
      return;
    }
    setBusy(true);
    try {
      const items = lines.map((ln) => ({ catalog_id: ln.row.id, qty: n(ln.qty) })).filter((x) => x.catalog_id && x.qty > 0);
      if (!items.length) {
        emitToast({ type: "error", message: "Please add at least one product to cart." });
        return;
      }
      const payload = {
        wholesaler_account_id: safeWholesalerAccountId,
        items,
        retailer_notes: notes ? notes : null,
      };
      const r = await onPlaceOrder?.(payload);
      if (r?.status >= 200 && r?.status < 300 && r?.json?.ok) {
        setConfirmOpen(false);
        reset();
        onClose?.();
        emitToast({ type: "success", message: "Order placed successfully." });
        return;
      }
      emitToast({ type: "error", message: parseApiError(r) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <CommonModal
        open={open}
        ariaLabel="order-place-wizard"
        onClose={() => {
          if (busy) return;
          reset();
          onClose?.();
        }}
        title="Place Order"
        size="lg"
        footer={
          <ModalFooterShell variant="appActions">
            <AppButton variant="secondary" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </AppButton>

            {step === 1 ? (
              <>
                <AsyncButton
                  variant="primary"
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={busy || !qtyOk}
                  icon={<IconChevronRight />}
                  loading={busy}
                  loadingText="Working..."
                >
                  {mode === "cart" ? "Checkout" : "Next"}
                </AsyncButton>
              </>
            ) : (
              <>
                <AppButton variant="secondary" type="button" onClick={() => setStep(1)} disabled={busy}>
                  Back
                </AppButton>
                <AsyncButton
                  variant="primary"
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={busy || !qtyOk}
                  icon={<IconPlaceOrder />}
                  loading={busy}
                  loadingText="Working..."
                >
                  Place Order
                </AsyncButton>
              </>
            )}
          </ModalFooterShell>
        }
      >
        <div className="cmpOrderWizard">

          {/* ── Step progress (no instructional subtitle — saves vertical space) ── */}
          <div className="cmpOrderStepRow">
            <div className="cmpOrderStepMeta">Step {step} of 2</div>
            <div className="cmpOrderStepBar" role="tablist" aria-label="Place order steps">
              <button
                type="button"
                className={`cmpOrderStepPill ${step === 1 ? "isActive" : step > 1 ? "isDone" : ""}`}
                onClick={() => setStep(1)}
                aria-selected={step === 1}
              >
                <span className="cmpStepNum">1</span>
                <span className="cmpStepLabel">Quantity</span>
              </button>
              <button
                type="button"
                className={`cmpOrderStepPill ${step === 2 ? "isActive" : ""} ${!qtyOk ? "isDisabled" : ""}`}
                onClick={() => qtyOk && setStep(2)}
                aria-selected={step === 2}
                disabled={!qtyOk}
                title={!qtyOk ? "Enter a valid quantity first" : "Go to summary"}
              >
                <span className="cmpStepNum">2</span>
                <span className="cmpStepLabel">Summary</span>
              </button>
            </div>
          </div>

          {/* ── Minimal context (muted one-liner; totals stay in sidebar / step 2) ── */}
          <p className="cmpOrderContextMuted">
            {step === 2 ? <span className="cmpOrderContextTag">Summary</span> : null}
            {step === 2 ? <span className="cmpOrderContextSep"> · </span> : null}
            <span>Cart ({lines.length})</span>
            {safeWholesalerName ? (
              <>
                <span className="cmpOrderContextSep"> · </span>
                <span>
                  Wholesaler · {safeWholesalerName}
                </span>
              </>
            ) : null}
          </p>

          {/* ── Step 1: Items + Notes ── */}
          {step === 1 && (
            <div className="cmpOrderStep1">
              <div className="cmpOrderFieldGroup">
                <div className="cmpOrderQtyBlock" style={{ width: "100%" }}>
                  <label className="cmpOrderFieldLabel">{mode === "single" ? "Order quantity" : "Selected products"}</label>
                  <div className="cmpOrderCartList">
                    {lines.length ? (
                      lines.map((ln) => {
                        const c = calcLine(ln.row, ln.qty);
                        const showLineTotal = mode === "single" || lines.length > 1;
                        return (
                          <div key={String(ln.row.id)} className={`cmpOrderCartItem ${ln.ok ? "" : "isInvalid"}`}>
                            <div className="cmpOrderCartItemHead">
                              <div className="cmpOrderCartMain">
                                <div className="cmpOrderCartName">{ln.row.product_name || ""}</div>
                                <div
                                  className="cmpOrderCartMeta cmpOrderCartMetaLine"
                                  title={cartMetaSummaryLine(ln, c)}
                                >
                                  {cartMetaSummaryLine(ln, c)}
                                </div>
                              </div>
                              {mode === "cart" ? (
                                <button
                                  type="button"
                                  className="cmpOrderCartRemove"
                                  disabled={busy}
                                  onClick={() => setLines((prev) => prev.filter((x) => String(x.row.id) !== String(ln.row.id)))}
                                  aria-label="Remove from cart"
                                  title="Remove"
                                >
                                  ×
                                </button>
                              ) : null}
                            </div>
                            <div className="cmpOrderCartFoot">
                              <div className="cmpOrderCartQty">
                                <button
                                  className="cmpOrderQtyBtn"
                                  type="button"
                                  disabled={busy || ln.qty <= ln.min}
                                  onClick={() =>
                                    setLines((prev) =>
                                      prev.map((x) => {
                                        if (String(x.row.id) !== String(ln.row.id)) return x;
                                        const nextQty = Math.max(x.min, n(x.qty) - 1);
                                        return { ...x, qty: nextQty, ok: nextQty >= x.min && (!x.max || nextQty <= x.max) };
                                      })
                                    )
                                  }
                                >
                                  −
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  className="cmpOrderQtyInput"
                                  value={String(ln.qty)}
                                  onChange={(e) => {
                                    const raw = n(e.target.value.replace(/[^0-9]/g, ""));
                                    setLines((prev) =>
                                      prev.map((x) => {
                                        if (String(x.row.id) !== String(ln.row.id)) return x;
                                        const nextQty = raw;
                                        return { ...x, qty: nextQty, ok: nextQty >= x.min && (!x.max || nextQty <= x.max) };
                                      })
                                    );
                                  }}
                                />
                                <button
                                  className="cmpOrderQtyBtn"
                                  type="button"
                                  disabled={busy || (ln.max != null && ln.qty >= ln.max)}
                                  onClick={() =>
                                    setLines((prev) =>
                                      prev.map((x) => {
                                        if (String(x.row.id) !== String(ln.row.id)) return x;
                                        const nextQty = n(x.qty) + 1;
                                        return { ...x, qty: nextQty, ok: nextQty >= x.min && (!x.max || nextQty <= x.max) };
                                      })
                                    )
                                  }
                                >
                                  +
                                </button>
                              </div>
                              {showLineTotal ? <div className="cmpOrderCartTotal">{fmtCurrency(c.total)}</div> : null}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="cmpOrderEmpty">No items selected yet. Add products from the list.</div>
                    )}
                  </div>
                </div>

                {lines.length > 0 && (
                  <div className="cmpOrderLivePreview">
                    <div className="cmpOrderLivePreviewHead">Order total</div>
                    <div className="cmpOrderLiveRow">
                      <span>Subtotal</span>
                      <span>{fmtCurrency(totals.gross)}</span>
                    </div>
                    {totals.discount > 0 && (
                      <div className="cmpOrderLiveRow cmpOrderLiveDiscount">
                        <span>Discount</span>
                        <span>− {fmtCurrency(totals.discount)}</span>
                      </div>
                    )}
                    {totals.gst > 0 && (
                      <div className="cmpOrderLiveRow">
                        <span>{taxLabel}</span>
                        <span>{fmtCurrency(totals.gst)}</span>
                      </div>
                    )}
                    <div className="cmpOrderLiveTotal">
                      <span>Total</span>
                      <span>{fmtCurrency(totals.total)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="cmpOrderNotesBlock">
                <label className="cmpOrderFieldLabel">
                  Notes to Wholesaler <span className="cmpOrderOptional">(optional)</span>
                </label>
                <textarea
                  className="cmpOrderNotesInput"
                  placeholder="Add any special instructions or remarks…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ── Step 2: Review summary ── */}
          {step === 2 && (
            <div className="cmpOrderStep2">
              {notes ? (
                <div className="cmpOrderNotesReadonly">
                  <div className="cmpOrderNotesReadonlyLabel">Your notes</div>
                  <div className="cmpOrderNotesReadonlyText">{notes}</div>
                </div>
              ) : null}

              <div className="cmpOrderSummaryCompact">
                <div className="cmpOrderSummaryCompactTitle">Amounts</div>
                <div className="cmpOrderSumRow">
                  <span>Subtotal</span>
                  <span>{fmtCurrency(totals.gross)}</span>
                </div>
                <div className="cmpOrderSumCaption">{lines.length} item{lines.length !== 1 ? "s" : ""}</div>
                {totals.discount > 0 ? (
                  <div className="cmpOrderSumRow cmpOrderSumRowDiscount">
                    <span>Discount</span>
                    <span>− {fmtCurrency(totals.discount)}</span>
                  </div>
                ) : null}
                {totals.gst > 0 ? (
                  <div className="cmpOrderSumRow">
                    <span>{taxLabel}</span>
                    <span>{fmtCurrency(totals.gst)}</span>
                  </div>
                ) : null}
                <div className="cmpOrderSumRow cmpOrderSumGrand">
                  <span>Total payable</span>
                  <span>{fmtCurrency(totals.total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CommonModal>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Place Order"
        message={
          lines.length === 1
            ? `Place order for "${lines[0]?.row?.product_name || "product"}" from ${safeWholesalerName || "wholesaler"}?`
            : `Place order for ${lines.length} products from ${safeWholesalerName || "wholesaler"}?`
        }
        hint={`Total payable: ${fmtCurrency(totals.total)}`}
        danger={false}
        busy={busy}
        confirmLabel="Confirm"
        cancelLabel="Back"
        onClose={() => setConfirmOpen(false)}
        onConfirm={doPlaceOrder}
      />
    </>
  );
}