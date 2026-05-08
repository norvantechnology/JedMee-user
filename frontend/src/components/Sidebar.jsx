import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clearAuth, onAuthChanged, readAuth } from "../services/authStorage.js";
import { logout } from "../services/authService.js";
import { getPendingOrderCount } from "../services/orderService.js";
import { subscribeOrderBadgeRefresh } from "../services/orderBadgeBus.js";
import { APP_DISPLAY_NAME, sidebarNavScrollStorageKey } from "../constants/brand.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { useLocale } from "../context/LocaleContext.jsx";
import {
  BadgeIndianRupee,
  Building2,
  CreditCard,
  IconCollapseChevron,
  IconDots,
  IconMenu,
  IconLedger,
  IconCatalog,
  IconOrder,
  IconDayBook,
  ClipboardList,
  LayoutGrid,
  Package2,
  RotateCcw,
  ShieldCheck,
  Truck,
  Users,
  UsersRound,
  WalletCards,
  Layers
} from "./ui/AppIcons.jsx";
import "./Sidebar.css";

// Persist sidebar nav scroll position across route changes.
// Each page renders its own AppShell, so <Sidebar /> unmounts/remounts on
// every navigation and its internal scroll would reset to 0 otherwise.
const SIDEBAR_SCROLL_STORAGE_KEY = sidebarNavScrollStorageKey();
let sidebarNavScrollCache = (() => {
  try {
    const v = Number(window.sessionStorage.getItem(SIDEBAR_SCROLL_STORAGE_KEY));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
})();

function initialsFrom(nameOrEmail) {
  const s = String(nameOrEmail || "US").trim();
  if (!s) return "US";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || "U"}${parts[1][0] || "S"}`.toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export default function Sidebar({
  variant = "user",
  collapsed = false,
  mobileOpen = false,
  onToggleCollapse,
  onOpenMobile,
  onCloseMobile,
  onNavigate,
  userName,
  userEmail,
  businessName,
  gstNumber
}) {
  const { taxLabel } = useLocale();
  const [authTick, setAuthTick] = useState(0);
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const auth = readAuth();
  const access = auth?.access || null;
  const isRetailer = isRetailerAuth(auth);
  const perms = access?.permissions || {};
  const isOwner = Boolean(access?.isAccountOwner);
  const canUsers = isOwner || Boolean(perms?.USERS?.VIEW);
  const canRoles = isOwner || Boolean(perms?.ROLES?.VIEW);
  const canDivisions = isOwner || Boolean(perms?.DIVISIONS?.VIEW) || Boolean(perms?.VENDORS?.VIEW);
  const canQuality = isOwner || Boolean(perms?.PRODUCT_BATCHES?.VIEW);
  const canMfg = isOwner || Boolean(perms?.MFG_COMPANIES?.VIEW);
  const canPurchase = isOwner || Boolean(perms?.PURCHASE_INVOICES?.VIEW);
  const canCustomers = isOwner || Boolean(perms?.CUSTOMERS?.VIEW);
  const canSales = isOwner || Boolean(perms?.SALES_INVOICES?.VIEW);
  const canSalesReturns = isOwner || Boolean(perms?.SALES_RETURNS?.VIEW);
  const canPurchaseReturns = isOwner || Boolean(perms?.PURCHASE_RETURNS?.VIEW);
  const canDivisionPayments = isOwner || Boolean(perms?.DIVISION_PAYMENTS?.VIEW) || Boolean(perms?.VENDOR_PAYMENTS?.VIEW);
  const canCustomerPayments = isOwner || Boolean(perms?.CUSTOMER_PAYMENTS?.VIEW);
  const canPrescriptions = isOwner || Boolean(perms?.PRESCRIPTIONS?.VIEW);
  const canOrders = isOwner || Boolean(perms?.PURCHASE_ORDERS?.VIEW);

  useEffect(() => {
    return onAuthChanged(() => setAuthTick((t) => t + 1));
  }, []);

  // Fetch pending order count for the sidebar badge (wholesaler only).
  const refreshOrderBadge = useCallback(async () => {
    if (!canOrders || isRetailer) return;
    const r = await getPendingOrderCount();
    if (r.status >= 200 && r.status < 300 && r.json?.ok) {
      setPendingOrderCount(Number(r.json?.data?.pagination?.total ?? 0));
    }
  }, [canOrders, isRetailer]);

  useEffect(() => {
    refreshOrderBadge();
    const t = window.setInterval(refreshOrderBadge, 60_000);
    return () => window.clearInterval(t);
  }, [refreshOrderBadge]);

  useEffect(() => subscribeOrderBadgeRefresh(refreshOrderBadge), [refreshOrderBadge]);

  const sections = useMemo(() => {
    const out = [
      {
        title: "MAIN",
        items: [{ to: "/dashboard", label: NAV_LABELS.dashboard, icon: <LayoutGrid />, shortcut: "Alt+H" }]
      }
    ];

    const divisionBaseTo = isRetailer ? "/vendors" : "/divisions";
    const masterSetupItems = [
      ...(canQuality ? [{ to: "/quality-master", label: NAV_LABELS.qualityMaster, icon: <Package2 />, shortcut: "Alt+Q" }] : []),
      ...(canMfg ? [{ to: "/mfg-companies", label: NAV_LABELS.mfgCompanies, icon: <Building2 />, shortcut: "Alt+M" }] : []),
      ...(canDivisions
        ? [
            {
              to: divisionBaseTo,
              label: isRetailer ? "Suppliers" : NAV_LABELS.divisions,
              icon: <Truck />,
              shortcut: "Alt+D"
            }
          ]
        : []),
      ...(canCustomers ? [{ to: "/customers", label: NAV_LABELS.customers, icon: <UsersRound />, shortcut: "Alt+C" }] : [])
      ,
      ...(canOrders
        ? [
            {
              to: isRetailer ? "/order-catalog" : "/my-catalog",
              label: isRetailer ? NAV_LABELS.orderCatalog : NAV_LABELS.myCatalog,
              icon: <IconCatalog />,
              shortcut: "Alt+L"
            }
          ]
        : [])
    ];
    if (masterSetupItems.length) out.push({ title: "MASTER SETUP", items: masterSetupItems });

    const txnItems = [
      ...(canSales
        ? [
            {
              to: "/sales-billing",
              label: isRetailer ? "Sales & Billing" : NAV_LABELS.salesBilling,
              icon: <WalletCards />,
              shortcut: "Alt+B"
            }
          ]
        : []),
      ...(canSalesReturns ? [{ to: "/sales-returns", label: NAV_LABELS.salesReturns, icon: <RotateCcw />, shortcut: "Alt+S" }] : []),
      ...(canPurchase ? [{ to: "/purchase-invoices", label: NAV_LABELS.purchaseInvoices, icon: <ClipboardList />, shortcut: "Alt+I" }] : []),
      ...(canPurchaseReturns ? [{ to: "/purchase-returns", label: "Purchase Returns", icon: <RotateCcw />, shortcut: "Alt+N" }] : []),
      ...(canOrders
        ? [
            {
              to: isRetailer ? "/my-orders" : "/orders",
              label: isRetailer ? NAV_LABELS.myOrders : NAV_LABELS.orders,
              icon: <IconOrder />,
              shortcut: "Alt+O",
              badge: !isRetailer && pendingOrderCount > 0 ? (pendingOrderCount > 99 ? "99+" : String(pendingOrderCount)) : null
            }
          ]
        : []),
      ...(isRetailer && canPrescriptions ? [{ to: "/prescriptions", label: "Prescriptions", icon: <ShieldCheck />, shortcut: "Alt+X" }] : [])
    ];
    if (txnItems.length) out.push({ title: "TRANSACTIONS", items: txnItems });

    const reportItems = [
      ...(canQuality || canMfg ? [{ to: "/reports/inventory", label: "Inventory Reports", icon: <Layers /> }] : []),
      ...(canSales ? [{ to: "/reports/day-book", label: "Day Book", icon: <IconDayBook /> }] : []),
      ...(canSales ? [{ to: "/reports/gst-r1", label: `${taxLabel} Report (R1)`, icon: <IconDayBook /> }] : []),
      ...(canCustomers || canDivisions ? [{ to: "/reports/ledger", label: "Ledger", icon: <IconLedger /> }] : [])
    ];
    if (reportItems.length) out.push({ title: "REPORTS", items: reportItems });

    const paymentItems = [
      ...(canDivisionPayments ? [{ to: "/division-payments", label: isRetailer ? "Supplier Payments" : NAV_LABELS.divisionPayments, icon: <BadgeIndianRupee />, shortcut: "Alt+P" }] : []),
      ...(canCustomerPayments ? [{ to: "/customer-payments", label: NAV_LABELS.customerPayments, icon: <CreditCard />, shortcut: "Alt+Y" }] : [])
    ];
    if (paymentItems.length) out.push({ title: "PAYMENTS", items: paymentItems });

    const userManagementItems = [
      ...(canUsers ? [{ to: "/users", label: NAV_LABELS.users, icon: <Users />, shortcut: "Alt+U" }] : []),
      ...(canRoles ? [{ to: "/roles-access", label: NAV_LABELS.rolesAccess, icon: <ShieldCheck />, shortcut: "Alt+R" }] : [])
    ];
    if (userManagementItems.length) out.push({ title: "USER MANAGEMENT", items: userManagementItems });

    return out;
  }, [canUsers, canRoles, canDivisions, canQuality, canMfg, canPurchase, canCustomers, canSales, canSalesReturns, canPurchaseReturns, canOrders, canPrescriptions, canDivisionPayments, canCustomerPayments, isRetailer, authTick, pendingOrderCount, taxLabel]);

  const flatNavItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  const indexForPath = useCallback(
    (pathname) => {
      const path = String(pathname || "");
      let best = 0;
      let bestLen = -1;
      flatNavItems.forEach((it, i) => {
        const to = String(it.to || "");
        if (!to) return;
        if (path === to || (to !== "/" && path.startsWith(`${to}/`))) {
          if (to.length > bestLen) {
            bestLen = to.length;
            best = i;
          }
        }
      });
      return best;
    },
    [flatNavItems]
  );

  const panelLabel = variant === "admin" ? "Admin Panel" : "User Panel";
  const avatar = initialsFrom(userName || userEmail || "User");
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [kbdRingIndex, setKbdRingIndex] = useState(null);
  const kbdRingRef = useRef(null);
  kbdRingRef.current = kbdRingIndex;
  const menuRef = useRef(null);
  const navRef = useRef(null);

  // Restore previous sidebar scroll before browser paints, so users don't
  // see a jump to the top when Sidebar remounts on route change.
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    if (sidebarNavScrollCache > 0) {
      el.scrollTop = sidebarNavScrollCache;
    }
  }, []);

  // Persist scroll position while the user scrolls inside the sidebar.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const top = el.scrollTop;
        sidebarNavScrollCache = top;
        try {
          window.sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(top));
        } catch {
          // ignore storage errors
        }
        ticking = false;
      });
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (!menuOpen) return;
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  useEffect(() => {
    setKbdRingIndex(null);
  }, [location.pathname]);

  function isBlockingOverlay() {
    if (menuOpen) return true;
    if (document.querySelector(".cmRoot")) return true;
    if (document.querySelector('.udpRoot[aria-hidden="false"]')) return true;
    if (document.querySelector('[role="dialog"][aria-hidden="false"]')) return true;
    if (document.querySelector('[role="listbox"]')) return true;
    return false;
  }

  function isEditable(el) {
    if (!el) return false;
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  /**
   * Global keyboard nav for the sidebar.
   * - ↑/↓ move a highlight over flattened nav items (smooth scroll, wrap).
   * - Enter opens the highlighted item.
   * - Esc clears the highlight.
   * - ↑/↓ while a sidebar link is focused: roving focus between links.
   * Disabled when modal/drawer/popup is open, an input/select is focused,
   * or focus is inside a CommonTable row (so in-table arrow nav still works).
   */
  useEffect(() => {
    function onKeyDown(e) {
      const key = e.key;
      if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Escape") return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

      if (isBlockingOverlay()) {
        if (kbdRingRef.current !== null) setKbdRingIndex(null);
        return;
      }

      const active = document.activeElement;
      const navEl = navRef.current;

      if (active?.matches?.("a.nav-link") && navEl) {
        if (key === "ArrowDown" || key === "ArrowUp") {
          const links = [...navEl.querySelectorAll("a.nav-link[data-sb-idx]")];
          const i = links.indexOf(active);
          if (i >= 0) {
            e.preventDefault();
            e.stopPropagation();
            const next = key === "ArrowDown" ? Math.min(links.length - 1, i + 1) : Math.max(0, i - 1);
            links[next]?.focus?.();
          }
          return;
        }
      }

      if (key === "Escape") {
        if (kbdRingRef.current !== null) {
          e.preventDefault();
          setKbdRingIndex(null);
        }
        return;
      }

      if (isEditable(active)) return;
      if (active?.closest?.(".ct tbody tr")) return;

      const n = flatNavItems.length;
      if (!n) return;

      e.preventDefault();
      e.stopPropagation();
      setKbdRingIndex((prev) => {
        const start = prev !== null ? prev : indexForPath(location.pathname);
        let next = key === "ArrowDown" ? start + 1 : start - 1;
        next = ((next % n) + n) % n;
        requestAnimationFrame(() => {
          navEl?.querySelector(`a.nav-link[data-sb-idx="${next}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
        return next;
      });
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [flatNavItems.length, indexForPath, location.pathname, menuOpen]);

  useEffect(() => {
    function onKeyCapture(e) {
      if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (kbdRingIndex === null) return;
      if (isBlockingOverlay()) return;
      if (isEditable(document.activeElement)) return;

      const item = flatNavItems[kbdRingIndex];
      if (!item?.to) return;

      e.preventDefault();
      e.stopPropagation();
      setKbdRingIndex(null);
      navigate(item.to);
      onNavigate?.();
    }
    document.addEventListener("keydown", onKeyCapture, true);
    return () => document.removeEventListener("keydown", onKeyCapture, true);
  }, [flatNavItems, kbdRingIndex, menuOpen, navigate, onNavigate]);

  return (
    <>
      <div className={`overlay ${mobileOpen ? "visible" : ""}`} onClick={onCloseMobile} aria-hidden={!mobileOpen} />

      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`} aria-label={`${panelLabel} sidebar`}>
        <button className="toggle-btn" type="button" onClick={onToggleCollapse} title="Toggle sidebar" aria-label="Toggle sidebar">
          <IconCollapseChevron />
        </button>

        <div className="sidebar-logo">
          <div className="sidebar-logo-inner">
            <div className="logo-mark" aria-hidden="true">
              {/* Full logo — visible when expanded */}
              <picture className="sidebar-logo-full">
                <source srcSet="/logo.webp" type="image/webp" />
                <img src="/logo.png" alt="JedMee" className="sidebar-logo-img" />
              </picture>
              {/* Favicon icon — visible when collapsed */}
              <picture className="sidebar-logo-favicon">
                <source srcSet="/favicon-192.webp" type="image/webp" />
                <img src="/favicon-192.png" alt="JedMee" className="sidebar-logo-favicon-img" />
              </picture>
            </div>
            <div className="sidebar-logo-tagline">Pharmacy Platform</div>
          </div>
          <button className="sb-mobile-close" type="button" onClick={onCloseMobile} aria-label="Close sidebar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <nav ref={navRef} className="nav-scroll" aria-label="Primary navigation">
          {(() => {
            let sbRunning = 0;
            const prettyTitle = (t) => {
              const s = String(t || "").trim().toLowerCase();
              if (!s) return "";
              return s
                .split(/\s+/)
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ");
            };

            return sections.map((sec) => (
              <div key={sec.title} className="nav-group">
                <div className="nav-group-label">{prettyTitle(sec.title)}</div>
                {sec.items.map((it) => {
                  const sbIdx = sbRunning++;
                  const ring = kbdRingIndex === sbIdx;
                  const itemKey = String(it.to || it.label || sbIdx);

                  const snapshotScroll = () => {
                    const el = navRef.current;
                    if (!el) return;
                    const top = el.scrollTop;
                    sidebarNavScrollCache = top;
                    try {
                      window.sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(top));
                    } catch {
                      // ignore
                    }
                  };

                  return (
                    <div key={itemKey} className="nav-item">
                      <NavLink
                        to={it.to}
                        title={it.label}
                        preventScrollReset
                        data-label={it.label}
                        data-sb-idx={sbIdx}
                        className={({ isActive }) => `nav-link${isActive ? " active" : ""}${ring ? " nav-link_kbd" : ""}`}
                        onClick={() => {
                          snapshotScroll();
                          onNavigate?.();
                          setKbdRingIndex(null);
                        }}
                      >
                        <span className="nav-active-bar" />
                        <span className="nav-icon" aria-hidden="true">
                          {it.icon}
                        </span>
                        <span className="nav-label">{it.label}</span>
                        {it.badge ? (
                          <span className="nav-badge" aria-label={`${it.badge} pending`}>{it.badge}</span>
                        ) : null}
                      </NavLink>

                      {collapsed ? <span className="nav-tooltip">{it.label}</span> : null}
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card" title={userEmail || userName || "User"} ref={menuRef}>
            <div className="user-avatar" aria-hidden="true">
              {avatar}
            </div>
            <div className="user-info">
              <div className="user-name">{userName || "User"}</div>
              <div className="user-role">{String(access?.customRoleName || "").trim() || (access?.isAccountOwner ? "Owner" : "Sub user")}</div>
            </div>

            <button
              className="user-more userMoreBtn"
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <IconDots />
            </button>

            {menuOpen ? (
              <div className="userMenu" role="menu" aria-label="Sidebar account menu">
                <button
                  className="userMenuItem"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    const auth = readAuth();
                    if (auth?.email && auth?.refreshToken) {
                      logout({ email: auth.email, refreshToken: auth.refreshToken }).catch(() => {});
                    }
                    clearAuth();
                    navigate("/login", { replace: true });
                  }}
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>

      </aside>
    </>
  );
}

