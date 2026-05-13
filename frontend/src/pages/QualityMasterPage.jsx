import { AppButton } from "../components/ui/buttons.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "../layouts/AppShell.jsx";
import CommonTable from "../components/CommonTable.jsx";
import CommonModal from "../components/CommonModal.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import ProductBatchModal from "../components/ProductBatchModal.jsx";
import ProductMasterModal from "../components/ProductMasterModal.jsx";
import { onAuthChanged, readAuth } from "../services/authStorage.js";
import { can } from "../utils/access.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import { toDivisionOption } from "../utils/divisionLabel.js";
import { bulkDeleteProducts, createProduct, deleteProduct, listProducts, updateProduct } from "../services/productService.js";
import { bulkDeleteProductBatches, createProductBatch, deleteProductBatch, listProductBatches, updateProductBatch } from "../services/productBatchService.js";
import { useLocale } from "../context/LocaleContext.jsx";
import { listDivisions } from "../services/divisionService.js";
import { listMfgCompanies } from "../services/mfgCompanyService.js";
import { listVendors } from "../services/vendorService.js";
import { upsertSupplierProduct } from "../services/supplierProductService.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import { IconProducts, IconStockAlert } from "../components/ui/AppIcons.jsx";
import { IconBtn, IconEdit, IconLayers, IconPlus, IconTrash } from "../components/TableActionKit.jsx";
import { clean, daysUntil, fmtMoney } from "../utils/format.js";
import { formatBatchExpiryRelativePhrase } from "../utils/batchExpiryDisplay.js";
import "./QualityMasterPage.css";
import CsvImportWizard from "../components/import/CsvImportWizard.jsx";
import { downloadCsvFile } from "../components/reports/reportExport.js";
import { Download, Layers, Upload } from "../components/ui/AppIcons.jsx";

