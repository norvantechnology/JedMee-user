import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Tooltip anchored to an icon control, rendered on document.body so it is not clipped by
 * overflow:auto scroll regions or covered by sticky table headers/footers.
 */
export function IconPortalTooltip({ anchorRef, text, visible }) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!visible || !text) {
      setPos(null);
      return undefined;
    }
    const el = anchorRef?.current;
    if (!el || typeof window === "undefined") return undefined;

    function measure() {
      const r = el.getBoundingClientRect();
      setPos({ left: r.left + r.width / 2, top: r.top - 8 });
    }

    measure();

    const scrollOpts = { capture: true };
    window.addEventListener("scroll", measure, scrollOpts);
    window.addEventListener("resize", measure);
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => measure());
      ro.observe(el);
    }

    return () => {
      window.removeEventListener("scroll", measure, scrollOpts);
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [visible, text, anchorRef]);

  if (!visible || !text || pos == null || typeof document === "undefined") return null;

  return createPortal(
    <span className="xibTip xibTip_float" role="tooltip" style={{ left: pos.left, top: pos.top }}>
      {text}
    </span>,
    document.body
  );
}
