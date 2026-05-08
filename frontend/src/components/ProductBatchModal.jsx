import AmountInput from "./ui/AmountInput.jsx";
import { InlineButtonProgress } from "./ui/buttons.jsx";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../context/LocaleContext.jsx";
import CommonModal from "./CommonModal.jsx";
import { computeProductBatch } from "../utils/productBatchCalc.js";
import { checkProductBatch } from "../services/productBatchService.js";
import CommonDatePicker from "./CommonDatePicker.jsx";
import "./MasterModalForm.css";
import "./ProductBatchModal.css";
import ProductPicker from "./ProductPicker.jsx";
import { formatBatchExpiryRelativePhrase } from "../utils/batchExpiryDisplay.js";
import { readAuth } from "../services/authStorage.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import {
  BadgeIndianRupee,
  Flag,
  Layers,
  Package2,
  IconMedicinePill,
  IconGST,
  IconInventory,
  IconExpiry,
  IconAlert,
  IconBatch
} from "./ui/AppIcons.jsx";

function clean(v) {
  return String(v ?? "").trim();
}

function numOrEmpty(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}

function asBool(v) {
  return Boolean(v);
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isFutureDateYmd(ymd) {
  const s = clean(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(`${s}T00:00:00Z`).getTime();
  const now = new Date(`${todayYmd()}T00:00:00Z`).getTime();
  return t > now;
}

function isValidDateYmd(ymd) {
  const s = clean(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(`${s}T00:00:00Z`).getTime();
  return Number.isFinite(t);
}

function isBeforeYmd(a, b) {
  const sa = clean(a);
  const sb = clean(b);
  if (!sa || !sb) return true;
  const ta = new Date(`${sa}T00:00:00Z`).getTime();
  const tb = new Date(`${sb}T00:00:00Z`).getTime();
  return ta < tb;
}

export default function ProductBatchModal({
  open,
  mode = "add", // add | edit | view
  busy = false,
  initialValue,
  existingRows = [],
  divisionOptions = [],
  mfgCompanyOptions = [],
  productOptions = [],
  onRefreshDivisionMfg,
  onRefreshProducts,
  onRequestCreateProduct,
  onClose,
  onSubmit
}) {
  const readOnly = mode === "view";
  const { taxLabel, taxRates } = useLocale();
  const [tab, setTab] = useState("product"); // product | pricing | discount | stock | flags
  const [touched, setTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [manual, setManual] = useState({ salesRate: false, retailRate: false });
  const empty = useMemo(
    () => ({
      divisionId: "",
      mfgCompanyId: "",
      productCode: "",
      productName: "",
      drugName: "",
      batchNo: "",
      barcode: "",
      expiryDate: "",
      mfgDate: "",

      mrp: "",
      purchaseRate: "",
      salesRate: "",
      retailRate: "",
      specialRate1: "",
      specialRate2: "",
      netRate: "",
      landingCost: "",
      marginPercent: "",

      discountSales: "",
      discountPurchase: "",
      retailDiscountPercent: "",
      netDiscountPercent: "",
      salesScheme: "",
      schemeQtyPaid: "",
      schemeQtyFree: "",

      salesGST: "",
      purchaseGST: "",

      openingStock: "0",
      stockable: true,
      openStockFreeQty: "",
      looseStock: "",
      looseUnitName: "",
      conversionUnit: "",

      packing: "",
      bulkPack: "",
      casePack: "",

      isDiscountEnabled: true,
      isHold: false,
      holdReason: "",
      isHalfScheme: false,
      isNet: false,
      isNonEditableFreeQty: false,
      isControl: false,
      lowStockAlertEnabled: false,
      lowStockThreshold: "0"
    }),
    []
  );

  const [form, setForm] = useState(empty);
  // Deferred form: inputs update immediately; expensive computations (computed, errors)
  // run in the background so every keystroke stays smooth.
  const deferredForm = useDeferredValue(form);
  const [batchCheck, setBatchCheck] = useState({ loading: false, exists: false, batch: null });
  const [checkingBatch, setCheckingBatch] = useState(false);
  const [pendingProductId, setPendingProductId] = useState("");
  const isProductLocked = mode === "add" && Boolean(clean(initialValue?.productId || initialValue?.product_id));
  // Draft preservation: overlay close keeps form data; explicit close resets it.
  const overlayClosedRef = useRef(false);

  const applyProduct = useCallback((product) => {
    if (!product) {
      setForm((p) => ({
        ...p,
        productId: "",
        productCode: "",
        productName: "",
        drugName: "",
        divisionId: "",
        division_name: "",
        division_code: "",
        mfgCompanyId: "",
        mfg_company_name: "",
        mfg_short_name: "",
        salesGST: "",
        purchaseGST: "",
        salesScheme: "",
        schemeQtyPaid: "",
        schemeQtyFree: "",
        packing: "",
        bulkPack: "",
        casePack: "",
        conversionUnit: "",
        stockable: true,
        isDiscountEnabled: true,
        isControl: false,
        isHalfScheme: false
      }));
      return;
    }
    const str = (v) => (v != null && v !== "" ? String(v) : "");
    setForm((p) => ({
      ...p,
      productId: String(product.id || ""),
      productCode: product.code || "",
      productName: product.name || "",
      drugName: product.drug_name || "",
      divisionId: product.division_id || "",
      division_name: product.division_name || "",
      division_code: product.division_code || "",
      mfgCompanyId: product.mfg_company_id || "",
      mfg_company_name: product.mfg_company_name || "",
      mfg_short_name: product.mfg_short_name || "",
      salesGST: str(product.sales_gst),
      purchaseGST: str(product.purchase_gst),
      salesScheme: product.sales_scheme || "",
      schemeQtyPaid: product.scheme_qty_paid != null ? String(product.scheme_qty_paid) : "",
      schemeQtyFree: product.scheme_qty_free != null ? String(product.scheme_qty_free) : "",
      packing: product.packing || "",
      bulkPack: product.bulk_pack || "",
      casePack: product.case_pack || "",
      conversionUnit: product.conversion_unit || "",
      stockable: product.stockable !== false,
      isDiscountEnabled: product.is_discount_enabled !== false,
      isControl: Boolean(product.is_control),
      isHalfScheme: Boolean(product.is_half_scheme)
    }));
  }, []);

  // After quick-create completes, the parent refreshes productOptions and
  // sets pendingProductId. Apply it automatically once the record shows up.
  useEffect(() => {
    const id = clean(pendingProductId);
    if (!id) return;
    const p = (productOptions || []).find((x) => String(x.id) === id);
    if (p) {
      applyProduct(p);
      setPendingProductId("");
    }
  }, [pendingProductId, productOptions, applyProduct]);
  const selectedMfg = useMemo(() => {
    const id = String(form.mfgCompanyId || "").trim();
    if (!id) return null;
    return (mfgCompanyOptions || []).find((c) => String(c.id) === id) || null;
  }, [form.mfgCompanyId, mfgCompanyOptions]);

  useEffect(() => {
    if (!open) return;
    if (overlayClosedRef.current) {
      overlayClosedRef.current = false;
      return;
    }
    const seed = initialValue ? { ...empty, ...initialValue } : empty;
    setForm(seed);
    setTab("product");
    setTouched({});
    setSubmitAttempted(false);
    setPendingProductId("");
    setBatchCheck({ loading: false, exists: false, batch: null });
    setManual({
      salesRate: Boolean(clean(seed?.salesRate)),
      retailRate: Boolean(clean(seed?.retailRate))
    });
  }, [open, empty, initialValue, mode]);

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

  const computed = useMemo(
    () =>
      computeProductBatch(deferredForm, {
        manualSalesRate: manual.salesRate,
        manualRetailRate: manual.retailRate
      }),
    [deferredForm, manual.salesRate, manual.retailRate]
  );

  const displaySalesRate = readOnly || manual.salesRate ? form.salesRate : String(computed.salesRate || "");
  const displayRetailRate = readOnly || manual.retailRate ? form.retailRate : String(computed.retailRate || "");

  const openingStockLocked = Boolean(
    initialValue?.openingStockLocked || initialValue?.hasTransactions || Number(initialValue?.stockTxnCount || 0) > 0
  );

  const errors = useMemo(() => {
    // Shadow `form` with the deferred value so validation runs off the main thread
    // and doesn't block keystrokes.
    const form = deferredForm;
    const out = {};
    if (!clean(form.productId)) out.productId = "Select a product from the list or create a new one.";
    else if (clean(form.productName).length < 2) out.productName = "Product name is required.";
    if (!clean(form.batchNo)) out.batchNo = "Batch No is required.";
    if (!clean(form.expiryDate)) out.expiryDate = "Expiry date is required.";
    // Allow editing/creating expired batches; expiry rules should be enforced at sale time.
    else if (!isValidDateYmd(form.expiryDate)) out.expiryDate = "Expiry date must be a valid date.";

    const salesGST = numOrEmpty(form.salesGST);
    const purchaseGST = numOrEmpty(form.purchaseGST);
    const allowedRates = new Set(taxRates.length ? taxRates : [0, 5, 12, 18, 28]);
    const taxOk = (v) => v === "" || allowedRates.has(Number(v));
    if (!taxOk(salesGST)) out.salesGST = `Sales ${taxLabel} must be a valid rate.`;
    if (!taxOk(purchaseGST)) out.purchaseGST = `Purchase ${taxLabel} must be a valid rate.`;

    const mrp = numOrEmpty(form.mrp);
    if (mrp === "" || !(Number(mrp) > 0)) {
      out.mrp = "MRP is required and must be greater than 0.";
    }

    if (form.stockable) {
      const os = String(form.openingStock ?? "").trim();
      // When opening qty is locked (txns exist), the input may be disabled and legacy seeds can omit it.
      if (!openingStockLocked) {
        if (os === "") out.openingStock = "Opening quantity is required.";
        else if (!Number.isFinite(Number(os)) || Number(os) < 0) out.openingStock = "Must be a non-negative number.";
      } else if (os !== "" && (!Number.isFinite(Number(os)) || Number(os) < 0)) {
        out.openingStock = "Must be a non-negative number.";
      }
    }
    // Compare against displayed values (which reflect auto-computed rates too)
    const salesRate = numOrEmpty(manual.salesRate ? form.salesRate : computed.salesRate);
    const retailRate = numOrEmpty(manual.retailRate ? form.retailRate : computed.retailRate);
    if (mrp !== "" && salesRate !== "" && Number(mrp) > 0 && Number(salesRate) > Number(mrp)) {
      out.salesRate = "Sales rate cannot exceed MRP.";
    }
    if (mrp !== "" && retailRate !== "" && Number(mrp) > 0 && Number(retailRate) > Number(mrp)) {
      out.retailRate = "Retail rate cannot exceed MRP.";
    }

    const nonNegativeFields = ["mrp", "purchaseRate", "salesRate", "retailRate", "specialRate1", "specialRate2", "netRate", "landingCost", "openingStock", "openStockFreeQty", "schemeQtyPaid", "schemeQtyFree", "looseStock"];
    for (const k of nonNegativeFields) {
      const v = form[k];
      if (v === "" || v === undefined || v === null) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n < 0) {
        if (!out[k]) out[k] = "Must be a non-negative number.";
      }
    }

    const isNumeric = (v) => v === "" || Number.isFinite(Number(v));
    const numericFields = [
      "mrp",
      "purchaseRate",
      "salesRate",
      "retailRate",
      "specialRate1",
      "specialRate2",
      "netRate",
      "discountSales",
      "discountPurchase",
      "retailDiscountPercent",
      "netDiscountPercent",
      "openingStock",
      "openStockFreeQty",
      "schemeQtyPaid",
      "schemeQtyFree",
      "marginPercent",
      "looseStock"
    ];

    const mrpVal = numOrEmpty(form.mrp);
    if (mrpVal !== "" && Number(mrpVal) > 0) {
      const sp1 = numOrEmpty(form.specialRate1);
      const sp2 = numOrEmpty(form.specialRate2);
      if (sp1 !== "" && Number(sp1) > Number(mrpVal)) out.specialRate1 = "Special rate 1 cannot exceed MRP.";
      if (sp2 !== "" && Number(sp2) > Number(mrpVal)) out.specialRate2 = "Special rate 2 cannot exceed MRP.";
    }
    for (const k of numericFields) {
      if (!isNumeric(form[k])) out[k] = "Must be a number.";
    }

    const barcode = clean(form.barcode);
    if (barcode) {
      const dupe = (existingRows || []).find((r) => String(r?.barcode || "").trim() === barcode && String(r?.id || "") !== String(form?.id || ""));
      if (dupe) out.barcode = "Barcode must be unique.";
    }
    const prodKey = clean(form.productCode) || clean(form.productName).toLowerCase();
    if (clean(form.batchNo)) {
      const dupeBatch = (existingRows || []).find((r) => {
        const rk = String(r?.product_code || r?.productCode || r?.product_name || "").trim().toLowerCase();
        const curk = String(prodKey || "").trim().toLowerCase();
        return (
          rk === curk &&
          String(r?.batch_no || r?.batchNo || "").trim().toLowerCase() === clean(form.batchNo).toLowerCase() &&
          String(r?.id || "") !== String(form?.id || "")
        );
      });
      if (dupeBatch) out.batchNo = "Batch No must be unique per product.";
    }
    if (batchCheck.exists) out.batchNo = "This batch number already exists for the selected product.";
    if (form.lowStockAlertEnabled) {
      if (String(form.lowStockThreshold ?? "").trim() === "") out.lowStockThreshold = "Low stock threshold is required.";
      else if (!Number.isFinite(Number(form.lowStockThreshold)) || Number(form.lowStockThreshold) < 0) {
        out.lowStockThreshold = "Low stock threshold must be a non-negative number.";
      }
    }
    return out;
  }, [existingRows, deferredForm, manual, computed, batchCheck.exists, openingStockLocked]);

  const warnings = useMemo(() => {
    const out = {};
    if (clean(deferredForm.mfgDate) && clean(deferredForm.expiryDate) && !isBeforeYmd(deferredForm.mfgDate, deferredForm.expiryDate)) {
      out.mfgDate = "Mfg date is after expiry date.";
    }
    return out;
  }, [deferredForm.expiryDate, deferredForm.mfgDate]);

  const canSubmit = !readOnly && !busy && Object.keys(errors).length === 0;

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
    // Clear stale batch-exists error whenever the user edits the batch number or product
    if (["batchNo", "productId", "product_id", "productCode"].includes(k)) {
      setBatchCheck({ loading: false, exists: false, batch: null });
    }
  }

  function markTouched(k) {
    setTouched((p) => ({ ...(p || {}), [k]: true }));
  }

  function showErr(k) {
    if (readOnly) return false;
    return Boolean(submitAttempted || touched?.[k]);
  }

  const firstError = useMemo(() => {
    const order = [
      "productId",
      "productCode",
      "productName",
      "batchNo",
      "expiryDate",
      "mfgDate",
      "purchaseGST",
      "salesGST",
      "barcode",
      "mrp",
      "purchaseRate",
      "salesRate",
      "retailRate",
      "retailDiscountPercent",
      "netDiscountPercent",
      "openingStock",
      "openStockFreeQty",
      "conversionUnit",
      "schemeQtyPaid",
      "schemeQtyFree",
      "marginPercent",
      "lowStockThreshold"
    ];
    for (const k of order) {
      if (errors?.[k]) return { key: k, message: String(errors[k]) };
    }
    const keys = Object.keys(errors || {});
    if (!keys.length) return null;
    const k = keys[0];
    return { key: k, message: String(errors[k]) };
  }, [errors]);

  const errorCount = Object.keys(errors || {}).length;

  const isRetailer = useMemo(() => isRetailerAuth(readAuth()), []);
  const marginLabel = isRetailer ? "Retail margin" : "Wholesale margin";
  const marginValue = isRetailer
    ? (Number(computed.salesRate || 0) > 0
        ? (((Number(computed.salesRate || 0) - Number(computed.landingCost || 0)) / Number(computed.salesRate || 0)) * 100).toFixed(2)
        : "0.00")
    : String(computed.wholesaleMargin || 0);
  const marginBand = Number(marginValue || 0);
  const kpis = [
    { label: "Landing cost", value: String(computed.landingCost || 0) },
    { label: "Net rate", value: String(computed.netRate || 0) },
    { label: marginLabel, value: `${marginValue}%` },
    { label: `Sales with ${taxLabel}`, value: String(computed.salesWithGST || 0) }
  ];
  const tabErrorCounts = useMemo(() => {
    const counts = { product: 0, pricing: 0, discount: 0, stock: 0, flags: 0 };
    Object.keys(errors || {}).forEach((k) => {
      const t = tabForErrorKey(k);
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [errors]);

  function tabForErrorKey(k) {
    const key = String(k || "");
    if (["productId", "productName", "batchNo", "expiryDate", "mfgDate", "barcode", "drugName", "productCode"].includes(key)) return "product";
    if (["mrp", "purchaseRate", "salesRate", "retailRate", "specialRate1", "specialRate2", "netRate", "landingCost", "marginPercent"].includes(key)) return "pricing";
    if (["looseStock", "looseUnitName"].includes(key)) return "stock";
    if (
      [
        "discountSales",
        "discountPurchase",
        "retailDiscountPercent",
        "netDiscountPercent",
        "salesScheme",
        "schemeQtyPaid",
        "schemeQtyFree",
        "purchaseGST",
        "salesGST"
      ].includes(key)
    )
      return "discount";
    if (["openingStock", "openStockFreeQty", "conversionUnit", "packing", "bulkPack", "casePack", "stockable", "lowStockThreshold"].includes(key)) return "stock";
    if (["isDiscountEnabled", "isHold", "isHalfScheme", "isNet", "isNonEditableFreeQty", "isControl"].includes(key)) return "flags";
    return "product";
  }

  return (
    <CommonModal
      open={open}
      title={mode === "add" ? "Add batch" : mode === "view" ? "View batch" : "Edit batch"}
      icon={<IconBatch />}
      size="lg"
      onClose={handleExplicitClose}
      onOverlayClose={handleOverlayClose}
      closeOnOverlay={!busy}
      footer={
        <div className="pbmFoot mfzFooter">
          {!readOnly && !canSubmit && submitAttempted && errorCount ? (
            <div className="pbmFootErr" role="alert" aria-live="polite" title={firstError?.message || ""}>
              <IconAlert />
              <span>
                {errorCount} issue{errorCount === 1 ? "" : "s"}  {firstError?.message || "fix required fields"}
              </span>
            </div>
          ) : (
            <span />
          )}
          <div className="pbmFootActions">
            <button className="mfzBtn appBtn appBtn_secondary appBtn_md" type="button" data-cm-cancel="true" onClick={handleExplicitClose} disabled={busy}>
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly ? (
              <button
                className="mfzBtn appBtn appBtn_primary appBtn_md"
                type="button"
                data-cm-primary="true"
                disabled={busy || checkingBatch}
                onClick={async () => {
                  setSubmitAttempted(true);
                  if (errorCount > 0) {
                    setTab(tabForErrorKey(firstError?.key || ""));
                    return;
                  }
                  // Check batch uniqueness on save (no live API calls while typing)
                  const productId = clean(form.productId || form.product_id || "");
                  const productCode = clean(form.productCode);
                  const batchNo = clean(form.batchNo);
                  if ((productId || productCode) && batchNo) {
                    setCheckingBatch(true);
                    try {
                      const res = await checkProductBatch(productId, batchNo, form.id, productCode);
                      const data = res?.json?.data || {};
                      if (data?.exists) {
                        setBatchCheck({ loading: false, exists: true, batch: data?.batch || null });
                        return; // errors useMemo will now show the duplicate error
                      }
                      setBatchCheck({ loading: false, exists: false, batch: null });
                    } catch {
                      setBatchCheck({ loading: false, exists: false, batch: null });
                    } finally {
                      setCheckingBatch(false);
                    }
                  }
                  const payload = {
                    productId: clean(form.productId) || null,
                    divisionId: clean(form.divisionId) || null,
                    vendorId: null,
                    mfgCompanyId: clean(form.mfgCompanyId) || null,
                    productCode: clean(form.productCode),
                    productName: clean(form.productName),
                    drugName: clean(form.drugName),
                    batchNo: clean(form.batchNo),
                    barcode: clean(form.barcode),
                    expiryDate: clean(form.expiryDate),
                    mfgDate: clean(form.mfgDate),

                    mrp: numOrEmpty(form.mrp),
                    purchaseRate: numOrEmpty(form.purchaseRate),
                    salesRate: numOrEmpty(displaySalesRate),
                    retailRate: numOrEmpty(displayRetailRate),
                    specialRate1: numOrEmpty(form.specialRate1),
                    specialRate2: numOrEmpty(form.specialRate2),
                    netRate: numOrEmpty(computed.netRate),
                    landingCost: numOrEmpty(computed.landingCost),

                    discountSales: numOrEmpty(computed.discountSales),
                    discountPurchase: numOrEmpty(form.discountPurchase),
                    retailDiscountPercent: numOrEmpty(form.retailDiscountPercent),
                    netDiscountPercent: numOrEmpty(form.netDiscountPercent),
                    salesScheme: clean(form.salesScheme),
                    schemeQtyPaid: numOrEmpty(form.schemeQtyPaid),
                    schemeQtyFree: numOrEmpty(form.schemeQtyFree),

                    salesGST: numOrEmpty(form.salesGST),
                    purchaseGST: numOrEmpty(form.purchaseGST),

                    openingStock: numOrEmpty(form.openingStock),
                    stockable: asBool(form.stockable),
                    openStockFreeQty: numOrEmpty(form.openStockFreeQty),
                    looseStock: numOrEmpty(form.looseStock),
                    looseUnitName: clean(form.looseUnitName),
                    conversionUnit: numOrEmpty(form.conversionUnit),

                    packing: clean(form.packing),
                    bulkPack: clean(form.bulkPack),
                    casePack: clean(form.casePack),

                    isDiscountEnabled: asBool(form.isDiscountEnabled),
                    isHold: asBool(form.isHold),
                    holdReason: clean(form.holdReason),
                    isHalfScheme: asBool(form.isHalfScheme),
                    isNet: asBool(form.isNet),
                    isNonEditableFreeQty: asBool(form.isNonEditableFreeQty),
                    isControl: asBool(form.isControl),
                    lowStockAlertEnabled: asBool(form.lowStockAlertEnabled),
                    lowStockThreshold: numOrEmpty(form.lowStockThreshold)
                  };
                  await onSubmit?.(payload);
                }}
              >
                {(busy || checkingBatch) ? <InlineButtonProgress label={checkingBatch ? "Checking…" : "Saving…"} /> : mode === "add" ? "Create batch" : "Save changes"}
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="pbm">
        <div className="pbmDashWrap">
          <div className="pbmDash">
            {kpis.map((k) => (
              <div
                key={k.label}
                className={`pbmTile${
                  k.label === marginLabel
                    ? marginBand < 5
                      ? " pbmTile_band_low"
                      : marginBand < 15
                        ? " pbmTile_band_mid"
                        : " pbmTile_band_hi"
                    : ""
                }`}
                title={
                  k.label === marginLabel
                    ? "<5 low, 5-15 medium, >15 healthy"
                    : k.label === `Sales with ${taxLabel}`
                      ? "Tax-inclusive sale value"
                      : ""
                }
              >
                <div className="pbmTileLab">{k.label}</div>
                <div className="pbmTileVal">{k.value}</div>
              </div>
            ))}
          </div>
        </div>
        {Number(computed.salesWithGST || 0) > Number(form.mrp || 0) && Number(form.mrp || 0) > 0 ? (
          <div className="pbmBanner">Sales with {taxLabel} exceeds MRP.</div>
        ) : null}

        <div className="pbmRail" role="tablist" aria-label="Batch form sections">
          {[
            ["product", "Product", IconMedicinePill],
            ["pricing", "Pricing", BadgeIndianRupee],
            ["discount", "Discount & tax", IconGST],
            ["stock", "Stock & pack", IconInventory],
            ["flags", "Flags", Flag]
          ].map(([id, label, IconComp]) => (
            <button
              key={id}
              type="button"
              className={`pbmRailBtn${tab === id ? " pbmRailBtn_on" : ""}`}
              role="tab"
              aria-selected={tab === id ? "true" : "false"}
              onClick={() => setTab(String(id))}
            >
              <span className="pbmRailGlyph" aria-hidden="true">
                <IconComp size={15} strokeWidth={2} aria-hidden />
              </span>
              <span>{label}</span>
              {tabErrorCounts[id] ? (
                <span className="pbmRailCount" aria-label={`${tabErrorCounts[id]} validation issue${tabErrorCounts[id] === 1 ? "" : "s"}`}>
                  {tabErrorCounts[id]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="pbmStage">
          {tab === "product" ? (
            <>
              <div className="pbmPanel">
                <div className="pbmBar">
                  <IconMedicinePill size={14} strokeWidth={2} aria-hidden />
                  <span>Product</span>
                </div>
                <div className="mfzGrid">
                  <div className="mfzField mfz12">
                    <label>Product <span className="reqMark" aria-hidden="true">*</span></label>
                    {isProductLocked ? (
                      <div className="pbmHero">
                        <div className="pbmHeroName">{form.productName || form.productCode || "Product"}</div>
                        {(form.productCode || form.drugName) ? (
                          <div className="pbmHeroMeta">
                            {[
                              form.productCode ? form.productCode : "",
                              form.drugName ? form.drugName : ""
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        ) : null}
                        <div className="pbmPillRow">
                          {form.division_name ? (
                            <span className="pbmPill">
                              {form.division_name}
                              {form.mfg_short_name || form.mfg_company_name ? ` · ${form.mfg_short_name || form.mfg_company_name}` : ""}
                            </span>
                          ) : null}
                          {form.mfg_company_name && !form.division_name ? <span className="pbmPill">{form.mfg_company_name}</span> : null}
                          {form.salesGST !== "" && form.salesGST != null ? <span className="pbmPill">{taxLabel} {form.salesGST}%</span> : null}
                          {clean(form.packing) ? <span className="pbmPill">{form.packing}</span> : null}
                        </div>
                      </div>
                    ) : (
                      <ProductPicker
                        value={form.productId || ""}
                        products={productOptions || []}
                        disabled={busy || mode === "edit"}
                        readOnly={readOnly}
                        allowCreate={mode !== "edit" && !readOnly && typeof onRequestCreateProduct === "function"}
                        onSelect={(p) => applyProduct(p)}
                        onCreateNew={() => {
                          if (typeof onRequestCreateProduct !== "function") return;
                          onRequestCreateProduct((created) => {
                            if (!created?.id) return;
                            setPendingProductId(String(created.id));
                            if (typeof onRefreshProducts === "function") {
                              Promise.resolve(onRefreshProducts()).catch(() => {});
                            }
                          });
                        }}
                      />
                    )}
                    {!clean(form.productId) && submitAttempted ? (
                      <div className="mfzErr">Pick a product from the list or create a new one.</div>
                    ) : null}
                  </div>
                  {!isProductLocked ? (
                    <>
                      <div className="mfzField mfz6">
                        <label>Code</label>
                        <input className="mfzInput" value={form.productCode || ""} readOnly />
                      </div>
                      <div className="mfzField mfz6">
                        <label>Drug</label>
                        <input className="mfzInput" value={form.drugName || ""} readOnly />
                      </div>
                    </>
                  ) : null}
                  <div className="mfzField mfz6">
                    <label>Batch No <span className="reqMark" aria-hidden="true">*</span></label>
                    <input
                      className="mfzInput"
                      value={form.batchNo}
                      disabled={busy || readOnly || !clean(form.productId)}
                      onChange={(e) => setField("batchNo", e.target.value)}
                      onBlur={() => markTouched("batchNo")}
                    />
                    {!readOnly && clean(form.batchNo) && clean(form.productId) && batchCheck.exists ? (
                      <div className="mfzErr">Batch already exists for this product.</div>
                    ) : null}
                    {showErr("batchNo") && errors.batchNo ? <div className="mfzErr">{errors.batchNo}</div> : null}
                  </div>
                  <div className="mfzField mfz6">
                    <label>Barcode</label>
                    <input
                      className="mfzInput"
                      value={form.barcode}
                      disabled={busy || readOnly || !clean(form.productId)}
                      onChange={(e) => setField("barcode", e.target.value)}
                      onBlur={() => markTouched("barcode")}
                    />
                    {showErr("barcode") && errors.barcode ? <div className="mfzErr">{errors.barcode}</div> : null}
                  </div>
                </div>
              </div>

              <div className="pbmPanel">
                <div className="pbmBar">
                  <IconExpiry size={14} strokeWidth={2} aria-hidden />
                  <span>Dates</span>
                </div>
                <div className="mfzGrid">
                  <div className="mfzField mfz6">
                    <label>Expiry date <span className="reqMark" aria-hidden="true">*</span></label>
                    <CommonDatePicker
                      value={form.expiryDate}
                      disabled={busy || readOnly}
                      onChange={(v) => setField("expiryDate", v)}
                      ariaLabel="Expiry date"
                    />
                    {showErr("expiryDate") && errors.expiryDate ? <div className="mfzErr">{errors.expiryDate}</div> : null}
                    {!errors.expiryDate && clean(form.expiryDate) && isValidDateYmd(form.expiryDate) ? (
                      <div className="mfzHelp" aria-live="polite">
                        {formatBatchExpiryRelativePhrase(form.expiryDate)}
                      </div>
                    ) : null}
                    {!errors.expiryDate && clean(form.expiryDate) && isValidDateYmd(form.expiryDate) && !isFutureDateYmd(form.expiryDate) ? (
                      <div className="pbmWarn">This batch is already expired. It will be marked as EXPIRED status.</div>
                    ) : null}
                  </div>
                  <div className="mfzField mfz6">
                    <label>Mfg date</label>
                    <CommonDatePicker
                      value={form.mfgDate}
                      disabled={busy || readOnly}
                      onChange={(v) => setField("mfgDate", v)}
                      ariaLabel="Mfg date"
                    />
                    {showErr("mfgDate") && warnings.mfgDate ? <div className="mfzErr">{warnings.mfgDate}</div> : null}
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {tab === "pricing" ? (
            <div className="pbmPanel">
              <div className="mfzGrid">
                <div className="mfzField mfz6">
                  <label>MRP <span className="reqMark" aria-hidden="true">*</span></label>
                  <AmountInput
                    className="mfzInput"
                    value={String(form.mrp ?? "")}
                    disabled={busy || readOnly}
                    onChange={(raw) => setField("mrp", raw)}
                    onBlur={() => markTouched("mrp")}
                  />
                  {showErr("mrp") && errors.mrp ? <div className="mfzErr">{errors.mrp}</div> : null}
                </div>
                <div className="mfzField mfz6">
                  <label>Purchase rate</label>
                  <AmountInput
                    className="mfzInput"
                    value={String(form.purchaseRate ?? "")}
                    disabled={busy || readOnly}
                    onChange={(raw) => setField("purchaseRate", raw)}
                    onBlur={() => markTouched("purchaseRate")}
                  />
                  {showErr("purchaseRate") && errors.purchaseRate ? <div className="mfzErr">{errors.purchaseRate}</div> : null}
                </div>
                <div className="mfzField mfz6">
                  <label>Margin %</label>
                  <input
                    className="mfzInput"
                    value={form.marginPercent}
                    disabled={busy || readOnly}
                    onChange={(e) => setField("marginPercent", e.target.value)}
                    onBlur={() => markTouched("marginPercent")}
                  />
                  {showErr("marginPercent") && errors.marginPercent ? <div className="mfzErr">{errors.marginPercent}</div> : null}
                </div>
                <div className="mfzField mfz6">
                  <label>Sales rate</label>
                  <AmountInput
                    className="mfzInput"
                    value={String(displaySalesRate ?? "")}
                    disabled={busy || readOnly}
                    onChange={(raw) => {
                      setManual((m) => ({ ...(m || {}), salesRate: Boolean(raw) }));
                      setField("salesRate", raw);
                    }}
                    onBlur={() => markTouched("salesRate")}
                  />
                  {showErr("salesRate") && errors.salesRate ? <div className="mfzErr">{errors.salesRate}</div> : null}
                </div>
                <div className="mfzField mfz6">
                  <label>Retail rate</label>
                  <AmountInput
                    className="mfzInput"
                    value={String(displayRetailRate ?? "")}
                    disabled={busy || readOnly}
                    onChange={(raw) => {
                      setManual((m) => ({ ...(m || {}), retailRate: Boolean(raw) }));
                      setField("retailRate", raw);
                    }}
                    onBlur={() => markTouched("retailRate")}
                  />
                  {showErr("retailRate") && errors.retailRate ? <div className="mfzErr">{errors.retailRate}</div> : null}
                </div>
                <div className="mfzField mfz6">
                  <label>Special rate 1</label>
                  <AmountInput
                    className="mfzInput"
                    value={String(form.specialRate1 ?? "")}
                    disabled={busy || readOnly}
                    onChange={(raw) => setField("specialRate1", raw)}
                    onBlur={() => markTouched("specialRate1")}
                  />
                  {showErr("specialRate1") && errors.specialRate1 ? <div className="mfzErr">{errors.specialRate1}</div> : null}
                </div>
                <div className="mfzField mfz6">
                  <label>Special rate 2</label>
                  <AmountInput
                    className="mfzInput"
                    value={String(form.specialRate2 ?? "")}
                    disabled={busy || readOnly}
                    onChange={(raw) => setField("specialRate2", raw)}
                    onBlur={() => markTouched("specialRate2")}
                  />
                  {showErr("specialRate2") && errors.specialRate2 ? <div className="mfzErr">{errors.specialRate2}</div> : null}
                </div>
                <div className="mfzField mfz6">
                  <label>Net rate</label>
                  <input className="mfzInput" value={String(computed.netRate || 0)} readOnly />
                </div>
              </div>
            </div>
          ) : null}

          {tab === "discount" ? (
            <>
              <div className="pbmPanel">
                <div className="pbmBar">
                  <IconGST size={14} strokeWidth={2} aria-hidden />
                  <span>Discount & scheme</span>
                  {form.isNet ? <span className="pbmTag">Net</span> : null}
                </div>
                <div className="mfzGrid">
                  <div className="mfzField mfz6">
                    <label>Retail discount %</label>
                    <input
                      className="mfzInput"
                      value={form.retailDiscountPercent}
                      disabled={busy || readOnly || !form.isDiscountEnabled || form.isNet || Boolean(selectedMfg?.prevent_discount)}
                      onChange={(e) => setField("retailDiscountPercent", e.target.value)}
                      onBlur={() => markTouched("retailDiscountPercent")}
                    />
                    {showErr("retailDiscountPercent") && errors.retailDiscountPercent ? <div className="mfzErr">{errors.retailDiscountPercent}</div> : null}
                  </div>
                  <div className="mfzField mfz6">
                    <label>Discount sales</label>
                    <input className="mfzInput" value={String(computed.discountSales || 0)} readOnly />
                  </div>
                  <div className="mfzField mfz6">
                    <label>Net discount %</label>
                    <input
                      className="mfzInput"
                      value={form.netDiscountPercent}
                      disabled={busy || readOnly || form.isNet || Boolean(selectedMfg?.prevent_discount)}
                      onChange={(e) => setField("netDiscountPercent", e.target.value)}
                      onBlur={() => markTouched("netDiscountPercent")}
                    />
                    {showErr("netDiscountPercent") && errors.netDiscountPercent ? <div className="mfzErr">{errors.netDiscountPercent}</div> : null}
                  </div>
                  <div className="mfzField mfz6">
                    <label>Discount purchase</label>
                    <input
                      className="mfzInput"
                      value={form.discountPurchase}
                      disabled={busy || readOnly}
                      onChange={(e) => setField("discountPurchase", e.target.value)}
                      onBlur={() => markTouched("discountPurchase")}
                    />
                    {showErr("discountPurchase") && errors.discountPurchase ? <div className="mfzErr">{errors.discountPurchase}</div> : null}
                  </div>
                  <div className="mfzField mfz12">
                    <label>Effective rate</label>
                    <input className="mfzInput" value={String(computed.effectiveRate || 0)} readOnly />
                  </div>
                </div>
              </div>

              <div className="pbmPanel">
                <div className="pbmBar">
                  <Layers size={14} strokeWidth={2} aria-hidden />
                  <span>Scheme</span>
                  {form.isHalfScheme ? <span className="pbmTag">Half scheme</span> : null}
                </div>
                <div className="mfzGrid">
                  <div className="mfzField mfz12">
                    <label>Scheme note</label>
                    <input
                      className="mfzInput"
                      value={form.salesScheme || ""}
                      readOnly={readOnly || Boolean(clean(form.productId))}
                      disabled={busy || Boolean(clean(form.productId))}
                      onChange={(e) => setField("salesScheme", e.target.value)}
                      placeholder="e.g. 10+1"
                    />
                    {clean(form.productId) && !readOnly ? (
                      <p className="mfzHelp">Scheme is set on the product master.</p>
                    ) : null}
                  </div>
                  <div className="mfzField mfz6">
                    <label>Paid qty</label>
                    <input
                      className="mfzInput"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={form.schemeQtyPaid}
                      readOnly={readOnly || Boolean(clean(form.productId))}
                      disabled={busy || Boolean(clean(form.productId))}
                      onChange={(e) => setField("schemeQtyPaid", e.target.value.replace(/[^0-9]/g, ""))}
                      onBlur={() => markTouched("schemeQtyPaid")}
                    />
                    {showErr("schemeQtyPaid") && errors.schemeQtyPaid ? <div className="mfzErr">{errors.schemeQtyPaid}</div> : null}
                  </div>
                  <div className="mfzField mfz6">
                    <label>Free qty</label>
                    <input
                      className="mfzInput"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={form.schemeQtyFree}
                      readOnly={readOnly || Boolean(clean(form.productId))}
                      disabled={busy || Boolean(clean(form.productId))}
                      onChange={(e) => setField("schemeQtyFree", e.target.value.replace(/[^0-9]/g, ""))}
                      onBlur={() => markTouched("schemeQtyFree")}
                    />
                    {showErr("schemeQtyFree") && errors.schemeQtyFree ? <div className="mfzErr">{errors.schemeQtyFree}</div> : null}
                  </div>
                </div>
              </div>

              <div className="pbmPanel">
                <div className="pbmBar">
                  <IconGST size={14} strokeWidth={2} aria-hidden />
                  <span>Tax</span>
                </div>
                <div className="mfzGrid">
                  <div className="mfzField mfz6">
                    <label>Purchase {taxLabel} %</label>
                    <input className="mfzInput" value={form.purchaseGST === "" || form.purchaseGST == null ? "" : `${form.purchaseGST}%`} readOnly />
                  </div>
                  <div className="mfzField mfz6">
                    <label>Sales {taxLabel} %</label>
                    <input className="mfzInput" value={form.salesGST === "" || form.salesGST == null ? "" : `${form.salesGST}%`} readOnly />
                  </div>
                  <div className="mfzField mfz6">
                    <label>Landing cost</label>
                    <input className="mfzInput" value={String(computed.landingCost || 0)} readOnly />
                  </div>
                  <div className="mfzField mfz6">
                    <label>Sales with {taxLabel}</label>
                    <input className="mfzInput" value={String(computed.salesWithGST || 0)} readOnly />
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {tab === "stock" ? (
            <>
              <div className="pbmPanel">
                <div className="pbmBar">
                  <IconInventory size={14} strokeWidth={2} aria-hidden />
                  <span>Stock</span>
                  {!form.stockable ? <span className="pbmTag">Non-stockable</span> : null}
                </div>
                <div className="mfzGrid">
                  <div className="mfzField mfz12">
                    <label>Total stock</label>
                    <input className="mfzInput" value={String(computed.totalStock || 0)} readOnly />
                  </div>
                  <div className="mfzField mfz12 pbmInset">
                    <div className="pbmInsetTitle">Opening stock</div>
                    <div className="mfzGrid">
                      <div className="mfzField mfz6">
                        <label>Opening Qty{form.stockable ? <span className="reqMark" aria-hidden="true"> *</span> : null}</label>
                        <input
                          className="mfzInput"
                          value={form.openingStock}
                          disabled={busy || readOnly || !form.stockable || openingStockLocked}
                          onChange={(e) => setField("openingStock", e.target.value)}
                          onBlur={() => markTouched("openingStock")}
                        />
                        {showErr("openingStock") && errors.openingStock ? <div className="mfzErr">{errors.openingStock}</div> : null}
                      </div>
                      <div className="mfzField mfz6">
                        <label>Opening Free Qty</label>
                        <input className="mfzInput" value={form.openStockFreeQty} disabled={busy || readOnly || !form.stockable || form.isNonEditableFreeQty || openingStockLocked} onChange={(e) => setField("openStockFreeQty", e.target.value)} />
                        {errors.openStockFreeQty ? <div className="mfzErr">{errors.openStockFreeQty}</div> : null}
                      </div>
                    </div>
                    {openingStockLocked ? (
                      <div className="pbmWarn">Locked  transactions already exist.</div>
                    ) : null}
                  </div>
                  <div className="mfzField mfz12 pbmInset">
                    <div className="pbmInsetTitle">Loose stock</div>
                    <div className="mfzGrid">
                      <div className="mfzField mfz6">
                        <label>Loose qty in stock</label>
                        <input
                          className="mfzInput"
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*\.?[0-9]*"
                          value={form.looseStock ?? ""}
                          disabled={busy || readOnly}
                          onChange={(e) => setField("looseStock", e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1"))}
                          onBlur={() => markTouched("looseStock")}
                          placeholder="0"
                        />
                        {showErr("looseStock") && errors.looseStock ? <div className="mfzErr">{errors.looseStock}</div> : null}
                      </div>
                      <div className="mfzField mfz6">
                        <label>Loose unit name</label>
                        <input
                          className="mfzInput"
                          value={form.looseUnitName ?? ""}
                          disabled={busy || readOnly}
                          onChange={(e) => setField("looseUnitName", e.target.value)}
                          placeholder="TAB / CAP / ML / GM / UNIT"
                          maxLength={16}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mfzField mfz12 pbmInset">
                    <div className="pbmInsetTitle">Low stock alert</div>
                    <label className="mfzCheck pbmCheckSpaced">
                      <input
                        type="checkbox"
                        checked={Boolean(form.lowStockAlertEnabled)}
                        disabled={busy || readOnly}
                        onChange={(e) => setField("lowStockAlertEnabled", e.target.checked)}
                      />
                      <span>Enable low stock alert</span>
                    </label>
                    <div className="mfzField mfz6">
                      <label>Threshold</label>
                      <input
                        className="mfzInput"
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        value={form.lowStockThreshold}
                        disabled={busy || readOnly || !form.lowStockAlertEnabled}
                        onChange={(e) => setField("lowStockThreshold", e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1"))}
                        onBlur={() => markTouched("lowStockThreshold")}
                      />
                      {showErr("lowStockThreshold") && errors.lowStockThreshold ? <div className="mfzErr">{errors.lowStockThreshold}</div> : null}
                    </div>
                  </div>
                  {form.conversionUnit ? (
                    <div className="mfzField mfz12">
                      <label>Conversion unit</label>
                      <input className="mfzInput" value={form.conversionUnit || ""} readOnly />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="pbmPanel">
                <div className="pbmBar">
                  <Package2 size={14} strokeWidth={2} aria-hidden />
                  <span>Packing</span>
                </div>
                <div className="mfzGrid">
                  <div className="mfz12">
                    <div className="pbmGridTri">
                      <div className="mfzField">
                        <label>Packing</label>
                        <input className="mfzInput" value={form.packing || ""} readOnly />
                      </div>
                      <div className="mfzField">
                        <label>Bulk pack</label>
                        <input className="mfzInput" value={form.bulkPack || ""} readOnly />
                      </div>
                      <div className="mfzField">
                        <label>Case pack</label>
                        <input className="mfzInput" value={form.casePack || ""} readOnly />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {tab === "flags" ? (
            <div className="pbmPanel">
              <div className="mfzGrid">
                {[
                  ["isHold", "Hold", "Blocks sale confirmation until hold is removed."],
                  ["isNet", "Net (bypass discount)", "Uses net-discount path."],
                  ["isNonEditableFreeQty", "Lock free qty", "Free qty auto-derives from scheme."]
                ].map(([k, label, tip]) => (
                  <label key={k} className="mfzCheck" title={tip}>
                    <input
                      type="checkbox"
                      checked={Boolean(form[k])}
                      disabled={busy || readOnly}
                      onChange={(e) => setField(k, e.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
                {form.isHold ? (
                  <div className="mfzField mfz12">
                    <label>Hold reason</label>
                    <input className="mfzInput" value={form.holdReason || ""} disabled={busy || readOnly} onChange={(e) => setField("holdReason", e.target.value)} />
                  </div>
                ) : null}
                <div className="mfz12 pbmBar" style={{ marginTop: 8 }}>
                  <Layers size={13} strokeWidth={2} aria-hidden />
                  <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-4)" }}>
                    Product-level policy
                  </span>
                </div>
                {[
                  ["isHalfScheme", "Half scheme", "Free units are taxed at 50% of their value."],
                  ["isDiscountEnabled", "Discounts allowed", "Retail and net discounts are enabled for this product."]
                ].map(([k, label, tip]) => (
                  <label key={k} className="mfzCheck" title={tip} style={{ opacity: 0.8 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(form[k])}
                      disabled
                    />
                    <span>
                      {label}{" "}
                      <span style={{ fontWeight: 400, color: "var(--color-text-3)", fontSize: "0.85em" }}>(product master)</span>
                    </span>
                  </label>
                ))}
                {form.isControl ? <div className="mfz12 pbmWarn">Controlled — prescription required at billing.</div> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </CommonModal>
  );
}