function formatYmdFriendly(dateStr) {
  const s = String(dateStr || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return s;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

function truncateMiddle(s, maxLen) {
  const t = clean(s);
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(4, maxLen - 3))}…`;
}

const QM_ICON_SZ = 17;
const QM_ICON_STROKE = 2.25;

export default function QualityMasterPage() {
  useSeoMeta({ title: "Quality Master" });
  const { taxLabel } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const stockDivisionFilter = clean(searchParams.get("divisionId") || "");
  const auth = readAuth();
  const user = auth?.user || null;
  const [authTick, setAuthTick] = useState(0);
  const isRetailer = useMemo(() => isRetailerAuth(auth), [auth]);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [mfgCompanies, setMfgCompanies] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [divisionsLoading, setDivisionsLoading] = useState(false);
  const [mfgLoading, setMfgLoading] = useState(false);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ by: "name", dir: "asc" });
  const [batchPresenceFilter, setBatchPresenceFilter] = useState(""); // "" | "with" | "without"
  const [expiryFilter, setExpiryFilter] = useState(""); // "" | "EXPIRED" | "NEAR" | "VALID" | "NONE"
  const [lowStockFilter, setLowStockFilter] = useState(""); // "" | "LOW_ANY" | "LOW_PRODUCT" | "LOW_BATCH" | "NORMAL" | "ALERTS_OFF"
  const [mfgFilter, setMfgFilter] = useState(""); // mfg_company_id
  const [divisionFilter, setDivisionFilter] = useState(""); // division_id
  const [productTablePageSize, setProductTablePageSize] = useState(50);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, kind: "batch", id: "", name: "", ids: [] });

  const [productMasterOpen, setProductMasterOpen] = useState(false);
  const [productMasterMode, setProductMasterMode] = useState("add");
  const [editingProduct, setEditingProduct] = useState(null);
  // When the product modal is opened from the batch modal, we stack it via portal
  // and call this callback with the newly created product on success so the batch
  // modal can auto-select it.
  const [productMasterStacked, setProductMasterStacked] = useState(false);
  const [pendingProductCallback, setPendingProductCallback] = useState(null);

  const [batchDrawer, setBatchDrawer] = useState(null);
  const [batchRows, setBatchRows] = useState([]);
  const [batchDrawerBusy, setBatchDrawerBusy] = useState(false);
  const [showLockedMfgStock, setShowLockedMfgStock] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importEntityType, setImportEntityType] = useState("PRODUCTS");

  // productId -> "EXPIRED" | "NEAR" | "VALID" | "NONE" | "UNKNOWN"
  const [expiryMap, setExpiryMap] = useState({});
  const [expiryBusy, setExpiryBusy] = useState(false);

  useEffect(() => {
    return onAuthChanged(() => setAuthTick((t) => t + 1));
  }, []);

  const canView = can("PRODUCT_BATCHES", "VIEW");
  const canAdd = can("PRODUCT_BATCHES", "ADD");
  const canUpdate = can("PRODUCT_BATCHES", "UPDATE");
  const canDelete = can("PRODUCT_BATCHES", "DELETE");

  async function refresh() {
    setBusy(true);
    const resp = await listProducts({
      page: 1,
      limit: 500,
      sortBy: sort.by,
      sortOrder: sort.dir,
      search: clean(search) || undefined,
      mfgCompanyId: clean(mfgFilter) || undefined,
      divisionId: clean(divisionFilter) || undefined,
      requireActiveBatch: batchPresenceFilter === "with" ? true : undefined
    });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      setRows(resp.json?.data?.items || []);
    } else {
      if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
    }
    setBusy(false);
  }

  useEffect(() => {
    if (canView) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, authTick, sort.by, sort.dir, search, mfgFilter, divisionFilter, batchPresenceFilter]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setDivisionsLoading(true);
      const resp = await listDivisions({ sortBy: "name", sortDir: "asc", isActive: true });
      if (!alive) return;
      if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
        setDivisions(resp.json?.data?.divisions || []);
      }
      if (alive) setDivisionsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [authTick]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setMfgLoading(true);
      const resp = await listMfgCompanies({ limit: 500, offset: 0 });
      if (!alive) return;
      if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
        setMfgCompanies(resp.json?.data?.companies || []);
      }
      if (alive) setMfgLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [authTick]);

  // Load vendors for supplier assignment (wholesaler only)
  useEffect(() => {
    if (isRetailer) return;
    let alive = true;
    (async () => {
      setVendorsLoading(true);
      const resp = await listVendors({ limit: 500, sortBy: "name", sortDir: "asc" });
      if (!alive) return;
      if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
        setVendors(resp.json?.data?.vendors || resp.json?.data?.items || []);
      }
      if (alive) setVendorsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [authTick, isRetailer]);

  async function loadBatchesForDrawer(productId) {
    if (!productId) {
      setBatchRows([]);
      return;
    }
    setBatchDrawerBusy(true);
    const b = await listProductBatches({
      productId,
      divisionId: stockDivisionFilter || undefined,
      respect_mfg_stock_report_lock: true,
      show_locked_mfg: showLockedMfgStock
    });
    if (b.status >= 200 && b.status < 300 && b.json?.ok) setBatchRows(b.json?.data?.items || []);
    else setBatchRows([]);
    setBatchDrawerBusy(false);
  }

  useEffect(() => {
    if (batchDrawer?.product?.id) loadBatchesForDrawer(batchDrawer.product.id);
    else setBatchRows([]);
    setSelectedBatchIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchDrawer?.product?.id, showLockedMfgStock, stockDivisionFilter]);

  function toggleBatchSelected(batchId) {
    const sid = String(batchId);
    setSelectedBatchIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  }

  function toggleAllBatchesSelected() {
    const all = (batchRows || []).map((b) => String(b.id));
    setSelectedBatchIds((prev) => (prev.length === all.length && all.length > 0 ? [] : all));
  }

  const filtered = useMemo(() => {
    let list = rows || [];
    if (batchPresenceFilter === "without") list = list.filter((r) => Number(r.active_batch_count ?? 0) === 0);
    if (expiryFilter) {
      const m = expiryMap || {};
      list = list.filter((r) => {
        const key = String(r?.id || "");
        const st = m[key] || "UNKNOWN";
        // While loading, don't hide rows prematurely.
        if (st === "UNKNOWN") return true;
        return st === expiryFilter;
      });
    }
    if (lowStockFilter) {
      list = list.filter((r) => {
        const productLow = Boolean(r.product_low_stock);
        const lowBatchCount = Number(r.low_batch_count ?? 0) || 0;
        const anyLow = productLow || lowBatchCount > 0;
        if (lowStockFilter === "LOW_ANY") return anyLow;
        if (lowStockFilter === "LOW_PRODUCT") return productLow;
        if (lowStockFilter === "LOW_BATCH") return lowBatchCount > 0;
        if (lowStockFilter === "NORMAL") return !anyLow;
        if (lowStockFilter === "ALERTS_OFF") return !Boolean(r.low_stock_alert_enabled);
        return true;
      });
    }
    return list;
  }, [rows, batchPresenceFilter, expiryFilter, expiryMap, lowStockFilter]);

  const divisionFilterOptions = useMemo(() => {
    const list = divisions || [];
    if (!mfgFilter) return list;
    return list.filter((d) => String(d.mfg_company_id || "") === String(mfgFilter));
  }, [divisions, mfgFilter]);

  const divisionOptionsForBatchModal = useMemo(() => {
    const base = divisions || [];
    const id = clean(editing?.divisionId || "");
    if (!id || base.some((d) => String(d.id) === id)) return base;
    return [
      ...base,
      {
        id,
        code: editing?.division_code || "",
        name: editing?.division_name || "Division",
        mfg_company_id: editing?.mfgCompanyId || "",
        mfg_company_name: "",
        is_active: false
      }
    ];
  }, [divisions, editing]);

  const rowClassName = (r) => (Number(r.active_batch_count ?? 0) === 0 ? "qmRow_noBatches" : "");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!expiryFilter) return;
      const list = Array.isArray(rows) ? rows : [];
      const ids = list.map((p) => String(p?.id || "")).filter(Boolean);
      if (!ids.length) return;

      // Only fetch for ids we don't have yet.
      setExpiryBusy(true);
      setExpiryMap((prev) => {
        const next = { ...(prev || {}) };
        for (const id of ids) if (!next[id]) next[id] = "UNKNOWN";
        return next;
      });

      const CONCURRENCY = 6;
      let idx = 0;
      async function worker() {
        for (;;) {
          if (cancelled) return;
          const id = ids[idx++];
          if (!id) return;
          // Skip cached (resolved) states
          const cur = (expiryMap || {})[id];
          if (cur && cur !== "UNKNOWN") continue;

          const resp = await listProductBatches({ productId: id, limit: 250 });
          if (cancelled) return;
          const batches = resp.status >= 200 && resp.status < 300 && resp.json?.ok ? resp.json?.data?.items || [] : [];

          let st = "NONE";
          if (Array.isArray(batches) && batches.length) {
            st = "VALID";
            for (const b of batches) {
              const d = daysUntil(b.expiry_date);
              const s = String(b.expiry_status || "").toUpperCase();
              if (s === "EXPIRED" || (d != null && d < 0)) {
                st = "EXPIRED";
                break;
              }
              if (s === "NEAR_EXPIRY" || (d != null && d <= 90)) {
                st = "NEAR";
              }
            }
          }

          setExpiryMap((prev) => ({ ...(prev || {}), [id]: st }));
        }
      }

      const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker());
      await Promise.all(workers);
      if (!cancelled) setExpiryBusy(false);
    }

    run();
    return () => {
      cancelled = true;
      setExpiryBusy(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiryFilter, rows]);

  function seedBatchFromProduct(p) {
    const gstStr = (v) => (v != null && v !== "" ? String(v) : "");
    return {
      productId: p.id || "",
      productCode: p.code || "",
      productName: p.name || "",
      drugName: p.drug_name || "",
      mfgCompanyId: p.mfg_company_id || "",
      mfg_company_name: p.mfg_company_name || "",
      divisionId: p.division_id || "",
      division_name: p.division_name || "",
      division_code: p.division_code || "",
      batchNo: "",
      barcode: "",
      expiryDate: "",
      mfgDate: "",
      mrp: "",
      purchaseRate: "",
      salesRate: "",
      retailRate: "",
      netRate: "",
      landingCost: "",
      discountSales: "",
      discountPurchase: "",
      retailDiscountPercent: "",
      netDiscountPercent: "",
      salesScheme: p.sales_scheme || "",
      schemeQtyPaid: p.scheme_qty_paid != null ? String(p.scheme_qty_paid) : "",
      schemeQtyFree: p.scheme_qty_free != null ? String(p.scheme_qty_free) : "",
      salesGST: gstStr(p.sales_gst),
      purchaseGST: gstStr(p.purchase_gst),
      openingStock: "0",
      stockable: p.stockable !== false,
      openStockFreeQty: "",
      conversionUnit: p.conversion_unit || "",
      packing: p.packing || "",
      bulkPack: p.bulk_pack || "",
      casePack: p.case_pack || "",
      isDiscountEnabled: p.is_discount_enabled !== false,
      isHold: false,
      holdReason: "",
      isHalfScheme: Boolean(p.is_half_scheme),
      isNet: false,
      isNonEditableFreeQty: false,
      isControl: Boolean(p.is_control),
      lowStockAlertEnabled: false,
      lowStockThreshold: "0"
    };
  }

  function seedFromBatchRow(r) {
    return {
      id: r.id,
      productId: r.product_id || r.productId || "",
      divisionId: r.division_id || r.divisionId || "",
      division_name: r.division_name || "",
      division_code: r.division_code || "",
      mfgCompanyId: r.mfg_company_id || r.mfgCompanyId || "",
      mfg_company_name: r.mfg_company_name || "",
      mfg_short_name: r.mfg_short_name || "",
      productCode: r.product_code || "",
      productName: r.product_name || "",
      drugName: r.drug_name || "",
      batchNo: r.batch_no || "",
      barcode: r.barcode || "",
      expiryDate: String(r.expiry_date || "").slice(0, 10),
      mfgDate: String(r.mfg_date || "").slice(0, 10),
      mrp: r.mrp ?? "",
      purchaseRate: r.purchase_rate ?? "",
      salesRate: r.sales_rate ?? "",
      retailRate: r.retail_rate ?? "",
      netRate: r.net_rate ?? "",
      landingCost: r.landing_cost ?? "",
      discountSales: r.discount_sales ?? "",
      discountPurchase: r.discount_purchase ?? "",
      retailDiscountPercent: r.retail_discount_percent ?? "",
      netDiscountPercent: r.net_discount_percent ?? "",
      salesScheme: r.sales_scheme ?? "",
      schemeQtyPaid: r.scheme_qty_paid ?? "",
      schemeQtyFree: r.scheme_qty_free ?? "",
      salesGST: r.sales_gst ?? "",
      purchaseGST: r.purchase_gst ?? "",
      // DB may store NULL opening/free qty for legacy rows  empty string fails modal validation ("required").
      openingStock: r.opening_stock != null && r.opening_stock !== "" ? String(r.opening_stock) : "0",
      openStockFreeQty:
        r.open_stock_free_qty != null && r.open_stock_free_qty !== "" ? String(r.open_stock_free_qty) : "0",
      specialRate1: r.special_rate_1 != null && r.special_rate_1 !== "" ? String(r.special_rate_1) : "",
      specialRate2: r.special_rate_2 != null && r.special_rate_2 !== "" ? String(r.special_rate_2) : "",
      looseStock: r.loose_stock != null && r.loose_stock !== "" ? String(r.loose_stock) : "",
      looseUnitName: r.loose_unit_name != null ? String(r.loose_unit_name) : "",
      stockable: r.stockable !== false,
      openingStockLocked: Boolean(r.opening_stock_locked),
      conversionUnit: r.conversion_unit ?? "",
      packing: r.packing ?? "",
      bulkPack: r.bulk_pack ?? "",
      casePack: r.case_pack ?? "",
      isDiscountEnabled: Boolean(r.is_discount_enabled),
      isHold: Boolean(r.is_hold),
      holdReason: r.hold_reason || "",
      isHalfScheme: Boolean(r.is_half_scheme),
      isNet: Boolean(r.is_net),
      isNonEditableFreeQty: Boolean(r.is_non_editable_free_qty),
      isControl: Boolean(r.is_control),
      lowStockAlertEnabled: Boolean(r.low_stock_alert_enabled),
      lowStockThreshold: r.low_stock_threshold ?? "0"
    };
  }

  if (!canView) {
    return (
      <AppShell
       
        userName={user?.full_name || "User"}
        userEmail={user?.email || auth?.email || ""}
        userBusinessName={user?.firm_name || ""}
        userGstNumber={user?.gst_number || ""}
        variant="user"
      >
        <div className="pageWrap">
          <div className="pageCard">
            <div className="raTitle">{NAV_LABELS.qualityMaster}</div>
            <div className="raSub">You don’t have permission to view quality master.</div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
     
      userName={user?.full_name || "User"}
      userEmail={user?.email || auth?.email || ""}
      userBusinessName={user?.firm_name || ""}
      userGstNumber={user?.gst_number || ""}
      variant="user"
    >
      <div className="pageWrap">
        <div className="qmTopRow">
          <div>
            <div className="raTitle">{NAV_LABELS.qualityMaster}</div>
            <div className="raSub">
              {isRetailer
                ? "Your shop catalog. Track batches for expiry, MRP and stock  open a product to manage its batches."
                : "Catalog products (SKUs). Batches track expiry, pricing and stock per lot  open a product to manage its batches."}
            </div>
          </div>
        </div>

        {stockDivisionFilter ? (
          <div
            className="pageCard"
            style={{
              marginBottom: 12,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)"
            }}
          >
            <span style={{ fontSize: 13, color: "var(--color-text-2)" }}>
              Showing batches for one division only (stock view). Open a product to see lots linked to this division.
            </span>
            <button
              type="button"
              className="sfmBtnGhost"
              onClick={() => {
                setSearchParams((prev) => {
                  const p = new URLSearchParams(prev);
                  p.delete("divisionId");
                  return p;
                });
              }}
            >
              Clear division filter
            </button>
          </div>
        ) : null}

        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            compact
            countText={busy ? "Loading…" : `${filtered.length} products`}
            search={search}
            onSearchChange={setSearch}
            controlsPlacement="top"
            sort={sort}
            onSortChange={setSort}
            extraHeaderActions={
              canAdd ? (
                <>
                  <AppButton
                    variant="secondary"
                    disabled={busy}
                    icon={<Upload size={QM_ICON_SZ} strokeWidth={QM_ICON_STROKE} />}
                    onClick={() => {
                      setImportEntityType("PRODUCTS");
                      setImportOpen(true);
                    }}
                  >
                    Import products
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    disabled={busy}
                    icon={<Upload size={QM_ICON_SZ} strokeWidth={QM_ICON_STROKE} />}
                    onClick={() => {
                      setImportEntityType("PRODUCT_BATCHES");
                      setImportOpen(true);
                    }}
                  >
                    Import batches
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    disabled={busy}
                    icon={<Download size={QM_ICON_SZ} strokeWidth={QM_ICON_STROKE} />}
                    onClick={async () => {
                      const rows = [];
                      for (const p of filtered || []) {
                        const r = await listProductBatches({ productId: p.id, limit: 500 });
                        const list = r.status >= 200 && r.status < 300 && r.json?.ok ? r.json?.data?.items || [] : [];
                        for (const b of list) {
                          rows.push({
                            product_code: p.code || "",
                            product_name: p.name || "",
                            batch_no: b.batch_no || "",
                            expiry_date: b.expiry_date || "",
                            mrp: b.mrp ?? "",
                            purchase_rate: b.purchase_rate ?? "",
                            sales_rate: b.sales_rate ?? "",
                            current_stock: b.current_stock ?? "",
                            loose_stock: b.loose_stock ?? "",
                            loose_unit_name: b.loose_unit_name || ""
                          });
                        }
                      }
                      downloadCsvFile(
                        "product_batches_export.csv",
                        [
                          { key: "product_code", label: "product_code" },
                          { key: "product_name", label: "product_name" },
                          { key: "batch_no", label: "batch_no" },
                          { key: "expiry_date", label: "expiry_date" },
                          { key: "mrp", label: "mrp" },
                          { key: "purchase_rate", label: "purchase_rate" },
                          { key: "sales_rate", label: "sales_rate" },
                          { key: "current_stock", label: "current_stock" },
                          { key: "loose_stock", label: "loose_stock" },
                          { key: "loose_unit_name", label: "loose_unit_name" }
                        ],
                        rows
                      );
                    }}
                  >
                    Export batches
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    disabled={busy}
                    icon={<Download size={QM_ICON_SZ} strokeWidth={QM_ICON_STROKE} />}
                    onClick={() => {
                      const cols = [
                        { key: "code", label: "code" },
                        { key: "name", label: "name" },
                        { key: "drug_name", label: "drug_name" },
                        { key: "manufacturer_code", label: "manufacturer_code" },
                        { key: "division_code", label: "division_code" },
                        { key: "packing", label: "packing" },
                        { key: "sales_gst", label: "sales_gst" },
                        { key: "purchase_gst", label: "purchase_gst" },
                        { key: "hsn_code", label: "hsn_code" },
                        { key: "rack_location", label: "rack_location" },
                        { key: "is_control", label: "is_control" },
                        { key: "is_otc", label: "is_otc" },
                        { key: "stockable", label: "stockable" },
                        { key: "is_discount_enabled", label: "is_discount_enabled" }
                      ];
                      downloadCsvFile(
                        "products_export.csv",
                        cols,
                        filtered.map((r) => ({
                          code: r.code,
                          name: r.name,
                          drug_name: r.drug_name || "",
                          manufacturer_code: r.mfg_company_code || r.division_code || "",
                          division_code: r.division_code || "",
                          packing: r.packing || "",
                          sales_gst: r.sales_gst ?? "",
                          purchase_gst: r.purchase_gst ?? "",
                          hsn_code: r.hsn_code || "",
                          rack_location: r.rack_location || "",
                          is_control: r.is_control ? "TRUE" : "FALSE",
                          is_otc: r.is_otc ? "TRUE" : "FALSE",
                          stockable: r.stockable ? "TRUE" : "FALSE",
                          is_discount_enabled: r.is_discount_enabled ? "TRUE" : "FALSE"
                        }))
                      );
                    }}
                  >
                    Export products
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    disabled={busy}
                    icon={<Layers size={QM_ICON_SZ} strokeWidth={QM_ICON_STROKE} />}
                    onClick={() => {
                      setEditing({ productCode: "" });
                      setModalMode("add");
                      setModalOpen(true);
                    }}
                  >
                    Add batch
                  </AppButton>
                </>
              ) : null
            }
            primaryAction={
              canAdd
                ? {
                    label: "Add product",
                    disabled: busy,
                    onClick: () => {
                      setEditingProduct(null);
                      setProductMasterMode("add");
                      setProductMasterOpen(true);
                    }
                  }
                : null
            }
            filters={
              isRetailer
                ? [
                    {
                      id: "batches",
                      label: "Batches",
                      value: batchPresenceFilter,
                      onChange: setBatchPresenceFilter,
                      options: [
                        { value: "", label: "All products" },
                        { value: "with", label: "Has batches" },
                        { value: "without", label: "No batches yet" }
                      ]
                    },
                    {
                      id: "expiry",
                      label: "Expiry",
                      value: expiryFilter,
                      onChange: setExpiryFilter,
                      options: [
                        { value: "", label: "All expiry" },
                        { value: "EXPIRED", label: "Expired" },
                        { value: "NEAR", label: "Near expiry (≤ 90 days)" },
                        { value: "VALID", label: "Valid (> 90 days)" },
                        { value: "NONE", label: "No batches" }
                      ]
                    },
                    {
                      id: "low_stock",
                      label: "Stock alerts",
                      value: lowStockFilter,
                      onChange: setLowStockFilter,
                      options: [
                        { value: "", label: "All stock" },
                        { value: "LOW_ANY", label: "Low stock (any)" },
                        { value: "LOW_PRODUCT", label: "Product low" },
                        { value: "LOW_BATCH", label: "Batch low" },
                        { value: "NORMAL", label: "Normal" },
                        { value: "ALERTS_OFF", label: "Alerts off" }
                      ]
                    }
                  ]
                : [
                    {
                      id: "mfg",
                      label: "Manufacturer",
                      value: mfgFilter,
                      onChange: (v) => {
                        setMfgFilter(v || "");
                        if (v) setDivisionFilter("");
                      },
                      options: [{ value: "", label: "All manufacturers" }, ...(mfgCompanies || []).map((c) => ({ value: String(c.id), label: c.name || c.short_name || "Company" }))]
                    },
                    {
                      id: "division",
                      label: "Division",
                      value: divisionFilter,
                      onChange: setDivisionFilter,
                      options: [{ value: "", label: "All divisions" }, ...(divisionFilterOptions || []).map((d) => ({ ...toDivisionOption(d), value: String(d.id) }))]
                    },
                    {
                      id: "batches",
                      label: "Batches",
                      value: batchPresenceFilter,
                      onChange: setBatchPresenceFilter,
                      options: [
                        { value: "", label: "All products" },
                        { value: "with", label: "Has batches" },
                        { value: "without", label: "No batches yet" }
                      ]
                    },
                    {
                      id: "expiry",
                      label: "Expiry",
                      value: expiryFilter,
                      onChange: setExpiryFilter,
                      options: [
                        { value: "", label: "All expiry" },
                        { value: "EXPIRED", label: "Expired" },
                        { value: "NEAR", label: "Near expiry (≤ 90 days)" },
                        { value: "VALID", label: "Valid (> 90 days)" },
                        { value: "NONE", label: "No batches" }
                      ]
                    },
                    {
                      id: "low_stock",
                      label: "Stock alerts",
                      value: lowStockFilter,
                      onChange: setLowStockFilter,
                      options: [
                        { value: "", label: "All stock" },
                        { value: "LOW_ANY", label: "Low stock (any)" },
                        { value: "LOW_PRODUCT", label: "Product low" },
                        { value: "LOW_BATCH", label: "Batch low" },
                        { value: "NORMAL", label: "Normal" },
                        { value: "ALERTS_OFF", label: "Alerts off" }
                      ]
                    }
                  ]
            }
            rows={filtered}
            getRowId={(r) => r.id}
            rowClassName={rowClassName}
            onRowClick={(r) => setBatchDrawer({ product: r })}
            pageSize={productTablePageSize}
            onPageSizeChange={setProductTablePageSize}
            bulkDelete={
              canDelete
                ? {
                    label: "Delete selected",
                    confirmTitle: "Delete selected products?",
                    confirmMessage: (n) =>
                      `Soft-delete ${n} product(s) and all of their live batches? Past invoices keep their references; this only hides catalog rows.`,
                    confirmLabel: "Delete selected",
                    danger: true,
                    onDelete: async (ids) => {
                      setBusy(true);
                      const r = await bulkDeleteProducts(ids);
                      setBusy(false);
                      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                        const data = r.json?.data || {};
                        const failed = data.failed || [];
                        if (failed.length) {
                          emitToast({ type: "warning", message: `${failed.length} product(s) could not be removed.` });
                        }
                        const deletedIds = data.deletedIds || [];
                        const delSet = new Set(deletedIds.map(String));
                        if (batchDrawer?.product?.id && delSet.has(String(batchDrawer.product.id))) {
                          setBatchDrawer(null);
                        }
                        setSelectedBatchIds([]);
                        await refresh();
                      } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                    }
                  }
                : undefined
            }
            columns={[
              { id: "code", header: "SKU", render: (r) => <span style={{ fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.02em" }}>{r.code || ""}</span> },
              { id: "name", header: "Product name", render: (r) => <span style={{ fontWeight: 700 }}>{r.name || ""}</span> },
              { id: "drug_name", header: "Drug name", sortable: false, render: (r) => <span>{r.drug_name || ""}</span> },
              { id: "packing", header: "Packing", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{r.packing || ""}</span> },
              ...(isRetailer
                ? [
                    {
                      id: "mfg_company_name",
                      header: "Mfg",
                      sortable: false,
                      render: (r) => {
                        const mfg = r.mfg_short_name || r.mfg_company_name;
                        if (!mfg) return <span style={{ color: "var(--color-text-3)" }}></span>;
                        return <span title={r.mfg_company_name || ""}>{mfg}</span>;
                      }
                    },
                    {
                      id: "is_otc",
                      header: "Type",
                      sortable: false,
                      render: (r) =>
                        r.is_control ? (
                          <span className="qmBadge qmBadge_warn" title="Schedule H/H1/X — prescription mandatory">
                            Rx
                          </span>
                        ) : r.is_otc !== false ? (
                          <span className="qmBadge">OTC</span>
                        ) : (
                          <span className="qmBadge qmBadge_warn">Other</span>
                        )
                    },
                    {
                      id: "hsn_code",
                      header: "HSN",
                      sortable: false,
                      render: (r) => <span style={{ color: "var(--color-text-3)" }}>{r.hsn_code || ""}</span>
                    },
                    {
                      id: "rack_location",
                      header: "Rack",
                      sortable: false,
                      render: (r) => <span style={{ color: "var(--color-text-3)" }}>{r.rack_location || ""}</span>
                    }
                  ]
                : [
                    {
                      id: "division_name",
                      header: "Division",
                      sortable: false,
                      render: (r) => {
                        const div = r.division_name || r.divisionName;
                        if (!div) return <span style={{ color: "var(--color-text-3)" }}></span>;
                        const mfg = r.mfg_short_name || r.mfg_company_name;
                        return <span>{div}{mfg ? <span style={{ color: "var(--color-text-3)" }}> · {mfg}</span> : null}</span>;
                      }
                    },
                    {
                      id: "mfg_company_name",
                      header: "Mfg company",
                      sortable: false,
                      render: (r) => <span>{r.mfg_company_name || ""}</span>
                    },
                    {
                      id: "supplier_name",
                      header: "Supplier",
                      sortable: false,
                      render: (r) => {
                        const name = r.supplier_short_name || r.supplier_name;
                        if (!name) return <span style={{ color: "var(--color-text-4)", fontSize: 12 }}>—</span>;
                        return (
                          <span
                            title={r.supplier_name || ""}
                            style={{ color: "var(--color-text-2)", fontSize: 12.5 }}
                          >
                            {name}
                            {r.supplier_is_preferred ? (
                              <span
                                style={{ marginLeft: 4, fontSize: 10, color: "var(--color-success)", fontWeight: 700 }}
                                title="Preferred supplier"
                              >
                                ★
                              </span>
                            ) : null}
                          </span>
                        );
                      }
                    }
                  ]),
              {
                id: "gst",
                header: taxLabel,
                sortable: false,
                render: (r) => {
                  const s = r.sales_gst != null && r.sales_gst !== "" ? Number(r.sales_gst) : null;
                  const p = r.purchase_gst != null && r.purchase_gst !== "" ? Number(r.purchase_gst) : null;
                  if (s === null && p === null) return <span style={{ color: "var(--color-text-3)" }}>—</span>;
                  if (s !== null && p !== null && s === p) {
                    return <span style={{ fontWeight: 600, color: "var(--color-text-2)" }}>{s}%</span>;
                  }
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, lineHeight: 1.4 }}>
                      {s !== null && <span style={{ color: "var(--color-text-2)" }}><span style={{ color: "var(--color-text-3)", fontSize: 11 }}>S </span>{s}%</span>}
                      {p !== null && <span style={{ color: "var(--color-text-2)" }}><span style={{ color: "var(--color-text-3)", fontSize: 11 }}>P </span>{p}%</span>}
                    </div>
                  );
                }
              },
              { id: "sales_scheme", header: "Scheme", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{r.sales_scheme || ""}</span> },
              {
                id: "active_batch_count",
                header: "Batches",
                sortable: false,
                render: (r) => {
                  const n = Number(r.active_batch_count ?? 0);
                  if (n === 0) {
                    return (
                      <span className="qmBadge qmBadge_warn" title="Add a batch to record expiry, rates and stock.">
                        None yet
                      </span>
                    );
                  }
                  return (
                    <span className="qmBadge qmBadge_ok">
                      {n} live {n === 1 ? "batch" : "batches"}
                    </span>
                  );
                }
              },
              {
                id: "total_quantity",
                header: "Total qty",
                sortable: true,
                render: (r) => {
                  const total = Number(r.total_quantity ?? 0);
                  const loose = Number(r.total_loose_quantity ?? 0);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontWeight: 700 }}>{Number.isFinite(total) ? total.toFixed(3).replace(/\.?0+$/, "") : "0"}</span>
                      {loose > 0 ? (
                        <span style={{ fontSize: 11, color: "var(--color-text-3)", fontVariantNumeric: "tabular-nums" }}>
                          {loose.toFixed(3).replace(/\.?0+$/, "")} loose
                        </span>
                      ) : null}
                    </div>
                  );
                }
              },
              {
                id: "low_stock",
                header: "Low stock alerts",
                sortable: false,
                render: (r) => {
                  const productLow = Boolean(r.product_low_stock);
                  const lowBatchCount = Number(r.low_batch_count ?? 0) || 0;
                  const alerts = [];
                  if (productLow) alerts.push(`Product low (<= ${Number(r.low_stock_threshold ?? 0)})`);
                  if (lowBatchCount > 0) alerts.push(`${lowBatchCount} ${lowBatchCount === 1 ? "batch" : "batches"} low`);
                  if (!alerts.length) return <span className="qmBadge qmBadge_ok">Normal</span>;
                  return (
                    <span className="qmBadge qmBadge_warn" title={alerts.join(" • ")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <IconStockAlert width={14} height={14} aria-hidden="true" />
                      {alerts.join(" • ")}
                    </span>
                  );
                }
              },
              { id: "created_at", header: "Created", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{String(r.created_at || "").slice(0, 10)}</span> },
              {
                id: "actions",
                header: "Actions",
                sortable: false,
                align: "right",
                render: (r) => (
                  <div className="ibGroup" onClick={(e) => e.stopPropagation()}>
                    <IconBtn tooltip="Batches" disabled={busy} onClick={() => setBatchDrawer({ product: r })}>
                      <IconLayers />
                    </IconBtn>
                    {canUpdate ? (
                      <IconBtn
                        tooltip="Edit product"
                        disabled={busy}
                        onClick={() => {
                          setEditingProduct(r);
                          setProductMasterMode("edit");
                          setProductMasterOpen(true);
                        }}
                      >
                        <IconEdit />
                      </IconBtn>
                    ) : null}
                    {canAdd ? (
                      <IconBtn
                        tooltip="Add batch"
                        variant="success"
                        disabled={busy}
                        onClick={() => {
                          setEditing(seedBatchFromProduct(r));
                          setModalMode("add");
                          setModalOpen(true);
                        }}
                      >
                        <IconPlus />
                      </IconBtn>
                    ) : null}
                    {canDelete ? (
                      <IconBtn
                        variant="danger"
                        disabled={busy}
                        tooltip="Delete product"
                        onClick={() =>
                          setConfirm({
                            open: true,
                            kind: "product",
                            id: r.id,
                            name: r.name || r.code || "",
                            ids: []
                          })
                        }
                      >
                        <IconTrash />
                      </IconBtn>
                    ) : null}
                  </div>
                )
              }
            ]}
          />
        </div>
      </div>

      <CommonModal
        open={Boolean(batchDrawer)}
        title={batchDrawer ? `Batches  ${batchDrawer.product?.name || ""}` : "Batches"}
        subtitle={
          batchDrawer
            ? (() => {
                const p = batchDrawer.product || {};
                const pieces = [
                  `Code ${p.code || ""}`,
                  p.division_name ? `Division: ${p.division_name}${p.mfg_short_name || p.mfg_company_name ? ` (${p.mfg_short_name || p.mfg_company_name})` : ""}` : p.mfg_company_name ? `Mfg: ${p.mfg_company_name}` : "",
                  !isRetailer && (p.supplier_short_name || p.supplier_name) ? `Supplier: ${p.supplier_short_name || p.supplier_name}` : "",
                  p.sales_gst != null && p.sales_gst !== "" ? `${taxLabel}: ${p.sales_gst}%` : "",
                  p.sales_scheme ? `Scheme: ${p.sales_scheme}` : "",
                  p.packing ? `Packing: ${p.packing}` : "",
                  `${batchRows.length} lot(s)`
                ].filter(Boolean);
                return pieces.join(" · ");
              })()
            : ""
        }
        icon={<IconProducts />}
        loading={batchDrawerBusy}
        loadingText="Loading batches..."
        onClose={() => !busy && setBatchDrawer(null)}
        size={980}
        drawer={true}
        footer={
          <div className="qmBatchDrawerFooter">
            {canDelete && batchRows.length > 0 ? (
              <p className="qmBatchDrawerHint">
                {selectedBatchIds.length > 0
                  ? `${selectedBatchIds.length} batch(es) selected  use Delete selected or row actions.`
                  : "Tip: use checkboxes to soft-delete several batches at once."}
              </p>
            ) : (
              <span className="qmBatchDrawerHint" />
            )}
            <div className="qmBatchDrawerFooterBtns">
              <button
                className="sfmBtnGhost"
                type="button"
                data-cm-cancel="true"
                disabled={busy}
                onClick={() => setBatchDrawer(null)}
              >
                Close
              </button>
              {canDelete ? (
                <button
                  className="qmBatchDrawerBtnBulk"
                  type="button"
                  disabled={busy || selectedBatchIds.length === 0}
                  title={selectedBatchIds.length === 0 ? "Select one or more batches in the table" : undefined}
                  onClick={() =>
                    setConfirm({
                      open: true,
                      kind: "bulkBatches",
                      id: "",
                      name: `${selectedBatchIds.length} batch(es)`,
                      ids: [...selectedBatchIds]
                    })
                  }
                >
                  Delete selected{selectedBatchIds.length > 0 ? ` (${selectedBatchIds.length})` : ""}
                </button>
              ) : null}
              {canAdd && batchDrawer?.product ? (
                <button
                  className="sfmBtnPrimary"
                  type="button"
                  data-cm-primary="true"
                  disabled={busy}
                  onClick={() => {
                    setEditing(seedBatchFromProduct(batchDrawer.product));
                    setModalMode("add");
                    setModalOpen(true);
                  }}
                >
                  Add batch
                </button>
              ) : null}
            </div>
          </div>
        }
      >
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <label className="sfmCheck" style={{ margin: 0 }}>
            <input type="checkbox" checked={showLockedMfgStock} onChange={(e) => setShowLockedMfgStock(e.target.checked)} />
            <span>Show locked manufacturer stock</span>
          </label>
        </div>
        {!batchRows.length ? (
          <div className="qmBatchDrawerEmpty">No batches yet. Add a batch to set expiry, pricing and opening stock for this product.</div>
        ) : (
          <div className="qmBatchDrawer">
            <div className="qmBatchDrawerScroll">
              <table className="qmBatchDrawerTable">
                <thead>
                  <tr>
                    {canDelete ? (
                      <th className="qmBDTh qmBDTh_check" scope="col">
                        <input
                          type="checkbox"
                          className="qmBDCheck"
                          aria-label="Select all batches on this list"
                          checked={batchRows.length > 0 && selectedBatchIds.length === batchRows.length}
                          onChange={toggleAllBatchesSelected}
                        />
                      </th>
                    ) : null}
                    <th className="qmBDTh" scope="col">
                      Batch No
                    </th>
                    <th className="qmBDTh" scope="col">
                      Barcode
                    </th>
                    <th className="qmBDTh qmBDTh_expiry" scope="col">
                      Expiry
                    </th>
                    <th className="qmBDTh" scope="col">
                      Mfg date
                    </th>
                    <th className="qmBDTh qmBDTh_num" scope="col">
                      MRP
                    </th>
                    <th className="qmBDTh qmBDTh_num" scope="col">
                      Purchase
                    </th>
                    <th className="qmBDTh qmBDTh_num" scope="col">
                      Sales
                    </th>
                    <th className="qmBDTh qmBDTh_num" scope="col">
                      Net
                    </th>
                    <th className="qmBDTh qmBDTh_num" scope="col">
                      Stock
                    </th>
                    <th className="qmBDTh qmBDTh_num" scope="col">
                      Loose
                    </th>
                    <th className="qmBDTh qmBDTh_center" scope="col">
                      Status
                    </th>
                    <th className="qmBDTh qmBDTh_actions" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((b) => {
                    const d = daysUntil(b.expiry_date);
                    const status =
                      b.expiry_status || (d == null ? null : d < 0 ? "EXPIRED" : d <= 90 ? "NEAR_EXPIRY" : "ACTIVE");
                    const billStock = Number(b.stock_billable_qty ?? b.total_stock ?? 0) || 0;
                    const freeStock = Number(b.stock_free_qty ?? 0) || 0;
                    const stockNum = billStock;
                    const batchLowStock = Boolean(b.batch_low_stock);
                    return (
                      <tr key={b.id} className="qmBDTr">
                        {canDelete ? (
                          <td className="qmBDTd qmBDTd_check" data-label="Select">
                            <input
                              type="checkbox"
                              className="qmBDCheck"
                              aria-label={`Select batch ${b.batch_no || b.id}`}
                              checked={selectedBatchIds.includes(String(b.id))}
                              onChange={() => toggleBatchSelected(b.id)}
                            />
                          </td>
                        ) : null}
                        <td className="qmBDTd" data-label="Batch No">
                          <div className="qmBDBatchNo">{b.batch_no || ""}</div>
                          {b.stockable === false ? <span className="qmBadge qmBadge_warn qmBDInlineBadge">Non-stock</span> : null}
                        </td>
                        <td className="qmBDTd qmBDMono" data-label="Barcode" title={clean(b.barcode) || undefined}>
                          {truncateMiddle(b.barcode, 14)}
                        </td>
                        <td className="qmBDTd qmBDTd_expiry" data-label="Expiry">
                          <div className={`qmBDExpiry ${status === "EXPIRED" ? "qmBDExpiry_exp" : status === "NEAR_EXPIRY" ? "qmBDExpiry_near" : ""}`}>
                            {formatYmdFriendly(b.expiry_date) || ""}
                          </div>
                          {d != null ? (
                            <div className="qmBDExpiryMeta">{formatBatchExpiryRelativePhrase(b.expiry_date)}</div>
                          ) : null}
                          {status === "EXPIRED" ? (
                            <span className="qmBadge qmBadge_warn qmBDInlineBadge">Expired</span>
                          ) : status === "NEAR_EXPIRY" ? (
                            <span className="qmBadge qmBadge_warn qmBDInlineBadge">Near</span>
                          ) : null}
                        </td>
                        <td className="qmBDTd qmBDMono" data-label="Mfg date">{formatYmdFriendly(b.mfg_date) || ""}</td>
                        <td className="qmBDTd qmBDTd_num" data-label="MRP">{fmtMoney(b.mrp)}</td>
                        <td className="qmBDTd qmBDTd_num" data-label="Purchase">{fmtMoney(b.purchase_rate)}</td>
                        <td className="qmBDTd qmBDTd_num" data-label="Sales">{fmtMoney(b.sales_rate)}</td>
                        <td className="qmBDTd qmBDTd_num" data-label="Net">{fmtMoney(b.net_rate)}</td>
                        <td className="qmBDTd qmBDTd_num" data-label="Stock">
                          <span className="qmBDStockNum" title="Billable (paid) units — sales invoice Qty uses this bucket">
                            {stockNum}
                          </span>
                          {freeStock > 0 ? (
                            <div className="qmBDStockSub" title="Free balance — use Free Qty on sales lines">
                              {freeStock} free · {billStock + freeStock} total
                            </div>
                          ) : null}
                          {batchLowStock ? (
                            <div className="qmBDStockSub" style={{ color: "var(--color-danger-strong)" }}>
                              Low stock ({"<="} {Number(b.low_stock_threshold ?? 0)})
                            </div>
                          ) : null}
                        </td>
                        <td className="qmBDTd qmBDTd_num" data-label="Loose">
                          {(() => {
                            const ls = Number(b.loose_stock ?? 0);
                            const lu = String(b.loose_unit_name || "").trim();
                            if (ls <= 0) return <span style={{ color: "var(--color-text-4)", fontSize: 12 }}>—</span>;
                            return (
                              <div>
                                <span className="qmBDStockNum" title="Loose units in stock">{ls}</span>
                                {lu ? <div className="qmBDStockSub">{lu}</div> : null}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="qmBDTd qmBDTd_center" data-label="Status">
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                            {status === "EXPIRED" ? (
                              <span className="qmBadge qmBadge_warn">Expired</span>
                            ) : status === "NEAR_EXPIRY" ? (
                              <span className="qmBadge qmBadge_warn">Near expiry</span>
                            ) : (
                              <span className="qmBadge">Active</span>
                            )}
                            {b.is_hold ? <span className="qmBadge qmBadge_warn" title={b.hold_reason || ""}>Hold</span> : null}
                          </div>
                        </td>
                        <td className="qmBDTd qmBDTd_actions" data-label="Actions">
                          <div className="qmBDActions">
                            <button
                              className="qmBDActBtn"
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setEditing(seedFromBatchRow(b));
                                setModalMode("view");
                                setModalOpen(true);
                              }}
                            >
                              View
                            </button>
                            {canUpdate ? (
                              <button
                                className="qmBDActBtn"
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setEditing(seedFromBatchRow(b));
                                  setModalMode("edit");
                                  setModalOpen(true);
                                }}
                              >
                                Edit
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                className="qmBDActBtn qmBDActBtnDanger"
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  setConfirm({
                                    open: true,
                                    kind: "batch",
                                    id: b.id,
                                    name: b.batch_no || b.product_name || b.product_code || "",
                                    ids: []
                                  })
                                }
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CommonModal>

      <ProductMasterModal
        open={productMasterOpen}
        mode={productMasterMode}
        busy={busy}
        loading={Boolean(divisionsLoading || mfgLoading || vendorsLoading)}
        initialValue={editingProduct}
        mfgCompanyOptions={mfgCompanies}
        divisionOptions={divisions}
        vendorOptions={vendors}
        portal={productMasterStacked}
        portalZIndex={520}
        onRefreshDivisions={async () => {
          const d = await listDivisions({ sortBy: "name", sortDir: "asc", isActive: true });
          if (d.status >= 200 && d.status < 300 && d.json?.ok) setDivisions(d.json?.data?.divisions || []);
        }}
        onRefreshMfg={async () => {
          const m = await listMfgCompanies({ limit: 500, offset: 0 });
          if (m.status >= 200 && m.status < 300 && m.json?.ok) setMfgCompanies(m.json?.data?.companies || []);
        }}
        onClose={() => {
          if (busy) return;
          setProductMasterOpen(false);
          setProductMasterStacked(false);
          setPendingProductCallback(null);
        }}
        onSubmit={async (payload) => {
          setBusy(true);
          const resp =
            productMasterMode === "edit" && editingProduct?.id
              ? await updateProduct(editingProduct.id, payload)
              : await createProduct(payload);
          if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
            const created = resp.json?.data?.product || null;
            const savedProductId = created?.id || editingProduct?.id || null;

            // Save supplier assignment for wholesalers when a supplier was chosen
            if (!isRetailer && payload.supplierId && savedProductId) {
              try {
                await upsertSupplierProduct({
                  vendorId: payload.supplierId,
                  productId: savedProductId,
                  isPreferred: true
                });
              } catch {
                /* non-fatal — product was saved; supplier link can be retried */
              }
            }

            setProductMasterOpen(false);
            setProductMasterStacked(false);
            await refresh();
            if (pendingProductCallback && created) {
              try {
                pendingProductCallback(created);
              } catch {
                /* ignore callback errors */
              }
            }
            setPendingProductCallback(null);
          } else if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
          setBusy(false);
        }}
      />

      <ProductBatchModal
        open={modalOpen}
        mode={modalMode}
        busy={busy}
        initialValue={editing}
        existingRows={rows}
        divisionOptions={divisionOptionsForBatchModal}
        mfgCompanyOptions={mfgCompanies}
        productOptions={rows}
        onRefreshProducts={refresh}
        onRequestCreateProduct={(onCreated) => {
          setEditingProduct(null);
          setProductMasterMode("add");
          setProductMasterStacked(true);
          setPendingProductCallback(() => onCreated);
          setProductMasterOpen(true);
        }}
        onRefreshDivisionMfg={async () => {
          const [d, m] = await Promise.all([listDivisions({ sortBy: "name", sortDir: "asc", isActive: true }), listMfgCompanies({ limit: 500, offset: 0 })]);
          if (d.status >= 200 && d.status < 300 && d.json?.ok) setDivisions(d.json?.data?.divisions || []);
          if (m.status >= 200 && m.status < 300 && m.json?.ok) setMfgCompanies(m.json?.data?.companies || []);
        }}
        onClose={() => {
          if (busy) return;
          setModalOpen(false);
        }}
        onSubmit={async (payload) => {
          setBusy(true);
          const resp =
            modalMode === "edit" && editing?.id ? await updateProductBatch(editing.id, payload) : await createProductBatch(payload);
          if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
            setModalOpen(false);
            await refresh();
            if (batchDrawer?.product?.id) await loadBatchesForDrawer(batchDrawer.product.id);
          } else {
            if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
          }
          setBusy(false);
        }}
      />

      <CsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityType={importEntityType}
        title={importEntityType === "PRODUCT_BATCHES" ? "Import product batches" : "Import products"}
        onCompleted={() => {
          refresh();
          if (batchDrawer?.product?.id) loadBatchesForDrawer(batchDrawer.product.id);
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        title={
          confirm.kind === "product"
            ? "Delete product?"
            : confirm.kind === "bulkBatches"
              ? "Delete batches?"
              : "Delete batch?"
        }
        message={
          confirm.kind === "product"
            ? confirm.name
              ? `Remove “${confirm.name}” from the catalog? All live batches for this product will be soft-deleted as well.`
              : "Remove this product from the catalog?"
            : confirm.kind === "bulkBatches"
              ? `Soft-delete ${confirm.ids?.length || 0} selected batch record(s)? The product row stays in the catalog.`
              : confirm.name
                ? `Soft-delete batch “${confirm.name}”?`
                : "Soft-delete this batch?"
        }
        hint={
          confirm.kind === "product"
            ? "Soft delete only: past invoices and history keep their references. You can create a new product with the same code later if needed."
            : "Soft delete: records are hidden, not destroyed."
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onClose={() => setConfirm({ open: false, kind: "batch", id: "", name: "", ids: [] })}
        onConfirm={async () => {
          setBusy(true);
          let ok = false;
          if (confirm.kind === "product" && confirm.id) {
            const resp = await deleteProduct(confirm.id);
            ok = resp.status >= 200 && resp.status < 300 && resp.json?.ok;
            if (!ok && resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
            if (ok) {
              setBatchDrawer(null);
              await refresh();
            }
          } else if (confirm.kind === "bulkBatches" && (confirm.ids || []).length) {
            const resp = await bulkDeleteProductBatches(confirm.ids);
            ok = resp.status >= 200 && resp.status < 300 && resp.json?.ok;
            if (ok) {
              const failed = resp.json?.data?.failed || [];
              if (failed.length) emitToast({ type: "warning", message: `${failed.length} batch(es) could not be removed.` });
              setSelectedBatchIds([]);
              await refresh();
              if (batchDrawer?.product?.id) await loadBatchesForDrawer(batchDrawer.product.id);
            } else if (resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
          } else if (confirm.kind === "batch" && confirm.id) {
            const resp = await deleteProductBatch(confirm.id);
            ok = resp.status >= 200 && resp.status < 300 && resp.json?.ok;
            if (!ok && resp.status !== 401) emitToast({ type: "error", message: parseApiError(resp) });
            if (ok) {
              setSelectedBatchIds((prev) => prev.filter((x) => x !== String(confirm.id)));
              await refresh();
              if (batchDrawer?.product?.id) await loadBatchesForDrawer(batchDrawer.product.id);
            }
          }
          setBusy(false);
          setConfirm({ open: false, kind: "batch", id: "", name: "", ids: [] });
        }}
      />
    </AppShell>
  );
}
