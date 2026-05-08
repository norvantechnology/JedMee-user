import { fmtCurrency } from "../utils/format.js";
import { useSeoMeta } from "../utils/seo.js";
import { AppButton, InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../layouts/AppShell.jsx";
import CommonModal from "../components/CommonModal.jsx";
import { readAuth } from "../services/authStorage.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import {
  acceptOrder,
  cancelOrderRetailer,
  confirmDelivery,
  createPurchaseFromOrder,
  dispatchOrder,
  getOrderById,
  getWholesalerOrderView,
  listIncomingOrders,
  listMyOrders,
  rejectOrder
} from "../services/orderService.js";
import {
  IconPurchaseOrder,
  IconView,
  IconCancel as IconCancelCircle,
  IconOpSearch,
  IconOpCart,
  IconOpClock,
  IconOpAccepted,
  IconOpSend,
  IconOpDelivered,
  IconOpRejected,
  IconOpCancelled,
  Zap,
  Package2,
  Building2,
  Store,
  Phone,
  MapPin,
  MessageSquare,
  Check,
  BadgeCheck,
  Printer,
} from "../components/ui/AppIcons.jsx";
import "../components/MasterModalForm.css";
import "./OrdersPage.css";

/* ── Status config ─────────────────────────────────────────── */
const STATUS_CFG = {
  PENDING:    { label: "Pending",    cls: "opSt_pending",    bar: "opBar_pending" },
  ACCEPTED:   { label: "Accepted",   cls: "opSt_accepted",   bar: "opBar_accepted" },
  DISPATCHED: { label: "Dispatched", cls: "opSt_dispatched", bar: "opBar_dispatched" },
  DELIVERED:  { label: "Delivered",  cls: "opSt_delivered",  bar: "opBar_delivered" },
  REJECTED:   { label: "Rejected",   cls: "opSt_rejected",   bar: "opBar_rejected" },
  CANCELLED:  { label: "Cancelled",  cls: "opSt_cancelled",  bar: "opBar_cancelled" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, cls: "", bar: "" };
  return (
    <span className={`opBadge ${cfg.cls}`}>
      <span className="opBadgeDot" />
      {cfg.label}
    </span>
  );
}

/* ── Stat pill definitions ─────────────────────────────────── */
const STAT_DEFS = [
  { key: "ALL",        label: "Total",      iconCls: "opStatIc_all",        svg: <IconOpCart /> },
  { key: "PENDING",    label: "Pending",    iconCls: "opStatIc_pending",    svg: <IconOpClock /> },
  { key: "ACCEPTED",   label: "Accepted",   iconCls: "opStatIc_accepted",   svg: <IconOpAccepted /> },
  { key: "DISPATCHED", label: "Dispatched", iconCls: "opStatIc_dispatched", svg: <IconOpSend /> },
  { key: "DELIVERED",  label: "Delivered",  iconCls: "opStatIc_delivered",  svg: <IconOpDelivered /> },
  { key: "REJECTED",   label: "Rejected",   iconCls: "opStatIc_rejected",   svg: <IconOpRejected /> },
  { key: "CANCELLED",  label: "Cancelled",  iconCls: "opStatIc_cancelled",  svg: <IconOpCancelled /> },
];

const FULFILLMENT_STEPS = [
  { key: "accepted",   label: "Accepted",   getAt: (o) => o?.accepted_at },
  { key: "dispatched", label: "Dispatched", getAt: (o) => o?.dispatched_at },
  { key: "delivered",  label: "Delivered",  getAt: (o) => o?.delivered_at },
];

