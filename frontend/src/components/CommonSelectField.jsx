import { IconChevronRight } from "./ui/AppIcons.jsx";
import "./CommonSelectField.css";

export default function CommonSelectField({
  value,
  onChange,
  options = [],
  placeholder = "Select",
  disabled = false,
  className = "",
  onFocus,
  autoOpenOnFocus = false,
  /** Tooltip / accessibility: full label for the current value (defaults to matching option label). */
  title: titleProp
}) {
  const selectedLabel = (options || []).find((o) => String(o.value) === String(value ?? ""))?.label;
  const title = titleProp ?? (selectedLabel != null && String(selectedLabel).trim() ? String(selectedLabel) : undefined);

  return (
    <div className={`csf ${disabled ? "csf_disabled" : ""} ${className}`.trim()}>
      <select
        className="csfSelect"
        value={value ?? ""}
        disabled={disabled}
        title={title}
        aria-label={title || placeholder || "Select"}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={(e) => {
          onFocus?.(e);
          if (!autoOpenOnFocus || disabled) return;
          const el = e.currentTarget;
          requestAnimationFrame(() => {
            try {
              el.click();
            } catch {
              /* ignore */
            }
          });
        }}
      >
        <option value="">{placeholder}</option>
        {(options || []).map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <span className="csfChevron" aria-hidden="true">
        <IconChevronRight />
      </span>
    </div>
  );
}

