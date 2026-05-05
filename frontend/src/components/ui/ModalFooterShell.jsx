import "./ModalFooterShell.css";

/**
 * Shared modal footer shells so layout + class names stay consistent.
 *
 * - `master`: MasterModalForm layout (`mfzFooter`, optional `mfzFooterMeta`, `mfzFooterActions`).
 *   Parent must import `MasterModalForm.css` (existing master modals already do).
 * - `appActions`: Right-aligned flex row for `AppButton` groups (catalog / order flows).
 * - `sfm`: Native structured-form footer row (`sfmModalFooter`); pair with `sfmBtnGhost` / `sfmBtnPrimary`.
 */
export default function ModalFooterShell({ variant = "master", meta = null, children }) {
  if (variant === "appActions") {
    return <div className="mfsAppActions">{children}</div>;
  }
  if (variant === "sfm") {
    return <div className="sfmModalFooter">{children}</div>;
  }
  return (
    <div className="mfzFooter">
      {meta != null && meta !== false ? <div className="mfzFooterMeta">{meta}</div> : null}
      <div className="mfzFooterActions">{children}</div>
    </div>
  );
}
