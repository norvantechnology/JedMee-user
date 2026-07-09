import { useState } from "react";
import { IconAuthEye } from "./AppIcons.jsx";
import "./PasswordInput.css";

/**
 * PasswordInput - reusable password field with show/hide eye toggle.
 *
 * Usage:
 *   <PasswordInput
 *     className="mfzInput"          // applied to the <input> element
 *     value={form.password}
 *     onChange={(e) => setField("password", e.target.value)}
 *     placeholder="Optional protection password"
 *     autoComplete="new-password"
 *   />
 */
export default function PasswordInput({
  /** CSS class(es) forwarded to the inner <input> element */
  className = "",
  /** CSS class(es) forwarded to the outer wrapper div */
  wrapClassName = "",
  value,
  onChange,
  placeholder = "",
  autoComplete = "current-password",
  disabled = false,
  id,
  name,
  ...rest
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`pwWrap${wrapClassName ? ` ${wrapClassName}` : ""}`}>
      <input
        id={id}
        name={name}
        className={`pwField${className ? ` ${className}` : ""}`}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        {...rest}
      />
      <button
        type="button"
        className="pwEye"
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
      >
        <IconAuthEye />
      </button>
    </div>
  );
}