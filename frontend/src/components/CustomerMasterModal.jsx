import { InlineButtonProgress } from "./ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import CommonModal from "./CommonModal.jsx";
import CommonDatePicker from "./CommonDatePicker.jsx";
import PhoneInput, { validatePhone } from "./PhoneInput.jsx";
import AmountInput from "./ui/AmountInput.jsx";
import "./MasterModalForm.css";
import "./CustomerMasterModal.css";
import { isRetailerAuth } from "../utils/businessRole.js";
import { readAuth } from "../services/authStorage.js";
import { IconChevronMini, IconCustomerMark } from "./ui/AppIcons.jsx";
import ModalFooterShell from "./ui/ModalFooterShell.jsx";

const WHOLESALER_TYPES = ["RETAILER", "HOSPITAL", "CLINIC", "DISTRIBUTOR", "OTHER"];
const RETAILER_TYPES = ["PATIENT", "CLINIC", "DOCTOR", "HOSPITAL", "OTHER"];

function makeEmptyCustomer(isRetailer) {
  return {
    code: "",
    name: "",
    shortName: "",
    phoneCountryCode: "+91",
    phoneNumber: "",
    email: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    customerType: isRetailer ? "PATIENT" : "RETAILER",
    gstNumber: "",
    drugLicenseNumber: "",
    dlExpiryDate: "",
    creditDays: 0,
    creditLimit: 0,
    discountPercent: 0,
    isCashCustomer: !!isRetailer,
    isActive: true,
    notes: ""
  };
}

/**
 * Shared customer add/edit modal. Used by the Customers page AND any quick-create
 * flow (sales billing, sales returns, customer payments). The form shape, required
 * fields and sections stay in ONE place so they never drift across modules.
 */
