import { useEffect, useRef, useState } from "react";
import { formatIndianAmount, parseAmount, handleAmountInput } from "../../utils/amountFormat.js";

/**
 * AmountInput — controlled input that formats numbers with Indian comma separation
 * while typing (1000 → 1,000 / 100000 → 1,00,000).
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
  // Display state holds the formatted string (with commas).
  const [display, setDisplay] = useState(() =>
    value != null && value !== "" ? formatIndianAmount(String(value)) : ""
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
    const currentRaw = parseAmount(display);
    if (incoming !== currentRaw) {
      setDisplay(incoming !== "" ? formatIndianAmount(incoming) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e) {
    userEditRef.current = true;
    const formatted = handleAmountInput(e.target.value);
    setDisplay(formatted);
    onChange?.(parseAmount(formatted));
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