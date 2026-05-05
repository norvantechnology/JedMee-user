import { useEffect, useState } from "react";
import CommonModal from "./CommonModal.jsx";
import { AppButton, InlineButtonProgress } from "./ui/buttons.jsx";
import ModalFooterShell from "./ui/ModalFooterShell.jsx";
import { IconEmail } from "./TableActionKit.jsx";

/**
 * Shared “add email (and optional phone) then retry send” dialog used for invoice / ledger emails.
 */
export default function PartyContactEmailModal({
  open,
  title = "Contact for email",
  icon = <IconEmail />,
  partySubtitle,
  email,
  phone,
  phoneCountryCode,
  onEmailChange,
  onPhoneChange,
  onPhoneCountryChange,
  showPhoneFields = true,
  canSave,
  saving,
  onClose,
  onSave,
  saveLabel = "Save & send",
  footerHint,
  permissionWarning
}) {
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { if (!open) setSubmitted(false); }, [open]);

  return (
    <CommonModal
      open={open}
      title={title}
      icon={icon}
      onClose={() => {
        if (saving) return;
        onClose?.();
      }}
      size="sm"
      footer={
        <ModalFooterShell>
          <AppButton variant="secondary" type="button" onClick={() => (saving ? null : onClose?.())} disabled={saving}>
            Close
          </AppButton>
          <AppButton variant="primary" type="button" disabled={saving} onClick={() => { setSubmitted(true); if (!canSave) return; onSave?.(); }}>
            {saving ? <InlineButtonProgress label="Saving…" /> : saveLabel}
          </AppButton>
        </ModalFooterShell>
      }
    >
      <div className="sfm">
        {partySubtitle ? <div className="raSub" style={{ marginBottom: 8 }}>{partySubtitle}</div> : null}
        {permissionWarning ? <div className="psErr">{permissionWarning}</div> : null}
        {footerHint ? <div className="raSub" style={{ marginBottom: 8 }}>{footerHint}</div> : null}
        <div className="raField">
          <label>
            Email <span className="reqMark" aria-hidden="true">*</span>
          </label>
          <input
            className={`raInput${submitted && !email ? " mfzInput_err" : ""}`}
            type="email"
            value={email}
            onChange={(e) => onEmailChange?.(e.target.value)}
            placeholder="party@email.com"
            autoComplete="email"
          />
          {submitted && !email && <div className="mfzErr">Email is required.</div>}
        </div>
        {showPhoneFields ? (
          <div className="raField">
            <label>Phone</label>
            <div className="sbmPhoneRow">
              <select
                className="raInput"
                value={phoneCountryCode || "+91"}
                onChange={(e) => onPhoneCountryChange?.(e.target.value)}
                aria-label="Phone country"
              >
                <option value="+91">+91</option>
                <option value="+1">+1</option>
                <option value="+44">+44</option>
              </select>
              <input
                className="raInput"
                type="tel"
                value={phone}
                onChange={(e) => onPhoneChange?.(e.target.value)}
                placeholder="10 digit mobile (optional for email)"
                autoComplete="tel"
              />
            </div>
          </div>
        ) : null}
      </div>
    </CommonModal>
  );
}