export default function CustomerMasterModal({
  open,
  mode = "add", // add | edit
  busy = false,
  initialValue = null,
  onClose,
  onSubmit,
  portal = false,
  portalZIndex = 480
}) {
  const isRetailer = useMemo(() => isRetailerAuth(readAuth()), []);
  const typeOptions = isRetailer ? RETAILER_TYPES : WHOLESALER_TYPES;
  const [form, setForm] = useState(() => makeEmptyCustomer(isRetailer));
  const [showCompliance, setShowCompliance] = useState(!isRetailer);
  const [submitted, setSubmitted] = useState(false);
  // Draft preservation: overlay close keeps form data; explicit close resets it.
  const overlayClosedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    // Restore draft when closed via overlay.
    if (overlayClosedRef.current) {
      overlayClosedRef.current = false;
      return;
    }
    const base = makeEmptyCustomer(isRetailer);
    if (initialValue && mode === "edit") {
      const merged = { ...base, ...initialValue };
      setForm(merged);
      setShowCompliance(
        !isRetailer ||
          Boolean(initialValue.gstNumber || initialValue.drugLicenseNumber || initialValue.dlExpiryDate)
      );
    } else {
      setForm(base);
      setShowCompliance(!isRetailer);
    }
    setSubmitted(false);
  }, [open, mode, initialValue, isRetailer]);

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

  const phoneClean = String(form.phoneNumber || "").trim();
  const phoneRequired = false;
  const phone = validatePhone(form.phoneCountryCode, form.phoneNumber);

  const gstRaw = String(form.gstNumber || "").trim().toUpperCase();
  // Relaxed: 15 alphanumeric characters (A–Z, 0–9). The strict PAN-embedded
  // format check was rejecting valid GSTINs that don't follow the canonical
  // pattern exactly (e.g. special economic zone registrations, test accounts).
  const GST_REGEX = /^[A-Z0-9]{15}$/;
  const gstError = submitted && gstRaw.length > 0 && !GST_REGEX.test(gstRaw)
    ? "GSTIN must be exactly 15 alphanumeric characters (letters and digits)."
    : "";

  const canSubmit =
    !busy &&
    String(form.name || "").trim().length > 0 &&
    (phoneClean.length === 0 || phoneClean.length >= 6) &&
    !gstError;

  return (
    <CommonModal
      open={open}
      title={mode === "edit" ? "Edit Customer" : "Add Customer"}
      subtitle=""
      icon={<IconCustomerMark />}
      onClose={handleExplicitClose}
      onOverlayClose={handleOverlayClose}
      portal={portal}
      portalZIndex={portalZIndex}
      footer={
        <ModalFooterShell>
          <button className="mfzBtn appBtn appBtn_secondary appBtn_md" type="button" data-cm-cancel="true" onClick={handleExplicitClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="mfzBtn appBtn appBtn_primary appBtn_md"
            type="button"
            data-cm-primary="true"
            disabled={busy}
            onClick={() => { setSubmitted(true); if (!canSubmit) return; onSubmit?.({ ...form }); }}
          >
            {busy ? (
              <InlineButtonProgress label={mode === "edit" ? "Saving…" : "Creating…"} />
            ) : mode === "edit" ? (
              "Save changes"
            ) : (
              "Create customer"
            )}
          </button>
        </ModalFooterShell>
      }
    >
      <div className="mfz cmz">
        <div className="mfzBody">
          <section className="mfzPanel" aria-label="Customer profile">
            <div className="mfzPanelHead">
              <div>
                <div className="mfzHeadKicker">Profile</div>
              </div>
            </div>

            <div className="mfzPanelBody">
              <div className="mfzGrid">
                <div className="mfzField mfz8">
                  <div className="mfzLabel">
                    Customer name <span className="reqMark" aria-hidden="true">*</span>
                  </div>
                  <input
                    className={`mfzInput${submitted && !String(form.name || "").trim() ? " mfzInput_err" : ""}`}
                    value={form.name}
                    placeholder=""
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  />
                  {submitted && !String(form.name || "").trim() && (
                    <div className="mfzErr">Customer name is required.</div>
                  )}
                </div>

                <div className="mfzField mfz4">
                  <div className="mfzLabel">Type</div>
                  <select
                    className="mfzInput"
                    value={form.customerType}
                    disabled={busy}
                    onChange={(e) =>
                      setForm((p) => {
                        const next = { ...p, customerType: e.target.value };
                        if (isRetailer) next.isCashCustomer = e.target.value === "PATIENT";
                        return next;
                      })
                    }
                    aria-label="Customer type"
                  >
                    {typeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    {!typeOptions.includes(form.customerType) && form.customerType ? (
                      <option value={form.customerType}>{form.customerType}</option>
                    ) : null}
                  </select>
                </div>

                <div className="mfzField mfz4">
                  <div className="mfzLabel">Code</div>
                  <input
                    className="mfzInput"
                    value={form.code}
                    placeholder="Optional"
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                  />
                </div>

                <div className="mfzField mfz4">
                  <div className="mfzLabel">Short name</div>
                  <input
                    className="mfzInput"
                    value={form.shortName}
                    placeholder=""
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, shortName: e.target.value }))}
                  />
                </div>

                <div className="mfzField mfz12">
                  <PhoneInput
                    countryCode={form.phoneCountryCode}
                    phoneNumber={form.phoneNumber}
                    onCountryCodeChange={(v) => setForm((p) => ({ ...p, phoneCountryCode: v }))}
                    onPhoneNumberChange={(v) => setForm((p) => ({ ...p, phoneNumber: v }))}
                    countryCodeError={!phoneRequired || !phoneClean || phone.ccOk ? "" : "Use prefix like +91"}
                    phoneNumberError={!phoneRequired || !phoneClean || phone.numOk ? "" : "Enter 7–15 digits"}
                  />
                </div>

                <div className="mfzField mfz12">
                  <div className="mfzLabel">Email</div>
                  <input
                    className="mfzInput"
                    value={form.email}
                    placeholder=""
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="mfzPanel" aria-label="Address">
            <div className="mfzPanelHead">
              <div>
                <div className="mfzHeadKicker">Address</div>
              </div>
            </div>
            <div className="mfzPanelBody">
              <div className="mfzGrid">
                <div className="mfzField mfz12">
                  <div className="mfzLabel">Address line</div>
                  <input
                    className="mfzInput"
                    value={form.address}
                    placeholder=""
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  />
                </div>
                <div className="mfzField mfz4">
                  <div className="mfzLabel">City</div>
                  <input className="mfzInput" value={form.city} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
                </div>
                <div className="mfzField mfz4">
                  <div className="mfzLabel">State</div>
                  <input className="mfzInput" value={form.state} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} />
                </div>
                <div className="mfzField mfz4">
                  <div className="mfzLabel">Pincode</div>
                  <input className="mfzInput" value={form.pincode} disabled={busy} onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))} />
                </div>
              </div>
            </div>
          </section>

          <section className="mfzPanel" aria-label="Compliance">
            <div className="mfzPanelHead">
              <div>
                <div className="mfzHeadKicker">Compliance</div>
              </div>
              {isRetailer ? (
                <div className="mfzHeadRight">
                  <button
                    type="button"
                    className="mfzToggle cmzToggle"
                    onClick={() => setShowCompliance((v) => !v)}
                    aria-expanded={showCompliance}
                    aria-controls="customer-compliance-section"
                  >
                    <span className="mfzToggleIcon" aria-hidden="true">
                      <span className={showCompliance ? "mfzRot90" : ""}>
                        <IconChevronMini />
                      </span>
                    </span>
                    {showCompliance ? "Hide compliance" : "Show compliance"}
                  </button>
                </div>
              ) : null}
            </div>

            {showCompliance ? (
              <div className="mfzPanelBody" id="customer-compliance-section">
                {isRetailer && form.customerType === "PATIENT" ? (
                  null
                ) : (
                  <div className="mfzGrid">
                    <div className="mfzField mfz6">
                      <div className="mfzLabel">GSTIN</div>
                      <input
                        className={`mfzInput${gstError ? " mfzInput_err" : ""}`}
                        value={form.gstNumber}
                        placeholder="e.g. 22AAAAA0000A1Z5"
                        disabled={busy}
                        maxLength={15}
                        onChange={(e) => setForm((p) => ({ ...p, gstNumber: e.target.value }))}
                      />
                      {gstError ? <div className="mfzErr">{gstError}</div> : null}
                    </div>
                    <div className="mfzField mfz6">
                      <div className="mfzLabel">Drug license number</div>
                      <input
                        className="mfzInput"
                        value={form.drugLicenseNumber}
                        placeholder=""
                        disabled={busy}
                        onChange={(e) => setForm((p) => ({ ...p, drugLicenseNumber: e.target.value }))}
                      />
                    </div>
                    <div className="mfzField mfz6">
                      <div className="mfzLabel">DL expiry date</div>
                      <CommonDatePicker
                        value={form.dlExpiryDate}
                        disabled={busy}
                        onChange={(v) => setForm((p) => ({ ...p, dlExpiryDate: v }))}
                        ariaLabel="DL expiry date"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </section>

          <section className="mfzPanel" aria-label="Billing defaults">
            <div className="mfzPanelHead">
              <div>
                <div className="mfzHeadKicker">Billing defaults</div>
              </div>
            </div>

            <div className="mfzPanelBody">
              <div className="mfzChecks">
                <label className="mfzCheck">
                  <input
                    type="checkbox"
                    checked={Boolean(form.isCashCustomer)}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, isCashCustomer: e.target.checked }))}
                  />
                  <span>Cash customer</span>
                </label>

                <label className="mfzCheck">
                  <input
                    type="checkbox"
                    checked={Boolean(form.isActive)}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                  />
                  <span>Active customer</span>
                </label>
              </div>

              {!form.isCashCustomer ? (
                <div className="mfzGrid mfzTop12">
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
                  <div className="mfzField mfz4">
                    <div className="mfzLabel">Credit limit</div>
                    <AmountInput
                      className="mfzInput"
                      value={String(form.creditLimit ?? "")}
                      onChange={(raw) => setForm((p) => ({ ...p, creditLimit: raw }))}
                      disabled={busy}
                      placeholder="e.g. 50,000"
                    />
                  </div>
                  <div className="mfzField mfz4">
                    <div className="mfzLabel">Default discount (%)</div>
                    <input
                      className="mfzInput"
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      placeholder="0"
                      value={String(form.discountPercent ?? "")}
                      disabled={busy}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                        setForm((p) => ({ ...p, discountPercent: val }));
                      }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="mfzGrid mfzTop12">
                <div className="mfzField mfz12">
                  <div className="mfzLabel">Notes</div>
                  <textarea
                    className="mfzTextarea"
                    value={form.notes}
                    placeholder="Optional remarks"
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </CommonModal>
  );
}
