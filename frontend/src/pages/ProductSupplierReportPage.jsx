import { fmtCurrency } from "../utils/format.js";
import { useSeoMeta } from "../utils/seo.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import { can } from "../utils/access.js";
import { getProductSupplierReport } from "../services/reportService.js";
import { sortBatchesByExpiryAsc } from "../utils/batchSort.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import { ReportShell, ReportDenied } from "../components/reports/index.js";
import { formatExpiryShort, expiryStatus } from "../components/reports/reportExpiry.js";
import { formatBatchExpiryRelativePhrase } from "../utils/batchExpiryDisplay.js";
import CommonLoading from "../components/CommonLoading.jsx";
import { IconAlert, IconPsrChevronDown, IconPsrGrid, IconPsrOutOfStock, IconPsrPackage, IconPsrSearch, IconPsrSuppliers, IconX } from "../components/ui/AppIcons.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import "./ProductSupplierReportPage.css";

const DD_PAGE = 4;

function normalizeSummary(data) {
  const s = data.summary;
  const products = data.products || [];
  const batches = data.batches || [];
  const suppliers = data.suppliers || [];
  if (s && typeof s === "object" && (s.total_products != null || s.active_suppliers != null)) {
    return {
      total_products: Number(s.total_products) || 0,
      active_suppliers: Number(s.active_suppliers) || 0,
      expiring_soon_batches: Number(s.expiring_soon_batches) || 0,
      out_of_stock_products: Number(s.out_of_stock_products) || 0
    };
  }
  const vendorIds = new Set(suppliers.map((x) => String(x.vendor_id || "")).filter(Boolean));
  let expiring = 0;
  for (const b of batches) {
    if (Number(b.current_stock || 0) <= 0) continue;
    const st = expiryStatus(b.expiry_date);
    if (st === "near" || st === "expired") expiring++;
  }
  const oos = products.filter((p) => Number(p.total_stock || 0) <= 0).length;
  return {
    total_products: products.length,
    active_suppliers: vendorIds.size,
    expiring_soon_batches: expiring,
    out_of_stock_products: oos
  };
}

