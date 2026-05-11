import AmountInput from "../components/ui/AmountInput.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { AsyncButton } from "../components/ui/buttons.jsx";
import { fmtMoney, fmtCurrency, getCurrencySymbol } from "../utils/format.js";
import { useEffect, useMemo, useState } from "react";
import { Check, Users } from "lucide-react";
import AppShell from "../layouts/AppShell.jsx";
import CommonModal from "../components/CommonModal.jsx";
import ModalFooterShell from "../components/ui/ModalFooterShell.jsx";
import {
  IconEdit, IconPlaceOrder, IconPlus, Search, Trash2,
  IconMcProduct, IconMcVisible, IconMcHidden, IconMcOos, IconMcTotal,
  IconChevronRight, IconChevronLeft, IconCheck, MessageSquare,
} from "../components/ui/AppIcons.jsx";
import OrderPlaceWizardModal from "../components/orders/OrderPlaceWizardModal.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import OrderCatalogProductDetailsModal from "../components/orders/OrderCatalogProductDetailsModal.jsx";
import QtyStepper from "../components/ui/QtyStepper.jsx";
import { readAuth } from "../services/authStorage.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { emitToast } from "../services/toastBus.js";
import { parseApiError } from "../utils/api.js";
import { listProducts } from "../services/productService.js";
import {
  addCatalogProduct, browseCatalog, browseWholesalers,
  bulkCatalogVisibility, deleteCatalogProduct, getMyCatalog, placeOrder, updateCatalogProduct
} from "../services/orderService.js";
import "./CatalogMarketplacePage.css";

function ToggleCard({ label, sub, value, onChange }) {
  return (
    <div className={`mcTogCard${value ? " mcTogCard_on" : ""}`} onClick={() => onChange(!value)}>
      <div className="mcTogSwitch"><div className="mcTogKnob" /></div>
      <div><div className="mcTogTitle">{label}</div><div className="mcTogSub">{sub}</div></div>
    </div>
  );
}

