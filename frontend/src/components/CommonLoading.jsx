import "./CommonLoading.css";
import { IconPill } from "./ui/AppIcons.jsx";

/**
 * Central loading primitive  3D motion language.
 *
 * Variants:
 *   - "page"   : 3D pill capsule tumbling inside an orbital ring.
 *                Use inside modals and page-level data fetches.
 *   - "inline" : 3D coin-flip disc + optional text. Default; flows with text.
 *   - "button" : 3D coin disc sized for buttons. Prefer `InlineButtonProgress`
 *                or `AsyncButton` instead of using this variant directly.
 *   - "bar"    : indeterminate progress strip (full width, height 3px).
 *   - "bars"   : 3-dot orbit on a tilted plane.
 *
 * All colors come from theme tokens  no hardcoded values.
 */
export default function CommonLoading({
  variant = "inline",
  text,
  size = "sm",
  className = ""
}) {
  const cls = (extra) => `cl ${extra} ${className}`.trim();
  const ariaText = text || "Loading";

  if (variant === "page") {
    return (
      <div className={cls("cl--page")} role="status" aria-label={ariaText} aria-live="polite">
        <div className="cl__scene3d" aria-hidden="true">
          <span className="cl__orbit" />
          <span className="cl__pill3d">
            <IconPill />
          </span>
          <span className="cl__floor" />
        </div>
        {text ? <span className="cl__label">{text}</span> : null}
      </div>
    );
  }

  if (variant === "button") {
    return <span className={`cl__btnSpin ${className}`.trim()} aria-hidden="true" />;
  }

  if (variant === "bar") {
    return (
      <span
        className={cls("cl--bar")}
        role="status"
        aria-label={ariaText}
      />
    );
  }

  if (variant === "bars") {
    return (
      <span
        className={cls("cl--bars")}
        role="status"
        aria-label={ariaText}
      >
        <span />
        <span />
        <span />
      </span>
    );
  }

  // inline (default)
  const sizeCls = size === "md" ? "cl__inlineSpin_md" : "cl__inlineSpin_sm";
  return (
    <span className={cls("cl--inline")} role="status" aria-live="polite">
      <span className={`cl__inlineSpin ${sizeCls}`} aria-hidden="true" />
      {text ? <span className="cl__inlineText">{text}</span> : null}
    </span>
  );
}

/**
 * Skeleton building block used by tables/lists. Always render via this helper
 * (or the `.cl__skel` class) so the shimmer animation stays identical everywhere.
 */
export function SkeletonLine({
  width = "100%",
  height = 12,
  radius = 999,
  className = "",
  style
}) {
  const w = typeof width === "number" ? `${width}px` : String(width);
  const h = typeof height === "number" ? `${height}px` : String(height);
  const r = typeof radius === "number" ? `${radius}px` : String(radius);
  return (
    <span
      className={`cl__skel ${className}`.trim()}
      style={{ width: w, height: h, borderRadius: r, ...(style || {}) }}
      aria-hidden="true"
    />
  );
}
