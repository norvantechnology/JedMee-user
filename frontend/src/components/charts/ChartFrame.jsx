import { useEffect, useMemo, useRef, useState } from "react";
import "./charts.css";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function fmt(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * ChartFrame
 * - Responsive SVG sizing via ResizeObserver
 * - Unified hover/click tooltip layer (no deps)
 */
export default function ChartFrame({
  height = 180,
  padding = { top: 10, right: 10, bottom: 22, left: 10 },
  title,
  subtitle,
  getTooltip, // (state) => { title, lines: [{label,value,color}], footer? } | null
  onPointerChange, // (pointer|null) => void
  children, // ({ w, h, innerW, innerH, pad, pointer }) => svg content
}) {
  const hostRef = useRef(null);
  const [w, setW] = useState(0);
  const [pointer, setPointer] = useState(null); // { x,y, ix, locked }

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries?.[0]?.contentRect;
      if (!cr) return;
      setW(Math.max(0, Math.floor(cr.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = useMemo(() => ({
    top: Number(padding?.top ?? 10),
    right: Number(padding?.right ?? 10),
    bottom: Number(padding?.bottom ?? 22),
    left: Number(padding?.left ?? 10),
  }), [padding]);

  const h = Math.max(80, Number(height || 180));
  const innerW = Math.max(10, w - pad.left - pad.right);
  const innerH = Math.max(10, h - pad.top - pad.bottom);

  const tooltip = useMemo(() => {
    if (!pointer) return null;
    return getTooltip?.(pointer) || null;
  }, [pointer, getTooltip]);

  function onMove(e) {
    const el = hostRef.current;
    if (!el) return;
    if (pointer?.locked) return;
    const r = el.getBoundingClientRect();
    const x = clamp(e.clientX - r.left, 0, r.width);
    const y = clamp(e.clientY - r.top, 0, r.height);
    const next = { ...(pointer || {}), x, y, w: r.width, h: r.height, locked: false };
    setPointer(next);
    onPointerChange?.(next);
  }

  function onLeave() {
    if (pointer?.locked) return;
    setPointer(null);
    onPointerChange?.(null);
  }

  function onClick(e) {
    const el = hostRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = clamp(e.clientX - r.left, 0, r.width);
    const y = clamp(e.clientY - r.top, 0, r.height);
    const next = { ...(pointer || {}), x, y, w: r.width, h: r.height, locked: !pointer?.locked };
    setPointer(next);
    onPointerChange?.(next);
  }

  return (
    <div
      className="chFrame"
      ref={hostRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
      role="img"
      aria-label={title ? String(title) : "Chart"}
    >
      <svg className="chSvg" width={w || 1} height={h} viewBox={`0 0 ${w || 1} ${h}`} preserveAspectRatio="none">
        <g transform={`translate(${pad.left},${pad.top})`}>
          {children?.({ w: w || 1, h, innerW, innerH, pad, pointer })}
        </g>
      </svg>

      {tooltip ? (
        <div className={`chTip ${pointer?.locked ? "isLocked" : ""}`}>
          {tooltip.title ? <div className="chTipTitle">{tooltip.title}</div> : null}
          <div className="chTipLines">
            {(tooltip.lines || []).map((ln, idx) => (
              <div key={`${ln.label || idx}`} className="chTipLine">
                <span className="chTipDot" style={{ background: ln.color || "var(--color-text-3)" }} />
                <span className="chTipLabel">{String(ln.label || "")}</span>
                <span className="chTipVal">{fmt(ln.value)}</span>
              </div>
            ))}
          </div>
          {tooltip.footer ? <div className="chTipFooter">{tooltip.footer}</div> : null}
          <div className="chTipHint">{pointer?.locked ? "Click to unlock" : "Click to lock"}</div>
        </div>
      ) : null}
    </div>
  );
}

