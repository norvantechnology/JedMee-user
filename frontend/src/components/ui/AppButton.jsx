import { forwardRef } from "react";
import "./AppButton.css";

/**
 * @typedef {'primary' | 'secondary' | 'ghost' | 'danger'} AppButtonVariant
 * @typedef {'md' | 'sm'} AppButtonSize
 */

const AppButton = forwardRef(function AppButton(
  {
    variant = "secondary",
    size = "md",
    type = "button",
    disabled = false,
    iconOnly = false,
    icon,
    trailingIcon,
    className = "",
    children,
    ...rest
  },
  ref
) {
  const v = variant;
  const s = size;
  const cls = [
    "appBtn",
    `appBtn_${v}`,
    s === "sm" ? "appBtn_sm" : "appBtn_md",
    iconOnly ? "appBtn_iconOnly" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={ref} type={type} className={cls} disabled={disabled} {...rest}>
      {icon ? (
        <span className="appBtn_leadIcon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {iconOnly ? null : <span className="appBtn_text">{children}</span>}
      {!iconOnly && trailingIcon ? (
        <span className="appBtn_trailIcon" aria-hidden="true">
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
});

export default AppButton;
