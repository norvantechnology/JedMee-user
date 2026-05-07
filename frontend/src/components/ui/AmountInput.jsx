import { useEffect, useRef, useState } from "react";
import { fmtInputAmount, parseInputAmount } from "../../utils/currency.js";
import { parseAmount } from "../../utils/amountFormat.js";

/**
 * AmountInput — controlled input that formats numbers with locale-aware comma
 * separation while typing (respects the active currency's locale).
 *
 * INR active:  1000 → "1,000" / 100000 → "1,00,000"
 * USD active:  1000 → "1,000" / 100000 → "100,000"
 *
 * The `value` prop and `onChange` callback both work with the RAW numeric string
 * (no commas), so the parent state stays clean for arithmetic / API calls.
 *
 * Usage:
 *   <AmountInput
 *     className="mfzInput"
 *     value={form.creditLimit}          // raw: "50000"
 *     onChange={(raw) => setField("creditLimit", raw)}  // raw: "50000"
 *     placeholder="e.g. 50,000"
 *   />
 */
export default function AmountInput({
  className = "",
  value,
  onChange,
  placeholder = "",
  disabled = false,
  inputMode = "decimal",
  id,
  name,
  ...rest
}) {
  // Display state holds the formatted string (with locale-aware commas).
  const [display, setDisplay] = useState(() =>
    value != null && value !== "" ? fmtInputAmount(String(value)) : ""
  );

  // Track whether the last change came from the user (to avoid cursor-jump loops).
  const userEditRef = useRef(false);

  // Sync display when the parent value changes externally (e.g. form reset).
  useEffect(() => {
    if (userEditRef.current) {
      userEditRef.current = false;
      return;
    }
    const incoming = String(value ?? "");
    // Strip grouping separators from current display to compare raw values
    const currentRaw = parseInputAmount(display);
    if (incoming !== currentRaw) {
      setDisplay(incoming !== "" ? fmtInputAmount(incoming) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e) {
    userEditRef.current = true;
    const raw = e.target.value;
    // Strip everything except digits and dot
    const stripped = raw.replace(/[^0-9.]/g, "");
    // Prevent multiple decimal points
    const parts = stripped.split(".");
    const clean =
      parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : stripped;
    const formatted = fmtInputAmount(clean);
    setDisplay(formatted);
    onChange?.(parseInputAmount(formatted));
  }

  return (
    <input
      id={id}
      name={name}
      className={className}
      type="text"
      inputMode={inputMode}
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      {...rest}
    />
  );
}