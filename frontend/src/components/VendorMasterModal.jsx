import { AppButton, AsyncButton } from "./ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import CommonModal from "./CommonModal.jsx";
import MasterSelectWithCreate from "./MasterSelectWithCreate.jsx";
import PhoneInput, { validatePhone } from "./PhoneInput.jsx";
import ModalFooterShell from "./ui/ModalFooterShell.jsx";
import { IconSupplier } from "./ui/AppIcons.jsx";
import "./MasterModalForm.css";
import "./VendorMasterModal.css";
import { isRetailerAuth } from "../utils/businessRole.js";
import { readAuth } from "../services/authStorage.js";

function clean(v) {
  return String(v ?? "").trim();
}

const VENDOR_TYPES = [
  { value: "WHOLESALER", label: "Wholesaler" },
  { value: "DISTRIBUTOR", label: "Distributor" },
  { value: "DIRECT_MFG", label: "Direct manufacturer" },
  { value: "OTHER", label: "Other" }
];

const emptyVendor = {
  code: "",
  name: "",
  shortName: "",
  rackNumber: "",
  mainCompany: "",
  creditDays: 0,
  mfgCompanyId: "",
  vendorType: "WHOLESALER",
  phoneCountryCode: "+91",
  phoneNumber: "",
  email: "",
  address: "",
  notes: "",
  isActive: true
};

/**
 * Shared vendor add/edit modal. Same fields and validation everywhere a vendor is
 * created  avoids drift between Vendors master and inline quick-create flows.
 */