function DdSkeletonRows() {
  const rows = [0, 1, 2];
  return (
    <>
      {rows.map((i) => (
        <div key={i} className="dd-skel">
          <div className="skel" style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skel" style={{ height: 13, width: "60%" }} />
            <div className="skel" style={{ height: 11, width: "40%" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
            <div className="skel" style={{ height: 14, width: 28 }} />
            <div className="skel" style={{ height: 10, width: 44 }} />
          </div>
        </div>
      ))}
    </>
  );
}

function productInitials(name) {
  const n = String(name || "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim();
  if (!n) return "??";
  const parts = n.split(/\s+/).filter(Boolean);
  const s = parts
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return s || String(name).slice(0, 2).toUpperCase();
}

/** Shared row UI for dropdown suggestions and main product list (single implementation). */
function PsrProductPickRow({ variant, product, selectedId, needle, onPick }) {
  const st = Number(product.total_stock || 0);
  const stkCls = st === 0 ? " zero" : "";
  const subDefault = [product.mfg_name || product.mfg_short || "", product.drug_name || product.packing || ""].filter(Boolean).join(" · ");

  if (variant === "dropdown") {
    const q = String(needle || "").trim();
    return (
      <button type="button" className="dd-item" onClick={() => onPick(product.id)}>
        <div className="dd-av">{productInitials(product.name)}</div>
        <div className="dd-info">
          <div className="dd-name">
            <HighlightChunks text={product.name || product.code || ""} query={q} />
          </div>
          <div className="dd-sub">
            <HighlightChunks text={subDefault} query={q} />
          </div>
        </div>
        <div className="dd-right">
          <div className={`dd-stk${stkCls}`}>{st.toFixed(0)}</div>
          <div className="dd-stk-lbl">{st === 0 ? "out of stock" : "in stock"}</div>
        </div>
      </button>
    );
  }

  return (
    <button type="button" className={`p-item${product.id === selectedId ? " sel" : ""}`} onClick={() => onPick(product.id)}>
      <div className="p-av">{productInitials(product.name)}</div>
      <div className="p-info">
        <div className="p-name">{product.name || product.code}</div>
        <div className="p-mfg">{product.mfg_name || product.mfg_short || "—"}</div>
      </div>
      <div className="p-meta">
        <div className={`p-stk${stkCls}`}>{st.toFixed(0)}</div>
        <div className="p-stk-lbl">{st === 0 ? "out of stock" : "in stock"}</div>
      </div>
    </button>
  );
}

function HighlightChunks({ text, query }) {
  const q = String(query || "").trim();
  if (!q) return text;
  const low = String(text).toLowerCase();
  const n = q.toLowerCase();
  const out = [];
  let i = 0;
  while (i < text.length) {
    const j = low.indexOf(n, i);
    if (j === -1) {
      out.push(text.slice(i));
      break;
    }
    if (j > i) out.push(text.slice(i, j));
    out.push(
      <mark key={`${j}-${i}`} className="hl-mark">
        {text.slice(j, j + n.length)}
      </mark>
    );
    i = j + n.length;
  }
  return out;
}

function formatRs(n) {
  return fmtCurrency(n) || "";
}

function formatDateChip(d) {
  if (!d) return "";
  const t = new Date(`${String(d).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(t.getTime())) return String(d).slice(0, 10);
  return t.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function groupByFirstLetter(items) {
  const g = new Map();
  for (const p of items) {
    const L = String(p.name || "?")[0].toUpperCase();
    if (!g.has(L)) g.set(L, []);
    g.get(L).push(p);
  }
  return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// (moved to shared icons) IconPsrPackage in `components/ui/AppIcons.jsx`

function ProductDetailModal({ open, product, suppliers, batches, onClose }) {
  const [show, setShow] = useState(false);
  const closeTimer = useRef(null);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setShow(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setShow(false);
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onEsc(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [open, onClose]);

  const handleClose = useCallback(() => {
    setShow(false);
    closeTimer.current = setTimeout(() => onClose(), 260);
  }, [onClose]);

  if (!open || !product) return null;

  const rates = suppliers.map((s) => Number(s.typical_purchase_rate)).filter((x) => x > 0);
  const minRate = rates.length ? Math.min(...rates) : null;
  const batchStock = batches.reduce((a, b) => a + Number(b.current_stock || 0), 0);

  const batchRows = batches.map((b, i) => {
    const st = expiryStatus(b.expiry_date);
    const expCls = st === "expired" ? "psrExpired" : st === "near" ? "psrNear" : "psrOk";
    return (
      <tr key={b.id}>
        <td>
          <span className="psrBNum">{i + 1}</span>
        </td>
        <td>
          <span className="psrBNo">{b.batch_no || ""}</span>
        </td>
        <td>
          <div className={`psrExpWrap ${expCls}`}>
            <span className="psrExpDate">{formatExpiryShort(b.expiry_date) || ""}</span>
            <span className="psrExpBadge">{b.expiry_date ? formatBatchExpiryRelativePhrase(b.expiry_date) : ""}</span>
          </div>
        </td>
        <td className="psrR">
          <span className="psrRate">{formatRs(b.mrp)}</span>
        </td>
        <td className="psrR">
          <span className="psrRate">{formatRs(b.purchase_rate)}</span>
        </td>
        <td className="psrR">
          <span className="psrRate">{formatRs(b.sales_rate)}</span>
        </td>
        <td className="psrR">
          <span className="psrRateSoft">{b.special_rate_1 != null ? formatRs(b.special_rate_1) : ""}</span>
        </td>
        <td className="psrR">
          <span className="psrRateSoft">{b.special_rate_2 != null ? formatRs(b.special_rate_2) : ""}</span>
        </td>
        <td className="psrR">
          <span className={`psrStkVal${Number(b.current_stock || 0) === 0 ? " psrStkZero" : ""}`}>
            {Number(b.current_stock || 0).toFixed(0)}
          </span>
        </td>
        <td className="psrR">
          <span className="psrRateSoft">{Number(b.loose_stock || 0) > 0 ? Number(b.loose_stock).toFixed(2) : ""}</span>
        </td>
        <td className="psrR">
          <span className="psrGstVal">{b.sales_gst != null ? `${Number(b.sales_gst).toFixed(2)}%` : ""}</span>
        </td>
        <td>
          <span className="psrSupPill">{b.supplier_name || ""}</span>
        </td>
      </tr>
    );
  });

  const batchCards = batches.map((b, i) => {
    const st = expiryStatus(b.expiry_date);
    const expCls = st === "expired" ? "psrExpired" : st === "near" ? "psrNear" : "psrOk";
    return (
      <div key={b.id} className="psrBCard">
        <div className="psrBCardTop">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="psrBNum">{i + 1}</span>
            <span className="psrBNo">{b.batch_no || ""}</span>
          </div>
          <div className={`psrExpWrap ${expCls}`}>
            <span className="psrExpDate">{formatExpiryShort(b.expiry_date) || ""}</span>
            <span className="psrExpBadge">{b.expiry_date ? formatBatchExpiryRelativePhrase(b.expiry_date) : ""}</span>
          </div>
        </div>
        <div className="psrBCardRows">
          <div>
            <div className="psrBLbl">MRP</div>
            <div className="psrBFval">{formatRs(b.mrp)}</div>
          </div>
          <div>
            <div className="psrBLbl">Purchase Rate</div>
            <div className="psrBFval">{formatRs(b.purchase_rate)}</div>
          </div>
          <div>
            <div className="psrBLbl">Selling Rate</div>
            <div className="psrBFval">{formatRs(b.sales_rate)}</div>
          </div>
          <div>
            <div className="psrBLbl">Sp. Rate 1</div>
            <div className="psrBFval" style={{ color: "var(--color-text-3)" }}>
              {b.special_rate_1 != null ? formatRs(b.special_rate_1) : ""}
            </div>
          </div>
          <div>
            <div className="psrBLbl">Sp. Rate 2</div>
            <div className="psrBFval" style={{ color: "var(--color-text-3)" }}>
              {b.special_rate_2 != null ? formatRs(b.special_rate_2) : ""}
            </div>
          </div>
          <div>
            <div className="psrBLbl">Stock</div>
            <div className={`psrBFval${Number(b.current_stock || 0) === 0 ? " psrStkZero" : ""}`}>
              {Number(b.current_stock || 0).toFixed(0)}
            </div>
          </div>
          <div>
            <div className="psrBLbl">Loose Units</div>
            <div className="psrBFval">{Number(b.loose_stock || 0) > 0 ? Number(b.loose_stock).toFixed(2) : ""}</div>
          </div>
          <div>
            <div className="psrBLbl">{taxLabel}</div>
            <div className="psrBFval">{b.sales_gst != null ? `${Number(b.sales_gst).toFixed(2)}%` : ""}</div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="psrBLbl">Supplier</div>
            <span className="psrSupPill">{b.supplier_name || ""}</span>
          </div>
        </div>
      </div>
    );
  });

  const tree = (
    <div
      className={`psr-product-modal modal-backdrop${show ? " show" : ""}`}
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="modal psrModal" role="dialog" aria-modal="true" aria-labelledby="psr-modal-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close psrModalClose" aria-label="Close" onClick={handleClose}>
          <IconX width={14} height={14} />
        </button>
        <div className="modal-strip psrModalStrip">
          <div className="modal-strip-left">
            <h2 id="psr-modal-title" className="modal-prod-name psrModalProdName">
              {product.name || product.code || "Product"}
            </h2>
            <p className="modal-prod-mfg psrModalProdMfg">by {product.mfg_name || product.mfg_short || ""}</p>
            <div className="modal-tags psrModalTags">
              <span className="modal-tag psrModalTag">{product.drug_name || product.packing || ""}</span>
              {product.code ? <span className="modal-tag psrModalTag">Code: {product.code}</span> : null}
              <span className="modal-tag psrModalTag">
                {suppliers.length} Supplier{suppliers.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="modal-stk-box psrModalStkBox">
            <div className="modal-stk-num psrModalStkNum">{Number(product.total_stock || 0).toFixed(0)}</div>
            <div className="modal-stk-lbl psrModalStkLbl">Total Stock</div>
          </div>
        </div>
        <div className="modal-body psrModalBody">
          <div className="psrMsec">
            <div className="psrMsecHdr">
              <h3 className="psrMsecTitle">
                <span className="psrMsecDot" />
                Suppliers
              </h3>
              <span className="psrMsecNote">
                {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""} · Best rate highlighted
              </span>
            </div>
            <div className="psrSupCards">
              {suppliers.map((s) => {
                const r = Number(s.typical_purchase_rate);
                const isBest = minRate != null && r === minRate && r > 0;
                return (
                  <div key={`${s.product_id}-${s.vendor_id}`} className="psrSupCard">
                    <div className="psrSupCardName">
                      <span className="psrSupDot" />
                      {s.vendor_name || s.vendor_short || "Supplier"}
                      {isBest ? <span className="psrBestTag">Best Rate</span> : null}
                    </div>
                    <div className="psrSupRow">
                      <span className="psrSupLbl">Last Purchase Rate</span>
                      <span className="psrSupRate">{r > 0 ? formatRs(r) : ""}</span>
                    </div>
                    <div className="psrSupRow">
                      <span className="psrSupLbl">Last Purchased On</span>
                      <span className="psrDateChip">{formatDateChip(s.last_supplied_on)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="psrMsec">
            <div className="psrMsecHdr">
              <h3 className="psrMsecTitle">
                <span className="psrMsecDot" />
                Batch Stock Details
              </h3>
              <span className="psrFefo">⏱ FEFO Order</span>
            </div>
            <div className="psrMsecNote" style={{ marginBottom: 14, fontSize: 12 }}>
              {batches.length} batch{batches.length !== 1 ? "es" : ""} &nbsp;·&nbsp; {batchStock} total units &nbsp;·&nbsp; Earliest
              expiry shown first
            </div>
            {batches.length === 0 ? (
              <div className="psrNoBatch">
                <p>No batch stock found for this product.</p>
              </div>
            ) : (
              <>
                <div className="psrTblWrap">
                  <table className="psrTbl">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Batch No.</th>
                        <th>Expiry</th>
                        <th className="psrR">MRP</th>
                        <th className="psrR">Purchase Rate</th>
                        <th className="psrR">Selling Rate</th>
                        <th className="psrR">Sp. Rate 1</th>
                        <th className="psrR">Sp. Rate 2</th>
                        <th className="psrR">Stock</th>
                        <th className="psrR">Loose</th>
                        <th className="psrR">{taxLabel} %</th>
                        <th>Supplier</th>
                      </tr>
                    </thead>
                    <tbody>{batchRows}</tbody>
                  </table>
                </div>
                <div className="psrBatchCards">{batchCards}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(tree, document.body);
}

export function ProductSupplierReportContent({ embedded = false } = {}) {
  const canView = can("PRODUCT_BATCHES", "VIEW");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ products: [], suppliers: [], batches: [], summary: null });
  const [selectedProductId, setSelectedProductId] = useState("");
  const [modalProductId, setModalProductId] = useState(null);
  const [ddOpen, setDdOpen] = useState(false);
  const [ddVisible, setDdVisible] = useState(false);
  const [ddPage, setDdPage] = useState(1);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const debounceRef = useRef(null);
  const searchWrapRef = useRef(null);
  const lastPickedProductRef = useRef(null);

  async function refresh(query) {
    setBusy(true);
    const resp = await getProductSupplierReport({ q: String(query || "").trim(), limit: 200 });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      const next = resp.json?.data || { products: [], suppliers: [], batches: [], summary: null };
      setData(next);
      setInitialLoaded(true);
      const ids = (next.products || []).map((p) => p.id);
      setSelectedProductId((prev) => (ids.includes(prev) ? prev : ""));
    } else if (resp.status !== 401) {
      emitToast({ type: "error", message: parseApiError(resp) });
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!canView) return;
    refresh("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      refresh(search);
    }, 280);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const products = data.products || [];
  const displaySummary = useMemo(() => normalizeSummary(data), [data]);

  const openDd = useCallback(() => {
    setDdOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setDdVisible(true)));
  }, []);

  const closeDd = useCallback(() => {
    setDdVisible(false);
    setTimeout(() => setDdOpen(false), 180);
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (!searchWrapRef.current?.contains(e.target)) closeDd();
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [closeDd]);

  useEffect(() => {
    setDdPage(1);
  }, [search, products]);

  const ddSlice = useMemo(() => products.slice(0, DD_PAGE * ddPage), [products, ddPage]);
  const ddGrouped = useMemo(() => groupByFirstLetter(ddSlice), [ddSlice]);
  const hasMoreDd = products.length > ddSlice.length;

  const pickProduct = useCallback(
    (id) => {
      const row = products.find((p) => p.id === id);
      if (row) lastPickedProductRef.current = row;
      setSelectedProductId(id);
      setModalProductId(id);
      setSearch("");
      closeDd();
    },
    [closeDd, products]
  );

  const modalProduct = useMemo(() => {
    if (!modalProductId) return null;
    const fromList = products.find((p) => p.id === modalProductId);
    if (fromList) return fromList;
    const cached = lastPickedProductRef.current;
    return cached && cached.id === modalProductId ? cached : null;
  }, [products, modalProductId]);

  const modalSuppliers = useMemo(() => {
    if (!modalProduct) return [];
    return (data.suppliers || [])
      .filter((s) => s.product_id === modalProduct.id)
      .slice()
      .sort((a, b) => String(b.last_supplied_on || "").localeCompare(String(a.last_supplied_on || "")));
  }, [data.suppliers, modalProduct]);

  const modalBatches = useMemo(() => {
    if (!modalProduct) return [];
    const list = (data.batches || []).filter((b) => b.product_id === modalProduct.id);
    return sortBatchesByExpiryAsc(list);
  }, [data.batches, modalProduct]);

  const needle = search.trim().toLowerCase();
  const ddEmpty = !busy && needle && products.length === 0;

  if (!canView) {
    return (
      <ReportDenied
        title={NAV_LABELS.reportProductSupplier}
        message="You don’t have permission to view product batches."
      />
    );
  }

  const body = (
    <div className="psrReport page">
        {busy ? (
          <div className="psrBusyStrip" role="status" aria-live="polite" aria-busy="true">
            <CommonLoading variant="bar" />
            <span className="psrBusyStripLabel">Updating results…</span>
          </div>
        ) : null}
        <div className="stats-row" aria-label="Summary statistics">
          <div className="stat-card">
            <div className="stat-icon stat-icon_primary">
              <IconPsrGrid />
            </div>
            <div>
              <div className="stat-val">
                {!initialLoaded && busy ? <span className="stat-val-skel skel" /> : displaySummary.total_products}
              </div>
              <div className="stat-lbl">Total Products</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon_success">
              <IconPsrSuppliers />
            </div>
            <div>
              <div className="stat-val">
                {!initialLoaded && busy ? <span className="stat-val-skel skel" /> : displaySummary.active_suppliers}
              </div>
              <div className="stat-lbl">Active Suppliers</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon_warn">
              <IconAlert />
            </div>
            <div>
              <div className="stat-val stat-val_warn">
                {!initialLoaded && busy ? <span className="stat-val-skel skel" /> : displaySummary.expiring_soon_batches}
              </div>
              <div className="stat-lbl">Expiring Soon</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon_danger">
              <IconPsrOutOfStock />
            </div>
            <div>
              <div className="stat-val stat-val_danger">
                {!initialLoaded && busy ? <span className="stat-val-skel skel" /> : displaySummary.out_of_stock_products}
              </div>
              <div className="stat-lbl">Out of Stock</div>
            </div>
          </div>
        </div>

        <div className="search-hero">
          <h2>Search Product</h2>
          <p>Type a product name, manufacturer, category, or code  results appear alphabetically</p>
          <div className="search-wrap" ref={searchWrapRef}>
            <IconPsrSearch className="s-icon" />
            <input
              className="search-input"
              type="search"
              placeholder="e.g. Dolo, Cipla, Antibiotic, AMOX500…"
              autoComplete="off"
              spellCheck={false}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearch("");
              }}
            />
            {search ? (
              <button
                type="button"
                className="s-clear"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <IconX width={12} height={12} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="main-grid">
          <div className="card">
            <div className="card-hdr">
              <span className="card-hdr-title">All Products</span>
              <div className="card-hdr-meta">
                <span className="card-hdr-az">A → Z</span>
                <span className="pill">
                  {busy && !initialLoaded ? "…" : `${products.length} product${products.length !== 1 ? "s" : ""}`}
                </span>
              </div>
            </div>
            <div className="product-list-scroll">
              {busy && products.length === 0 ? (
                <div className="product-list-skel">
                  <DdSkeletonRows />
                </div>
              ) : products.length === 0 ? (
                <div className="dd-empty">
                  <p>No products match your search.</p>
                </div>
              ) : (
                products.map((p) => (
                  <PsrProductPickRow key={p.id} variant="list" product={p} selectedId={selectedProductId} onPick={pickProduct} />
                ))
              )}
            </div>
          </div>
        </div>

      {modalProductId && modalProduct ? (
        <ProductDetailModal
          open={Boolean(modalProductId)}
          product={modalProduct}
          suppliers={modalSuppliers}
          batches={modalBatches}
          onClose={() => setModalProductId(null)}
        />
      ) : null}
    </div>
  );

  return embedded ? body : <ReportShell>{body}</ReportShell>;
}

export default function ProductSupplierReportPage() {
  useSeoMeta({ title: "Product Supplier Report" });
  const { taxLabel } = useLocale();
  return <ProductSupplierReportContent embedded={false} />;
}
