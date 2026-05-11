import { InlineButtonProgress } from "./ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
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
import PhoneInput from "./PhoneInput.jsx";
import ModalFooterShell from "./ui/ModalFooterShell.jsx";
import { IconUser } from "./ui/AppIcons.jsx";

function clean(v) {
  return String(v ?? "").trim();
}

export default function AccountUserModal({
  open,
  mode, // "create" | "edit"
  busy,
  canSubmit = true,
  roles = [],
  initialValues,
  onClose,
  onSubmit,
  drawer = true
}) {
  const isEdit = mode === "edit";
  const entityLabel = "User";

  const empty = useMemo(
    () => ({
      fullName: "",
      email: "",
      phoneCountryCode: "+91",
      phoneNumber: "",
      customRoleId: ""
    }),
    []
  );

  const [form, setForm] = useState(empty);
  const [touched, setTouched] = useState({ phoneCc: false, phone: false, name: false, email: false, role: false });
  const [submitted, setSubmitted] = useState(false);
  const overlayClosedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (overlayClosedRef.current) {
      overlayClosedRef.current = false;
      return;
    }
    const v = initialValues || {};
    setForm({
      fullName: v.fullName ?? v.full_name ?? "",
      email: v.email ?? "",
      phoneCountryCode: v.phoneCountryCode ?? v.phone_country_code ?? "+91",
      phoneNumber: v.phoneNumber ?? v.phone_number ?? "",
      customRoleId: v.customRoleId ?? v.custom_role_id ?? ""
    });
    setTouched({ phoneCc: false, phone: false, name: false, email: false, role: false });
    setSubmitted(false);
  }, [open, initialValues, empty]);

  function handleOverlayClose() {
    if (busy) return;
    overlayClosedRef.current = true;
    onClose?.();
  }

  function handleExplicitClose() {
    if (busy) return;
    overlayClosedRef.current = false;
    onClose?.();
  }

  const phoneCcOk = /^\+\d{1,4}$/.test(clean(form.phoneCountryCode));
  const phoneDigits = clean(form.phoneNumber).replace(/\D+/g, "");
  const phoneOk = /^\d{7,15}$/.test(phoneDigits);
  const nameOk = clean(form.fullName).length >= 2;
  const emailOk = isEdit ? true : Boolean(clean(form.email));
  const roleOk = Boolean(String(form.customRoleId || "").trim());

  const canSave = canSubmit && !busy && nameOk && phoneCcOk && phoneOk && emailOk && roleOk;

  return (
    <CommonModal
      open={open}
      title={isEdit ? `Edit ${entityLabel}` : `Add ${entityLabel}`}
      subtitle=""
      icon={<IconUser />}
      loading={busy}
      loadingText="Saving user…"
      onClose={handleExplicitClose}
      onOverlayClose={handleOverlayClose}
      size="md"
      drawer={drawer}
      footer={
        <ModalFooterShell>
          <button className="mfzBtn appBtn appBtn_secondary appBtn_md" type="button" data-cm-cancel="true" onClick={handleExplicitClose} disabled={busy}>
            Close
          </button>
          <button
            className="mfzBtn appBtn appBtn_primary appBtn_md"
            type="button"
            data-cm-primary="true"
            disabled={busy}
            onClick={async () => {
              setSubmitted(true);
              if (!canSave) return;
              await onSubmit?.({
                fullName: clean(form.fullName),
                email: clean(form.email),
                phoneCountryCode: clean(form.phoneCountryCode),
                phoneNumber: phoneDigits,
                customRoleId: String(form.customRoleId || "")
              });
            }}
          >
            {busy ? (
              <InlineButtonProgress label="Saving…" />
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Create user"
            )}
          </button>
        </ModalFooterShell>
      }
    >
      <ModalFormShell>
        <ModalFormBody>
          <ModalFormPanel aria-label="Profile">
            <ModalFormPanelHead>
              <ModalFormSectionTitle kicker="Profile" />
            </ModalFormPanelHead>
            <ModalFormPanelBody>
              <ModalFormGrid>
                <ModalFormField span={12} label="Full name" required error={submitted && !nameOk ? "Full name is required (min 2 characters)." : null}>
                  <input
                    className={`mfzInput${submitted && !nameOk ? " mfzInput_err" : ""}`}
                    value={form.fullName}
                    onChange={(e) => {
                      setTouched((t) => ({ ...t, name: true }));
                      setForm((p) => ({ ...p, fullName: e.target.value }));
                    }}
                    placeholder="e.g., Aman Sharma"
                    autoComplete="name"
                  />
                </ModalFormField>

                <ModalFormField span={12} label="Email" required={!isEdit} error={submitted && !emailOk ? "Email is required." : null}>
                  <input
                    className={`mfzInput${submitted && !emailOk ? " mfzInput_err" : ""}`}
                    value={form.email}
                    disabled={isEdit}
                    onChange={(e) => {
                      setTouched((t) => ({ ...t, email: true }));
                      setForm((p) => ({ ...p, email: e.target.value }));
                    }}
                    placeholder="e.g., aman@company.com"
                    autoComplete="email"
                  />
                </ModalFormField>

                <ModalFormField span={12} label="Phone" required>
                  <PhoneInput
                    compact
                    phonePlaceholder="7–15 digits"
                    countryCode={form.phoneCountryCode}
                    phoneNumber={form.phoneNumber}
                    onCountryCodeChange={(v) => {
                      setTouched((t) => ({ ...t, phoneCc: true }));
                      setForm((p) => ({ ...p, phoneCountryCode: v }));
                    }}
                    onPhoneNumberChange={(v) => {
                      setTouched((t) => ({ ...t, phone: true }));
                      setForm((p) => ({ ...p, phoneNumber: v }));
                    }}
                    countryCodeError={
                      submitted && !phoneCcOk ? "Use format like +91" : !touched.phoneCc ? "" : phoneCcOk ? "" : "Use format like +91"
                    }
                    phoneNumberError={
                      submitted && !phoneOk ? "Enter 7–15 digits" : !touched.phone ? "" : phoneOk ? "" : "Enter 7–15 digits"
                    }
                  />
                </ModalFormField>
              </ModalFormGrid>
            </ModalFormPanelBody>
          </ModalFormPanel>

          <ModalFormPanel aria-label="Access">
            <ModalFormPanelHead>
              <ModalFormSectionTitle kicker="Access" />
            </ModalFormPanelHead>
            <ModalFormPanelBody>
              <ModalFormGrid>
                <ModalFormField span={12} label="Role" required error={submitted && !roleOk ? "Role is required." : null}>
                  <select
                    className={`mfzInput${submitted && !roleOk ? " mfzInput_err" : ""}`}
                    value={form.customRoleId}
                    onChange={(e) => {
                      setTouched((t) => ({ ...t, role: true }));
                      setForm((p) => ({ ...p, customRoleId: e.target.value }));
                    }}
                  >
                    <option value="" disabled>
                      Select a role
                    </option>
                    {(roles || []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </ModalFormField>
              </ModalFormGrid>
            </ModalFormPanelBody>
          </ModalFormPanel>
        </ModalFormBody>
      </ModalFormShell>
    </CommonModal>
  );
}