export default function VendorMasterModal({
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
  const isRetailer = useMemo(() => isRetailerAuth(readAuth()), []);
  const [form, setForm] = useState(emptyVendor);
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
      setForm({
        ...emptyVendor,
        ...initialValue,
        vendorType: clean(initialValue.vendorType || initialValue.vendor_type) || "WHOLESALER"
      });
    } else {
      setForm({ ...emptyVendor, vendorType: "WHOLESALER" });
    }
    setExtraMfgRows([]);
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

  const phone = validatePhone(form.phoneCountryCode, form.phoneNumber);

  const canSubmit = !busy && clean(form.name).length >= 2 && phone.ok;

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

  const partnerLabel = isRetailer ? "Supplier" : "Vendor";

  function submitPayload() {
    return {
      code: clean(form.code),
      name: clean(form.name),
      shortName: clean(form.shortName),
      rackNumber: isRetailer ? "" : clean(form.rackNumber),
      mainCompany: clean(form.mainCompany),
      creditDays: Math.max(0, Number.parseInt(String(form.creditDays ?? 0), 10) || 0),
      mfgCompanyId: isRetailer ? (mode === "edit" ? null : undefined) : clean(form.mfgCompanyId) || (mode === "edit" ? null : undefined),
      vendorType: clean(form.vendorType) || "WHOLESALER",
      phoneCountryCode: clean(form.phoneNumber) ? clean(form.phoneCountryCode) : "",
      phoneNumber: clean(form.phoneNumber) ? phone.digits : "",
      email: clean(form.email),
      address: clean(form.address),
      notes: clean(form.notes),
      isActive: Boolean(form.isActive)
    };
  }

  return (
    <CommonModal
      open={open}
      title={
        mode === "edit"
          ? isRetailer
            ? "Edit supplier"
            : "Edit vendor"
          : isRetailer
            ? "New supplier"
            : "New vendor"
      }
      subtitle=""
      onClose={handleExplicitClose}
      onOverlayClose={handleOverlayClose}
      size="lg"
      icon={<IconSupplier />}
      portal={portal}
      portalZIndex={portalZIndex}
      footer={
        <ModalFooterShell>
          <AppButton type="button" variant="secondary" size="md" data-cm-cancel="true" disabled={busy} onClick={handleExplicitClose}>
            Cancel
          </AppButton>
          <AsyncButton
            type="button"
            variant="primary"
            size="md"
            data-cm-primary="true"
            disabled={busy}
            onClick={() => { setSubmitted(true); if (!canSubmit) return; onSubmit?.(submitPayload()); }}
            loading={busy}
            loadingText={mode === "edit" ? "Saving…" : "Working…"}
          >
            {mode === "edit" ? "Save changes" : isRetailer ? "Create supplier" : "Create vendor"}
          </AsyncButton>
        </ModalFooterShell>
      }
    >
      <div className="mfz vmShell">
        <div className="mfzBody vmSplit">
          <section className="mfzPanel vmColStretch" aria-label={`${partnerLabel} profile`}>
            <div className="mfzPanelHead">
              <div>
                <div className="mfzHeadKicker">{isRetailer ? "Supplier profile" : "Vendor profile"}</div>
              </div>
            </div>
            <div className="mfzPanelBody">
              <div className="mfzGrid">
                <div className="mfzField mfz12">
                  <div className="mfzLabel">
                    {isRetailer ? "Supplier name" : "Vendor name"} <span className="reqMark" aria-hidden="true">*</span>
                  </div>
                  <input
                    className={`mfzInput${submitted && clean(form.name).length < 2 ? " mfzInput_err" : ""}`}
                    value={form.name}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder=""
                    autoComplete="organization"
                  />
                  {submitted && clean(form.name).length < 2 && (
                    <div className="mfzErr">Name is required (min 2 characters).</div>
                  )}
                </div>

                <div className="mfzField mfz4">
                  <div className="mfzLabel">Code</div>
                  <input
                    className="mfzInput"
                    value={form.code}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                    placeholder={isRetailer ? "Optional  e.g. SUP-0001" : "Optional  e.g. VEN-0001"}
                  />
                </div>

                <div className="mfzField mfz4">
                  <div className="mfzLabel">Short name</div>
                  <input
                    className="mfzInput"
                    value={form.shortName}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, shortName: e.target.value }))}
                    placeholder=""
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

                {!isRetailer ? (
                  <div className="mfzField mfz6">
                    <div className="mfzLabel">Rack / shelf</div>
                    <input
                      className="mfzInput"
                      value={form.rackNumber}
                      disabled={busy}
                      onChange={(e) => setForm((p) => ({ ...p, rackNumber: e.target.value }))}
                      placeholder=""
                    />
                  </div>
                ) : (
                  <div className="mfzField mfz6">
                    <div className="mfzLabel">Supplier type</div>
                    <select
                      className="mfzInput"
                      value={form.vendorType || "WHOLESALER"}
                      disabled={busy}
                      onChange={(e) => setForm((p) => ({ ...p, vendorType: e.target.value }))}
                      aria-label="Supplier type"
                    >
                      {VENDOR_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mfzField mfz6">
                  <div className="mfzLabel">{isRetailer ? "Main brand" : "Main company"}</div>
                  <input
                    className="mfzInput"
                    value={form.mainCompany}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, mainCompany: e.target.value }))}
                    placeholder="Parent or flagship name"
                  />
                </div>

                {!isRetailer ? (
                  <div className="mfzField mfz12">
                    <div className="mfzLabel">Linked manufacturer</div>
                    <MasterSelectWithCreate
                      kind="mfgCompany"
                      selectClassName="mfzInput"
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
                      placeholder="None"
                      options={mfgOptions}
                      buttonTitle="Create new manufacturer"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="mfzPanel vmColStretch" aria-label="Contact and notes">
            <div className="mfzPanelHead">
              <div>
                <div className="mfzHeadKicker">Reach & notes</div>
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
                        : !clean(form.phoneCountryCode) || phone.ccOk ? "" : "Use a prefix like +91"
                    }
                    phoneNumberError={
                      submitted && !clean(form.phoneNumber)
                        ? "Phone number is required."
                        : !clean(form.phoneNumber) || phone.numOk ? "" : "Enter 7–15 digits"
                    }
                  />
                </div>

                <div className="mfzField mfz12">
                  <div className="mfzLabel">Email</div>
                  <input
                    className="mfzInput"
                    type="email"
                    value={form.email}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="billing@example.com"
                    autoComplete="email"
                  />
                </div>

                <div className="mfzField mfz12">
                  <div className="mfzLabel">Address</div>
                  <input
                    className="mfzInput"
                    value={form.address}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                    placeholder=""
                    autoComplete="street-address"
                  />
                </div>

                <div className="mfzField mfz12">
                  <div className="mfzLabel">Notes</div>
                  <textarea
                    className="mfzTextarea"
                    value={form.notes}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Payment instructions, delivery slots, alternate contacts…"
                    rows={4}
                  />
                </div>

                <div className="mfzField mfz12">
                  <div className="mfzChecks">
                    <label className="mfzCheck">
                      <input
                        type="checkbox"
                        checked={Boolean(form.isActive)}
                        disabled={busy}
                        onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                      />
                      <span>Active</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </CommonModal>
  );
}
