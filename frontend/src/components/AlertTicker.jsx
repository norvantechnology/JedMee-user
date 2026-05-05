import { useEffect, useMemo, useRef, useState } from "react";
import { getDashboardAlerts } from "../services/dashboardService.js";
import { IconAlert } from "./ui/AppIcons.jsx";
import CommonLoading from "./CommonLoading.jsx";
import "./AlertTicker.css";

/**
 * AlertTicker
 *
 * Compact marquee that shows non-moving batches.
 * Mirrors the bottom-strip in the legacy KMS retail software (Image 16) so
 * counter staff are continuously aware of what to push and what is about to
 * expire. Polls `/dashboard/alerts` every 30 minutes by default.
 *
 * Props
 * - className?: string                 extra classes on the outer container.
 * - pollMs?: number = 1800000          refresh interval in ms.
 * - maxItems?: number = 25             visible items per row before truncation.
 * - dense?: boolean = false            half-height variant for billing screen.
 * - onClickItem?: (item, kind) => void  optional row-level click hook.
 */
export default function AlertTicker({ className = "", pollMs = 30 * 60 * 1000, maxItems = 25, dense = false, onClickItem }) {
  const [data, setData] = useState({ nonMoving: [], visibility: { nonMoving: true } });
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    let timer = null;
    async function load() {
      setBusy(true);
      try {
        const r = await getDashboardAlerts();
        if (!aliveRef.current) return;
        if (r.status >= 200 && r.status < 300 && r.json?.ok) {
          const d = r.json?.data || {};
          setData({
            nonMoving: Array.isArray(d.nonMoving) ? d.nonMoving : [],
            visibility: d.visibility || { nonMoving: true }
          });
        }
      } finally {
        if (aliveRef.current) setBusy(false);
      }
    }
    load();
    timer = setInterval(load, Math.max(60000, Number(pollMs) || 1800000));
    return () => {
      aliveRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, [pollMs]);

  const rows = useMemo(() => {
    const out = [];
    if (data.visibility?.nonMoving !== false && (data.nonMoving || []).length > 0) {
      out.push({ kind: "nonMoving", title: "Non‑moving items", items: (data.nonMoving || []).slice(0, maxItems) });
    }
    return out;
  }, [data, maxItems]);

  if (!rows.length && !busy) return null;

  return (
    <div className={`alertTicker${dense ? " alertTicker_dense" : ""} ${className}`} aria-live="polite">
      {busy && rows.length === 0 ? (
        <div className="alertTickerRow alertTickerRow_loading">
          <CommonLoading variant="inline" text="Loading alerts…" />
        </div>
      ) : null}
      {rows.map((row) => (
        <div key={row.kind} className={`alertTickerRow alertTickerRow_${row.kind}`}>
          <span className={`alertTickerLabel${dense ? " alertTickerLabel_pin" : ""}`}>
            {dense ? (
              <span className="alertTickerPinDot" aria-hidden="true" />
            ) : (
              <span className="alertTickerIcon" aria-hidden="true">
                <IconAlert />
              </span>
            )}
            {row.title}
          </span>
          <div className={dense ? "alertTickerDenseItems" : "alertTickerScrollOuter"}>
            <div className={dense ? "alertTickerDenseInner" : "alertTickerScrollInner"}>
              {(dense ? row.items : [...row.items, ...row.items]).map((it, dupIdx) => {
                const stock = Number(it.current_stock || 0) + Number(it.loose_stock || 0);
                const meta = `${stock}`;
                return (
                  <button
                    key={`${row.kind}-${it.batch_id}-${dupIdx}`}
                    type="button"
                    className={`alertTickerItem${dense ? " alertTickerItem_dense" : ""}`}
                    title={`${it.product_name || ""} · ${it.batch_no || ""} · ${meta}`}
                    onClick={() => onClickItem && onClickItem(it, row.kind)}
                  >
                    <span className="alertTickerItemName">{it.product_name || it.product_code || "Item"}</span>
                    <span className="alertTickerItemQty">[{meta}]</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
