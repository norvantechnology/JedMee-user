import { fmtMoney, fmtCurrency } from "../utils/format.js";
import { InlineButtonProgress } from "./ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import CommonModal, {
  ModalFormBody,
  ModalFormCheckGroup,
  ModalFormField,
  ModalFormGrid,
  ModalFormPanel,
  ModalFormPanelBody,
  ModalFormPanelHead,
  ModalFormSectionTitle,
  ModalFormShell
} from "./CommonModal.jsx";
import MasterSelectWithCreate from "./MasterSelectWithCreate.jsx";
import PhoneInput, { validatePhone } from "./PhoneInput.jsx";
import { IconDivisionMark } from "./ui/AppIcons.jsx";
import ModalFooterShell from "./ui/ModalFooterShell.jsx";

function clean(v) {
  return String(v ?? "").trim();
}

const emptyDivision = {
  code: "",
  name: "",
  shortName: "",
  mfgCompanyId: "",
  creditDays: 0,
  phoneCountryCode: "+91",
  phoneNumber: "",
  email: "",
  address: "",
  notes: "",
  isActive: true
};

/**
 * Shared division add/edit modal. Used by Divisions master page AND quick-create
 * flows from purchase invoice / product forms, so field parity is guaranteed.
 */
export default function DivisionMasterModal({
  open,
  mode = "add",
  busy = false,
  loading = false,
  initialValue = null,
  mfgCompanyOptions = [],
  onRefreshMfgCompanies,
  onClose,
  onSubmit,
  portal = false,
  portalZIndex = 480,
  drawer = true
}) {
  const [form, setForm] = useState(emptyDivision);
  // Locally-remembered rows for manufacturers created via the inline "+" button
  // while this modal is open. Lets the select show the new row immediately even
  // when the parent page has not yet refreshed its own list.
  const [extraMfgRows, setExtraMfgRows] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  // Draft preservation: overlay close keeps form data; explicit close resets it.
  const overlayClosedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (overlayClosedRef.current) {
      overlayClosedRef.current = false;
      return;
    }
    if (initialValue && mode === "edit") {
      setForm({ ...emptyDivision, ...initialValue });
    } else {
      setForm(emptyDivision);
    }
    setExtraMfgRows([]);
    setSubmitted(false);
  }, [open, mode, initialValue]);

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

  const phone = validatePhone(form.phoneCountryCode, form.phoneNumber);

  const canSubmit = !busy && clean(form.name).length >= 2 && Boolean(clean(form.mfgCompanyId)) && phone.ok;

  const allMfgRows = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const row of [...(mfgCompanyOptions || []), ...extraMfgRows]) {
      const key = String(row?.id || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }, [mfgCompanyOptions, extraMfgRows]);

  const mfgOptions = useMemo(
    () => allMfgRows.map((c) => ({ value: String(c.id), label: `${c.name || ""}${c.code ? ` (${c.code})` : ""}` })),
    [allMfgRows]
  );

  const selectedMfg = useMemo(() => {
    const id = clean(form.mfgCompanyId);
    if (!id) return null;
    return allMfgRows.find((c) => String(c.id) === id) || null;
  }, [form.mfgCompanyId, allMfgRows]);

  function buildPayload() {
    const base = {
      name: clean(form.name),
      shortName: clean(form.shortName) || (mode === "edit" ? null : undefined),
      mfgCompanyId: clean(form.mfgCompanyId),
      creditDays: Math.max(0, Number.parseInt(String(form.creditDays ?? 0), 10) || 0),
      phoneCountryCode: clean(form.phoneCountryCode),
      phoneNumber: phone.digits,
      email: clean(form.email),
      address: clean(form.address),
      notes: clean(form.notes),
      isActive: Boolean(form.isActive)
    };
    const code = clean(form.code);
    if (mode === "edit") {
      base.code = code.toUpperCase();
    } else if (code) {
      base.code = code.toUpperCase();
    }
    return base;
  }

  return (
    <CommonModal
      open={open}
      title={mode === "edit" ? "Edit Division" : "Add Division"}
      subtitle=""
      onClose={handleExplicitClose}
      onOverlayClose={handleOverlayClose}
      size="lg"
      icon={<IconDivisionMark />}
      loading={loading}
      loadingText="Loading required data…"
      portal={portal}
      portalZIndex={portalZIndex}
      drawer={drawer}
      footer={
        <ModalFooterShell meta="">
          <button
            className="mfzBtn appBtn appBtn_secondary appBtn_md"
            type="button"
            data-cm-cancel="true"
            onClick={handleExplicitClose}
            disabled={busy}
          >
            Close
          </button>
          <button
            className="mfzBtn appBtn appBtn_primary appBtn_md"
            type="button"
            data-cm-primary="true"
            disabled={busy}
            onClick={() => { setSubmitted(true); if (!canSubmit) return; onSubmit?.(buildPayload()); }}
          >
            {busy ? (
              <InlineButtonProgress label={mode === "edit" ? "Saving…" : "Creating…"} />
            ) : mode === "edit" ? (
              "Save changes"
            ) : (
              "Create division"
            )}
          </button>
        </ModalFooterShell>
      }
    >
      <ModalFormShell>
        <ModalFormBody>
          <ModalFormPanel aria-label="Division details">
            <ModalFormPanelHead>
              <ModalFormSectionTitle kicker="Division details" />
            </ModalFormPanelHead>
            <ModalFormPanelBody>
              <ModalFormGrid>
                <ModalFormField
                  span={12}
                  label="Manufacturer"
                  required
                  error={submitted && !clean(form.mfgCompanyId) ? "Manufacturer is required." : null}
                >
                  <MasterSelectWithCreate
                    kind="mfgCompany"
                    selectClassName={`mfzInput${submitted && !clean(form.mfgCompanyId) ? " mfzInput_err" : ""}`}
                    value={form.mfgCompanyId || ""}
                    disabled={busy}
                    onChange={(v, createdRow) => {
                      const id = v != null ? String(v) : "";
                      if (createdRow && String(createdRow.id) === id) {
                        setExtraMfgRows((prev) => {
                          if (prev.some((r) => String(r.id) === id)) return prev;
                          return [createdRow, ...prev];
                        });
                      }
                      setForm((p) => ({ ...p, mfgCompanyId: id }));
                    }}
                    onListsRefresh={onRefreshMfgCompanies}
                    placeholder="Select manufacturer"
                    options={mfgOptions}
                    buttonTitle="Create manufacturer"
                  />
                </ModalFormField>

                {selectedMfg ? (
                  <div className="mfz12">
                    <div className="mfzNote mfzNoteStrong">
                      <strong>{selectedMfg.name}</strong>
                      <div className="mfzHelp mfzTop12">
                        {[
                          selectedMfg.sale_lock ? "Sale locked" : "",
                          selectedMfg.purchase_order_lock ? "Purchase locked" : "",
                          selectedMfg.prevent_discount ? "No discount" : "",
                          Number(selectedMfg.credit_limit || 0) > 0 ? `Credit ${fmtCurrency(selectedMfg.credit_limit)}` : ""
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No restriction flags set"}
                      </div>
                    </div>
                  </div>
                ) : null}

                <ModalFormField
                  span={4}
                  label="Code"
                  required={mode === "edit"}
                >
                  <input
                    className="mfzInput"
                    value={form.code}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                    placeholder={mode === "edit" ? "" : "Auto-generated if empty"}
                  />
                </ModalFormField>

                <ModalFormField
                  span={4}
                  label="Name"
                  required
                  error={submitted && clean(form.name).length < 2 ? "Name is required (min 2 characters)." : null}
                >
                  <input
                    className={`mfzInput${submitted && clean(form.name).length < 2 ? " mfzInput_err" : ""}`}
                    value={form.name}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Division name"
                  />
                </ModalFormField>

                <ModalFormField span={4} label="Short name">
                  <input
                    className="mfzInput"
                    value={form.shortName}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, shortName: e.target.value }))}
                    placeholder="Optional label"
                  />
                </ModalFormField>

                <ModalFormField span={4} label="Credit days">
                  <input
                    className="mfzInput"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    value={String(form.creditDays ?? "")}
                    disabled={busy}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setForm((p) => ({ ...p, creditDays: val }));
                    }}
                  />
                </ModalFormField>
              </ModalFormGrid>
            </ModalFormPanelBody>
          </ModalFormPanel>

          <ModalFormPanel aria-label="Contact">
            <ModalFormPanelHead>
              <ModalFormSectionTitle kicker="Contact" />
            </ModalFormPanelHead>
            <ModalFormPanelBody>
              <ModalFormGrid>
                <ModalFormField span={12} label="Phone" required>
                  <PhoneInput
                    compact
                    phonePlaceholder="7–15 digits"
                    countryCode={form.phoneCountryCode}
                    phoneNumber={form.phoneNumber}
                    onCountryCodeChange={(v) => setForm((p) => ({ ...p, phoneCountryCode: v }))}
                    onPhoneNumberChange={(v) => setForm((p) => ({ ...p, phoneNumber: v }))}
                    countryCodeError={
                      submitted && !clean(form.phoneCountryCode)
                        ? "Country code is required."
                        : !clean(form.phoneCountryCode) || phone.ccOk ? "" : "Use format like +91"
                    }
                    phoneNumberError={
                      submitted && !clean(form.phoneNumber)
                        ? "Phone number is required."
                        : !clean(form.phoneNumber) || phone.numOk ? "" : "Phone must be 7 to 15 digits"
                    }
                  />
                </ModalFormField>

                <ModalFormField span={6} label="Email">
                  <input className="mfzInput" value={form.email} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                </ModalFormField>

                <ModalFormField span={12} label="Address">
                  <input className="mfzInput" value={form.address} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
                </ModalFormField>

                <ModalFormField span={12} label="Notes">
                  <textarea className="mfzTextarea" value={form.notes} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                </ModalFormField>

                <ModalFormCheckGroup>
                  <label className="mfzCheck">
                    <input
                      type="checkbox"
                      checked={Boolean(form.isActive)}
                      disabled={busy}
                      onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                    />
                    <span>Active division</span>
                  </label>
                </ModalFormCheckGroup>
              </ModalFormGrid>
            </ModalFormPanelBody>
          </ModalFormPanel>
        </ModalFormBody>
      </ModalFormShell>
    </CommonModal>
  );
}
