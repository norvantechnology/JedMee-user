import { InlineButtonProgress } from "./ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import CommonModal from "./CommonModal.jsx";
import ModalFooterShell from "./ui/ModalFooterShell.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { checkMfgCompanyUnique, getMfgCompanyPolicyImpact } from "../services/mfgCompanyService.js";
import PasswordInput from "./ui/PasswordInput.jsx";
import AmountInput from "./ui/AmountInput.jsx";
import "./MasterModalForm.css";
import "./MfgCompanyMasterModal.css";
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
  portalZIndex = 480
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
        portal={portal}
        portalZIndex={portalZIndex}
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
    <div className="mfz">
      <div className="mfzBody">
        <section className="mfzPanel" aria-label="Identity">
          <div className="mfzPanelHead">
            <div>
              <div className="mfzHeadKicker">Identity</div>
            </div>
          </div>
          <div className="mfzPanelBody">
            <div className="mfzGrid">
              <div className="mfzField mfz4">
                <div className="mfzLabel">Code</div>
                <input
                  className="mfzInput"
                  value={form.code}
                  onChange={(e) => setField("code", e.target.value)}
                  placeholder="Auto-generated if empty"
                />
                {errors.code ? <div className="mfzErr">{errors.code}</div> : null}
              </div>

              <div className="mfzField mfz8">
                <div className="mfzLabel">
                  Name <span className="reqMark" aria-hidden="true">*</span>
                </div>
                <input
                  className="mfzInput"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="Full company name"
                />
                {errors.name ? <div className="mfzErr">{errors.name}</div> : null}
              </div>

              <div className="mfzField mfz4">
                <div className="mfzLabel">Short name</div>
                <input className="mfzInput" value={form.shortName} onChange={(e) => setField("shortName", e.target.value)} placeholder="Optional label" />
              </div>
              <div className="mfzField mfz4">
                <div className="mfzLabel">Rack number</div>
                <input className="mfzInput" value={form.rackNo} onChange={(e) => setField("rackNo", e.target.value)} placeholder="Storage location" />
              </div>

              <div className="mfzField mfz12">
                <div className="mfzLabel">Main company (group)</div>
                <select className="mfzInput" value={form.mainCompanyId} onChange={(e) => setField("mainCompanyId", e.target.value)} aria-label="Main company">
                  {mainCompanyOptions.map((o) => (
                    <option key={String(o.value)} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div className="mfzHelp">Use this to group multiple manufacturers under one parent.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mfzPanel" aria-label="Protection">
          <div className="mfzPanelHead">
            <div>
              <div className="mfzHeadKicker">Protection</div>
            </div>
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
          </div>
          <div className="mfzPanelBody">
            {isEdit && !changePassword ? (
              <div className="mfzNote">Password unchanged.</div>
            ) : (
              <div className="mfzGrid">
                <div className="mfzField mfz12">
                  <div className="mfzLabel">Password (optional)</div>
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
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="mfzPanel" aria-label="Email routing">
          <div className="mfzPanelHead">
            <div>
              <div className="mfzHeadKicker">Email routing</div>
              <div className="mfzHeadHint">Use comma, semicolon, or new line to add multiple emails.</div>
            </div>
          </div>
          <div className="mfzPanelBody">
            <div className="mfzGrid">
              <div className="mfzField mfz6">
                <div className="mfzLabel">MR emails {emailCount(form.mrEmails) ? `(${emailCount(form.mrEmails)})` : ""}</div>
                <textarea className="mfzTextarea" value={form.mrEmails} onChange={(e) => setField("mrEmails", e.target.value)} placeholder="mr1@x.com, mr2@x.com" />
                {errors.mrEmails ? <div className="mfzErr">{errors.mrEmails}</div> : null}
              </div>
              <div className="mfzField mfz6">
                <div className="mfzLabel">C&F emails {emailCount(form.cfEmails) ? `(${emailCount(form.cfEmails)})` : ""}</div>
                <textarea className="mfzTextarea" value={form.cfEmails} onChange={(e) => setField("cfEmails", e.target.value)} placeholder="cf@x.com" />
                {errors.cfEmails ? <div className="mfzErr">{errors.cfEmails}</div> : null}
              </div>
              <div className="mfzField mfz6">
                <div className="mfzLabel">Manufacturer emails {emailCount(form.mfgEmails) ? `(${emailCount(form.mfgEmails)})` : ""}</div>
                <textarea className="mfzTextarea" value={form.mfgEmails} onChange={(e) => setField("mfgEmails", e.target.value)} placeholder="company@x.com" />
                {errors.mfgEmails ? <div className="mfzErr">{errors.mfgEmails}</div> : null}
              </div>
              <div className="mfzField mfz6">
                <div className="mfzLabel">Other emails {emailCount(form.otherEmails) ? `(${emailCount(form.otherEmails)})` : ""}</div>
                <textarea className="mfzTextarea" value={form.otherEmails} onChange={(e) => setField("otherEmails", e.target.value)} placeholder="other@x.com" />
                {errors.otherEmails ? <div className="mfzErr">{errors.otherEmails}</div> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="mfzPanel" aria-label="Operational locks">
          <div className="mfzPanelHead">
            <div>
              <div className="mfzHeadKicker">Operational locks</div>
            </div>
          </div>
          <div className="mfzPanelBody">
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
          </div>
        </section>

        <section className="mfzPanel" aria-label="Billing restrictions">
          <div className="mfzPanelHead">
            <div>
              <div className="mfzHeadKicker">Billing restrictions</div>
            </div>
          </div>
          <div className="mfzPanelBody">
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
          </div>
        </section>

        <section className="mfzPanel" aria-label="Financial limits">
          <div className="mfzPanelHead">
            <div>
              <div className="mfzHeadKicker">Financial limits</div>
            </div>
          </div>
          <div className="mfzPanelBody">
            <div className="mfzGrid">
              <div className="mfzField mfz4">
                <div className="mfzLabel">Out bill limit</div>
                <AmountInput
                  className="mfzInput"
                  value={String(form.outBillLimit ?? "")}
                  onChange={(raw) => setField("outBillLimit", raw)}
                  inputMode="numeric"
                  placeholder="e.g. 20"
                />
                {errors.outBillLimit ? <div className="mfzErr">{errors.outBillLimit}</div> : null}
              </div>
              <div className="mfzField mfz4">
                <div className="mfzLabel">Out day limit</div>
                <input className="mfzInput" value={form.outDayLimit} onChange={(e) => setField("outDayLimit", e.target.value)} inputMode="numeric" placeholder="e.g. 30" />
                {errors.outDayLimit ? <div className="mfzErr">{errors.outDayLimit}</div> : null}
                <div className="mfzHelp">Maximum overdue age (days).</div>
              </div>
              <div className="mfzField mfz4">
                <div className="mfzLabel">Credit limit</div>
                <AmountInput
                  className="mfzInput"
                  value={String(form.creditLimit ?? "")}
                  onChange={(raw) => setField("creditLimit", raw)}
                  inputMode="decimal"
                  placeholder="e.g. 50,000"
                />
                {errors.creditLimit ? <div className="mfzErr">{errors.creditLimit}</div> : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
