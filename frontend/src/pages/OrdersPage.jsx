import { fmtMoney, fmtCurrency } from "../utils/format.js";
import { useSeoMeta } from "../utils/seo.js";
import { AppButton, InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useEffect, useMemo, useState } from "react";
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
  const [selected, setSelected]           = useState(null);
  const [detail, setDetail]               = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
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
      return matchQ && matchS;
    });
  }, [rows, search, statusFilter]);

  /* ── Stat counts ────────────────────────────────────────── */
  const statCounts = useMemo(() => {
    const c = { ALL: rows.length };
    ["PENDING", "ACCEPTED", "DISPATCHED", "DELIVERED", "REJECTED", "CANCELLED"].forEach((s) => {
      c[s] = rows.filter((r) => r.status === s).length;
    });
    return c;
  }, [rows]);

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
        refresh();
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
        refresh();
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
        closeView();
        refresh();
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
        refresh();
        emitToast({ type: "success", message: "Purchase invoice created." });
        return;
      }
      emitToast({ type: "error", message: parseApiError(r) });
    } finally {
      setPurchaseBusy(false);
    }
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
              const cfg = STATUS_CFG[row.status] || {};
              const party = row[partyKey] || "—";
              const itemCount = row.item_count ?? row.items?.length ?? "—";
              const amount = fmtMoney(row.total_amount || 0);
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
                          {typeof itemCount === "number"
                            ? `${itemCount} item${itemCount !== 1 ? "s" : ""}`
                            : itemCount}
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
                      {!isRetailer && row.status === "ACCEPTED" && (
                        <button
                          type="button"
                          className="opBtn opBtn_action"
                          disabled={actionBusyKey === `dispatch:${row.id}`}
                          onClick={() => quickAction("dispatch", row)}
                        >
                          {actionBusyKey === `dispatch:${row.id}` ? "Dispatching…" : "Dispatch"}
                        </button>
                      )}
                      {!isRetailer && row.status === "DISPATCHED" && (
                        <button
                          type="button"
                          className="opBtn opBtn_action"
                          disabled={actionBusyKey === `confirm:${row.id}`}
                          onClick={() => quickAction("confirm", row)}
                        >
                          {actionBusyKey === `confirm:${row.id}` ? "Confirming…" : "Confirm Delivery"}
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
        subtitle="Line items, totals & delivery milestones"
        size="lg"
        icon={<IconPurchaseOrder />}
        loading={detailLoading}
        loadingText="Loading order…"
        footer={
          detail ? (
            <div className="opModalFoot">
              <AppButton variant="ghost" onClick={closeView}>Close</AppButton>
              {isRetailer && detail?.order?.status === "PENDING" && (
                <AppButton variant="danger" onClick={() => { closeView(); setCancelTarget(selected); }}>
                  Cancel Order
                </AppButton>
              )}
              {!isRetailer && detail?.order?.status === "DELIVERED" && (
                <AppButton
                  variant="primary"
                  disabled={actionBusyKey === `purchase:${selected?.id}`}
                  onClick={() => quickAction("purchase", selected)}
                >
                  Create Purchase Invoice
                </AppButton>
              )}
            </div>
          ) : null
        }
      >
        {detail && (
          <div className="opDetail">

            {/* Meta grid */}
            <div className="opMetaGrid">
              <div className="opMetaBox">
                <div className="opMetaLbl">📅 Placed on</div>
                <div className="opMetaVal">
                  {detail.order?.placed_at ? new Date(detail.order.placed_at).toLocaleString() : "—"}
                </div>
              </div>
              <div className="opMetaBox">
                <div className="opMetaLbl">{isRetailer ? "🏭 Wholesaler" : "🏪 Retailer"}</div>
                <div className="opMetaVal">
                  {(isRetailer ? detail.order?.wholesaler_firm_name : detail.order?.retailer_firm_name) || "—"}
                </div>
              </div>
              <div className="opMetaBox">
                <div className="opMetaLbl">📋 Status</div>
                <div className="opMetaVal"><StatusBadge status={detail.order?.status} /></div>
              </div>
              <div className="opMetaBox">
                <div className="opMetaLbl">💰 Total</div>
                <div className="opMetaVal opMetaVal_big">
                  {fmtCurrency(detail.order?.total_amount || 0)}
                </div>
              </div>
            </div>

            {/* Fulfillment track */}
            <div className="opSecTitle">Delivery Progress</div>
            <div className="opFulfil">
              {FULFILLMENT_STEPS.map(({ key, label, getAt }) => {
                const at = getAt(detail.order);
                return (
                  <div key={key} className={`opFulStep${at ? " opFulStep_done" : ""}`}>
                    <div className="opFulLabel">
                      <span className={`opFulDot${at ? " opFulDot_done" : ""}`} />
                      {label}
                    </div>
                    <div className={`opFulVal${at ? "" : " opFulVal_pend"}`}>
                      {at ? new Date(at).toLocaleString() : "Not yet"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Items list */}
            <div className="opSecTitle">
              Order Items
              <span className="opSecCnt">{detail.items?.length || 0}</span>
            </div>
            <div className="opItemsList">
              {(detail.items || []).map((it) => (
                <div key={it.id} className="opItemRow">
                  <div className="opItemLeft">
                    <div className="opItemName">{it.product_name || "—"}</div>
                    <div className="opItemMeta">
                      {it.packing && <span className="opPill opPill_pack">Pack {it.packing}</span>}
                      <span className="opPill opPill_ord">Ordered: {Number(it.ordered_qty || 0)}</span>
                      {Number(it.accepted_qty || 0) > 0 && (
                        <span className="opPill opPill_acc">Accepted: {Number(it.accepted_qty)}</span>
                      )}
                      {it.batch_id && (
                        <span className="opPill opPill_batch" title={String(it.batch_id)}>
                          Batch: {String(it.batch_id).slice(0, 16)}{String(it.batch_id).length > 16 ? "…" : ""}
                        </span>
                      )}
                      {!isRetailer && (
                        <span className="opPill opPill_stock">Stock: {Number(it.available_stock || 0)}</span>
                      )}
                    </div>
                  </div>
                  <div className="opItemTotal">{fmtCurrency(it.line_total || 0)}</div>
                </div>
              ))}
            </div>

            {/* Wholesaler: accept / reject form */}
            {!isRetailer && detail?.order?.status === "PENDING" && (
              <div className="opAcceptBox">

                {/* Section title */}
                <div className="opSecTitle">Accept Order</div>

                {/* Column headers */}
                <div className="opAcceptHeader">
                  <div className="opAcceptHProduct">Product</div>
                  <div className="opAcceptHField">Accept Qty</div>
                  <div className="opAcceptHField">Free Qty</div>
                  <div className="opAcceptHField">Batch ID</div>
                </div>

                {/* Item rows */}
                {(detail.items || []).map((it) => (
                  <div key={it.id} className="opOverrideRow">
                    <div className="opOverrideName">
                      {it.product_name}
                      <span className="opOverrideStock">
                        Stock: {Number(it.available_stock || 0)}
                      </span>
                    </div>
                    <input
                      className="mfzInput"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={overrides[it.id]?.accepted_qty ?? it.ordered_qty}
                      onChange={(e) => setOverride(it.id, "accepted_qty", e.target.value.replace(/[^0-9]/g, ""))}
                    />
                    <input
                      className="mfzInput"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={overrides[it.id]?.free_qty ?? it.free_qty ?? 0}
                      onChange={(e) => setOverride(it.id, "free_qty", e.target.value.replace(/[^0-9]/g, ""))}
                    />
                    <input
                      className="mfzInput"
                      placeholder="Optional"
                      value={overrides[it.id]?.batch_id || ""}
                      onChange={(e) => setOverride(it.id, "batch_id", e.target.value)}
                    />
                  </div>
                ))}

                {/* Notes + Accept button */}
                <textarea
                  className="mfzTextarea"
                  placeholder="Add a note for the retailer (optional)"
                  value={acceptNotes}
                  onChange={(e) => setAcceptNotes(e.target.value)}
                />
                <AppButton
                  variant="primary"
                  disabled={acceptBusy}
                  onClick={onAcceptSubmit}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {acceptBusy ? <InlineButtonProgress label="Accepting…" /> : "✓ Accept Order"}
                </AppButton>

                {/* Reject section — separated */}
                <div className="opRejectBox">
                  <div className="opRejectLabel">Reject this order</div>
                  <div className="opRejectRow">
                    <input
                      className="mfzInput"
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

    </AppShell>
  );
}
