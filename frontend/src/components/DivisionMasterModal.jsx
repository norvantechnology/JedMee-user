import { fmtMoney } from "../utils/format.js";
import { InlineButtonProgress } from "./ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import CommonModal from "./CommonModal.jsx";
import MasterSelectWithCreate from "./MasterSelectWithCreate.jsx";
import PhoneInput, { validatePhone } from "./PhoneInput.jsx";
import "./MasterModalForm.css";
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
  initialValue = null,
  mfgCompanyOptions = [],
  onRefreshMfgCompanies,
  onClose,
  onSubmit,
  portal = false,
  portalZIndex = 480
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
      portal={portal}
      portalZIndex={portalZIndex}
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
      <div className="mfz">
        <div className="mfzBody">
          <section className="mfzPanel" aria-label="Division details">
            <div className="mfzPanelHead">
              <div>
                <div className="mfzHeadKicker">Division details</div>
              </div>
            </div>
            <div className="mfzPanelBody">
              <div className="mfzGrid">
                <div className="mfzField mfz12">
                  <div className="mfzLabel">
                    Manufacturer <span className="reqMark" aria-hidden="true">*</span>
                  </div>
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
                  {submitted && !clean(form.mfgCompanyId) && (
                    <div className="mfzErr">Manufacturer is required.</div>
                  )}
                </div>

                {selectedMfg ? (
                  <div className="mfz12">
                    <div className="mfzNote mfzNoteStrong">
                      <strong>{selectedMfg.name}</strong>
                      <div className="mfzHelp mfzTop12">
                        {[
                          selectedMfg.sale_lock ? "Sale locked" : "",
                          selectedMfg.purchase_order_lock ? "Purchase locked" : "",
                          selectedMfg.prevent_discount ? "No discount" : "",
                          Number(selectedMfg.credit_limit || 0) > 0 ? `Credit ₹${fmtMoney(selectedMfg.credit_limit)}` : ""
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No restriction flags set"}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mfzField mfz4">
                  <div className="mfzLabel">
                    Code{mode === "edit" ? (
                      <>
                        {" "}
                        <span className="reqMark" aria-hidden="true">*</span>
                      </>
                    ) : null}
                  </div>
                  <input
                    className="mfzInput"
                    value={form.code}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                    placeholder={mode === "edit" ? "" : "Auto-generated if empty"}
                  />
                </div>

                <div className="mfzField mfz4">
                  <div className="mfzLabel">
                    Name <span className="reqMark" aria-hidden="true">*</span>
                  </div>
                  <input
                    className={`mfzInput${submitted && clean(form.name).length < 2 ? " mfzInput_err" : ""}`}
                    value={form.name}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Division name"
                  />
                  {submitted && clean(form.name).length < 2 && (
                    <div className="mfzErr">Name is required (min 2 characters).</div>
                  )}
                </div>

                <div className="mfzField mfz4">
                  <div className="mfzLabel">Short name</div>
                  <input
                    className="mfzInput"
                    value={form.shortName}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, shortName: e.target.value }))}
                    placeholder="Optional label"
                  />
                </div>

                <div className="mfzField mfz4">
                  <div className="mfzLabel">Credit days</div>
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
                </div>
              </div>
            </div>
          </section>

          <section className="mfzPanel" aria-label="Contact">
            <div className="mfzPanelHead">
              <div>
                <div className="mfzHeadKicker">Contact</div>
              </div>
            </div>
            <div className="mfzPanelBody">
              <div className="mfzGrid">
                <div className="mfzField mfz12">
                  <div className="mfzLabel">
                    Phone <span className="reqMark" aria-hidden="true">*</span>
                  </div>
                  <PhoneInput
                    compact
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
                </div>

                <div className="mfzField mfz6">
                  <div className="mfzLabel">Email</div>
                  <input className="mfzInput" value={form.email} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                </div>

                <div className="mfzField mfz12">
                  <div className="mfzLabel">Address</div>
                  <input className="mfzInput" value={form.address} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
                </div>

                <div className="mfzField mfz12">
                  <div className="mfzLabel">Notes</div>
                  <textarea className="mfzTextarea" value={form.notes} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>

                <div className="mfz12">
                  <label className="mfzCheck">
                    <input
                      type="checkbox"
                      checked={Boolean(form.isActive)}
                      disabled={busy}
                      onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                    />
                    <span>Active division</span>
                  </label>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </CommonModal>
  );
}
