import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUnreadNotificationCount, listNotifications, markNotificationsRead } from "../services/notificationService.js";
import { subscribeNotificationInboxRefresh } from "../services/notificationInboxBus.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { BellMark, IconAlert, IconArrowRight, IconCheck, IconInfo, IconX } from "./ui/AppIcons.jsx"; // Shared notification icons (prevents inline svg duplicates)
import "./NotificationCenter.css";

const PAGE_SIZE = 25;
const SCROLL_LOAD_THRESHOLD_PX = 100;

// ── Helpers ──
function calendarDayKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayHeading(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const todayKey = calendarDayKey(today);
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const ik = calendarDayKey(d);
  if (ik === todayKey) return "Today";
  if (ik === calendarDayKey(yest)) return "Yesterday";
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short", month: "short", day: "numeric",
      year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined
    }).format(d);
  } catch { return ik; }
}

function fmtTimeOnly(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try { return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: true }).format(d); }
  catch { return ""; }
}

function parseNotificationPayload(payload) {
  if (payload == null) return {};
  if (typeof payload === "object" && !Array.isArray(payload)) return payload;
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      return typeof parsed === "object" && parsed && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function resolveNotificationPath(n) {
  let path = String(n.action_path || n.actionPath || "").trim();
  if (path === "/products") path = "/quality-master";
  const payload = parseNotificationPayload(n.payload);
  if (path === "/quality-master") {
    const productId = payload.productId ?? payload.product_id;
    if (productId) path = `/quality-master/${productId}`;
  }
  return path || null;
}

function normalizeNotification(n) {
  const payload = parseNotificationPayload(n.payload);
  const action_path = resolveNotificationPath({ ...n, payload }) || n.action_path || n.actionPath || null;
  return { ...n, payload, action_path };
}

function buildNotificationRows(items) {
  const rows = [];
  let lastDay = null;
  for (const n of items) {
    const dk = calendarDayKey(n.created_at);
    if (dk !== lastDay) {
      rows.push({ kind: "day", key: `day-${dk}`, label: formatDayHeading(n.created_at) });
      lastDay = dk;
    }
    rows.push({ kind: "item", key: n.id, n });
  }
  return rows;
}

function severityForNotification(n) {
  const p = String(n.priority || "").toUpperCase();
  if (p === "P1") return "crit";
  if (p === "P2") return "warn";
  if (p === "P4") return "info";
  const t = String(n.type || "").toUpperCase();
  if (t.includes("EXPIRED") || t === "STOCK_ZERO") return "crit";
  if (t.includes("OVERDUE") || t.includes("EXPIRING")) return "warn";
  if (t.includes("LOW_STOCK")) {
    const thr = Number(n.payload?.threshold);
    const qty = Number(n.payload?.total ?? n.payload?.qty);
    if (Number.isFinite(thr) && Number.isFinite(qty) && thr > 0 && qty <= thr / 2) return "crit";
    return "warn";
  }
  return "info";
}

function severityLabel(n) {
  const p = String(n.priority || "").toUpperCase();
  if (p) return p;
  const t = String(n.type || "").toUpperCase();
  if (t === "LOW_STOCK_PRODUCT") return "P2";
  if (t === "LOW_STOCK_BATCH") return "P2";
  if (t === "EXPIRED_BATCH") return "P1";
  if (t === "BATCH_EXPIRING_SOON") return "P2";
  if (t === "PAYABLE_OVERDUE" || t === "RECEIVABLE_OVERDUE") return "P2";
  return "P3";
}

function SeverityIcon({ tone }) {
  if (tone === "crit") return <IconAlert />;
  if (tone === "warn") return <IconAlert />;
  return <IconInfo />;
}

export default function NotificationCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const itemsRef = useRef([]);
  const loadMoreLockRef = useRef(false);
  const openRef = useRef(false);
  openRef.current = open;
  itemsRef.current = items;

  const listRows = useMemo(() => buildNotificationRows(items), [items]);

  const unreadLabel = useMemo(() => {
    if (unread <= 0) return "";
    if (unread > 99) return "99+";
    return String(unread);
  }, [unread]);

  const refreshUnread = useCallback(async () => {
    const r = await getUnreadNotificationCount();
    if (r.status >= 200 && r.status < 300 && r.json?.ok)
      setUnread(Number(r.json?.data?.unread_count ?? 0));
  }, []);

  const fetchPage = useCallback(async (offset, append) => {
    const r = await listNotifications({ limit: PAGE_SIZE, offset });
    if (r.status >= 200 && r.status < 300 && r.json?.ok) {
      const newItems = (r.json?.data?.items || []).map(normalizeNotification);
      const hm = r.json?.data?.has_more;
      const more = hm !== undefined && hm !== null ? Boolean(hm) : newItems.length >= PAGE_SIZE;
      setHasMore(more);
      if (append) {
        setItems((prev) => {
          const seen = new Set(prev.map((x) => String(x.id)));
          const merged = [...prev];
          for (const it of newItems) {
            const id = String(it.id);
            if (!seen.has(id)) { seen.add(id); merged.push(it); }
          }
          return merged;
        });
      } else {
        setItems(newItems);
      }
      return true;
    }
    if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
    return false;
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setHasMore(true);
    await fetchPage(0, false);
    setListLoading(false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || listLoadingMore || listLoading || loadMoreLockRef.current) return;
    loadMoreLockRef.current = true;
    setListLoadingMore(true);
    try { await fetchPage(itemsRef.current.length, true); }
    finally { loadMoreLockRef.current = false; setListLoadingMore(false); }
  }, [fetchPage, hasMore, listLoadingMore, listLoading]);

  const onListScroll = useCallback((e) => {
    const el = e.currentTarget;
    if (!hasMore || listLoadingMore || listLoading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_LOAD_THRESHOLD_PX) void loadMore();
  }, [hasMore, listLoadingMore, listLoading, loadMore]);

  useEffect(() => {
    refreshUnread();
    const t = window.setInterval(refreshUnread, 45_000);
    return () => window.clearInterval(t);
  }, [refreshUnread]);

  useEffect(() => subscribeNotificationInboxRefresh(() => {
    void refreshUnread();
    if (openRef.current) void loadList();
  }), [refreshUnread, loadList]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") {
        void refreshUnread();
        if (openRef.current) void loadList();
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshUnread, loadList]);

  useEffect(() => {
    if (!open) return;
    void loadList();
    void refreshUnread();
  }, [open, loadList, refreshUnread]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (!wrapRef.current || wrapRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function onMarkAllRead() {
    const r = await markNotificationsRead({ all: true });
    if (r.status >= 200 && r.status < 300 && r.json?.ok) {
      await loadList();
      await refreshUnread();
    } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
  }

  async function onOpenItem(n) {
    if (!n.read_at) {
      const r = await markNotificationsRead({ ids: [n.id] });
      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
        await refreshUnread();
      }
    }
    const path = resolveNotificationPath(n);
    if (path) { setOpen(false); navigate(path); }
  }

  return (
    <div className="nfy" ref={wrapRef}>
      {/* Bell trigger */}
      <button
        type="button"
        className="nfyBtn"
        title={unread > 0 ? `${unread} unread` : "Notifications"}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        {/* Bell trigger icon for the notification dropdown */}
        <BellMark className="nfyBtnSvg" />
        {unread > 0 && <span className="nfyBadge" aria-hidden="true">{unreadLabel}</span>}
      </button>

      {/* Popover */}
      {open && (
        <div className="nfyPop" role="dialog" aria-label="Notifications">

          {/* Header */}
          <div className="nfyHead">
            <div className="nfyHeadLeft">
              <span className="nfyHeadTitle">Notifications</span>
              {unread > 0
                ? <span className="nfyHeadBadge">{unreadLabel} unread</span>
                : <span className="nfyHeadBadge nfyHeadBadge_clear">All read</span>
              }
            </div>
            <div className="nfyHeadActions">
              {unread > 0 && (
                <button type="button" className="nfyHeadBtn" onClick={onMarkAllRead} title="Mark all as read">
                  <IconCheck />
                  <span>Mark all read</span>
                </button>
              )}
              <button type="button" className="nfyCloseBtn" onClick={() => setOpen(false)} aria-label="Close">
                <IconX />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="nfyList" ref={listRef} onScroll={onListScroll} role="list">

            {listLoading && (
              <div className="nfyState">
                <div className="nfySpinner" />
                <span>Loading…</span>
              </div>
            )}

            {!listLoading && !items.length && (
              <div className="nfyState nfyState_empty">
                <BellMark className="nfyEmptyIcon" />
                <span>No notifications yet</span>
              </div>
            )}

            {!listLoading && listRows.map((row) => {
              if (row.kind === "day") {
                return (
                  <div key={row.key} className="nfyDayLabel" role="presentation">
                    {row.label}
                  </div>
                );
              }

              const n = row.n;
              const tone = severityForNotification(n);
              const isUnread = !n.read_at;
              const qty   = n.payload?.total ?? n.payload?.qty;
              const thr   = n.payload?.threshold;

              return (
                <div
                  key={row.key}
                  className={`nfyItem nfyItem_${tone}${isUnread ? " nfyItem_unread" : ""}${resolveNotificationPath(n) ? " nfyItem_clickable" : ""}`}
                  role="listitem"
                  onClick={() => void onOpenItem(n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void onOpenItem(n);
                    }
                  }}
                  tabIndex={resolveNotificationPath(n) ? 0 : undefined}
                >
                  {/* Left accent + icon */}
                  <div className={`nfyIcon nfyIcon_${tone}`}>
                    <SeverityIcon tone={tone} />
                  </div>

                  {/* Content */}
                  <div className="nfyContent">
                    <div className="nfyRow1">
                      <span className="nfyTitle">{n.title || "Update"}</span>
                      <span className="nfyTime">{fmtTimeOnly(n.created_at)}</span>
                    </div>

                    {n.body && <p className="nfyBody">{n.body}</p>}

                    <div className="nfyRow2">
                      <span className={`nfyChip nfyChip_${tone}`}>
                        {severityLabel(n)}
                        {qty !== undefined && thr !== undefined && (
                          <span className="nfyChipSub"> · {qty}/{thr}</span>
                        )}
                      </span>

                      {(n.action_label || n.action_path) && (
                        <button
                          type="button"
                          className="nfyActLink"
                          onClick={(e) => { e.stopPropagation(); onOpenItem(n); }}
                        >
                          {n.action_label || "Open"}
                          <IconArrowRight />
                        </button>
                      )}
                      {!n.action_label && !n.action_path && isUnread && (
                        <button type="button" className="nfyActLink nfyActLink_ghost" onClick={() => onOpenItem(n)}>
                          Dismiss <IconArrowRight />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Unread dot */}
                  {isUnread && <span className="nfyUnreadDot" aria-hidden="true" />}
                </div>
              );
            })}

            {listLoadingMore && (
              <div className="nfyState nfyState_more">
                <div className="nfySpinner nfySpinner_sm" />
                <span>Loading more…</span>
              </div>
            )}

            {!listLoading && !listLoadingMore && items.length > 0 && !hasMore && (
              <div className="nfyEndLine">You're all caught up</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}