import { useEffect, useState } from "react";
import CommonModal, {
  ModalFormBody,
  ModalFormField,
  ModalFormGrid,
  ModalFormPanel,
  ModalFormPanelBody,
  ModalFormPanelHead,
  ModalFormSectionTitle,
  ModalFormShell
} from "./CommonModal.jsx";
import { AppButton, InlineButtonProgress } from "./ui/buttons.jsx";
import ModalFooterShell from "./ui/ModalFooterShell.jsx";
import { IconEmail } from "./TableActionKit.jsx";
import PhoneInput from "./PhoneInput.jsx";

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
  useEffect(() => {
    if (!open) setSubmitted(false);
  }, [open]);

  return (
    <CommonModal
      open={open}
      title={title}
      icon={icon}
      loading={saving}
      loadingText="Saving contact…"
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
      <ModalFormShell>
        <ModalFormBody>
          <ModalFormPanel aria-label="Contact">
            <ModalFormPanelHead>
              <ModalFormSectionTitle kicker="Contact" />
            </ModalFormPanelHead>
            <ModalFormPanelBody>
              {partySubtitle ? <div className="raSub" style={{ marginBottom: 10 }}>{partySubtitle}</div> : null}
              {permissionWarning ? <div className="psErr" style={{ marginBottom: 10 }}>{permissionWarning}</div> : null}
              {footerHint ? <div className="raSub" style={{ marginBottom: 10 }}>{footerHint}</div> : null}
              <ModalFormGrid>
                <ModalFormField span={12} label="Email" required error={submitted && !email ? "Email is required." : null}>
                  <input
                    className={`mfzInput${submitted && !email ? " mfzInput_err" : ""}`}
                    type="email"
                    value={email}
                    onChange={(e) => onEmailChange?.(e.target.value)}
                    placeholder="party@email.com"
                    autoComplete="email"
                  />
                </ModalFormField>
                {showPhoneFields ? (
                  <ModalFormField span={12} label="Phone">
                    <PhoneInput
                      compact
                      phonePlaceholder="7–15 digits"
                      countryCode={phoneCountryCode || "+91"}
                      phoneNumber={phone || ""}
                      onCountryCodeChange={(v) => onPhoneCountryChange?.(v)}
                      onPhoneNumberChange={(v) => onPhoneChange?.(v)}
                    />
                  </ModalFormField>
                ) : null}
              </ModalFormGrid>
            </ModalFormPanelBody>
          </ModalFormPanel>
        </ModalFormBody>
      </ModalFormShell>
    </CommonModal>
  );
}