/* ══════════════════════════════════════════════════════════════
   PAGE COMPONENT
══════════════════════════════════════════════════════════════ */
export default function OrdersPage() {
  useSeoMeta({ title: "Orders" });
  const auth = readAuth();
  const isRetailer = useMemo(() => isRetailerAuth(auth), [auth]);

  const [loading, setLoading]             = useState(false);
  const [rows, setRows]                   = useState([]);
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState("");
  const [retailerFilter, setRetailerFilter] = useState("");
  const [selected, setSelected]           = useState(null);
  const [detail, setDetail]               = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const printRef = useRef(null);
  const [cancelTarget, setCancelTarget]   = useState(null);
  const [cancelBusy, setCancelBusy]       = useState(false);
  const [rejectReason, setRejectReason]   = useState("");
  const [acceptNotes, setAcceptNotes]     = useState("");
  const [overrides, setOverrides]         = useState({});
  const [openPurchaseModal, setOpenPurchaseModal] = useState(false);
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [actionBusyKey, setActionBusyKey] = useState(null);
  const [acceptBusy, setAcceptBusy]       = useState(false);
  const [purchaseBusy, setPurchaseBusy]   = useState(false);

  /* ── Fetch all orders (client-side filter for stat counts) ── */
  async function refresh() {
    setLoading(true);
    const r = isRetailer
      ? await listMyOrders({})
      : await listIncomingOrders({});
    if (r.status >= 200 && r.status < 300 && r.json?.ok)
      setRows(r.json?.data?.items || []);
    else if (r.status !== 401)
      emitToast({ type: "error", message: parseApiError(r) });
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRetailer]);

  /* ── Client-side filter ─────────────────────────────────── */
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const party = (r.wholesaler_firm_name || r.retailer_firm_name || "").toLowerCase();
      const matchQ = !q || (r.order_number || "").toLowerCase().includes(q) || party.includes(q);
      const matchS = !statusFilter || r.status === statusFilter;
      const matchR = isRetailer || !retailerFilter || r.retailer_firm_name === retailerFilter;
      return matchQ && matchS && matchR;
    });
  }, [rows, search, statusFilter, retailerFilter, isRetailer]);

  /* ── Stat counts ────────────────────────────────────────── */
  const statCounts = useMemo(() => {
    const c = { ALL: rows.length };
    ["PENDING", "ACCEPTED", "DISPATCHED", "DELIVERED", "REJECTED", "CANCELLED"].forEach((s) => {
      c[s] = rows.filter((r) => r.status === s).length;
    });
    return c;
  }, [rows]);

  /* ── Unique retailer names for wholesaler filter ─────────── */
  const retailerOptions = useMemo(() => {
    if (isRetailer) return [];
    return [...new Set(rows.map((r) => r.retailer_firm_name).filter(Boolean))].sort();
  }, [rows, isRetailer]);

  /* ── Open detail modal ──────────────────────────────────── */
  async function openView(row) {
    setSelected(row);
    setDetail(null);
    setDetailLoading(true);
    try {
      const r = isRetailer
        ? await getOrderById(row.id)
        : await getWholesalerOrderView(row.id);
      if (r.status >= 200 && r.status < 300 && r.json?.ok)
        setDetail(r.json?.data || null);
      else {
        emitToast({ type: "error", message: parseApiError(r) });
        setSelected(null);
      }
    } finally {
      setDetailLoading(false);
    }
  }

  function closeView() {
    setSelected(null);
    setDetail(null);
    setDetailLoading(false);
  }

  /* ── Patch a single row in-place (avoids full list reload) ── */
  function patchRow(id, updates) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  }

  /* ── Quick actions ──────────────────────────────────────── */
  async function quickAction(type, row) {
    const busyKey = `${type}:${row?.id || ""}`;
    setActionBusyKey(busyKey);
    let r = null;
    try {
      if (type === "dispatch") r = await dispatchOrder(row.id);
      if (type === "reject")   r = await rejectOrder(row.id, { rejection_reason: rejectReason || "Rejected by wholesaler" });
      if (type === "confirm")  r = await confirmDelivery(row.id);
      if (type === "purchase") {
        setSelected(row);
        setDetail(null);
        setDetailLoading(true);
        try {
          const dr = await getOrderById(row.id);
          if (dr.status >= 200 && dr.status < 300 && dr.json?.ok) {
            const lines = dr.json?.data?.items || [];
            setDetail(dr.json?.data || null);
            setPurchaseItems(lines.map((x) => ({ order_item_id: x.id, received_qty: Number(x.accepted_qty || x.ordered_qty || 0) })));
            setOpenPurchaseModal(true);
          } else {
            emitToast({ type: "error", message: parseApiError(dr) });
            setSelected(null);
          }
        } finally {
          setDetailLoading(false);
        }
        return;
      }
      if (r && r.status >= 200 && r.status < 300 && r.json?.ok) {
        const statusMap = { dispatch: "DISPATCHED", reject: "REJECTED", confirm: "DELIVERED" };
        const newStatus = statusMap[type];
        if (newStatus) patchRow(row.id, { status: newStatus });
        const successMsg =
          type === "dispatch" ? "Order dispatched." :
          type === "reject"   ? "Order rejected." :
          type === "confirm"  ? "Delivery confirmed." :
          "Order updated.";
        emitToast({ type: "success", message: successMsg });
        closeView();
        return;
      }
      if (r && r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
    } finally {
      setActionBusyKey(null);
    }
  }

  /* ── Cancel (retailer) ──────────────────────────────────── */
  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      const r = await cancelOrderRetailer(cancelTarget.id, {});
      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
        patchRow(cancelTarget.id, { status: "CANCELLED" });
        emitToast({ type: "success", message: `Order ${cancelTarget.order_number} cancelled.` });
        setCancelTarget(null);
        closeView();
        return;
      }
      emitToast({ type: "error", message: parseApiError(r) });
    } finally {
      setCancelBusy(false);
    }
  }

  /* ── Accept (wholesaler) ────────────────────────────────── */
  function setOverride(itemId, key, value) {
    setOverrides((p) => ({ ...p, [itemId]: { ...(p[itemId] || {}), [key]: value } }));
  }

  async function onAcceptSubmit() {
    if (!selected?.id || !detail?.items?.length || acceptBusy) return;
    setAcceptBusy(true);
    const item_overrides = detail.items.map((it) => ({
      order_item_id: it.id,
      accepted_qty: Number(overrides[it.id]?.accepted_qty ?? it.ordered_qty),
      free_qty: Number(overrides[it.id]?.free_qty ?? it.free_qty ?? 0),
      batch_id: overrides[it.id]?.batch_id || undefined
    }));
    try {
      const r = await acceptOrder(selected.id, { wholesaler_notes: acceptNotes || null, item_overrides });
      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
        emitToast({ type: "success", message: "Order accepted." });
        setAcceptNotes("");
        setOverrides({});
        patchRow(selected.id, { status: "ACCEPTED" });
        closeView();
        return;
      }
      emitToast({ type: "error", message: parseApiError(r) });
    } finally {
      setAcceptBusy(false);
    }
  }

  /* ── Create purchase from order ─────────────────────────── */
  async function onCreatePurchaseWithAdjust() {
    if (!selected?.id || purchaseBusy) return;
    setPurchaseBusy(true);
    try {
      const r = await createPurchaseFromOrder(selected.id, { items: purchaseItems });
      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
        setOpenPurchaseModal(false);
        setPurchaseItems([]);
        setSelected(null);
        emitToast({ type: "success", message: "Purchase invoice created." });
        return;
      }
      emitToast({ type: "error", message: parseApiError(r) });
    } finally {
      setPurchaseBusy(false);
    }
  }

  /* ── Print invoice (wholesaler only) ───────────────────────── */
  function printOrder() {
    if (!printRef.current) return;
    const el = printRef.current;
    el.style.display = "block";
    // Reset after the print dialog closes (afterprint fires on both Print and Cancel)
    const cleanup = () => { el.style.display = "none"; };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  }

  const partyKey   = isRetailer ? "wholesaler_firm_name" : "retailer_firm_name";
  const partyLabel = isRetailer ? "Wholesaler" : "Retailer";

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  return (
    <AppShell
      userName={auth?.user?.full_name || "User"}
      userEmail={auth?.user?.email || auth?.email || ""}
      userBusinessName={auth?.user?.firm_name || ""}
      userGstNumber={auth?.user?.gst_number || ""}
      variant="user"
    >
      <div className="pageWrap ordersPage">

        {/* ── Page header ── */}
        <div className="opHeader">
          <div className="opTitle">{isRetailer ? "My Orders" : "Orders"}</div>
          <div className="opSub">
            {isRetailer ? "Track placed orders and confirm delivery." : "Manage incoming retailer orders."}
          </div>
        </div>

        {/* ── Stat pills ── */}
        <div className="opStatsScroll" aria-label="Order status summary">
          {STAT_DEFS.map((def) => {
            const cnt = def.key === "ALL" ? statCounts.ALL : (statCounts[def.key] || 0);
            const isActive = def.key === "ALL" ? !statusFilter : statusFilter === def.key;
            return (
              <button
                key={def.key}
                type="button"
                className={`opStat${isActive ? " opStat_active" : ""}`}
                onClick={() => setStatusFilter(def.key === "ALL" ? "" : def.key)}
              >
                <div className={`opStatIc ${def.iconCls}`}>{def.svg}</div>
                <div>
                  <div className="opStatN">{loading ? "—" : cnt}</div>
                  <div className="opStatL">{def.label}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Toolbar ── */}
        <div className="opToolbar">
          <div className="opSearchBox">
            <IconOpSearch />
            <input
              type="text"
              placeholder={`Search order ID or ${partyLabel.toLowerCase()}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="opStatusSel"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            {["PENDING", "ACCEPTED", "DISPATCHED", "DELIVERED", "REJECTED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select>
          {!isRetailer && retailerOptions.length > 0 && (
            <select
              className="opStatusSel"
              value={retailerFilter}
              onChange={(e) => setRetailerFilter(e.target.value)}
            >
              <option value="">All Retailers</option>
              {retailerOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>

        {/* ── Result meta ── */}
        <div className="opMeta">
          <span className="opMetaCnt">
            {loading ? "Loading…" : `${filteredRows.length} order${filteredRows.length !== 1 ? "s" : ""}`}
          </span>
          {!loading && <span>sorted newest first</span>}
        </div>

        {/* ── Order cards / empty / loading ── */}
        {loading ? (
          <div className="opLoading">Loading orders…</div>
        ) : filteredRows.length === 0 ? (
          <div className="opEmpty">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.95-1.57L23 6H6"/>
            </svg>
            <div className="opEmptyT">No orders found</div>
            <div className="opEmptyS">Try changing your search or filter.</div>
          </div>
        ) : (
          <div className="opList">
            {filteredRows.map((row) => {
              const party = row[partyKey] || "—";
              const itemCount = row.item_count ?? row.total_items ?? row.items?.length ?? null;
              const placedAt = row.placed_at
                ? new Date(row.placed_at).toLocaleString()
                : row.created_at
                  ? new Date(row.created_at).toLocaleString()
                  : "—";
              return (
                <div key={row.id} className={`opCard opCard_${(row.status || "").toLowerCase()}`}>
                  <div className="opCardBody">

                    {/* Row 1: order number + date + badge */}
                    <div className="opCardRow1">
                      <div>
                        <div className="opCardId">{row.order_number || row.id}</div>
                        <div className="opCardDate">{placedAt}</div>
                      </div>
                      <StatusBadge status={row.status} />
                    </div>

                    {/* Row 2: info chips */}
                    <div className="opCardRow2">
                      <div className="opCardInfo">
                        <div className="opCardInfoL">{partyLabel}</div>
                        <div className="opCardInfoV">{party}</div>
                      </div>
                      <div className="opCardDiv" aria-hidden="true" />
                      <div className="opCardInfo">
                        <div className="opCardInfoL">Items</div>
                        <div className="opCardInfoV">
                          {itemCount !== null
                            ? `${itemCount} item${itemCount !== 1 ? "s" : ""}`
                            : "—"}
                        </div>
                      </div>
                      <div className="opCardDiv" aria-hidden="true" />
                      <div className="opCardInfo">
                        <div className="opCardInfoL">Total</div>
                        <div className="opCardInfoV opCardInfoV_amt">{fmtCurrency(row.total_amount || 0)}</div>
                      </div>
                    </div>

                    {/* Row 3: actions */}
                    <div className="opCardRow3">
                      <button type="button" className="opBtn opBtn_view" onClick={() => openView(row)}>
                        <IconView />
                        View Details
                      </button>
                      {isRetailer && row.status === "PENDING" && (
                        <button type="button" className="opBtn opBtn_cancel" onClick={() => setCancelTarget(row)}>
                          <IconCancelCircle />
                          Cancel
                        </button>
                      )}
                      {!isRetailer && row.status === "PENDING" && (
                        <span className="opCardUrgent"><Zap size={12} />Needs Action</span>
                      )}
                      {!isRetailer && row.status === "ACCEPTED" && (
                        <button
                          type="button"
                          className="opBtn opBtn_action"
                          disabled={actionBusyKey === `dispatch:${row.id}`}
                          onClick={() => quickAction("dispatch", row)}
                        >
                          <Package2 size={14} />
                          {actionBusyKey === `dispatch:${row.id}` ? "Dispatching…" : "Dispatch"}
                        </button>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          ORDER DETAIL MODAL
      ══════════════════════════════════════════════════════ */}
      <CommonModal
        open={Boolean(selected)}
        ariaLabel="orders-detail"
        onClose={closeView}
        title={selected?.order_number || "Order Details"}
        subtitle={isRetailer ? "Track your order status and delivery" : "Review retailer order and take action"}
        size="lg"
        icon={<IconPurchaseOrder />}
        loading={detailLoading}
        loadingText="Loading order…"
        footer={
          detail ? (
            !isRetailer && detail?.order?.status === "PENDING" ? (
              /* ── Wholesaler PENDING: Accept / Reject footer ── */
              <div className="opDFooter">
                <AppButton
                  variant="primary"
                  disabled={acceptBusy}
                  onClick={onAcceptSubmit}
                  className="opDAcceptBtn"
                  icon={!acceptBusy ? <Check size={14} /> : undefined}
                >
                  {acceptBusy ? <InlineButtonProgress label="Accepting…" /> : "Accept Order"}
                </AppButton>
                <div className="opDOrDivider"><span className="opDOrText">or reject</span></div>
                <div className="opDRejectRow">
                  <input
                    className="opDRejectInput"
                    type="text"
                    placeholder="Reason for rejection (required)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <AppButton
                    variant="danger"
                    disabled={actionBusyKey === `reject:${selected?.id}`}
                    onClick={() => quickAction("reject", selected)}
                  >
                    {actionBusyKey === `reject:${selected?.id}` ? <InlineButtonProgress label="Rejecting…" /> : "Reject"}
                  </AppButton>
                </div>
              </div>
            ) : (
              /* ── All other states: standard footer ── */
              <div className="opModalFoot">
                <AppButton variant="ghost" onClick={closeView}>Close</AppButton>
                {!isRetailer && ["ACCEPTED", "DISPATCHED", "DELIVERED"].includes(detail?.order?.status) && (
                  <AppButton variant="secondary" icon={<Printer size={14} />} onClick={printOrder}>
                    Print Invoice
                  </AppButton>
                )}
                {isRetailer && detail?.order?.status === "PENDING" && (
                  <AppButton variant="danger" onClick={() => { closeView(); setCancelTarget(selected); }}>
                    Cancel Order
                  </AppButton>
                )}
                {isRetailer && detail?.order?.status === "DISPATCHED" && (
                  <AppButton
                    variant="primary"
                    disabled={actionBusyKey === `confirm:${selected?.id}`}
                    onClick={() => quickAction("confirm", selected)}
                  >
                    Confirm Delivery
                  </AppButton>
                )}
                {isRetailer && detail?.order?.status === "DELIVERED" && !detail?.order?.retailer_purchase_invoice_id && (
                  <AppButton
                    variant="primary"
                    disabled={actionBusyKey === `purchase:${selected?.id}`}
                    onClick={() => quickAction("purchase", selected)}
                  >
                    Create Purchase Invoice
                  </AppButton>
                )}
              </div>
            )
          ) : null
        }
      >
        {detail && (
          <div className="opDetail opDetail_sectioned">

            {/* ── Section 1: Order Summary + Delivery Progress (inline) ── */}
            <div className="opDSection">
              <div className="opDSummaryRow">
                <div className="opDSummaryBlock">
                  <div className="opDSummaryLabel">Order Total</div>
                  <div className="opDSummaryValue">{fmtCurrency(detail.order?.total_amount || 0)}</div>
                </div>
                <div className="opDSummaryDiv" />
                <div className="opDSummaryBlock">
                  <div className="opDSummaryLabel">Items</div>
                  <div className="opDSummaryValue opDSummaryValue_items">{detail.items?.length || 0}</div>
                </div>
                <div className="opDSummaryDiv" />
                <div className="opDProgressWrap">
                  <div className="opDProgressLabel">Delivery Progress</div>
                  <div className="opDProgressTrack">
                    {FULFILLMENT_STEPS.map(({ key, label, getAt }, idx) => {
                      const at = getAt(detail.order);
                      const isDone = Boolean(at);
                      const isLast = idx === FULFILLMENT_STEPS.length - 1;
                      return (
                        <div key={key} className="opDProgressStep">
                          <div className="opDProgressStepTop">
                            <div className={`opDStepCircle${isDone ? " opDStepCircle_done" : ""}`}>
                              {isDone && (
                                <svg width="10" height="10" fill="white" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                </svg>
                              )}
                            </div>
                            {!isLast && <div className={`opDStepLine${isDone ? " opDStepLine_done" : ""}`} />}
                          </div>
                          <div className="opDStepLabel">{label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 2: Party card ── */}
            <div className="opDSection">
              <div className="opDSecLabel">{partyLabel}</div>
              <div className="opPartyCard">
                <div className="opPartyIcon">
                  {isRetailer ? <Building2 size={18} /> : <Store size={18} />}
                </div>
                <div className="opPartyBody">
                  <div className="opPartyName">
                    {(isRetailer ? detail.order?.wholesaler_firm_name : detail.order?.retailer_firm_name) || "—"}
                  </div>
                  <div className="opPartyMeta">
                    {!isRetailer && detail.order?.delivery_phone && (
                      <span className="opPartyChip"><Phone size={11} />{detail.order.delivery_phone}</span>
                    )}
                    {!isRetailer && detail.order?.retailer_gst_number && (
                      <span className="opPartyChip"><BadgeCheck size={11} />GST: {detail.order.retailer_gst_number}</span>
                    )}
                    {isRetailer && detail.order?.wholesaler_phone && (
                      <span className="opPartyChip"><Phone size={11} />{detail.order.wholesaler_phone}</span>
                    )}
                    {isRetailer && detail.order?.wholesaler_gst_number && (
                      <span className="opPartyChip"><BadgeCheck size={11} />GST: {detail.order.wholesaler_gst_number}</span>
                    )}
                  </div>
                  {!isRetailer && (detail.order?.delivery_address || detail.order?.delivery_city || detail.order?.delivery_state) && (
                    <div className="opPartyAddress">
                      <MapPin size={11} className="opPartyAddressIcon" />
                      <div className="opPartyAddressLines">
                        {detail.order?.delivery_address && (
                          <div className="opPartyAddressLine">{detail.order.delivery_address}</div>
                        )}
                        {(detail.order?.delivery_city || detail.order?.delivery_pincode) && (
                          <div className="opPartyAddressLine">
                            {[detail.order.delivery_city, detail.order.delivery_pincode].filter(Boolean).join(" – ")}
                          </div>
                        )}
                        {(detail.order?.delivery_state || detail.order?.delivery_country) && (
                          <div className="opPartyAddressLine">
                            {[detail.order.delivery_state, detail.order.delivery_country].filter(Boolean).join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section 3: Order Items ── */}
            <div className="opDSection">
              <div className="opDSecLabel">
                Order Items{" "}
                <span className="opDSecCnt">{detail.items?.length || 0}</span>
              </div>
              <div className="opItemsList">
                {(detail.items || []).map((it) => {
                  const batchLabel = it.batch_number || (it.batch_id ? `#${String(it.batch_id).slice(0, 8)}` : null);
                  const unitPrice = it.unit_price ?? it.price_per_unit ?? null;
                  const freeQty = Number(it.free_qty || 0);
                  const acceptedQty = Number(it.accepted_qty || 0);
                  const orderedQty = Number(it.ordered_qty || 0);
                  return (
                    <div key={it.id} className="opItemRow">
                      <div className="opItemLeft">
                        <div className="opItemName">{it.product_name || "—"}</div>
                        <div className="opItemMeta">
                          {it.packing && <span className="opPill opPill_pack">Pack {it.packing}</span>}
                          <span className="opPill opPill_ord">Ordered: {orderedQty}</span>
                          {acceptedQty > 0 && (
                            <span className={`opPill ${acceptedQty < orderedQty ? "opPill_partial" : "opPill_acc"}`}>
                              Accepted: {acceptedQty}{acceptedQty < orderedQty ? ` / ${orderedQty}` : ""}
                            </span>
                          )}
                          {freeQty > 0 && <span className="opPill opPill_free">Free: {freeQty}</span>}
                          {batchLabel && (
                            <span className="opPill opPill_batch" title={it.batch_id ? String(it.batch_id) : batchLabel}>
                              Batch: {batchLabel}
                            </span>
                          )}
                          {!isRetailer && (
                            <span className="opPill opPill_stock">Stock: {Number(it.available_stock || 0)}</span>
                          )}
                          {unitPrice !== null && (
                            <span className="opPill opPill_price">{fmtCurrency(unitPrice)} / unit</span>
                          )}
                        </div>
                      </div>
                      <div className="opItemTotal">{fmtCurrency(it.line_total || 0)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Section 4: Accept Order Form (wholesaler PENDING only) ── */}
            {!isRetailer && detail?.order?.status === "PENDING" && (
              <div className="opDSection opDSection_last">
                <div className="opDSecLabel">Accept Order</div>
                <table className="opDAcceptTable">
                  <thead>
                    <tr>
                      <th>Product · Stock</th>
                      <th>Accept</th>
                      <th>Free</th>
                      <th>Batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items || []).map((it) => (
                      <tr key={it.id}>
                        <td>
                          <div className="opDProdCellName">{it.product_name}</div>
                          <div className="opDProdCellStock">Stock: <span>{Number(it.available_stock || 0)}</span></div>
                        </td>
                        <td>
                          <input
                            className="opDNumInput"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={overrides[it.id]?.accepted_qty ?? it.ordered_qty}
                            onChange={(e) => setOverride(it.id, "accepted_qty", e.target.value.replace(/[^0-9]/g, ""))}
                          />
                        </td>
                        <td>
                          <input
                            className="opDNumInput"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={overrides[it.id]?.free_qty ?? it.free_qty ?? 0}
                            onChange={(e) => setOverride(it.id, "free_qty", e.target.value.replace(/[^0-9]/g, ""))}
                          />
                        </td>
                        <td>
                          <input
                            className="opDBatchInput"
                            placeholder="Optional"
                            value={overrides[it.id]?.batch_id || ""}
                            onChange={(e) => setOverride(it.id, "batch_id", e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <textarea
                  className="opDNoteInput"
                  placeholder="Note for retailer (optional)…"
                  value={acceptNotes}
                  onChange={(e) => setAcceptNotes(e.target.value)}
                />
              </div>
            )}

            {/* ── Section 5: Notes (if any) ── */}
            {(detail.order?.retailer_notes || detail.order?.wholesaler_notes) && (
              <div className="opDSection opDSection_last">
                <div className="opDSecLabel">Notes</div>
                {detail.order?.retailer_notes && (
                  <div className="opNoteBox opNoteBox_retailer">
                    <div className="opNoteLbl"><MessageSquare size={11} />Retailer Note</div>
                    <div className="opNoteText">{detail.order.retailer_notes}</div>
                  </div>
                )}
                {detail.order?.wholesaler_notes && (
                  <div className="opNoteBox opNoteBox_wholesaler" style={{ marginTop: detail.order?.retailer_notes ? "8px" : 0 }}>
                    <div className="opNoteLbl"><MessageSquare size={11} />Wholesaler Note</div>
                    <div className="opNoteText">{detail.order.wholesaler_notes}</div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </CommonModal>

      {/* Cancel confirm modal */}
      <CommonModal
        open={Boolean(cancelTarget)}
        ariaLabel="orders-cancel-confirm"
        onClose={() => setCancelTarget(null)}
        title="Cancel this order?"
        danger
        size="sm"
        footer={
          <div className="opModalFoot">
            <AppButton variant="ghost" onClick={() => setCancelTarget(null)}>No, Keep It</AppButton>
            <AppButton variant="danger" disabled={cancelBusy} onClick={confirmCancel}>
              {cancelBusy ? <InlineButtonProgress label="Cancelling…" /> : "Yes, Cancel"}
            </AppButton>
          </div>
        }
      >
        <div className="opCancelBody">
          <div className="opCancelIc">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <p className="opCancelText">
            You&apos;re about to cancel order{" "}
            <strong className="opCancelId">{cancelTarget?.order_number}</strong>.
            <br />This action <strong>cannot be undone</strong>.
          </p>
        </div>
      </CommonModal>

      {/* Create purchase modal */}
      <CommonModal
        open={openPurchaseModal}
        ariaLabel="orders-create-purchase"
        onClose={() => { setOpenPurchaseModal(false); setSelected(null); }}
        title="Add to Purchases"
        footer={
          <div className="opModalFoot">
            <AppButton variant="ghost" onClick={() => setOpenPurchaseModal(false)}>Cancel</AppButton>
            <AppButton variant="primary" disabled={purchaseBusy} onClick={onCreatePurchaseWithAdjust}>
              {purchaseBusy ? <InlineButtonProgress label="Creating…" /> : "Create Purchase Invoice"}
            </AppButton>
          </div>
        }
      >
        <div className="opPurchaseBody">
          {(detail?.items || []).map((it) => {
            const prow = purchaseItems.find((x) => x.order_item_id === it.id) || { received_qty: 0 };
            return (
              <div key={it.id} className="opOverrideRow">
                <div className="opOverrideName">{it.product_name}</div>
                <div className="opOverrideSub">Accepted: {it.accepted_qty || it.ordered_qty}</div>
                <input
                  className="mfzInput"
                  placeholder="Received qty"
                  value={prow.received_qty}
                  onChange={(e) =>
                    setPurchaseItems((prev) =>
                      prev.map((p) =>
                        p.order_item_id === it.id ? { ...p, received_qty: Number(e.target.value || 0) } : p
                      )
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </CommonModal>

      {/* ══════════════════════════════════════════════════════
          PRINT INVOICE (hidden; shown only via @media print)
      ══════════════════════════════════════════════════════ */}
      <div ref={printRef} className="opPrintInvoice" style={{ display: "none" }} aria-hidden="true">
        {detail && !isRetailer && (
          <>
            {/* ── Header: firm info left · INVOICE label right ── */}
            <div className="opPrintHeader">
              <div className="opPrintHeaderLeft">
                <div className="opPrintBizName">{auth?.user?.firm_name || "Wholesaler"}</div>
                {auth?.user?.address && <div className="opPrintBizMeta">{auth.user.address}</div>}
                {auth?.user?.gst_number && <div className="opPrintBizMeta">GSTIN: {auth.user.gst_number}</div>}
                {auth?.user?.phone_number && <div className="opPrintBizMeta">Ph: {auth.user.phone_number}</div>}
              </div>
              <div className="opPrintHeaderRight">
                <div className="opPrintInvoiceLabel">INVOICE</div>
              </div>
            </div>

            <div className="opPrintDivider" />

            {/* ── Bill To (left) + Invoice Details (right) ── */}
            <div className="opPrintBillRow">
              <div className="opPrintBillTo">
                <div className="opPrintBillLabel">BILL TO</div>
                <div className="opPrintBillName">{detail.order?.retailer_firm_name || "—"}</div>
                {detail.order?.delivery_phone && (
                  <div className="opPrintBillLine">
                    <span className="opPrintBillKey">Ph:</span> {detail.order.delivery_phone}
                  </div>
                )}
                {detail.order?.retailer_gst_number && (
                  <div className="opPrintBillLine">
                    <span className="opPrintBillKey">GSTIN:</span> {detail.order.retailer_gst_number}
                  </div>
                )}
                {detail.order?.delivery_address && (
                  <div className="opPrintBillLine">{detail.order.delivery_address}</div>
                )}
                {(detail.order?.delivery_city || detail.order?.delivery_pincode) && (
                  <div className="opPrintBillLine">
                    {[detail.order.delivery_city, detail.order.delivery_pincode].filter(Boolean).join(" – ")}
                  </div>
                )}
                {(detail.order?.delivery_state || detail.order?.delivery_country) && (
                  <div className="opPrintBillLine">
                    {[detail.order.delivery_state, detail.order.delivery_country].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
              <div className="opPrintInvoiceBox">
                <div className="opPrintBillLabel">INVOICE DETAILS</div>
                <div className="opPrintInvoiceRow">
                  <span className="opPrintInvoiceKey">Order No</span>
                  <span className="opPrintInvoiceVal">{detail.order?.order_number || "—"}</span>
                </div>
                <div className="opPrintInvoiceRow">
                  <span className="opPrintInvoiceKey">Date</span>
                  <span className="opPrintInvoiceVal">
                    {detail.order?.placed_at ? new Date(detail.order.placed_at).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div className="opPrintInvoiceRow">
                  <span className="opPrintInvoiceKey">Status</span>
                  <span className="opPrintInvoiceVal opPrintInvoiceVal_status">{detail.order?.status || "—"}</span>
                </div>
              </div>
            </div>

            <div className="opPrintDivider" />

            {/* ── Items table ── */}
            <table className="opPrintTable">
              <thead>
                <tr>
                  <th className="opPrintTh opPrintThProduct">Product</th>
                  <th className="opPrintTh opPrintThNum">Qty</th>
                  <th className="opPrintTh opPrintThNum">Free</th>
                  <th className="opPrintTh opPrintThNum">Rate</th>
                  <th className="opPrintTh opPrintThNum">Disc%</th>
                  <th className="opPrintTh opPrintThNum">GST%</th>
                  <th className="opPrintTh opPrintThNum opPrintThRight">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((it) => (
                  <tr key={it.id} className="opPrintTr">
                    <td className="opPrintTd">
                      <div className="opPrintProdName">{it.product_name}</div>
                      {it.packing && <div className="opPrintProdMeta">Pack: {it.packing}</div>}
                      {it.batch_no && <div className="opPrintProdMeta">Batch: {it.batch_no}</div>}
                    </td>
                    <td className="opPrintTd opPrintTdNum">{it.accepted_qty ?? it.ordered_qty}</td>
                    <td className="opPrintTd opPrintTdNum">{it.free_qty || 0}</td>
                    <td className="opPrintTd opPrintTdNum">{fmtCurrency(it.unit_price || 0)}</td>
                    <td className="opPrintTd opPrintTdNum">{Number(it.discount_percent || 0).toFixed(1)}%</td>
                    <td className="opPrintTd opPrintTdNum">{Number(it.gst_percent || 0).toFixed(1)}%</td>
                    <td className="opPrintTd opPrintTdNum opPrintTdRight">{fmtCurrency(it.line_total || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="opPrintDivider" />

            {/* ── Totals ── */}
            <div className="opPrintTotals">
              <div className="opPrintTotalsBox">
                {Number(detail.order?.total_discount || 0) > 0 && (
                  <div className="opPrintTotalRow">
                    <span className="opPrintTotalLabel">Subtotal</span>
                    <span className="opPrintTotalValue">{fmtCurrency(detail.order?.subtotal || 0)}</span>
                  </div>
                )}
                {Number(detail.order?.total_discount || 0) > 0 && (
                  <div className="opPrintTotalRow">
                    <span className="opPrintTotalLabel">Discount</span>
                    <span className="opPrintTotalValue">− {fmtCurrency(detail.order?.total_discount || 0)}</span>
                  </div>
                )}
                {Number(detail.order?.total_gst || 0) > 0 && (
                  <div className="opPrintTotalRow">
                    <span className="opPrintTotalLabel">GST</span>
                    <span className="opPrintTotalValue">{fmtCurrency(detail.order?.total_gst || 0)}</span>
                  </div>
                )}
                <div className="opPrintTotalRow opPrintGrand">
                  <span className="opPrintTotalLabel">Grand Total</span>
                  <span className="opPrintTotalValue">{fmtCurrency(detail.order?.total_amount || 0)}</span>
                </div>
              </div>
            </div>

            {/* ── Notes ── */}
            {(detail.order?.retailer_notes || detail.order?.wholesaler_notes) && (
              <div className="opPrintNotes">
                {detail.order?.retailer_notes && (
                  <div>
                    <span className="opPrintNotesLabel">Retailer Note:</span> {detail.order.retailer_notes}
                  </div>
                )}
                {detail.order?.wholesaler_notes && (
                  <div>
                    <span className="opPrintNotesLabel">Note:</span> {detail.order.wholesaler_notes}
                  </div>
                )}
              </div>
            )}

            <div className="opPrintFooter">Thank you for your business.</div>
          </>
        )}
      </div>

    </AppShell>
  );
}
