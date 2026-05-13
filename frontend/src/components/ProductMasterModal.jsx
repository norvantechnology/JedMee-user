import { InlineButtonProgress } from "./ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../context/LocaleContext.jsx";
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
import { checkProductName } from "../services/productService.js";
import { toDivisionOption } from "../utils/divisionLabel.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { readAuth } from "../services/authStorage.js";
import { IconProductMark } from "./ui/AppIcons.jsx";
import ModalFooterShell from "./ui/ModalFooterShell.jsx";
import { useDebounce } from "../utils/useDebounce.js";
import "./ProductMasterModal.css";

function clean(v) { return String(v ?? "").trim(); }
function toBool(v) {
  if (v === true || v === false) return v;
  return ["1","true","yes","on"].includes(String(v ?? "").trim().toLowerCase());
}

export default function ProductMasterModal({
  open, mode = "add", busy = false, loading = false, initialValue = null,
  mfgCompanyOptions = [], divisionOptions = [], vendorOptions = [],
  onRefreshMfg, onRefreshDivisions, onClose, onSubmit,
  portal = false, portalZIndex = 480, drawer = true
}) {
  const readOnly = mode === "view";
  const isRetailer = useMemo(() => isRetailerAuth(readAuth()), []);
  const { taxLabel, taxRates } = useLocale();
  const TAX_OPTIONS = taxRates.length ? taxRates.map(String) : ["0","5","12","18","28"];
  const [form, setForm] = useState(() => emptyForm());
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [nameError, setNameError] = useState("");
  const [checking, setChecking] = useState(false);
  const casePackManualRef = useRef(false);

  function emptyForm() {
    return {
      code:"", name:"", drugName:"", divisionId:"", mfgCompanyId:"", supplierId:"",
      hsnCode:"", rackLocation:"", packing:"", bulkPack:"", casePack:"",
      unitsPerStrip:"1", conversionUnit:"", salesGST:"", purchaseGST:"", salesScheme:"",
      schemeQtyPaid:"", schemeQtyFree:"",
      stockable:true, isDiscountEnabled:true, isControl:false,
      isHalfScheme:false, isOtc:true, lowStockAlertEnabled:false, lowStockThreshold:"0"
    };
  }

  useEffect(() => {
    if (!open) { setSubmitted(false); setNameError(""); setChecking(false); return; }
    casePackManualRef.current = false;
    if (initialValue) {
      setForm({
        code: clean(initialValue.code),
        name: clean(initialValue.name),
        drugName: clean(initialValue.drug_name ?? initialValue.drugName),
        divisionId: clean(initialValue.division_id ?? initialValue.divisionId),
        mfgCompanyId: clean(initialValue.mfg_company_id ?? initialValue.mfgCompanyId),
        supplierId: clean(initialValue.supplier_id ?? initialValue.supplierId),
        hsnCode: clean(initialValue.hsn_code ?? initialValue.hsnCode),
        rackLocation: clean(initialValue.rack_location ?? initialValue.rackLocation),
        packing: clean(initialValue.packing),
        bulkPack: clean(initialValue.bulk_pack ?? initialValue.bulkPack),
        casePack: clean(initialValue.case_pack ?? initialValue.casePack),
        unitsPerStrip: initialValue.units_per_strip != null ? String(initialValue.units_per_strip) : initialValue.unitsPerStrip != null ? String(initialValue.unitsPerStrip) : "1",
        conversionUnit: clean(initialValue.conversion_unit ?? initialValue.conversionUnit),
        salesGST: initialValue.sales_gst != null ? String(initialValue.sales_gst) : initialValue.salesGST != null ? String(initialValue.salesGST) : "",
        purchaseGST: initialValue.purchase_gst != null ? String(initialValue.purchase_gst) : initialValue.purchaseGST != null ? String(initialValue.purchaseGST) : "",
        salesScheme: clean(initialValue.sales_scheme ?? initialValue.salesScheme),
        schemeQtyPaid: initialValue.scheme_qty_paid != null ? String(initialValue.scheme_qty_paid) : initialValue.schemeQtyPaid != null ? String(initialValue.schemeQtyPaid) : "",
        schemeQtyFree: initialValue.scheme_qty_free != null ? String(initialValue.scheme_qty_free) : initialValue.schemeQtyFree != null ? String(initialValue.schemeQtyFree) : "",
        stockable: initialValue.stockable !== undefined ? toBool(initialValue.stockable) : true,
        isDiscountEnabled: initialValue.is_discount_enabled !== undefined ? toBool(initialValue.is_discount_enabled) : initialValue.isDiscountEnabled !== undefined ? toBool(initialValue.isDiscountEnabled) : true,
        isControl: toBool(initialValue.is_control ?? initialValue.isControl),
        isHalfScheme: toBool(initialValue.is_half_scheme ?? initialValue.isHalfScheme),
        isOtc: initialValue.is_otc !== undefined ? toBool(initialValue.is_otc) : initialValue.isOtc !== undefined ? toBool(initialValue.isOtc) : true,
        lowStockAlertEnabled: toBool(initialValue.low_stock_alert_enabled ?? initialValue.lowStockAlertEnabled),
        lowStockThreshold: String(initialValue.low_stock_threshold ?? initialValue.lowStockThreshold ?? 0)
      });
    } else {
      setForm(emptyForm());
    }
    setTouched({});
  }, [open, initialValue]);

  useEffect(() => {
    if (!open || readOnly || casePackManualRef.current) return;
    const p = Number(form.packing), b = Number(form.bulkPack);
    if (Number.isFinite(p) && p > 0 && Number.isFinite(b) && b > 0)
      setForm((prev) => ({ ...prev, casePack: String(p * b) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.packing, form.bulkPack]);

  const selectedDivision = useMemo(() => {
    const id = String(form.divisionId || "").trim();
    if (!id) return null;
    return (divisionOptions || []).find((d) => String(d.id) === id) || null;
  }, [form.divisionId, divisionOptions]);

  const derivedMfgCompanyId = selectedDivision
    ? String(selectedDivision.mfg_company_id || "")
    : String(form.mfgCompanyId || "");

  const selectedMfg = useMemo(() => {
    const id = derivedMfgCompanyId;
    if (!id) return null;
    return (mfgCompanyOptions || []).find((c) => String(c.id) === id) || null;
  }, [derivedMfgCompanyId, mfgCompanyOptions]);

  const manufacturerLockHint = useMemo(() => {
    if (!selectedMfg) return null;
    const parts = [
      selectedMfg.sale_lock ? "Sale locked" : "",
      selectedMfg.prevent_free_qty ? "No free qty" : "",
      selectedMfg.prevent_discount ? "No discounts" : "",
      selectedMfg.prevent_net_rate ? "Net rate locked" : ""
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }, [selectedMfg]);

  useEffect(() => {
    if (!open || readOnly) return;
    if (selectedDivision) {
      const mfg = String(selectedDivision.mfg_company_id || "");
      if (mfg && String(form.mfgCompanyId || "") !== mfg)
        setForm((p) => ({ ...p, mfgCompanyId: mfg }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDivision?.id]);

  const thresholdNum = Number(form.lowStockThreshold);
  const thresholdInvalid = form.lowStockAlertEnabled && (!Number.isFinite(thresholdNum) || thresholdNum < 0);

  const errors = useMemo(() => {
    const out = {};
    if (clean(form.name).length < 2) out.name = "Enter a product name (at least 2 characters).";
    if (!isRetailer && !clean(form.divisionId)) out.divisionId = "Choose a division.";
    if (isRetailer && !clean(form.mfgCompanyId)) out.mfgCompanyId = "Please select a brand or company.";
    if (form.salesGST && !TAX_OPTIONS.includes(String(form.salesGST))) out.salesGST = `Choose a valid ${taxLabel} rate.`;
    if (form.purchaseGST && !TAX_OPTIONS.includes(String(form.purchaseGST))) out.purchaseGST = `Choose a valid ${taxLabel} rate.`;
    if (!isRetailer) {
      const freeN = Number(form.schemeQtyFree), paidN = Number(form.schemeQtyPaid);
      if (clean(form.schemeQtyFree) && clean(form.schemeQtyPaid) && (!Number.isFinite(paidN) || paidN <= 0))
        out.schemeQtyPaid = "Paid quantity must be greater than 0 when free quantity is set.";
      if (Number.isFinite(freeN) && freeN > 0 && (!clean(form.schemeQtyPaid) || !(paidN > 0)))
        out.schemeQtyPaid = "Paid quantity must be greater than 0 when free quantity is set.";
    }
    if (thresholdInvalid) out.lowStockThreshold = "Enter zero or a positive number.";
    return out;
  }, [form, thresholdInvalid, isRetailer]);

  const hasErrors = Object.keys(errors).length > 0;
  const displayErrors = useDebounce(errors, 500);
  const title = mode === "add" ? "Add product" : mode === "edit" ? "Edit product" : "Product";
  const hasVendors = (vendorOptions || []).length > 0;

  function setField(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function buildPayload() {
    return {
      ...(mode === "add" ? { code: clean(form.code) || undefined } : {}),
      name: clean(form.name),
      drugName: clean(form.drugName) || undefined,
      divisionId: clean(form.divisionId) || undefined,
      mfgCompanyId: clean(form.mfgCompanyId) || undefined,
      supplierId: !isRetailer ? (clean(form.supplierId) || undefined) : undefined,
      hsnCode: clean(form.hsnCode) || undefined,
      rackLocation: clean(form.rackLocation) || undefined,
      packing: clean(form.packing) || undefined,
      bulkPack: clean(form.bulkPack) || undefined,
      casePack: clean(form.casePack) || undefined,
      unitsPerStrip: clean(form.unitsPerStrip) !== "" ? Math.max(1, Number(form.unitsPerStrip) || 1) : 1,
      conversionUnit: clean(form.conversionUnit) || undefined,
      salesGST: clean(form.salesGST) !== "" ? Number(form.salesGST) : null,
      purchaseGST: clean(form.purchaseGST) !== "" ? Number(form.purchaseGST) : null,
      salesScheme: isRetailer ? undefined : clean(form.salesScheme) || undefined,
      schemeQtyPaid: isRetailer ? null : clean(form.schemeQtyPaid) !== "" ? Number(form.schemeQtyPaid) : null,
      schemeQtyFree: isRetailer ? null : clean(form.schemeQtyFree) !== "" ? Number(form.schemeQtyFree) : null,
      stockable: Boolean(form.stockable),
      isDiscountEnabled: Boolean(form.isDiscountEnabled),
      isControl: Boolean(form.isControl),
      isHalfScheme: isRetailer ? false : Boolean(form.isHalfScheme),
      isOtc: Boolean(form.isOtc),
      lowStockAlertEnabled: Boolean(form.lowStockAlertEnabled),
      lowStockThreshold: form.lowStockAlertEnabled ? Number(form.lowStockThreshold || 0) : 0
    };
  }

  const policyChecks = isRetailer
    ? [
        ["stockable","Stockable","Track inventory."],
        ["isDiscountEnabled","Allow discounts","Line discounts at billing."],
        ["isControl","Controlled (Schedule H/H1/X)","Prescription required in sales."],
        ["isOtc","OTC","Sold without prescription when allowed."]
      ]
    : [
        ["stockable","Stockable","Track inventory."],
        ["isDiscountEnabled","Allow discounts","Retail and net discounts."],
        ["isControl","Controlled (Rx)","Prescription required in sales."],
        ["isOtc","OTC","Sold without prescription when allowed."],
        ["isHalfScheme","Half scheme","Free units at 50% taxable value."]
      ];

  const casePackAutoHint =
    !readOnly && Number(form.packing) > 0 && Number(form.bulkPack) > 0 && !casePackManualRef.current
      ? `${form.packing} × ${form.bulkPack} = ${Number(form.packing) * Number(form.bulkPack)}`
      : null;

  return (
    <CommonModal
      open={open}
      title={title}
      icon={<IconProductMark />}
      onClose={() => !busy && onClose?.()}
      loading={loading}
      loadingText="Loading required data…"
      size={780}
      portal={portal}
      portalZIndex={portalZIndex}
      drawer={drawer}
      footer={
        <ModalFooterShell meta={readOnly || !(submitted && hasErrors) ? "" : "Fix errors to save."}>
          <button className="mfzBtn appBtn appBtn_secondary appBtn_md" type="button" data-cm-cancel="true" disabled={busy} onClick={() => onClose?.()}>
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly ? (
            <button
              className="mfzBtn appBtn appBtn_primary appBtn_md"
              type="button"
              data-cm-primary="true"
              disabled={busy || checking}
              onClick={async () => {
                setSubmitted(true);
                if (hasErrors) return;
                const name = clean(form.name);
                const mfg = derivedMfgCompanyId;
                if (name.length >= 2 && (isRetailer || mfg)) {
                  setChecking(true);
                  try {
                    const res = await checkProductName({ name, mfgCompanyId: mfg || "", excludeId: initialValue?.id || "" });
                    const data = res?.json?.data || {};
                    if (!data.available && data.existing_product) {
                      setNameError(isRetailer
                        ? `"${name}" is already in your catalog (${data.existing_product.code}).`
                        : `"${name}" already exists for this manufacturer (${data.existing_product.code}).`);
                      return;
                    }
                  } catch { /* ignore */ }
                  finally { setChecking(false); }
                }
                setNameError("");
                onSubmit?.(buildPayload());
              }}
            >
              {busy ? <InlineButtonProgress label="Saving…" /> : mode === "add" ? "Create product" : "Save changes"}
            </button>
          ) : null}
        </ModalFooterShell>
      }
    >
      <ModalFormShell className="pmmForm">
        <ModalFormBody>

          {/* ── SECTION 1: Product identity ──────────────────────────────────────
              Retailer:   Brand (8) + SKU (4) → Name (12) → Generic (8) + Rack (4) → HSN (4)
              Wholesaler: Division (6) + Mfg (6) → Name (12) → Generic (8) + SKU (4) → HSN (4) + Rack (4) + Supplier (4)
              ─────────────────────────────────────────────────────────────────── */}
          <ModalFormPanel aria-label="Product details" className="pmmPanel pmmPanel_details">
            <ModalFormPanelHead>
              <ModalFormSectionTitle kicker="Product details" />
            </ModalFormPanelHead>
            <ModalFormPanelBody>
              <ModalFormGrid className="pmmGrid">

                {/* Retailer: Brand/Company (required, wide) + SKU code (narrow) */}
                {isRetailer ? (
                  <ModalFormField span={8} label="Brand / Company" required error={displayErrors.mfgCompanyId || null}>
                    <MasterSelectWithCreate
                      kind="mfgCompany"
                      selectClassName={`mfzInput${displayErrors.mfgCompanyId ? " mfzInput_err" : ""}`}
                      value={String(form.mfgCompanyId || "")}
                      disabled={busy || readOnly}
                      onChange={(v, createdRow) => {
                        const id = v != null ? String(v) : "";
                        if (createdRow && String(createdRow.id) === id && onRefreshMfg) onRefreshMfg();
                        setForm((p) => ({ ...p, mfgCompanyId: id }));
                      }}
                      onListsRefresh={async () => { if (onRefreshMfg) await onRefreshMfg(); }}
                      placeholder="Select brand or company"
                      options={(mfgCompanyOptions || []).map((m) => ({
                        value: String(m.id),
                        label: `${m.name || ""}${m.short_name ? ` (${m.short_name})` : ""}`
                      }))}
                    />
                  </ModalFormField>
                ) : null}
                {isRetailer ? (
                  <ModalFormField span={4} label="SKU code">
                    <input className="mfzInput" value={form.code} readOnly={readOnly || mode === "edit"} placeholder={mode === "add" ? "Auto if blank" : ""} onChange={(e) => setField("code", e.target.value)} />
                  </ModalFormField>
                ) : null}

                {/* Wholesaler: Division (required) + Manufacturer (derived, read-only) */}
                {!isRetailer ? (
                  <ModalFormField span={6} label="Division" required error={displayErrors.divisionId || null}>
                    <MasterSelectWithCreate
                      kind="division"
                      productMfgOptions={mfgCompanyOptions}
                      selectClassName="mfzInput"
                      value={String(form.divisionId || "")}
                      disabled={busy || readOnly}
                      onChange={(v, createdRow) => {
                        const id = v != null ? String(v) : "";
                        const row = (createdRow && String(createdRow.id) === id ? createdRow : null) || (divisionOptions || []).find((d) => String(d.id) === id);
                        const mfg = row?.mfg_company_id != null ? String(row.mfg_company_id) : "";
                        setForm((p) => ({ ...p, divisionId: id, mfgCompanyId: mfg || "" }));
                      }}
                      onListsRefresh={async () => {
                        if (onRefreshDivisions) await onRefreshDivisions();
                        if (onRefreshMfg) await onRefreshMfg();
                      }}
                      placeholder="Select division"
                      options={(divisionOptions || []).map((d) => ({ ...toDivisionOption(d), value: String(d.id) }))}
                    />
                  </ModalFormField>
                ) : null}
                {!isRetailer ? (
                  <ModalFormField span={6} label="Manufacturer" hint={manufacturerLockHint}>
                    <input className="mfzInput pmmInputReadonlyDisplay" readOnly value={selectedMfg ? `${selectedMfg.name || ""}${selectedMfg.short_name ? ` (${selectedMfg.short_name})` : ""}` : ""} placeholder="Select a division first" />
                  </ModalFormField>
                ) : null}

                {/* Both roles: Product name — required, full width, hero */}
                <ModalFormField span={12} label="Product name" required error={nameError || displayErrors.name || null}>
                  <input
                    className={`mfzInput pmmInputHero${nameError || displayErrors.name ? " mfzInput_err" : ""}`}
                    value={form.name}
                    readOnly={readOnly}
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    onChange={(e) => { setNameError(""); setField("name", e.target.value); }}
                    placeholder="e.g. Brand name + strength + form"
                  />
                </ModalFormField>

                {/* Retailer: Generic/drug name (wide) + Rack or shelf (narrow) */}
                {isRetailer ? (
                  <ModalFormField span={8} label="Generic / drug name">
                    <input className="mfzInput pmmInputSecondary" value={form.drugName} readOnly={readOnly} onChange={(e) => setField("drugName", e.target.value)} placeholder="INN or generic (optional)" />
                  </ModalFormField>
                ) : null}
                {isRetailer ? (
                  <ModalFormField span={4} label="Rack or shelf">
                    <input className="mfzInput" value={form.rackLocation} readOnly={readOnly} onChange={(e) => setField("rackLocation", e.target.value)} placeholder="e.g. A-3" />
                  </ModalFormField>
                ) : null}

                {/* Wholesaler: Generic/drug name (wide) + SKU code (narrow) */}
                {!isRetailer ? (
                  <ModalFormField span={8} label="Generic / drug name">
                    <input className="mfzInput pmmInputSecondary" value={form.drugName} readOnly={readOnly} onChange={(e) => setField("drugName", e.target.value)} placeholder="INN or generic (optional)" />
                  </ModalFormField>
                ) : null}
                {!isRetailer ? (
                  <ModalFormField span={4} label="SKU code">
                    <input className="mfzInput" value={form.code} readOnly={readOnly || mode === "edit"} placeholder={mode === "add" ? "Auto if blank" : ""} onChange={(e) => setField("code", e.target.value)} />
                  </ModalFormField>
                ) : null}

                {/* Retailer: HSN/Tax Code (narrow, last optional row) */}
                {isRetailer ? (
                  <ModalFormField span={4} label="HSN / Tax Code" hint="Tax classification.">
                    <input className="mfzInput" value={form.hsnCode} readOnly={readOnly} onChange={(e) => setField("hsnCode", e.target.value)} placeholder="e.g. 3004" />
                  </ModalFormField>
                ) : null}

                {/* Wholesaler: HSN (4) + Rack (4) + Supplier (4) — all optional, narrow */}
                {!isRetailer ? (
                  <ModalFormField span={4} label="HSN / Tax Code" hint="Tax classification.">
                    <input className="mfzInput" value={form.hsnCode} readOnly={readOnly} onChange={(e) => setField("hsnCode", e.target.value)} placeholder="e.g. 3004" />
                  </ModalFormField>
                ) : null}
                {!isRetailer ? (
                  <ModalFormField span={4} label="Rack or shelf">
                    <input className="mfzInput" value={form.rackLocation} readOnly={readOnly} onChange={(e) => setField("rackLocation", e.target.value)} placeholder="e.g. A-3" />
                  </ModalFormField>
                ) : null}
                {!isRetailer && hasVendors ? (
                  <ModalFormField span={4} label="Supplier" hint="Optional — can differ from division.">
                    <select className="mfzInput" value={form.supplierId} disabled={busy || readOnly} onChange={(e) => setField("supplierId", e.target.value)}>
                      <option value="">— No supplier —</option>
                      {(vendorOptions || []).map((v) => (
                        <option key={v.id} value={String(v.id)}>
                          {v.name || v.short_name || String(v.id)}{v.short_name && v.name && v.short_name !== v.name ? ` (${v.short_name})` : ""}
                        </option>
                      ))}
                    </select>
                  </ModalFormField>
                ) : null}

              </ModalFormGrid>
            </ModalFormPanelBody>
          </ModalFormPanel>

          {/* ── SECTION 2: Packaging · Tax ───────────────────────────────────────
              Row 1: Strips/box (4) + Boxes/case (4) + Strips/case (4)
              Row 2: Purchase GST (4) + Sales GST (4) + Conversion (4)
              ─────────────────────────────────────────────────────────────────── */}
          <ModalFormPanel aria-label="Packaging and tax" className="pmmPanel pmmPanel_pack">
            <ModalFormPanelHead>
              <ModalFormSectionTitle kicker={`Packaging · ${taxLabel}`} />
            </ModalFormPanelHead>
            <ModalFormPanelBody>
              <ModalFormGrid className="pmmGrid">

                <ModalFormField span={4} label="Strips per box">
                  <input className="mfzInput" value={form.packing} readOnly={readOnly} onChange={(e) => { casePackManualRef.current = false; setField("packing", e.target.value); }} placeholder="e.g. 10" inputMode="numeric" />
                </ModalFormField>
                <ModalFormField span={4} label="Boxes per case">
                  <input className="mfzInput" value={form.bulkPack} readOnly={readOnly} onChange={(e) => { casePackManualRef.current = false; setField("bulkPack", e.target.value); }} placeholder="e.g. 10" inputMode="numeric" />
                </ModalFormField>
                <ModalFormField
                  span={4}
                  label={<>{`Strips per case`}{!readOnly && Number(form.packing) > 0 && Number(form.bulkPack) > 0 ? <span className="mfzHelp" style={{ fontWeight: 400 }}> (auto)</span> : null}</>}
                  hint={casePackAutoHint}
                >
                  <input className="mfzInput" value={form.casePack} readOnly={readOnly} onChange={(e) => { casePackManualRef.current = true; setField("casePack", e.target.value); }} placeholder="e.g. 100" inputMode="numeric" />
                </ModalFormField>

                <ModalFormField span={4} label={`Purchase ${taxLabel} %`} error={displayErrors.purchaseGST || null}>
                  <select className="mfzInput" value={form.purchaseGST} disabled={readOnly} onChange={(e) => setField("purchaseGST", e.target.value)}>
                    <option value="">Select</option>
                    {TAX_OPTIONS.map((g) => <option key={g} value={g}>{g}%</option>)}
                  </select>
                </ModalFormField>
                <ModalFormField span={4} label={`Sales ${taxLabel} %`} error={displayErrors.salesGST || null}>
                  <select className="mfzInput" value={form.salesGST} disabled={readOnly} onChange={(e) => setField("salesGST", e.target.value)}>
                    <option value="">Select</option>
                    {TAX_OPTIONS.map((g) => <option key={g} value={g}>{g}%</option>)}
                  </select>
                </ModalFormField>
                <ModalFormField span={4} label="Units per strip" hint="Tablets / capsules / ml in 1 strip.">
                  <input
                    className="mfzInput"
                    value={form.unitsPerStrip}
                    readOnly={readOnly}
                    inputMode="numeric"
                    onChange={(e) => setField("unitsPerStrip", e.target.value)}
                    placeholder="e.g. 10"
                  />
                </ModalFormField>

              </ModalFormGrid>
            </ModalFormPanelBody>
          </ModalFormPanel>

          {/* ── SECTION 3: Scheme (wholesaler only) ─────────────────────────────
              Scheme note (6) + Paid qty (3) + Free qty (3)
              ─────────────────────────────────────────────────────────────────── */}
          {!isRetailer ? (
            <ModalFormPanel aria-label="Scheme" className="pmmPanel pmmPanel_scheme">
              <ModalFormPanelHead>
                <ModalFormSectionTitle kicker="Scheme" hint="Optional trade scheme; paid/free quantities for offers." />
              </ModalFormPanelHead>
              <ModalFormPanelBody>
                <ModalFormGrid className="pmmGrid">
                  <ModalFormField span={6} label="Scheme note">
                    <input className="mfzInput" value={form.salesScheme} readOnly={readOnly} onChange={(e) => setField("salesScheme", e.target.value)} placeholder="e.g. 10+1" />
</ModalFormField>
                  <ModalFormField span={3} label="Paid qty" error={displayErrors.schemeQtyPaid || null}>
                    <input className="mfzInput" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={form.schemeQtyPaid} readOnly={readOnly} onChange={(e) => setField("schemeQtyPaid", e.target.value.replace(/[^0-9]/g, ""))} />
                  </ModalFormField>
                  <ModalFormField span={3} label="Free qty">
                    <input className="mfzInput" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={form.schemeQtyFree} readOnly={readOnly} onChange={(e) => setField("schemeQtyFree", e.target.value.replace(/[^0-9]/g, ""))} />
                  </ModalFormField>
                </ModalFormGrid>
              </ModalFormPanelBody>
            </ModalFormPanel>
          ) : null}

          {/* ── SECTION 4: Policy & alerts ───────────────────────────────────────
              Checkboxes in compact tile grid + Low stock alert + threshold
              ─────────────────────────────────────────────────────────────────── */}
          <ModalFormPanel aria-label="Policy and stock alerts" className="pmmPanel pmmPanel_policy">
            <ModalFormPanelHead>
              <ModalFormSectionTitle kicker="Policy & alerts" hint="Billing behaviour and optional low-stock warning." />
            </ModalFormPanelHead>
            <ModalFormPanelBody className="pmmPolicyBody">

              {/* Compact tile grid of policy checkboxes */}
              <ModalFormGrid className="pmmGrid pmmGrid_checks">
                <ModalFormCheckGroup className="pmmChecks">
                    {policyChecks.map(([k, label, tip]) => {
                      const isOff =
                        readOnly ||
                        (k === "isHalfScheme" && !form.isDiscountEnabled) ||
                        (k === "isOtc" && form.isControl);
                      return (
                        <label key={k} className={`mfzCheck${isOff ? " pmmCheck_off" : ""}`} title={tip}>
                          <input
                            type="checkbox"
                            checked={Boolean(form[k])}
                            disabled={isOff}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setForm((p) => {
                                const next = { ...p, [k]: v };
                                if (isRetailer && k === "isControl" && v) next.isOtc = false;
                                if (isRetailer && k === "isOtc" && v) next.isControl = false;
                                return next;
                              });
                            }}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </ModalFormCheckGroup>
              </ModalFormGrid>

              {/* Low stock alert + threshold — aligned row; dims threshold when alert is off */}
              <div className={`pmmLowStockRow${form.lowStockAlertEnabled ? "" : " pmmLowStockRow_off"}`}>
                <label className="mfzCheck pmmLowStockToggle">
                  <input
                    type="checkbox"
                    checked={Boolean(form.lowStockAlertEnabled)}
                    disabled={readOnly}
                    onChange={(e) => setField("lowStockAlertEnabled", e.target.checked)}
                  />
                  <span>Low stock alert</span>
                </label>
                <div className="pmmLowStockField">
                  <div className="mfzLabel">Threshold</div>
                  <input
                    className="mfzInput"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*\.?[0-9]*"
                    placeholder="0"
                    value={form.lowStockThreshold}
                    readOnly={readOnly}
                    onClick={() => { if (!readOnly && !form.lowStockAlertEnabled) setField("lowStockAlertEnabled", true); }}
                    onFocus={() => { if (!readOnly && !form.lowStockAlertEnabled) setField("lowStockAlertEnabled", true); }}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                      setField("lowStockThreshold", val);
                    }}
                  />
                  {displayErrors.lowStockThreshold ? (
                    <div className="mfzErr" role="alert">{displayErrors.lowStockThreshold}</div>
                  ) : null}
                </div>
              </div>

            </ModalFormPanelBody>
          </ModalFormPanel>

        </ModalFormBody>
      </ModalFormShell>
    </CommonModal>
  );
}
