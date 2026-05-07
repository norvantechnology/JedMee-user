import { fmtMoney } from "../utils/format.js";
import { AppButton } from "./ui/buttons.jsx";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext.jsx";
import CommonModal from "./CommonModal.jsx";
import { BadgeIndianRupee, BarChart3, Layers, IconAlert } from "./ui/AppIcons.jsx";
import "./MasterModalForm.css";
import "./SchemeDiscountPopup.css";

/**
 * Per-line scheme + discount editor for retail billing.
 * Parent owns line state; `onApply` receives discount % and free qty.
 */
export default function SchemeDiscountPopup({ open, onClose, item, onApply, lineNumber }) {
  const { taxLabel } = useLocale();
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [freeQty, setFreeQty] = useState(0);
  const [editingDiscMode, setEditingDiscMode] = useState("percent");

  useEffect(() => {
    if (!open || !item) return;
    setDiscountPercent(Number(item.discountPercent || 0));
    setFreeQty(Number(item.freeQty || 0));
    const qty = Number(item.qty || 0);
    const rate = Number(item.salesRate || 0);
    const gross = qty * rate;
    const baseDiscPct = Number(item.discountPercent || 0);
    setDiscountAmount(Number((gross * (baseDiscPct / 100)).toFixed(2)));
    setEditingDiscMode("percent");
  }, [open, item]);

  const restrictions = useMemo(() => {
    if (!item) return {};
    return {
      discount: Boolean(item.preventDiscount || item.isNet || item.preventNetRate),
      freeQty: Boolean(item.preventFreeQty || item.isNonEditableFreeQty)
    };
  }, [item]);

  const computed = useMemo(() => {
    if (!item) return null;
    const qty = Number(item.qty || 0);
    const rate = Number(item.salesRate || 0);
    const gstPct = Number(item.gstPercent || 0);
    const isHalfScheme = Boolean(item.isHalfScheme);
    const fq = Number(freeQty || 0);
    const dp = Number(discountPercent || 0);

    const gross = qty * rate;
    const disc = gross * (dp / 100);
    const schemeHalfTaxable = isHalfScheme ? fq * rate * 0.5 : 0;
    const taxable = gross - disc + schemeHalfTaxable;
    const gst = taxable * (gstPct / 100);
    const net = taxable + gst;

    const totalUnits = qty + fq;
    const effectiveSchemePct = totalUnits > 0 ? (fq / totalUnits) * 100 : 0;
    const effectiveTotalPct = gross > 0 ? ((disc + (fq * rate - schemeHalfTaxable)) / (gross + fq * rate)) * 100 : 0;

    return {
      gross,
      disc,
      schemeHalfTaxable,
      taxable,
      gst,
      net,
      effectiveSchemePct,
      effectiveTotalPct
    };
  }, [item, freeQty, discountPercent]);

  const batchScheme = useMemo(() => {
    if (!item) return null;
    const paid = Number(item.schemeQtyPaid || 0);
    const free = Number(item.schemeQtyFree || 0);
    if (paid <= 0 || free <= 0) return null;
    return { paid, free, label: `${paid}+${free}` };
  }, [item]);

  function handlePercentChange(v) {
    const n = Number(v);
    setEditingDiscMode("percent");
    setDiscountPercent(Number.isFinite(n) ? n : 0);
    const qty = Number(item?.qty || 0);
    const rate = Number(item?.salesRate || 0);
    setDiscountAmount(Number((qty * rate * (Number.isFinite(n) ? n : 0) / 100).toFixed(2)));
  }

  function handleAmountChange(v) {
    const n = Number(v);
    setEditingDiscMode("amount");
    setDiscountAmount(Number.isFinite(n) ? n : 0);
    const qty = Number(item?.qty || 0);
    const rate = Number(item?.salesRate || 0);
    const gross = qty * rate;
    const pct = gross > 0 ? ((Number.isFinite(n) ? n : 0) / gross) * 100 : 0;
    setDiscountPercent(Number(pct.toFixed(4)));
  }

  function applyBatchScheme() {
    if (!batchScheme || !item) return;
    const qty = Number(item.qty || 0);
    if (qty < batchScheme.paid) return;
    const auto = Math.floor(qty / batchScheme.paid) * batchScheme.free;
    setFreeQty(auto);
  }

  function handleClear() {
    setDiscountPercent(0);
    setDiscountAmount(0);
    setEditingDiscMode("percent");
    if (!restrictions.freeQty) setFreeQty(0);
  }

  function handleApply() {
    onApply?.({
      discountPercent: Number(discountPercent || 0),
      freeQty: Number(freeQty || 0)
    });
    onClose?.();
  }

  if (!item || !computed) return null;

  const productLabel = [item.productName || "Item", item.batchNo ? `· ${item.batchNo}` : ""].filter(Boolean).join(" ");
  const title = lineNumber ? `Scheme & discount · Line ${lineNumber}` : "Scheme & discount";

  return (
    <CommonModal
      open={open}
      onClose={onClose}
      portal
      portalZIndex={520}
      size="md"
      title={title}
      subtitle={productLabel}
      ariaLabel="Scheme and discount editor"
      icon={<BadgeIndianRupee size={20} strokeWidth={2.2} aria-hidden="true" />}
      footer={
        <div className="sdpModalFoot">
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            className="sdpModalFootClear"
            onClick={handleClear}
            disabled={restrictions.discount && restrictions.freeQty}
          >
            Clear all
          </AppButton>
          <div className="sdpModalFootActions">
            <AppButton type="button" variant="secondary" size="md" data-cm-cancel="true" onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton type="button" variant="primary" size="md" data-cm-primary="true" onClick={handleApply}>
              Apply
            </AppButton>
          </div>
        </div>
      }
    >
      <div className="mfz sdpPage">
        <section className="sdpKpiBoard" aria-label="Line facts">
          <div className="sdpKpiHead">
            <span className="sdpKpiHeadIcon" aria-hidden="true">
              <Layers size={18} strokeWidth={2.2} />
            </span>
            <div>
              <p className="sdpKpiHeadKicker">This line</p>
              <p className="sdpKpiHeadTitle">Billing basis</p>
            </div>
          </div>
          <div className="sdpKpiTiles">
            <div className="sdpKpiTile">
              <span className="sdpKpiTileLab">Qty</span>
              <span className="sdpKpiTileVal">{Number(item.qty || 0)}</span>
            </div>
            <div className="sdpKpiTile">
              <span className="sdpKpiTileLab">Sales rate</span>
              <span className="sdpKpiTileVal">{fmtMoney(item.salesRate || 0)}</span>
            </div>
            <div className="sdpKpiTile">
              <span className="sdpKpiTileLab">MRP</span>
              <span className="sdpKpiTileVal">{fmtMoney(item.mrp || 0)}</span>
            </div>
            <div className="sdpKpiTile">
              <span className="sdpKpiTileLab">{taxLabel}</span>
              <span className="sdpKpiTileVal">{Number(item.gstPercent || 0)}%</span>
            </div>
          </div>
        </section>

        <section className="sdpSchemePanel" aria-label="Batch scheme">
          {batchScheme ? (
            <div className="sdpSchemeInner">
              <div className="sdpSchemeCopy">
                <span className="sdpSchemeIcon" aria-hidden="true">
                  <Layers size={20} strokeWidth={2.15} />
                </span>
                <div>
                  <p className="sdpSchemeKicker">Batch scheme</p>
                  <p className="sdpSchemeTitle">{batchScheme.label} (paid + free)</p>
                  <p className="sdpSchemeHint">Fills free quantity from quantity sold, using this batch rule.</p>
                </div>
              </div>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="sdpSchemeBtn"
                onClick={applyBatchScheme}
                disabled={restrictions.freeQty || Number(item.qty || 0) < batchScheme.paid}
                title={
                  Number(item.qty || 0) < batchScheme.paid ? `Sell at least ${batchScheme.paid} units to qualify.` : "Apply batch scheme to free qty"
                }
              >
                Auto-fill free qty
              </AppButton>
            </div>
          ) : (
            <p className="sdpSchemeEmpty">No scheme is configured on this batch.</p>
          )}
        </section>

        <section className="sdpAdjust" aria-label="Adjustments">
          <div className="sdpAdjustHead">
            <BarChart3 size={18} strokeWidth={2.2} aria-hidden="true" />
            <div>
              <p className="sdpAdjustKicker">Overrides</p>
              <h3 className="sdpAdjustTitle">Free units & discount</h3>
            </div>
          </div>
          <div className="mfzGrid sdpAdjustGrid">
            <div className="mfzField mfz4">
              <label htmlFor="sdp-free">Free quantity</label>
              <input
                id="sdp-free"
                className="mfzInput"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
                value={String(freeQty ?? "")}
                disabled={restrictions.freeQty}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  setFreeQty(val === "" ? 0 : Number(val));
                }}
              />
              <p className="mfzHelp">Stock movement; not billed as paid units.</p>
            </div>
            <div className="mfzField mfz4">
              <label htmlFor="sdp-pct">Discount %</label>
              <input
                id="sdp-pct"
                className="mfzInput"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                placeholder="0"
                value={String(discountPercent ?? "")}
                disabled={restrictions.discount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                  handlePercentChange(val);
                }}
              />
            </div>
            <div className="mfzField mfz4">
              <label htmlFor="sdp-amt">Discount amount</label>
              <input
                id="sdp-amt"
                className="mfzInput"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                placeholder="0"
                value={String(discountAmount ?? "")}
                disabled={restrictions.discount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                  handleAmountChange(val);
                }}
              />
            </div>
          </div>
        </section>

        <section className="sdpLedger" aria-label="Computed totals">
          <div className="sdpLedgerHead">
            <BarChart3 size={17} strokeWidth={2.15} aria-hidden="true" />
            <span>Live calculation</span>
          </div>
          <ul className="sdpLedgerList">
            <li className="sdpLedgerRow">
              <span>Gross</span>
              <strong>{fmtMoney(computed.gross)}</strong>
            </li>
            <li className="sdpLedgerRow sdpLedgerRow_muted">
              <span>Manual discount</span>
              <strong>−{fmtMoney(computed.disc)}</strong>
            </li>
            {computed.schemeHalfTaxable > 0 ? (
              <li className="sdpLedgerRow">
                <span>Half-scheme taxable add-on</span>
                <strong>+{fmtMoney(computed.schemeHalfTaxable)}</strong>
              </li>
            ) : null}
            <li className="sdpLedgerRow">
              <span>Taxable</span>
              <strong>{fmtMoney(computed.taxable)}</strong>
            </li>
            <li className="sdpLedgerRow">
              <span>{taxLabel} ({Number(item.gstPercent || 0)}%)</span>
              <strong>{fmtMoney(computed.gst)}</strong>
            </li>
            <li className="sdpLedgerRow sdpLedgerRow_net">
              <span>Net</span>
              <strong>{fmtMoney(computed.net)}</strong>
            </li>
          </ul>
          <div className="sdpLedgerMeta">
            <span>Effective free share: {computed.effectiveSchemePct.toFixed(2)}%</span>
            <span>Effective total off: {computed.effectiveTotalPct.toFixed(2)}%</span>
          </div>
        </section>

        {restrictions.discount || restrictions.freeQty ? (
          <div className="sdpLockBanner" role="status">
            <span className="sdpLockIcon" aria-hidden="true">
              <IconAlert />
            </span>
            <div className="sdpLockBody">
              {restrictions.discount ? <p>Discount is locked for this line (policy or net rate).</p> : null}
              {restrictions.freeQty ? <p>Free quantity is fixed from the batch scheme.</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </CommonModal>
  );
}
