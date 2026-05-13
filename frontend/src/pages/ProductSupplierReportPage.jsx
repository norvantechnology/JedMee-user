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
import {
  ReportShell,
  ReportDenied,
  ReportCard,
  ReportToolbar,
  ReportToolbarPrim,
  ReportSearchInput,
  ReportCountChip,
  ReportListEmpty,
  ReportTableScroll,
  ReportPaneBody,
} from "../components/reports/index.js";
import { formatExpiryShort, expiryStatus } from "../components/reports/reportExpiry.js";
import { formatBatchExpiryRelativePhrase } from "../utils/batchExpiryDisplay.js";
import {
  IconAlert,
  IconPsrGrid,
  IconPsrOutOfStock,
  IconPsrSuppliers,
  IconX,
} from "../components/ui/AppIcons.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import "./ProductSupplierReportPage.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      out_of_stock_products: Number(s.out_of_stock_products) || 0,
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
    out_of_stock_products: oos,
  };
}

function productInitials(name) {
  const n = String(name || "").replace(/[^A-Za-z0-9 ]/g, "").trim();
  if (!n) return "??";
  const parts = n.split(/\s+/).filter(Boolean);
  const s = parts.map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return s || String(name).slice(0, 2).toUpperCase();
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

// ── Product Detail Modal ──────────────────────────────────────────────────────

function ProductDetailModal({ open, product, suppliers, batches, onClose }) {
  const { taxLabel } = useLocale();
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
        <td><span className="psrBNum">{i + 1}</span></td>
        <td><span className="psrBNo">{b.batch_no || ""}</span></td>
        <td>
          <div className={`psrExpWrap ${expCls}`}>
            <span className="psrExpDate">{formatExpiryShort(b.expiry_date) || ""}</span>
            <span className="psrExpBadge">{b.expiry_date ? formatBatchExpiryRelativePhrase(b.expiry_date) : ""}</span>
          </div>
        </td>
        <td className="psrR"><span className="psrRate">{formatRs(b.mrp)}</span></td>
        <td className="psrR"><span className="psrRate">{formatRs(b.purchase_rate)}</span></td>
        <td className="psrR"><span className="psrRate">{formatRs(b.sales_rate)}</span></td>
        <td className="psrR"><span className="psrRateSoft">{b.special_rate_1 != null ? formatRs(b.special_rate_1) : ""}</span></td>
        <td className="psrR"><span className="psrRateSoft">{b.special_rate_2 != null ? formatRs(b.special_rate_2) : ""}</span></td>
        <td className="psrR">
          <span className={`psrStkVal${Number(b.current_stock || 0) < 0 ? " psrStkNeg" : Number(b.current_stock || 0) === 0 ? " psrStkZero" : ""}`}>
            {Number(b.current_stock || 0).toFixed(0)}
          </span>
        </td>
        <td className="psrR">
          <span className="psrRateSoft">{Number(b.loose_stock || 0) > 0 ? Number(b.loose_stock).toFixed(2) : ""}</span>
        </td>
        <td className="psrR">
          <span className="psrGstVal">{b.sales_gst != null ? `${Number(b.sales_gst).toFixed(2)}%` : ""}</span>
        </td>
        <td><span className="psrSupPill">{b.supplier_name || ""}</span></td>
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
          <div><div className="psrBLbl">MRP</div><div className="psrBFval">{formatRs(b.mrp)}</div></div>
          <div><div className="psrBLbl">Purchase Rate</div><div className="psrBFval">{formatRs(b.purchase_rate)}</div></div>
          <div><div className="psrBLbl">Selling Rate</div><div className="psrBFval">{formatRs(b.sales_rate)}</div></div>
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
            <div className={`psrBFval${Number(b.current_stock || 0) < 0 ? " psrStkNeg" : Number(b.current_stock || 0) === 0 ? " psrStkZero" : ""}`}>
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
              {batches.length} batch{batches.length !== 1 ? "es" : ""} &nbsp;·&nbsp; {batchStock} total units &nbsp;·&nbsp; Earliest expiry shown first
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

// ── Main content ──────────────────────────────────────────────────────────────

export function ProductSupplierReportContent({ embedded = false } = {}) {
  const canView = can("PRODUCT_BATCHES", "VIEW");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ products: [], suppliers: [], batches: [], summary: null });
  const [modalProductId, setModalProductId] = useState(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const debounceRef = useRef(null);
  const lastPickedProductRef = useRef(null);

  async function refresh(query) {
    setBusy(true);
    const resp = await getProductSupplierReport({ q: String(query || "").trim(), limit: 200 });
    if (resp.status >= 200 && resp.status < 300 && resp.json?.ok) {
      const next = resp.json?.data || { products: [], suppliers: [], batches: [], summary: null };
      setData(next);
      setInitialLoaded(true);
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

  const pickProduct = useCallback(
    (id) => {
      const row = products.find((p) => p.id === id);
      if (row) lastPickedProductRef.current = row;
      setModalProductId(id);
    },
    [products]
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

  if (!canView) {
    return (
      <ReportDenied
        title={NAV_LABELS.reportProductSupplier}
        message="You don't have permission to view product batches."
      />
    );
  }

  const body = (
    <div className={embedded ? "" : "pageWrap"}>

      {/* ── Stat cards ── */}
      <div className="psrStatsRow" aria-label="Summary statistics">
        <div className="psrStatCard">
          <div className="psrStatIcon psrStatIcon_primary"><IconPsrGrid /></div>
          <div>
            <div className="psrStatVal">
              {!initialLoaded && busy ? "…" : displaySummary.total_products}
            </div>
            <div className="psrStatLbl">Total Products</div>
          </div>
        </div>
        <div className="psrStatCard">
          <div className="psrStatIcon psrStatIcon_success"><IconPsrSuppliers /></div>
          <div>
            <div className="psrStatVal">
              {!initialLoaded && busy ? "…" : displaySummary.active_suppliers}
            </div>
            <div className="psrStatLbl">Active Suppliers</div>
          </div>
        </div>
        <div className="psrStatCard">
          <div className="psrStatIcon psrStatIcon_warn"><IconAlert /></div>
          <div>
            <div className="psrStatVal psrStatVal_warn">
              {!initialLoaded && busy ? "…" : displaySummary.expiring_soon_batches}
            </div>
            <div className="psrStatLbl">Expiring Soon</div>
          </div>
        </div>
        <div className="psrStatCard">
          <div className="psrStatIcon psrStatIcon_danger"><IconPsrOutOfStock /></div>
          <div>
            <div className="psrStatVal psrStatVal_danger">
              {!initialLoaded && busy ? "…" : displaySummary.out_of_stock_products}
            </div>
            <div className="psrStatLbl">Out of Stock</div>
          </div>
        </div>
      </div>

      {/* ── Report card with table ── */}
      <ReportCard busy={busy}>
        <ReportToolbar>
          <ReportToolbarPrim>
            <ReportSearchInput
              placeholder="Search product, drug name or manufacturer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {!busy && (
              <ReportCountChip>{`${products.length} product(s)`}</ReportCountChip>
            )}
          </ReportToolbarPrim>
        </ReportToolbar>

        <ReportPaneBody>
          {!busy && products.length === 0 ? (
            <ReportListEmpty>
              {search ? "No products match your search." : "No products found."}
            </ReportListEmpty>
          ) : !busy ? (
            <ReportTableScroll>
              <table className="rptBatchTable psrTable">
                <thead>
                  <tr>
                    <th className="psrColIdx">#</th>
                    <th>Product</th>
                    <th>Manufacturer</th>
                    <th className="rptNum psrColSuppliers">Suppliers</th>
                    <th className="rptNum psrColStock">Stock</th>
                    <th className="rptNum psrColExpiring">Expiring</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, idx) => {
                    const supplierCount = (data.suppliers || []).filter((s) => s.product_id === p.id).length;
                    const productBatches = (data.batches || []).filter((b) => b.product_id === p.id);
                    const expiringCount = productBatches.filter((b) => {
                      const st = expiryStatus(b.expiry_date);
                      return (st === "near" || st === "expired") && Number(b.current_stock || 0) > 0;
                    }).length;
                    const stock = Number(p.total_stock || 0);
                    const stockOut = stock === 0;

                    return (
                      <tr
                        key={p.id}
                        className={`psrTableRow${stockOut ? " psrRow_out" : ""}`}
                        onClick={() => pickProduct(p.id)}
                        title="Click to view batch & supplier details"
                      >
                        <td className="psrColIdx psrIdxVal">{idx + 1}</td>
                        <td>
                          <div className="rptVendorContact">
                            <span className="rptVendorName">{p.name || p.code || "—"}</span>
                            {p.drug_name ? <span className="rptVendorAddress">{p.drug_name}</span> : null}
                            {p.code ? (
                              <span className="rptVendorAddress psrCodePill">{p.code}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="psrMfgCell">{p.mfg_name || p.mfg_short || <span className="psrMuted">—</span>}</td>
                        <td className="rptNum psrColSuppliers">
                          {supplierCount > 0 ? (
                            <span className="psrSupCount">{supplierCount}</span>
                          ) : (
                            <span className="psrMuted">—</span>
                          )}
                        </td>
                        <td className="rptNum psrColStock">
                          <span className={`rptExpiryChip ${stockOut ? "is-expired" : "is-ok"}`}>
                            {stock}
                          </span>
                        </td>
                        <td className="rptNum psrColExpiring">
                          {expiringCount > 0 ? (
                            <span className="rptExpiryChip is-soon">{expiringCount}</span>
                          ) : (
                            <span className="psrMuted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ReportTableScroll>
          ) : null}
        </ReportPaneBody>
      </ReportCard>

      {/* ── Product detail modal ── */}
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
  return <ProductSupplierReportContent embedded={false} />;
}