export default function CatalogMarketplacePage() {
  useSeoMeta({ title: "Catalog & Marketplace" });
  const { taxLabel } = useLocale();
  const auth = readAuth();
  const isRetailer = useMemo(() => isRetailerAuth(auth), [auth]);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [wholesalers, setWholesalers] = useState([]);
  const [wholesalerId, setWholesalerId] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openOrder, setOpenOrder] = useState(false);
  const [cartLines, setCartLines] = useState([]);
  const [cartWholesalerId, setCartWholesalerId] = useState("");
  const [openRetailerDetail, setOpenRetailerDetail] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [deletingRow, setDeletingRow] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [products, setProducts] = useState([]);
  const [editingCatalogId, setEditingCatalogId] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const [selectedRetailerRow, setSelectedRetailerRow] = useState(null);
  const [qtyPick, setQtyPick] = useState({ open: false, row: null });
  const [qtyPickValue, setQtyPickValue] = useState(1);
  const [cardQtys, setCardQtys] = useState({});
  const [addStep, setAddStep] = useState(1);
  const [addProductSearch, setAddProductSearch] = useState("");
  const [addSelectedProduct, setAddSelectedProduct] = useState(null);
  const [form, setForm] = useState({ product_id: "", catalog_price: "", mrp: "", packing: "", min_order_qty: 1, max_order_qty: "", is_visible: true, hide_when_out_of_stock: true, catalog_notes: "" });
  const [editForm, setEditForm] = useState({ catalog_price: "", mrp: "", packing: "", min_order_qty: 1, max_order_qty: "", is_visible: true, hide_when_out_of_stock: true, catalog_notes: "" });

  const activeWholesaler = useMemo(() => wholesalers.find((w) => String(w.wholesaler_account_id || "") === String(wholesalerId || "")) || null, [wholesalers, wholesalerId]);
  const mcStats = useMemo(() => ({ total: rows.length, visible: rows.filter(r => r.is_visible).length, hidden: rows.filter(r => !r.is_visible).length, oos: rows.filter(r => Number(r.current_stock || 0) === 0).length }), [rows]);
  const filteredAddProducts = useMemo(() => {
    const q = addProductSearch.toLowerCase();
    const existingIds = new Set(rows.map(r => String(r.product_id || "")));
    return products.filter(p => !existingIds.has(String(p.id || "")) && (!q || (p.name || "").toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q)));
  }, [products, rows, addProductSearch]);
  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      (r.product_name || "").toLowerCase().includes(q) ||
      (r.product_code || "").toLowerCase().includes(q) ||
      (r.drug_name || "").toLowerCase().includes(q) ||
      (r.wholesaler_name || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  async function refresh() {
    setBusy(true);
    if (isRetailer) {
      const wr = await browseWholesalers();
      if (wr.status >= 200 && wr.status < 300 && wr.json?.ok) {
        const items = wr.json?.data?.items || [];
        setWholesalers(items);
        if (!wholesalerId && items[0]?.wholesaler_account_id) setWholesalerId(items[0].wholesaler_account_id);
      }
      const br = await browseCatalog({ wholesaler_id: wholesalerId || undefined, search: search || undefined });
      if (br.status >= 200 && br.status < 300 && br.json?.ok) setRows(br.json?.data?.items || []);
      else if (br.status !== 401 && wholesalerId) emitToast({ type: "error", message: parseApiError(br) });
    } else {
      const pr = await listProducts({ limit: 500 });
      if (pr.status >= 200 && pr.status < 300 && pr.json?.ok) setProducts(pr.json?.data?.items || []);
      const r = await getMyCatalog({ search: search || undefined });
      if (r.status >= 200 && r.status < 300 && r.json?.ok) setRows(r.json?.data?.items || []);
      else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
    }
    setBusy(false);
  }
  useEffect(() => { refresh(); }, [isRetailer, wholesalerId]); // eslint-disable-line

  function resetAddForm() {
    setAddStep(1); setAddProductSearch(""); setAddSelectedProduct(null);
    setForm({ product_id: "", catalog_price: "", mrp: "", packing: "", min_order_qty: 1, max_order_qty: "", is_visible: true, hide_when_out_of_stock: true, catalog_notes: "" });
  }
  async function onAddCatalog() {
    const pid = String(form.product_id || "").trim(), cp = Number(form.catalog_price || 0), minQ = Number(form.min_order_qty || 1), maxQ = form.max_order_qty === "" ? null : Number(form.max_order_qty || 0);
    if (!pid) { emitToast({ type: "error", message: "Please select a product." }); return; }
    if (!(cp > 0)) { emitToast({ type: "error", message: "Catalog price must be greater than 0." }); return; }
    if (!(minQ >= 1)) { emitToast({ type: "error", message: "Minimum quantity must be at least 1." }); return; }
    if (maxQ != null && maxQ < minQ) { emitToast({ type: "error", message: "Max quantity cannot be smaller than min quantity." }); return; }
    setAddBusy(true);
    try {
      const r = await addCatalogProduct({ product_id: pid, catalog_price: cp, mrp: form.mrp === "" ? null : Number(form.mrp || 0), packing: form.packing || null, min_order_qty: minQ, max_order_qty: maxQ, is_visible: Boolean(form.is_visible), hide_when_out_of_stock: Boolean(form.hide_when_out_of_stock), catalog_notes: form.catalog_notes || null });
      if (r.status >= 200 && r.status < 300 && r.json?.ok) { setOpenAdd(false); resetAddForm(); refresh(); emitToast({ type: "success", message: `${addSelectedProduct?.name || "Product"} added to catalog.` }); return; }
      emitToast({ type: "error", message: parseApiError(r) });
    } finally { setAddBusy(false); }
  }
  async function toggleSingleVisible(row) {
    const r = await bulkCatalogVisibility({ ids: [row.id], is_visible: !row.is_visible });
    if (r.status >= 200 && r.status < 300 && r.json?.ok) refresh(); else emitToast({ type: "error", message: parseApiError(r) });
  }
  function setCartQty(row, nextQty) {
    if (!row?.id) return;
    const rowWh = String(row.wholesaler_account_id || wholesalerId || "");
    if (cartWholesalerId && rowWh && String(cartWholesalerId) !== String(rowWh)) { emitToast({ type: "error", message: "You can place one order only for a single wholesaler." }); return; }
    const min = Math.max(1, Number(row.min_order_qty || 1) || 1), rawMax = row.max_order_qty == null || row.max_order_qty === "" ? null : Number(row.max_order_qty || 0), max = rawMax != null && rawMax > 0 ? rawMax : null;
    const fq = max ? Math.min(Math.max(min, Number(nextQty || min) || min), max) : Math.max(min, Number(nextQty || min) || min);
    setCartLines((prev) => { const id = String(row.id); const ex = prev.find((x) => String(x?.row?.id) === id); if (ex) return prev.map((x) => String(x?.row?.id) === id ? { ...x, qty: fq } : x); return [...prev, { row, qty: fq }]; });
    if (!cartWholesalerId && rowWh) setCartWholesalerId(rowWh);
  }
  function openCart() { if (cartWholesalerId && wholesalerId && String(cartWholesalerId) !== String(wholesalerId)) { emitToast({ type: "error", message: "Cart contains items from another wholesaler." }); return; } setOpenOrder(true); }
  useEffect(() => { if (!isRetailer) return; setCartLines([]); setCartWholesalerId(""); }, [isRetailer, wholesalerId]);
  const cartCount = useMemo(() => (cartLines || []).length, [cartLines]);
  const qtyByCatalogId = useMemo(() => { const map = new Map(); for (const ln of cartLines || []) { if (ln?.row?.id) map.set(String(ln.row.id), Number(ln.qty || 0)); } return map; }, [cartLines]);
  function getCardQty(row) { const id = String(row.id || ""), min = Math.max(1, Number(row.min_order_qty || 1) || 1); return cardQtys[id] || min; }
  function stepCardQty(row, delta) {
    const id = String(row.id || ""), min = Math.max(1, Number(row.min_order_qty || 1) || 1), rawMax = row.max_order_qty == null || row.max_order_qty === "" ? null : Number(row.max_order_qty || 0), max = rawMax != null && rawMax > 0 ? rawMax : null;
    setCardQtys((prev) => { const cur = prev[id] || min; return { ...prev, [id]: Math.max(min, max ? Math.min(max, cur + delta) : cur + delta) }; });
  }
  function handleCardAdd(row) { setCartQty(row, getCardQty(row)); emitToast({ type: "success", message: `${row.product_name || "Product"} added to cart.` }); }
  async function bulkVisible(isVisible) { const ids = rows.map((x) => x.id); if (!ids.length) return; const r = await bulkCatalogVisibility({ ids, is_visible: isVisible }); if (r.status >= 200 && r.status < 300 && r.json?.ok) refresh(); else emitToast({ type: "error", message: parseApiError(r) }); }
  function onEditOpen(row) {
    setEditingRow(row); setEditingCatalogId(String(row.id || ""));
    setEditForm({ catalog_price: row.catalog_price ?? "", mrp: row.mrp ?? "", packing: row.packing ?? "", min_order_qty: row.min_order_qty ?? 1, max_order_qty: row.max_order_qty ?? "", is_visible: Boolean(row.is_visible), hide_when_out_of_stock: Boolean(row.hide_when_out_of_stock), catalog_notes: row.catalog_notes ?? "" });
    setOpenEdit(true);
  }
  async function onEditCatalog() {
    const cp = Number(editForm.catalog_price || 0), minQ = Number(editForm.min_order_qty || 1), maxQ = editForm.max_order_qty === "" ? null : Number(editForm.max_order_qty || 0);
    if (!(cp > 0)) { emitToast({ type: "error", message: "Catalog price must be greater than 0." }); return; }
    if (!(minQ >= 1)) { emitToast({ type: "error", message: "Minimum quantity must be at least 1." }); return; }
    if (maxQ != null && maxQ < minQ) { emitToast({ type: "error", message: "Max quantity cannot be smaller than min quantity." }); return; }
    setEditBusy(true);
    try {
      const r = await updateCatalogProduct(editingCatalogId, { catalog_price: cp, mrp: editForm.mrp === "" ? null : Number(editForm.mrp || 0), packing: editForm.packing || null, min_order_qty: minQ, max_order_qty: maxQ, is_visible: Boolean(editForm.is_visible), hide_when_out_of_stock: Boolean(editForm.hide_when_out_of_stock), catalog_notes: editForm.catalog_notes || null });
      if (r.status >= 200 && r.status < 300 && r.json?.ok) { setOpenEdit(false); setEditingCatalogId(""); setEditingRow(null); refresh(); emitToast({ type: "success", message: "Catalog product updated." }); return; }
      emitToast({ type: "error", message: parseApiError(r) });
    } finally { setEditBusy(false); }
  }
  async function onDeleteCatalog() {
    if (!deletingRow) return;
    setDeleteBusy(true);
    try {
      const r = await deleteCatalogProduct(deletingRow.id);
      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
        setOpenDelete(false); setDeletingRow(null); refresh();
        emitToast({ type: "success", message: `${deletingRow.product_name || "Product"} removed from catalog.` });
        return;
      }
      emitToast({ type: "error", message: parseApiError(r) });
    } finally { setDeleteBusy(false); }
  }

  return (
    <AppShell userName={auth?.user?.full_name || "User"} userEmail={auth?.user?.email || auth?.email || ""} userBusinessName={auth?.user?.firm_name || ""} userGstNumber={auth?.user?.gst_number || ""} variant="user">
      <div className="pageWrap">
        {/* Page header */}
        <div className="raTop">
          <div>
            <div className="raTitle">{isRetailer ? "Order Catalog" : "My Catalog"}</div>
            <div className="raSub">{isRetailer ? "Browse wholesaler products and place an order." : "Products you share with retailers to order from"}</div>
          </div>
          {isRetailer
            ? <button type="button" className={`mcBtn mcBtn_primary cmpCartHeaderBtn${!cartCount ? " mcBtn_disabled" : ""}`} disabled={!cartCount} onClick={openCart}><IconPlaceOrder width={14} height={14} />Cart{cartCount > 0 ? ` (${cartCount})` : ""}</button>
            : <button type="button" className="mcBtn mcBtn_primary" onClick={() => setOpenAdd(true)}><IconPlus width={13} height={13} /><span>Add Product</span></button>
          }
        </div>

        {/* ── Retailer view ── */}
        {isRetailer ? (
          <>
            <div className="pageCard cmpCatalogToolbarWrap">
              <div className="cmpCatalogToolbar">
                <div className="cmpCatalogSearchBox">
                  <Search size={14} className="cmpCatalogSearchIcon" aria-hidden="true" />
                  <input type="text" className="cmpCatalogSearchInput" placeholder="Search product name, code, drug..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <select className="cmpCatalogWsSelect" value={wholesalerId} onChange={(e) => setWholesalerId(e.target.value)}>
                  <option value="">All Wholesalers</option>
                  {wholesalers.map((w) => <option key={w.wholesaler_account_id} value={w.wholesaler_account_id}>{w.wholesaler_name}</option>)}
                </select>
              </div>
              <div className="cmpCatalogMeta">
                <span className="cmpCatalogCount">{busy ? "Loading…" : `${filteredRows.length} item${filteredRows.length !== 1 ? "s" : ""}${search && filteredRows.length !== rows.length ? ` of ${rows.length}` : ""}`}</span>
                <span className="cmpCatalogMetaText">sorted A – Z</span>
              </div>
            </div>
            <div className="cmpGrid">
              {busy
                ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="cmpCard cmpCard_skel" aria-hidden="true"><div className="cmpCardSkelLine cmpCardSkelLine_lg" /><div className="cmpCardSkelLine cmpCardSkelLine_sm" /><div className="cmpCardSkelPrices" /><div className="cmpCardSkelLine" /><div className="cmpCardSkelActions" /></div>)
                : filteredRows.length === 0
                  ? <div className="cmpGridEmpty"><svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.95-1.57L23 6H6" /></svg><p>{search ? "No products match your search." : "No products found."}</p></div>
                  : filteredRows.map((row) => {
                    const id = String(row.id || ""), inCart = qtyByCatalogId.has(id);
                    const min = Math.max(1, Number(row.min_order_qty || 1) || 1);
                    const rawMax = row.max_order_qty == null || row.max_order_qty === "" ? null : Number(row.max_order_qty || 0);
                    const max = rawMax != null && rawMax > 0 ? rawMax : null;
                    const cardQty = getCardQty(row), stock = Number(row.current_stock || 0);
                    const outOfStock = stock === 0, lowStock = stock > 0 && stock <= 5;
                    return (
                      <div key={id} className={["cmpCard", inCart ? "cmpCard_inCart" : "", outOfStock ? "cmpCard_oos" : ""].filter(Boolean).join(" ")}>
                        <div className="cmpCardHead">
                          <div className="cmpCardHeadLeft"><div className="cmpCardName">{row.product_name || "—"}</div><div className="cmpCardCode">{row.product_code || ""}</div></div>
                          {(row.wholesaler_name || activeWholesaler?.wholesaler_name) && <div className="cmpCardWsBadge"><Users size={9} aria-hidden="true" />{row.wholesaler_name || activeWholesaler?.wholesaler_name}</div>}
                        </div>
                        <div className="cmpCardPills">
                          {row.packing && <span className="cmpPill cmpPill_pack">Pack {row.packing}</span>}
                          {row.sales_gst != null && row.sales_gst !== "" && Number(row.sales_gst) > 0 && <span className="cmpPill cmpPill_gst">{taxLabel} {row.sales_gst}%</span>}
                          {row.drug_name && <span className="cmpPill cmpPill_drug">{row.drug_name}</span>}
                        </div>
                        <div className="cmpCardPrices">
                          <div className="cmpCardPriceItem"><div className="cmpCardPriceLabel">Catalog</div><div className="cmpCardPriceValue cmpCardPriceValue_cat">{fmtCurrency(row.catalog_price || 0)}</div></div>
                          <div className="cmpCardPriceDivider" />
                          <div className="cmpCardPriceItem"><div className="cmpCardPriceLabel">MRP</div><div className="cmpCardPriceValue">{row.mrp != null && row.mrp !== "" ? fmtCurrency(row.mrp) : "—"}</div></div>
                          <div className="cmpCardPriceDivider" />
                          <div className="cmpCardPriceItem"><div className="cmpCardPriceLabel">Stock</div><div className="cmpCardPriceValue">{stock}</div></div>
                        </div>
                        <div className="cmpCardStockRow">
                          <div className="cmpCardStockStatus">
                            <div className={["cmpStockDot", outOfStock ? "cmpStockDot_no" : lowStock ? "cmpStockDot_lo" : ""].filter(Boolean).join(" ")} />
                            <span>{outOfStock ? "Out of stock" : lowStock ? "Low stock" : "In stock"}: <strong>{stock}</strong></span>
                          </div>
                          <div className="cmpCardMinMax">Min {min}{max ? ` / Max ${max}` : ""}</div>
                        </div>
                        <div className="cmpCardActions" onClick={(e) => e.stopPropagation()}>
                          <div className="cmpCardQtyCtrl">
                            <button type="button" className="cmpCardQtyBtn" aria-label="Decrease quantity" onClick={() => stepCardQty(row, -1)}>−</button>
                            <span className="cmpCardQtyVal">{cardQty}</span>
                            <button type="button" className="cmpCardQtyBtn" aria-label="Increase quantity" onClick={() => stepCardQty(row, 1)}>+</button>
                          </div>
                          <button type="button" className={`cmpCardAddBtn${inCart ? " cmpCardAddBtn_done" : ""}`} disabled={outOfStock} onClick={() => inCart ? openCart() : handleCardAdd(row)}>
                            {inCart ? <><Check size={11} aria-hidden="true" />Added</> : <><svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.95-1.57L23 6H6" /></svg>Add</>}
                          </button>
                          <button type="button" className="cmpCardDetailsBtn" title="View details" aria-label="View product details" onClick={() => { setSelectedRetailerRow(row); setOpenRetailerDetail(true); }}>
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </>
        ) : (
          /* ── Wholesaler view ── */
          <>
            {/* Stats */}
            <div className="mcStats">
              {[
                { icon: <IconMcTotal />,   num: mcStats.total,   label: "Total Products", bg: "var(--mc-p1)",  ic: "var(--mc-p6)" },
                { icon: <IconMcVisible />, num: mcStats.visible, label: "Visible",         bg: "var(--mc-okb)", ic: "var(--mc-ok)" },
                { icon: <IconMcHidden />,  num: mcStats.hidden,  label: "Hidden",          bg: "var(--mc-grb)", ic: "var(--mc-gr)" },
                { icon: <IconMcOos />,     num: mcStats.oos,     label: "Out of Stock",    bg: "var(--mc-erb)", ic: "var(--mc-er)" },
              ].map((s, i) => (
                <div className="mcStat" key={i}>
                  <div className="mcStatIcon" style={{ background: s.bg, color: s.ic }}>{s.icon}</div>
                  <div><div className="mcStatNum">{s.num}</div><div className="mcStatLabel">{s.label}</div></div>
                </div>
              ))}
            </div>
            {/* Card section */}
            <div className="mcSection">
              <div className="mcToolbar">
                <div className="mcSearchBox">
                  <Search size={14} className="mcSearchIcon" aria-hidden="true" />
                  <input type="text" className="mcSearchInput" placeholder="Search by product name or code..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <span className="mcCount">{busy ? "Loading…" : `${filteredRows.length} product${filteredRows.length !== 1 ? "s" : ""}`}</span>
                <div className="mcToolbarActions">
                  <button type="button" className="mcBtn mcBtn_ghost mcBtn_sm" onClick={() => bulkVisible(true)}><IconMcVisible width={13} height={13} /><span>Show All</span></button>
                  <button type="button" className="mcBtn mcBtn_ghost mcBtn_sm" onClick={() => bulkVisible(false)}><IconMcHidden width={13} height={13} /><span>Hide All</span></button>
                </div>
              </div>
              {busy ? (
                <div className="mcGrid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="mcCard mcCard_skel" aria-hidden="true"><div className="mcSkelLine mcSkelLine_lg" /><div className="mcSkelLine mcSkelLine_sm" /><div className="mcSkelPrices" /><div className="mcSkelLine" /><div className="mcSkelActions" /></div>)}</div>
              ) : filteredRows.length === 0 ? (
                <div className="mcEmpty">
                  <IconMcTotal width={48} height={48} className="mcEmptyIcon" />
                  <div className="mcEmptyTitle">No products found</div>
                  <div className="mcEmptySub">{rows.length === 0 ? "Add your first product to the catalog." : "Try a different search term."}</div>
                  {rows.length === 0 && <button type="button" className="mcBtn mcBtn_primary mcBtn_sm" style={{ marginTop: 12 }} onClick={() => setOpenAdd(true)}><IconPlus width={13} height={13} />Add Product</button>}
                </div>
              ) : (
                <div className="mcGrid">
                  {filteredRows.map((row) => {
                    const stock = Number(row.current_stock || 0), oos = stock === 0, lo = stock > 0 && stock <= 10;
                    return (
                      <div key={row.id} className={`mcCard${!row.is_visible ? " mcCard_hid" : ""}`}>
                        <span className={`mcVisBadge${row.is_visible ? " mcVisBadge_yes" : " mcVisBadge_no"}`}>{row.is_visible ? "Visible" : "Hidden"}</span>
                        <div className="mcCardHead">
                          <div className="mcCardIcon"><IconMcProduct width={18} height={18} /></div>
                          <div><div className="mcCardName">{row.product_name || "—"}</div><div className="mcCardCode">{row.product_code || ""}</div></div>
                        </div>
                        <div className="mcPills">
                          {row.packing && <span className="mcPill mcPill_pack">Pack {row.packing}</span>}
                          {oos ? <span className="mcPill mcPill_oos">Out of stock</span> : <span className={`mcPill mcPill_stock${lo ? " mcPill_lo" : ""}`}>Stock: {stock}</span>}
                          {row.hide_when_out_of_stock && <span className="mcPill mcPill_hideoos">Auto-hide OOS</span>}
                        </div>
                        <div className="mcPrices">
                          <div className="mcPrice"><div className="mcPriceLabel">Catalog</div><div className="mcPriceValue mcPriceValue_cat">{fmtCurrency(row.catalog_price || 0)}</div></div>
                          <div className="mcPriceDivider" />
                          <div className="mcPrice"><div className="mcPriceLabel">MRP</div><div className="mcPriceValue">{row.mrp != null && row.mrp !== "" ? fmtCurrency(row.mrp) : "—"}</div></div>
                          <div className="mcPriceDivider" />
                          <div className="mcPrice"><div className="mcPriceLabel">Stock</div><div className="mcPriceValue">{stock}</div></div>
                        </div>
                        <div className="mcQtyRow">
                          <div className="mcQtyGroup"><span className="mcQtyLabel">Min Order:</span><span className="mcQtyValue">{row.min_order_qty || 1}</span></div>
                          <div className="mcQtyGroup"><span className="mcQtyLabel">Max Order:</span><span className="mcQtyValue">{row.max_order_qty || "—"}</span></div>
                        </div>
                        {row.catalog_notes && <div className="mcNote"><MessageSquare size={12} aria-hidden="true" />{row.catalog_notes}</div>}
                        <div className="mcCardFoot">
                          <button type="button" className="mcBtn mcBtn_ghost mcBtn_sm mcBtn_flex" onClick={() => onEditOpen(row)}><IconEdit width={13} height={13} />Edit</button>
                          <button type="button" className={`mcBtn mcBtn_sm mcBtn_flex${row.is_visible ? " mcBtn_ghost" : " mcBtn_ok"}`} onClick={() => toggleSingleVisible(row)}>
                            {row.is_visible ? <><IconMcHidden width={13} height={13} />Hide</> : <><IconMcVisible width={13} height={13} />Show</>}
                          </button>
                          <button type="button" className="mcBtn mcBtn_er mcBtn_sm mcBtn_flex" onClick={() => { setDeletingRow(row); setOpenDelete(true); }}>
                            <Trash2 width={13} height={13} />Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
        {/* ── Add Product Modal (2-step wizard) ── */}
        <CommonModal open={openAdd} onClose={() => { setOpenAdd(false); resetAddForm(); }} title="Add Product to Catalog" size="md" loading={addBusy} loadingText="Adding to catalog…">
          <div className="mcWizBody">
            {/* Step indicator */}
            <div className="mcStepsWrap">
              <div className="mcSteps">
                <div className={`mcStepDot${addStep === 1 ? " mcStepDot_active" : addStep > 1 ? " mcStepDot_done" : ""}`}>{addStep > 1 ? <IconCheck width={11} height={11} /> : "1"}</div>
                <div className={`mcStepLine${addStep > 1 ? " mcStepLine_done" : ""}`} />
                <div className={`mcStepDot${addStep === 2 ? " mcStepDot_active" : ""}`}>2</div>
              </div>
              <div className="mcSteps" style={{ justifyContent: "space-between", marginTop: 4 }}>
                <span className="mcStepLbl">Select Product</span>
                <span className="mcStepLbl">Set Pricing</span>
              </div>
            </div>

            {addStep === 1 ? (
              /* Step 1 — product search list */
              <>
                <div className="mcSearchBox" style={{ marginBottom: 10 }}>
                  <Search size={14} className="mcSearchIcon" aria-hidden="true" />
                  <input type="text" className="mcSearchInput" placeholder="Search product name or code…" value={addProductSearch} onChange={(e) => setAddProductSearch(e.target.value)} autoFocus />
                </div>
                <div className="mcProdList">
                  {filteredAddProducts.length === 0
                    ? (() => {
                        const allInCatalog = products.length > 0 && products.every(p => rows.some(r => String(r.product_id || "") === String(p.id || "")));
                        const title = products.length === 0 ? "No products in inventory" : allInCatalog && !addProductSearch ? "All products added" : "No matching products";
                        const sub   = products.length === 0 ? "Add products to your inventory first." : allInCatalog && !addProductSearch ? "Every inventory product is already in your catalog." : "Try a different search term.";
                        return <div className="mcEmpty" style={{ padding: "24px 0" }}><div className="mcEmptyTitle">{title}</div><div className="mcEmptySub">{sub}</div></div>;
                      })()
                    : filteredAddProducts.map((p) => {
                        const sel = addSelectedProduct?.id === p.id;
                        return (
                          <div key={p.id} className={`mcProdItem${sel ? " mcProdItem_sel" : ""}`} onClick={() => { setAddSelectedProduct(p); setForm((f) => ({ ...f, product_id: String(p.id || "") })); }}>
                            <div className={`mcProdRadio${sel ? " mcProdRadio_on" : ""}`}>{sel && <IconCheck width={9} height={9} />}</div>
                            <div className="mcProdInfo">
                              <div className="mcProdName">{p.name || "—"}</div>
                              <div className="mcProdMeta"><span className="mcProdCode">{p.code || ""}</span>{p.packing ? <span> · Pack {p.packing}</span> : null}</div>
                            </div>
                          </div>
                        );
                      })
                  }
                </div>
                <ModalFooterShell>
                  <button type="button" className="mcBtn mcBtn_ghost" onClick={() => { setOpenAdd(false); resetAddForm(); }}>Cancel</button>
                  <button type="button" className={`mcBtn mcBtn_primary${!addSelectedProduct ? " mcBtn_disabled" : ""}`} disabled={!addSelectedProduct} onClick={() => setAddStep(2)}>
                    Next <IconChevronRight width={13} height={13} />
                  </button>
                </ModalFooterShell>
              </>
            ) : (
              /* Step 2 — pricing / limits / toggles / notes */
              <>
                {addSelectedProduct && (
                  <div className="mcSelCard">
                    <div className="mcSelIcon"><IconMcProduct width={16} height={16} /></div>
                    <div><div className="mcSelName">{addSelectedProduct.name || addSelectedProduct.product_name || "—"}</div><div className="mcSelMeta">{addSelectedProduct.code || addSelectedProduct.product_code || ""}{addSelectedProduct.packing ? ` · Pack ${addSelectedProduct.packing}` : ""}</div></div>
                  </div>
                )}
                <div className="mcSecLabel">Pricing</div>
                <div className="mcFieldRow mcFieldRow_col2">
                  <div className="mcField">
                    <label>Catalog Price <span style={{ color: "var(--color-danger)" }}>*</span></label>
                    <div className="mcFieldGroup"><span className="mcFieldPfx">{getCurrencySymbol()}</span><AmountInput value={String(form.catalog_price ?? "")} onChange={(raw) => setForm((f) => ({ ...f, catalog_price: raw }))} placeholder="0.00" inputMode="decimal" /></div>
                  </div>
                  <div className="mcField">
                    <label>MRP</label>
                    <div className="mcFieldGroup"><span className="mcFieldPfx">{getCurrencySymbol()}</span><AmountInput value={String(form.mrp ?? "")} onChange={(raw) => setForm((f) => ({ ...f, mrp: raw }))} placeholder="0.00" inputMode="decimal" /></div>
                  </div>
                </div>
                <div className="mcSecLabel">Order Limits</div>
                <div className="mcFieldRow mcFieldRow_col3">
                  <div className="mcField">
                    <label>Packing</label>
                    <input type="text" placeholder="e.g. 10×10" value={form.packing} onChange={(e) => setForm((f) => ({ ...f, packing: e.target.value }))} />
                  </div>
                  <div className="mcField">
                    <label>Min Qty</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={form.min_order_qty} onChange={(e) => setForm((f) => ({ ...f, min_order_qty: e.target.value.replace(/[^0-9]/g, "") || "1" }))} />
                  </div>
                  <div className="mcField">
                    <label>Max Qty</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="No limit" value={form.max_order_qty} onChange={(e) => setForm((f) => ({ ...f, max_order_qty: e.target.value.replace(/[^0-9]/g, "") }))} />
                  </div>
                </div>
                <div className="mcSecLabel">Visibility</div>
                <div className="mcTogGrid">
                  <ToggleCard label="Visible to retailers" sub="Retailers can see and order this product" value={form.is_visible} onChange={(v) => setForm((f) => ({ ...f, is_visible: v }))} />
                  <ToggleCard label="Auto-hide when out of stock" sub="Automatically hide when stock reaches 0" value={form.hide_when_out_of_stock} onChange={(v) => setForm((f) => ({ ...f, hide_when_out_of_stock: v }))} />
                </div>
                <div className="mcSecLabel">Notes</div>
                <textarea className="mcNoteInput" rows={2} placeholder="Optional notes visible to retailers…" value={form.catalog_notes} onChange={(e) => setForm((f) => ({ ...f, catalog_notes: e.target.value }))} />
                <ModalFooterShell>
                  <button type="button" className="mcBtn mcBtn_ghost" onClick={() => setAddStep(1)}><IconChevronLeft width={13} height={13} /> Back</button>
                  <AsyncButton busy={addBusy} className="mcBtn mcBtn_primary" onClick={onAddCatalog}>Add to Catalog</AsyncButton>
                </ModalFooterShell>
              </>
            )}
          </div>
        </CommonModal>

        {/* ── Edit Product Modal ── */}
        <CommonModal open={openEdit} onClose={() => { setOpenEdit(false); setEditingCatalogId(""); setEditingRow(null); }} title="Edit Catalog Product" size="md" loading={editBusy} loadingText="Saving changes…">
          <div className="mcWizBody">
            {editingRow && (
              <div className="mcSelCard">
                <div className="mcSelIcon"><IconMcProduct width={16} height={16} /></div>
                <div><div className="mcSelName">{editingRow.product_name || "—"}</div><div className="mcSelMeta">{editingRow.product_code || ""}{editingRow.packing ? ` · Pack ${editingRow.packing}` : ""}</div></div>
              </div>
            )}
            <div className="mcSecLabel">Pricing</div>
            <div className="mcFieldRow mcFieldRow_col2">
              <div className="mcField">
                <label>Catalog Price <span style={{ color: "var(--color-danger)" }}>*</span></label>
                <div className="mcFieldGroup"><span className="mcFieldPfx">{getCurrencySymbol()}</span><AmountInput value={String(editForm.catalog_price ?? "")} onChange={(raw) => setEditForm((f) => ({ ...f, catalog_price: raw }))} placeholder="0.00" inputMode="decimal" /></div>
              </div>
              <div className="mcField">
                <label>MRP</label>
                <div className="mcFieldGroup"><span className="mcFieldPfx">{getCurrencySymbol()}</span><AmountInput value={String(editForm.mrp ?? "")} onChange={(raw) => setEditForm((f) => ({ ...f, mrp: raw }))} placeholder="0.00" inputMode="decimal" /></div>
              </div>
            </div>
            <div className="mcSecLabel">Order Limits</div>
            <div className="mcFieldRow mcFieldRow_col3">
              <div className="mcField">
                <label>Packing</label>
                <input type="text" placeholder="e.g. 10×10" value={editForm.packing} onChange={(e) => setEditForm((f) => ({ ...f, packing: e.target.value }))} />
              </div>
              <div className="mcField">
                <label>Min Qty</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" value={editForm.min_order_qty} onChange={(e) => setEditForm((f) => ({ ...f, min_order_qty: e.target.value.replace(/[^0-9]/g, "") || "1" }))} />
              </div>
              <div className="mcField">
                <label>Max Qty</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="No limit" value={editForm.max_order_qty} onChange={(e) => setEditForm((f) => ({ ...f, max_order_qty: e.target.value.replace(/[^0-9]/g, "") }))} />
              </div>
            </div>
            <div className="mcSecLabel">Visibility</div>
            <div className="mcTogGrid">
              <ToggleCard label="Visible to retailers" sub="Retailers can see and order this product" value={editForm.is_visible} onChange={(v) => setEditForm((f) => ({ ...f, is_visible: v }))} />
              <ToggleCard label="Auto-hide when out of stock" sub="Automatically hide when stock reaches 0" value={editForm.hide_when_out_of_stock} onChange={(v) => setEditForm((f) => ({ ...f, hide_when_out_of_stock: v }))} />
            </div>
            <div className="mcSecLabel">Notes</div>
            <textarea className="mcNoteInput" rows={2} placeholder="Optional notes visible to retailers…" value={editForm.catalog_notes} onChange={(e) => setEditForm((f) => ({ ...f, catalog_notes: e.target.value }))} />
            <ModalFooterShell>
              <button type="button" className="mcBtn mcBtn_ghost" onClick={() => { setOpenEdit(false); setEditingCatalogId(""); setEditingRow(null); }}>Cancel</button>
              <AsyncButton busy={editBusy} className="mcBtn mcBtn_primary" onClick={onEditCatalog}>Save Changes</AsyncButton>
            </ModalFooterShell>
          </div>
        </CommonModal>

        {/* ── Delete confirm modal ── */}
        <CommonModal open={openDelete} onClose={() => { setOpenDelete(false); setDeletingRow(null); }} title="Remove from Catalog" size="sm" drawer={false} loading={deleteBusy} loadingText="Removing…">
          <div className="mcWizBody">
            <div className="mcDeleteConfirm">
              <div className="mcDeleteIcon"><Trash2 size={28} /></div>
              <div className="mcDeleteMsg">
                <strong>{deletingRow?.product_name || "This product"}</strong> will be hidden from retailers and removed from your catalog.
              </div>
              {deletingRow?.product_code && <div className="mcDeleteSub">Code: {deletingRow.product_code}</div>}
              <div className="mcDeleteNote">Note: Products with active pending or accepted orders cannot be removed.</div>
            </div>
            <ModalFooterShell>
              <button type="button" className="mcBtn mcBtn_ghost" onClick={() => { setOpenDelete(false); setDeletingRow(null); }}>Cancel</button>
              <AsyncButton busy={deleteBusy} className="mcBtn mcBtn_er" onClick={onDeleteCatalog}>Remove</AsyncButton>
            </ModalFooterShell>
          </div>
        </CommonModal>

        {/* ── Retailer: Order wizard modal ── */}
        {isRetailer && (
          <OrderPlaceWizardModal
            open={openOrder}
            mode="cart"
            onClose={() => {
              setCartLines([]);
              setCartWholesalerId("");
              setOpenOrder(false);
              refresh();
            }}
            cartItems={cartLines}
            wholesalerAccountId={String(activeWholesaler?.wholesaler_account_id || cartWholesalerId || "")}
            wholesalerName={activeWholesaler?.wholesaler_name || ""}
            onPlaceOrder={placeOrder}
          />
        )}

        {/* ── Retailer: Qty picker modal ── */}
        {isRetailer && qtyPick.open && qtyPick.row && (
          <CommonModal open={qtyPick.open} onClose={() => setQtyPick({ open: false, row: null })} title="Select Quantity" size="sm" drawer={false}>
            <div style={{ padding: "16px 0 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{qtyPick.row.product_name}</div>
              <QtyStepper
                value={qtyPickValue}
                min={Math.max(1, Number(qtyPick.row.min_order_qty || 1) || 1)}
                max={qtyPick.row.max_order_qty ? Number(qtyPick.row.max_order_qty) : undefined}
                onChange={setQtyPickValue}
              />
            </div>
            <ModalFooterShell>
              <button type="button" className="mcBtn mcBtn_ghost" onClick={() => setQtyPick({ open: false, row: null })}>Cancel</button>
              <button type="button" className="mcBtn mcBtn_primary" onClick={() => { setCartQty(qtyPick.row, qtyPickValue); setQtyPick({ open: false, row: null }); emitToast({ type: "success", message: `${qtyPick.row.product_name || "Product"} added to cart.` }); }}>Add to Cart</button>
            </ModalFooterShell>
          </CommonModal>
        )}

        {/* ── Retailer: Product details modal ── */}
        {isRetailer && (
          <OrderCatalogProductDetailsModal
            open={openRetailerDetail}
            onClose={() => { setOpenRetailerDetail(false); setSelectedRetailerRow(null); }}
            row={selectedRetailerRow}
            inCart={selectedRetailerRow ? qtyByCatalogId.has(String(selectedRetailerRow.id || "")) : false}
            onAddToCart={(row) => { handleCardAdd(row); setOpenRetailerDetail(false); }}
          />
        )}
      </div>
    </AppShell>
  );
}
