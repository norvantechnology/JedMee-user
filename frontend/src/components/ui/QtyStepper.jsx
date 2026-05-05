import { useEffect, useMemo, useState } from "react";
import "./QtyStepper.css";

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export default function QtyStepper({
  value,
  min = 1,
  max = null,
  step = 1,
  disabled = false,
  size = "md", // "sm" | "md"
  onChange
}) {
  const safeMin = useMemo(() => Math.max(0, Math.floor(n(min) || 0)), [min]);
  const safeStep = useMemo(() => Math.max(1, Math.floor(n(step) || 1)), [step]);
  const safeMax = useMemo(() => {
    const m = max == null || max === "" ? null : Math.floor(n(max));
    return m != null && m > 0 ? m : null;
  }, [max]);

  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => {
    setDraft(String(value ?? ""));
  }, [value]);

  const cur = useMemo(() => Math.floor(n(draft)), [draft]);
  const decDisabled = disabled || cur <= safeMin;
  const incDisabled = disabled || (safeMax != null && cur >= safeMax);

  function clamp(next) {
    let v = Math.floor(n(next));
    if (v < safeMin) v = safeMin;
    if (safeMax != null && v > safeMax) v = safeMax;
    return v;
  }

  function commit(next) {
    const v = clamp(next);
    setDraft(String(v));
    onChange?.(v);
  }

  return (
    <div className={`qst qst_${size} ${disabled ? "qst_dis" : ""}`.trim()}>
      <button type="button" className="qstBtn" onClick={() => commit(cur - safeStep)} disabled={decDisabled} aria-label="Decrease quantity">
        −
      </button>
      <input
        className="qstInput"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        disabled={disabled}
        aria-label="Quantity"
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={() => commit(draft === "" ? safeMin : draft)}
      />
      <button type="button" className="qstBtn" onClick={() => commit(cur + safeStep)} disabled={incDisabled} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}

