import { AppButton, AsyncButton } from "./ui/buttons.jsx";
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
import ModalFooterShell from "./ui/ModalFooterShell.jsx";
import { IconSupplier } from "./ui/AppIcons.jsx";
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

  const partnerLabel = "Supplier";

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
      loading={loading}
      loadingText="Loading required data…"
      title={mode === "edit" ? "Edit supplier" : "New supplier"}
      subtitle=""
      onClose={handleExplicitClose}
      onOverlayClose={handleOverlayClose}
      size="lg"
      icon={<IconSupplier />}
      portal={portal}
      portalZIndex={portalZIndex}
      drawer={drawer}
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
            {mode === "edit" ? "Save changes" : "Create supplier"}
          </AsyncButton>
        </ModalFooterShell>
      }
    >
      <ModalFormShell className="vmShell">
        <ModalFormBody className="vmSplit">
          <ModalFormPanel className="vmColStretch" aria-label={`${partnerLabel} profile`}>
            <ModalFormPanelHead>
              <ModalFormSectionTitle kicker="Supplier profile" />
            </ModalFormPanelHead>
            <ModalFormPanelBody>
              <ModalFormGrid>
                <ModalFormField
                  span={12}
                  label="Supplier name"
                  required
                  error={submitted && clean(form.name).length < 2 ? "Name is required (min 2 characters)." : null}
                >
                  <input
                    className={`mfzInput${submitted && clean(form.name).length < 2 ? " mfzInput_err" : ""}`}
                    value={form.name}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder=""
                    autoComplete="organization"
                  />
                </ModalFormField>

                {/* Credit days first - business-critical; Code + Short name are optional */}
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

                <ModalFormField span={4} label="Code">
                  <input
                    className="mfzInput"
                    value={form.code}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                    placeholder={isRetailer ? "Optional  e.g. SUP-0001" : "Optional  e.g. VEN-0001"}
                  />
                </ModalFormField>

                <ModalFormField span={4} label="Short name">
                  <input
                    className="mfzInput"
                    value={form.shortName}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, shortName: e.target.value }))}
                    placeholder=""
                  />
                </ModalFormField>

                {!isRetailer ? (
                  <ModalFormField span={6} label="Rack / shelf">
                    <input
                      className="mfzInput"
                      value={form.rackNumber}
                      disabled={busy}
                      onChange={(e) => setForm((p) => ({ ...p, rackNumber: e.target.value }))}
                      placeholder=""
                    />
                  </ModalFormField>
                ) : (
                  <ModalFormField span={6} label="Supplier type">
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
                  </ModalFormField>
                )}

                <ModalFormField span={6} label={isRetailer ? "Main brand" : "Main company"}>
                  <input
                    className="mfzInput"
                    value={form.mainCompany}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, mainCompany: e.target.value }))}
                    placeholder="Parent or flagship name"
                  />
                </ModalFormField>

                {!isRetailer ? (
                  <ModalFormField span={8} label="Linked manufacturer">
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
                  </ModalFormField>
                ) : null}
              </ModalFormGrid>
            </ModalFormPanelBody>
          </ModalFormPanel>

          <ModalFormPanel className="vmColStretch" aria-label="Contact and notes">
            <ModalFormPanelHead>
              <ModalFormSectionTitle kicker="Reach & notes" />
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
                        : !clean(form.phoneCountryCode) || phone.ccOk ? "" : "Use a prefix like +91"
                    }
                    phoneNumberError={
                      submitted && !clean(form.phoneNumber)
                        ? "Phone number is required."
                        : !clean(form.phoneNumber) || phone.numOk ? "" : "Enter 7–15 digits"
                    }
                  />
                </ModalFormField>

                <ModalFormField span={8} label="Email">
                  <input
                    className="mfzInput"
                    type="email"
                    value={form.email}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="billing@example.com"
                    autoComplete="email"
                  />
                </ModalFormField>

                <ModalFormField span={12} label="Address">
                  <input
                    className="mfzInput"
                    value={form.address}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                    placeholder=""
                    autoComplete="street-address"
                  />
                </ModalFormField>

                <ModalFormField span={12} label="Notes">
                  <textarea
                    className="mfzTextarea"
                    value={form.notes}
                    disabled={busy}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Payment instructions, delivery slots, alternate contacts…"
                    rows={4}
                  />
                </ModalFormField>

                <ModalFormCheckGroup>
                  <label className="mfzCheck">
                    <input
                      type="checkbox"
                      checked={Boolean(form.isActive)}
                      disabled={busy}
                      onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                    />
                    <span>Active</span>
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
