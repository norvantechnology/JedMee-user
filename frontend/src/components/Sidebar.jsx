import { NavLink, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clearAuth, onAuthChanged, readAuth } from "../services/authStorage.js";
import { logout } from "../services/authService.js";
import { getPendingOrderCount } from "../services/orderService.js";
import { subscribeOrderBadgeRefresh } from "../services/orderBadgeBus.js";
import { sidebarNavScrollStorageKey } from "../constants/brand.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { useLocale } from "../context/LocaleContext.jsx";
import { buildUserSidebarSections } from "../navigation/userSidebarNav.js";
import {
  ArrowLeftRight,
  BookMarked,
  BookOpen,
  Building2,
  ClipboardList,
  CreditCard,
  Factory,
  FileClock,
  FileText,
  Landmark,
  LayoutDashboard,
  Layers,
  PackageCheck,
  Pill,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import { IconCollapseChevron, IconDots } from "./ui/AppIcons.jsx";
import "./Sidebar.css";

// Persist sidebar nav scroll position across route changes.
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

/** Icons for sidebar routes — all 18 px via CSS, contextually correct LucideIcons. */
function pickSidebarIcon(to) {
  const path = String(to || "");
  switch (path) {
    case "/dashboard":
      return <LayoutDashboard />;
    case "/quality-master":
      return <Pill />;
    case "/mfg-companies":
      return <Factory />;
    case "/divisions":
      return <Layers />;
    case "/vendors":
      return <Truck />;
    case "/customers":
      return <Users />;
    case "/order-catalog":
    case "/my-catalog":
      return <BookOpen />;
    case "/sales-billing":
      return <ReceiptText />;
    case "/purchase-invoices":
      return <ShoppingCart />;
    case "/sales-returns":
    case "/purchase-returns":
      return <ArrowLeftRight />;
    case "/my-orders":
    case "/orders":
      return <PackageCheck />;
    case "/reports/inventory":
      return <ClipboardList />;
    case "/reports/day-book":
      return <BookMarked />;
    case "/reports/gst-r1":
      return <Landmark />;
    case "/reports/gst-r2":
      return <FileText />;
    case "/reports/gst-r3b":
      return <FileClock />;
    case "/reports/ledger":
      return <ScrollText />;
    case "/division-payments":
    case "/vendor-payments":
      return <Building2 />;
    case "/customer-payments":
      return <CreditCard />;
    case "/users":
      return <UserRound />;
    case "/roles-access":
      return <ShieldCheck />;
    default:
      return <LayoutDashboard />;
  }
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
  const canUsers    = isOwner || Boolean(perms?.USERS?.VIEW);
  const canRoles    = isOwner || Boolean(perms?.ROLES?.VIEW);
  const canDivisions = !isRetailer && (isOwner || Boolean(perms?.DIVISIONS?.VIEW));
  const canVendors   = isOwner || Boolean(perms?.VENDORS?.VIEW);
  const canQuality   = isOwner || Boolean(perms?.PRODUCT_BATCHES?.VIEW);
  const canMfg       = isOwner || Boolean(perms?.MFG_COMPANIES?.VIEW);
  const canPurchase  = isOwner || Boolean(perms?.PURCHASE_INVOICES?.VIEW);
  const canCustomers = isOwner || Boolean(perms?.CUSTOMERS?.VIEW);
  const canSales     = isOwner || Boolean(perms?.SALES_INVOICES?.VIEW);
  const canSalesReturns    = isOwner || Boolean(perms?.SALES_RETURNS?.VIEW);
  const canPurchaseReturns = isOwner || Boolean(perms?.PURCHASE_RETURNS?.VIEW);
  const canDivisionPayments  = isOwner || Boolean(perms?.DIVISION_PAYMENTS?.VIEW) || Boolean(perms?.VENDOR_PAYMENTS?.VIEW);
  const canCustomerPayments  = isOwner || Boolean(perms?.CUSTOMER_PAYMENTS?.VIEW);
  const canPrescriptions = isOwner || Boolean(perms?.PRESCRIPTIONS?.VIEW);
  const canOrders    = isOwner || Boolean(perms?.PURCHASE_ORDERS?.VIEW);

  useEffect(() => {
    return onAuthChanged(() => setAuthTick((t) => t + 1));
  }, []);

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
    const model = buildUserSidebarSections({
      isOwner,
      perms,
      isRetailer,
      pendingOrderCount,
      taxLabel
    });
    return model.map((sec) => ({
      title: sec.title,
      items: sec.items.map((it) => ({
        to: it.to,
        label: it.label,
        badge: it.badge,
        fnKey: it.fnKey,
        icon: pickSidebarIcon(it.to)
      }))
    }));
  }, [isOwner, perms, isRetailer, pendingOrderCount, taxLabel, authTick, canUsers, canRoles, canDivisions, canVendors, canQuality, canMfg, canPurchase, canCustomers, canSales, canSalesReturns, canPurchaseReturns, canOrders, canPrescriptions, canDivisionPayments, canCustomerPayments]);

  const panelLabel = variant === "admin" ? "Admin Panel" : "User Panel";
  const avatar = initialsFrom(userName || userEmail || "User");
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navRef = useRef(null);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    if (sidebarNavScrollCache > 0) {
      el.scrollTop = sidebarNavScrollCache;
    }
  }, []);

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
              <picture className="sidebar-logo-full">
                <source srcSet="/logo.webp" type="image/webp" />
                <img src="/logo.png" alt="JedMee" className="sidebar-logo-img" />
              </picture>
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
          {sections.map((sec) => (
            <div key={sec.title || "__main"} className="nav-group">
              {/* Only render the label when the group has a title */}
              {sec.title ? (
                <div className="nav-group-label">{sec.title}</div>
              ) : null}
              {sec.items.map((it) => {
                const itemKey = String(it.to || it.label || sec.title);
                const shortcutHint = it.fnKey ? `F${it.fnKey}` : "";

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
                      title={shortcutHint ? `${it.label} (${shortcutHint})` : it.label}
                      preventScrollReset
                      data-label={it.label}
                      className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                      onClick={() => {
                        snapshotScroll();
                        onNavigate?.();
                      }}
                    >
                      <span className="nav-active-bar" />
                      <span className="nav-icon" aria-hidden="true">
                        {it.icon}
                      </span>
                      <span className="nav-label">{it.label}</span>
                      {!collapsed && shortcutHint ? (
                        <kbd className="navShortcutHint" aria-label={`Shortcut ${shortcutHint}`}>
                          {shortcutHint}
                        </kbd>
                      ) : null}
                      {it.badge ? (
                        <span className="nav-badge" aria-label={`${it.badge} pending`}>{it.badge}</span>
                      ) : null}
                    </NavLink>

                    {collapsed ? (
                      <span className="nav-tooltip">
                        {it.label}
                        {shortcutHint ? ` (${shortcutHint})` : ""}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
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
                    navigate("/profile");
                  }}
                >
                  Profile
                </button>
                <button
                  className="userMenuItem"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/settings");
                  }}
                >
                  Settings
                </button>
                <button
                  className="userMenuItem userMenuItem--danger"
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
