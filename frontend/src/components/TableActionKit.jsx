import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { IconBtn } from "./IconBtn.jsx";
import { IconPortalTooltip } from "./IconPortalTooltip.jsx";
import "./IconBtn.css";

/**
 * Central place for table row actions: same `IconBtn` + `AppIcons` everywhere.
 *
 * **Recommended order (left → right):** View → Edit → (post/confirm) → Print →
 * Share / Send (email) → other row actions (e.g. payment) → Restore or undo-style
 * (e.g. return) → void/cancel (if any) → Delete (trash) last.
 */
export { IconBtn };
export * from "./ui/AppIcons.jsx";
export { inferBulkDeleteIconName, renderBulkTableIcon } from "./TableBulkActionIcons.jsx";

/** Router link styled as `IconBtn` (tooltip, icon-only) for in-table navigation. */
export function TableIconLink({ to, tooltip, children, className = "" }) {
  const linkRef = useRef(null);
  const [tipOpen, setTipOpen] = useState(false);

  return (
    <>
      <Link
        ref={linkRef}
        to={to}
        className={["xib", "xibLink", className].filter(Boolean).join(" ")}
        onClick={(e) => e.stopPropagation()}
        aria-label={tooltip}
        onMouseEnter={() => setTipOpen(true)}
        onMouseLeave={() => setTipOpen(false)}
        onFocus={() => setTipOpen(true)}
        onBlur={() => setTipOpen(false)}
      >
        {children}
      </Link>
      <IconPortalTooltip anchorRef={linkRef} text={tooltip} visible={Boolean(tooltip) && tipOpen} />
    </>
  );
}
