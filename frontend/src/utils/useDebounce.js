import { useEffect, useRef, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * inactivity. Use this to defer expensive computations (validation, API calls)
 * so they don't run on every keystroke.
 *
 * @param {*}      value  The value to debounce (any type).
 * @param {number} delay  Milliseconds to wait after the last change (default 500).
 * @returns The debounced value.
 */
export function useDebounce(value, delay = 500) {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delay]);

  return debounced;
}