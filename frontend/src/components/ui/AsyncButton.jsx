import AppButton from "./AppButton.jsx";
import InlineButtonProgress from "./InlineButtonProgress.jsx";

/**
 * AsyncButton - standard loading state for `AppButton`.
 * When `loading` is true, shows `InlineButtonProgress` (spinner + label).
 * Pass `loadingText` for a different label while busy; if omitted and `children`
 * is a string, that string is reused as the busy label (icon-only spinner if not).
 */
export default function AsyncButton({
  loading = false,
  loadingText,
  disabled = false,
  children,
  ...rest
}) {
  const busyLabel =
    loadingText ??
    (typeof children === "string" || typeof children === "number" ? String(children) : "");

  return (
    <AppButton
      disabled={disabled || loading}
      aria-busy={loading ? "true" : "false"}
      {...rest}
    >
      {loading ? <InlineButtonProgress label={busyLabel} /> : children}
    </AppButton>
  );
}

