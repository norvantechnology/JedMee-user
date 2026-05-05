import CommonLoading from "../CommonLoading.jsx";
import "./InlineButtonProgress.css";

/** Consistent “spinner + optional label” inside buttons (avoids duplicated inline styles). */
export default function InlineButtonProgress({ label = "" }) {
  const text = label?.trim?.() ? label : null;
  return (
    <span className={`inlineBtnProgress${text ? "" : " inlineBtnProgress--iconOnly"}`}>
      <CommonLoading variant="button" />
      {text}
    </span>
  );
}
