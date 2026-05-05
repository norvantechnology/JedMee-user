import "./CommonInlineAddButton.css";
import { IconPlus } from "./ui/AppIcons.jsx";

function sizeClass(iconSize) {
  const n = Number(iconSize);
  if (n >= 18) return "ciab_isz_18";
  if (n >= 16) return "ciab_isz_16";
  if (n >= 14) return "ciab_isz_14";
  if (n >= 12) return "ciab_isz_12";
  return "ciab_isz_14";
}

export default function CommonInlineAddButton({
  label = "Add",
  title = "Add",
  onClick,
  disabled = false,
  className = "",
  variant = "text", // "text" | "icon"
  iconSize = 14
}) {
  const isIcon = variant === "icon";
  return (
    <button
      type="button"
      className={`ciab ${isIcon ? "ciab_icon" : "ciab_text"} ${sizeClass(iconSize)} ${className}`.trim()}
      title={title}
      aria-label={title || label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="ciabIcon" aria-hidden="true">
        <IconPlus />
      </span>
      {!isIcon ? <span className="ciabLabel">{label}</span> : null}
    </button>
  );
}

