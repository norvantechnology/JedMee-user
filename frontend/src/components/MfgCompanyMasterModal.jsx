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
import ModalFooterShell from "./ui/ModalFooterShell.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { checkMfgCompanyUnique, getMfgCompanyPolicyImpact } from "../services/mfgCompanyService.js";
import PasswordInput from "./ui/PasswordInput.jsx";
import AmountInput from "./ui/AmountInput.jsx";
import { IconChevronMini, IconMfgMark } from "./ui/AppIcons.jsx";

function clean(v) {
  return String(v ?? "").trim();
}

function parseEmailsToText(list) {
  if (!Array.isArray(list) || !list.length) return "";
  return list.join(", ");
}

function normalizeEmailText(v) {
  return clean(v)
    .split(/[\n,;]+/g)
    .map((x) => clean(x))
    .filter(Boolean)
    .join(", ");
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

function validateEmailText(v) {
  const list = clean(v)
    .split(/[\n,;]+/g)
    .map((x) => clean(x))
    .filter(Boolean);
  for (const e of list) if (!isEmail(e)) return false;
  return true;
}

function emailCount(v) {
  return clean(v)
    .split(/[\n,;]+/g)
    .map((x) => clean(x))
    .filter(Boolean).length;
}

const emptyMfg = {
  code: "",
  name: "",
  shortName: "",
  rackNo: "",
  password: "",
  mainCompanyId: "",
  mrEmails: "",
  cfEmails: "",
  mfgEmails: "",
  otherEmails: "",
  saleLock: false,
  purchaseOrderLock: false,
  stockReportLock: false,
  preventFreeQty: false,
  preventDiscount: false,
  preventNetRate: false,
  preventReturnProduct: false,
  preventExpiryDamageProduct: false,
  outBillLimit: "",
  outDayLimit: "",
  creditLimit: ""
};

export function initialMfgFromRow(r) {
  if (!r) return { ...emptyMfg };
  return {
    id: r.id,
    code: r.code || "",
    name: r.name || "",
    shortName: r.short_name || "",
    rackNo: r.rack_no || "",
    password: "",
    mainCompanyId: r.main_company_id ? String(r.main_company_id) : "",
    mrEmails: parseEmailsToText(r.mr_emails),
    cfEmails: parseEmailsToText(r.cf_emails),
    mfgEmails: parseEmailsToText(r.mfg_emails),
    otherEmails: parseEmailsToText(r.other_emails),
    saleLock: Boolean(r.sale_lock),
    purchaseOrderLock: Boolean(r.purchase_order_lock),
    stockReportLock: Boolean(r.stock_report_lock),
    preventFreeQty: Boolean(r.prevent_free_qty),
    preventDiscount: Boolean(r.prevent_discount),
    preventNetRate: Boolean(r.prevent_net_rate),
    preventReturnProduct: Boolean(r.prevent_return_product),
    preventExpiryDamageProduct: Boolean(r.prevent_expiry_damage_product),
    outBillLimit: r.out_bill_limit ?? "",
    outDayLimit: r.out_day_limit ?? "",
    creditLimit: r.credit_limit ?? ""
  };
}

/**
 * Shared manufacturer master modal. Owns the full form UI, live uniqueness
 * checks and sale-lock activation prompt so every entry point shows identical
 * fields/validation.
 */
export default function MfgCompanyMasterModal({
  open,
  mode = "add",
  busy = false,
  initialValue = null,
  existingRows = [],
  onClose,
  onSubmit,
  portal = false,
  portalZIndex = 480,
  drawer = true
}) {
  const [form, setForm] = useState(emptyMfg);
  const [submitErrors, setSubmitErrors] = useState({});
  const [checking, setChecking] = useState(false);
  const [saleLockPrompt, setSaleLockPrompt] = useState({ open: false, activeBatchCount: 0, productCount: 0 });
  const [submitted, setSubmitted] = useState(false);
  // Draft preservation: when user closes via overlay, keep form data for next open.
  const overlayClosedRef = useRef(false);

  const isEdit = mode === "edit";
  const editingId = initialValue?.id || "";

  useEffect(() => {
    if (!open) {
      setSubmitted(false);
      setSubmitErrors({});
      setChecking(false);
      return;
    }
    // If closed via overlay, restore draft instead of re-initialising.
    if (overlayClosedRef.current) {
      overlayClosedRef.current = false;
      return;
    }
    if (isEdit && initialValue) {
      setForm({ ...emptyMfg, ...initialValue });
    } else {
      setForm({ ...emptyMfg });
    }
    setSubmitErrors({});
    setSubmitted(false);
  }, [open, isEdit, initialValue]);

  const mainCompanyOptions = useMemo(() => {
    const selfId = String(editingId || "");
    const items = (existingRows || [])
      .filter((c) => String(c.id) !== selfId)
      .map((c) => ({ value: String(c.id), label: `${c.code ? `[${c.code}] ` : ""}${c.name || ""}`.trim() }));
    items.sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "", label: " None " }, ...items];
  }, [existingRows, editingId]);

  const formErrors = useMemo(() => {
    const out = {};
    if (!clean(form.name)) out.name = "Name is required.";
    if (clean(form.code) && clean(form.code).length > 32) out.code = "Code must be 32 characters or less.";
    if (clean(form.mrEmails) && !validateEmailText(form.mrEmails)) out.mrEmails = "Enter valid emails separated by comma.";
    if (clean(form.cfEmails) && !validateEmailText(form.cfEmails)) out.cfEmails = "Enter valid emails separated by comma.";
    if (clean(form.mfgEmails) && !validateEmailText(form.mfgEmails)) out.mfgEmails = "Enter valid emails separated by comma.";
    if (clean(form.otherEmails) && !validateEmailText(form.otherEmails)) out.otherEmails = "Enter valid emails separated by comma.";
    const intOk = (v) => v === "" || Number.isFinite(Number.parseInt(String(v), 10));
    const moneyOk = (v) => v === "" || Number.isFinite(Number(String(v)));
    if (!intOk(form.outBillLimit)) out.outBillLimit = "Out bill limit must be a number.";
    if (!intOk(form.outDayLimit)) out.outDayLimit = "Out day limit must be a number.";
    if (!moneyOk(form.creditLimit)) out.creditLimit = "Credit limit must be a number.";
    return out;
  }, [form]);

  const canSubmit = Object.keys(formErrors).length === 0 && !busy;

  async function requestSaleLockEnable() {
    if (form.saleLock) return;
    if (!editingId) {
      setSaleLockPrompt({ open: true, activeBatchCount: 0, productCount: 0 });
      return;
    }
    const r = await getMfgCompanyPolicyImpact(editingId);
    if (r.status >= 200 && r.status < 300 && r.json?.ok) {
      setSaleLockPrompt({
        open: true,
        activeBatchCount: Number(r.json?.data?.impact?.activeBatchCount || 0),
        productCount: Number(r.json?.data?.impact?.productCount || 0)
      });
      return;
    }
    setSaleLockPrompt({ open: true, activeBatchCount: 0, productCount: 0 });
  }

  function buildPayload() {
    const payload = {
      code: clean(form.code),
      name: clean(form.name),
      shortName: clean(form.shortName),
      rackNo: clean(form.rackNo),
      mainCompanyId: clean(form.mainCompanyId),
      mrEmails: normalizeEmailText(form.mrEmails),
      cfEmails: normalizeEmailText(form.cfEmails),
      mfgEmails: normalizeEmailText(form.mfgEmails),
      otherEmails: normalizeEmailText(form.otherEmails),
      saleLock: Boolean(form.saleLock),
      purchaseOrderLock: Boolean(form.purchaseOrderLock),
      stockReportLock: Boolean(form.stockReportLock),
      preventFreeQty: Boolean(form.preventFreeQty),
      preventDiscount: Boolean(form.preventDiscount),
      preventNetRate: Boolean(form.preventNetRate),
      preventReturnProduct: Boolean(form.preventReturnProduct),
      preventExpiryDamageProduct: Boolean(form.preventExpiryDamageProduct),
      outBillLimit: form.outBillLimit === "" ? null : Number.parseInt(String(form.outBillLimit), 10),
      outDayLimit: form.outDayLimit === "" ? null : Number.parseInt(String(form.outDayLimit), 10),
      creditLimit: form.creditLimit === "" ? null : Number(String(form.creditLimit))
    };
    const pw = clean(form.password);
    if (pw) payload.password = pw;
    return payload;
  }

  /** Overlay click: close but preserve draft form data. */
  function handleOverlayClose() {
    if (busy) return;
    overlayClosedRef.current = true;
    onClose?.();
  }

  /** Explicit close (button / Escape): close and clear draft. */
  function handleExplicitClose() {
    if (busy) return;
    overlayClosedRef.current = false;
    onClose?.();
  }

  return (
    <>
      <CommonModal
        open={open}
        title={isEdit ? "Edit manufacturer" : "Add manufacturer"}
        subtitle=""
        icon={<IconMfgMark />}
        onClose={handleExplicitClose}
        onOverlayClose={handleOverlayClose}
        size="lg"
        loading={busy || checking}
        loadingText={busy ? "Saving manufacturer…" : checking ? "Checking code & name…" : "Working…"}
        portal={portal}
        portalZIndex={portalZIndex}
        drawer={drawer}
        footer={
          <ModalFooterShell meta={submitted && (Object.keys(formErrors).length > 0 || Object.keys(submitErrors).length > 0) ? "Fix errors to save." : ""}>
            <button className="mfzBtn appBtn appBtn_secondary appBtn_md" type="button" data-cm-cancel="true" onClick={handleExplicitClose} disabled={busy}>
              Close
            </button>
            <button
              className="mfzBtn appBtn appBtn_primary appBtn_md"
              type="button"
              data-cm-primary="true"
              disabled={busy || checking}
              onClick={async () => {
                setSubmitted(true);
                if (!canSubmit) return;
                setChecking(true);
                const newSubmitErrors = {};
                try {
                  const codeVal = clean(form.code);
                  const nameVal = clean(form.name);
                  const params = { exclude_id: editingId || "" };
                  if (codeVal) params.code = codeVal;
                  if (nameVal) params.name = nameVal;
                  const r = await checkMfgCompanyUnique(params);
                  if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                    const data = r.json.data || {};
                    if (data.code?.exists) newSubmitErrors.code = `Code "${codeVal.toUpperCase()}" is already used.`;
                    if (data.name?.exists) newSubmitErrors.name = `Name "${nameVal}" is already used.`;
                  }
                } catch { /* ignore — let backend handle */ }
                finally { setChecking(false); }
                setSubmitErrors(newSubmitErrors);
                if (Object.keys(newSubmitErrors).length > 0) return;
                onSubmit?.(buildPayload());
              }}
            >
              {busy ? (
                <InlineButtonProgress label={isEdit ? "Saving…" : "Creating…"} />
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create manufacturer"
              )}
            </button>
          </ModalFooterShell>
        }
      >
        <MfgCompanyFormV2
          form={form}
          setForm={setForm}
          errors={submitted ? { ...formErrors, ...submitErrors } : {}}
          mainCompanyOptions={mainCompanyOptions}
          isEdit={isEdit}
          onRequestSaleLockEnable={requestSaleLockEnable}
        />
      </CommonModal>

      <ConfirmDialog
        open={saleLockPrompt.open}
        title="Enable Sale Lock?"
        message={
          saleLockPrompt.activeBatchCount > 0
            ? `Enabling Sale Lock blocks sales across ${saleLockPrompt.productCount} product(s) and ${saleLockPrompt.activeBatchCount} active batch(es).`
            : "Enabling Sale Lock will block all future sales for this manufacturer."
        }
        hint="Draft invoices can still be created, but confirmation will be blocked until lock is removed."
        confirmLabel="Enable lock"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onClose={() => setSaleLockPrompt({ open: false, activeBatchCount: 0, productCount: 0 })}
        onConfirm={() => {
          setForm((prev) => ({ ...prev, saleLock: true }));
          setSaleLockPrompt({ open: false, activeBatchCount: 0, productCount: 0 });
        }}
      />
    </>
  );
}

