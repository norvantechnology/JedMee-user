import { Trash2 } from "./AppIcons.jsx";
import "./LineRemoveButton.css";

export default function LineRemoveButton({
  onClick,
  disabled = false,
  title = "Remove item",
  className = "",
  size = 12
}) {
  return (
    <button
      type="button"
      className={`lineRemoveBtn ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label={title || "Remove item"}
      title={title}
    >
      <Trash2 size={size} />
    </button>
  );
}

