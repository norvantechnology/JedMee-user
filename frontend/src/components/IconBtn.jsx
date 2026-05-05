import { useRef, useState } from "react";
import { IconPortalTooltip } from "./IconPortalTooltip.jsx";
import "./IconBtn.css";

/**
 * Icon-only button with hover / focus tooltip (string).
 * @param {{ onClick?: () => void, tooltip: string, variant?: "default"|"danger"|"success"|"blue"|"amber"|"violet", disabled?: boolean, children: React.ReactNode, ariaLabel?: string, className?: string, type?: "button"|"submit" }} p
 */
export function IconBtn({ onClick, tooltip, variant = "default", disabled = false, children, ariaLabel, className = "", type = "button" }) {
  const vClass = variant && variant !== "default" ? `xib_${String(variant)}` : "";
  const btnRef = useRef(null);
  const [tipOpen, setTipOpen] = useState(false);
  const showTip = Boolean(tooltip) && tipOpen && !disabled;

  return (
    <>
      <button
        ref={btnRef}
        type={type}
        className={["xib", vClass, className].filter(Boolean).join(" ")}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel != null && ariaLabel !== "" ? ariaLabel : tooltip}
        onMouseEnter={() => !disabled && setTipOpen(true)}
        onMouseLeave={() => setTipOpen(false)}
        onFocus={() => !disabled && setTipOpen(true)}
        onBlur={() => setTipOpen(false)}
      >
        {children}
      </button>
      <IconPortalTooltip anchorRef={btnRef} text={tooltip} visible={showTip} />
    </>
  );
}

export default IconBtn;