function MfgCompanyFormV2({
  form,
  setForm,
  errors,
  mainCompanyOptions,
  isEdit = false,
  onRequestSaleLockEnable
}) {
  const setField = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
  const [changePassword, setChangePassword] = useState(!isEdit);
  useEffect(() => {
    setChangePassword(!isEdit);
    if (isEdit) setField("password", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  return (
    <ModalFormShell>
      <ModalFormBody>
        <ModalFormPanel aria-label="Identity">
          <ModalFormPanelHead>
            <ModalFormSectionTitle kicker="Identity" />
          </ModalFormPanelHead>
          <ModalFormPanelBody>
            <ModalFormGrid>
              {/* Name first — required, primary, wide */}
              <ModalFormField span={8} label="Name" required error={errors.name || null}>
                <input
                  className="mfzInput"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="Full company name"
                />
              </ModalFormField>
              <ModalFormField span={4} label="Code" error={errors.code || null}>
                <input
                  className="mfzInput"
                  value={form.code}
                  onChange={(e) => setField("code", e.target.value)}
                  placeholder="Auto-generated if empty"
                />
              </ModalFormField>

              {/* Short name + Rack — fill the full row evenly */}
              <ModalFormField span={6} label="Short name">
                <input className="mfzInput" value={form.shortName} onChange={(e) => setField("shortName", e.target.value)} placeholder="Optional label" />
              </ModalFormField>
              <ModalFormField span={6} label="Rack number">
                <input className="mfzInput" value={form.rackNo} onChange={(e) => setField("rackNo", e.target.value)} placeholder="Storage location" />
              </ModalFormField>

              {/* Main company — optional grouping, narrower than full width */}
              <ModalFormField
                span={8}
                label="Main company (group)"
                hint="Use this to group multiple manufacturers under one parent."
              >
                <select className="mfzInput" value={form.mainCompanyId} onChange={(e) => setField("mainCompanyId", e.target.value)} aria-label="Main company">
                  {mainCompanyOptions.map((o) => (
                    <option key={String(o.value)} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </ModalFormField>
            </ModalFormGrid>
          </ModalFormPanelBody>
        </ModalFormPanel>

        <ModalFormPanel aria-label="Protection">
          <ModalFormPanelHead>
            <ModalFormSectionTitle kicker="Protection" />
            {isEdit && !changePassword ? (
              <div className="mfzHeadRight">
                <button
                  type="button"
                  className="mfzToggle"
                  onClick={() => {
                    setChangePassword(true);
                    setField("password", "");
                  }}
                >
                  <span className="mfzToggleIcon" aria-hidden="true">
                    <IconChevronMini />
                  </span>
                  Change password
                </button>
              </div>
            ) : null}
          </ModalFormPanelHead>
          <ModalFormPanelBody>
            {isEdit && !changePassword ? (
              <div className="mfzNote">Password unchanged.</div>
            ) : (
              <ModalFormGrid>
                <ModalFormField span={6} label="Password (optional)">
                  <PasswordInput
                    className="mfzInput"
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                    placeholder={isEdit ? "Enter a new password" : "Optional protection password"}
                    autoComplete="new-password"
                  />
                  {isEdit ? (
                    <div className="mfzHelp">
                      <button
                        type="button"
                        className="mfzToggle mfgMiniBtn"
                        onClick={() => {
                          setChangePassword(false);
                          setField("password", "");
                        }}
                      >
                        Cancel change
                      </button>
                    </div>
                  ) : null}
                </ModalFormField>
              </ModalFormGrid>
            )}
          </ModalFormPanelBody>
        </ModalFormPanel>

        <ModalFormPanel aria-label="Email routing">
          <ModalFormPanelHead>
            <ModalFormSectionTitle
              kicker="Email routing"
              hint="Use comma, semicolon, or new line to add multiple emails."
            />
          </ModalFormPanelHead>
          <ModalFormPanelBody>
            <ModalFormGrid>
              <ModalFormField span={6} label={`MR emails${emailCount(form.mrEmails) ? ` (${emailCount(form.mrEmails)})` : ""}`} error={errors.mrEmails || null}>
                <textarea className="mfzTextarea" value={form.mrEmails} onChange={(e) => setField("mrEmails", e.target.value)} placeholder="mr1@x.com, mr2@x.com" />
              </ModalFormField>
              <ModalFormField span={6} label={`C&F emails${emailCount(form.cfEmails) ? ` (${emailCount(form.cfEmails)})` : ""}`} error={errors.cfEmails || null}>
                <textarea className="mfzTextarea" value={form.cfEmails} onChange={(e) => setField("cfEmails", e.target.value)} placeholder="cf@x.com" />
              </ModalFormField>
              <ModalFormField span={6} label={`Manufacturer emails${emailCount(form.mfgEmails) ? ` (${emailCount(form.mfgEmails)})` : ""}`} error={errors.mfgEmails || null}>
                <textarea className="mfzTextarea" value={form.mfgEmails} onChange={(e) => setField("mfgEmails", e.target.value)} placeholder="company@x.com" />
              </ModalFormField>
              <ModalFormField span={6} label={`Other emails${emailCount(form.otherEmails) ? ` (${emailCount(form.otherEmails)})` : ""}`} error={errors.otherEmails || null}>
                <textarea className="mfzTextarea" value={form.otherEmails} onChange={(e) => setField("otherEmails", e.target.value)} placeholder="other@x.com" />
              </ModalFormField>
            </ModalFormGrid>
          </ModalFormPanelBody>
        </ModalFormPanel>

        <ModalFormPanel aria-label="Operational locks">
          <ModalFormPanelHead>
            <ModalFormSectionTitle kicker="Operational locks" />
          </ModalFormPanelHead>
          <ModalFormPanelBody>
            <div className="mfgTwoColChecks">
              <label className="mfzCheck">
                <input
                  type="checkbox"
                  checked={form.saleLock}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onRequestSaleLockEnable?.();
                      return;
                    }
                    setField("saleLock", false);
                  }}
                />
                <span>Sale lock</span>
              </label>
              <label className="mfzCheck">
                <input type="checkbox" checked={form.purchaseOrderLock} onChange={(e) => setField("purchaseOrderLock", e.target.checked)} />
                <span>
                  Purchase lock
                  <span className="mfgCheckDesc">Blocks confirming purchase invoices for this manufacturer.</span>
                </span>
              </label>
              <label className="mfzCheck">
                <input type="checkbox" checked={form.stockReportLock} onChange={(e) => setField("stockReportLock", e.target.checked)} />
                <span>Stock visibility lock</span>
              </label>
            </div>
          </ModalFormPanelBody>
        </ModalFormPanel>

        <ModalFormPanel aria-label="Billing restrictions">
          <ModalFormPanelHead>
            <ModalFormSectionTitle kicker="Billing restrictions" />
          </ModalFormPanelHead>
          <ModalFormPanelBody>
            <div className="mfgTwoColChecks">
              <label className="mfzCheck">
                <input type="checkbox" checked={form.preventFreeQty} onChange={(e) => setField("preventFreeQty", e.target.checked)} />
                <span>Prevent free quantity</span>
              </label>
              <label className="mfzCheck">
                <input type="checkbox" checked={form.preventDiscount} onChange={(e) => setField("preventDiscount", e.target.checked)} />
                <span>Prevent discount</span>
              </label>
              <label className="mfzCheck">
                <input type="checkbox" checked={form.preventNetRate} onChange={(e) => setField("preventNetRate", e.target.checked)} />
                <span>Prevent net rate edits</span>
              </label>
              <label className="mfzCheck">
                <input type="checkbox" checked={form.preventReturnProduct} onChange={(e) => setField("preventReturnProduct", e.target.checked)} />
                <span>Prevent returns</span>
              </label>
              <label className="mfzCheck">
                <input type="checkbox" checked={form.preventExpiryDamageProduct} onChange={(e) => setField("preventExpiryDamageProduct", e.target.checked)} />
                <span>
                  Prevent expiry/damage entries
                  <span className="mfgCheckDesc">Disable expiry/damage entries for this manufacturer.</span>
                </span>
              </label>
            </div>
          </ModalFormPanelBody>
        </ModalFormPanel>

        <ModalFormPanel aria-label="Financial limits">
          <ModalFormPanelHead>
            <ModalFormSectionTitle kicker="Financial limits" />
          </ModalFormPanelHead>
          <ModalFormPanelBody>
            <ModalFormGrid>
              <ModalFormField span={4} label="Out bill limit" error={errors.outBillLimit || null}>
                <AmountInput
                  className="mfzInput"
                  value={String(form.outBillLimit ?? "")}
                  onChange={(raw) => setField("outBillLimit", raw)}
                  inputMode="numeric"
                  placeholder="e.g. 20"
                />
              </ModalFormField>
              <ModalFormField span={4} label="Out day limit" error={errors.outDayLimit || null} hint="Maximum overdue age (days).">
                <input className="mfzInput" value={form.outDayLimit} onChange={(e) => setField("outDayLimit", e.target.value)} inputMode="numeric" placeholder="e.g. 30" />
              </ModalFormField>
              <ModalFormField span={4} label="Credit limit" error={errors.creditLimit || null}>
                <AmountInput
                  className="mfzInput"
                  value={String(form.creditLimit ?? "")}
                  onChange={(raw) => setField("creditLimit", raw)}
                  inputMode="decimal"
                  placeholder="e.g. 50,000"
                />
              </ModalFormField>
            </ModalFormGrid>
          </ModalFormPanelBody>
        </ModalFormPanel>
      </ModalFormBody>
    </ModalFormShell>
  );
}
