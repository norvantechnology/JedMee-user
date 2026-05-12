import { useEffect, useMemo, useState } from "react";
import AppHeader from "../components/AppHeader.jsx";
import AnnouncementBar from "../components/AnnouncementBar.jsx";
import Sidebar from "../components/Sidebar.jsx";
import { APP_DISPLAY_NAME, sidebarCollapsedStorageKey } from "../constants/brand.js";
import { onAuthChanged, readAuth } from "../services/authStorage.js";
import { installNavShortcuts } from "../services/navShortcuts.js";
import { useLocation, useNavigate } from "react-router-dom";
import "./AppShell.css";

function readBool(key, fallback) {
  try {
    const v = window.localStorage.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    // ignore
  }
  return fallback;
}

function writeBool(key, val) {
  try {
    window.localStorage.setItem(key, val ? "1" : "0");
  } catch {
    // ignore
  }
}

export default function AppShell({
  title = APP_DISPLAY_NAME,
  userName,
  userEmail,
  userBusinessName,
  userGstNumber,
  children,
  variant = "user"
}) {
  const collapseKey = useMemo(() => sidebarCollapsedStorageKey(variant), [variant]);
  const [collapsed, setCollapsed] = useState(() => readBool(collapseKey, false));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authTick, setAuthTick] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => writeBool(collapseKey, collapsed), [collapseKey, collapsed]);

  useEffect(() => {
    return onAuthChanged(() => setAuthTick((t) => t + 1));
  }, []);

  useEffect(() => {
    // Re-install when auth/access changes so permission-based targets stay correct.
    return installNavShortcuts(navigate);
  }, [navigate, authTick]);

  // Safety: never keep the mobile overlay open after navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile sidebar is open; restore on close/navigation.
  useEffect(() => {
    try {
      if (mobileOpen) {
        document.body.classList.add("sidebar-mobile-open");
      } else {
        document.body.classList.remove("sidebar-mobile-open");
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
        document.body.style.position = "";
        document.body.style.width = "";
      }
    } catch {
      // ignore
    }
    return () => {
      try {
        document.body.classList.remove("sidebar-mobile-open");
      } catch {
        // ignore
      }
    };
  }, [mobileOpen]);

  // Safety: always restore scroll on navigation.
  useEffect(() => {
    try {
      document.body.classList.remove("sidebar-mobile-open");
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    } catch {
      // ignore
    }
  }, [location.pathname]);

  const userRoleLabel = useMemo(() => {
    // eslint-disable-next-line no-unused-vars
    const _ = authTick;
    const auth = readAuth();
    const u = auth?.user || null;
    const access = auth?.access || null;

    const sysRoleRaw = String(u?.role || "").trim();
    const sysRolePretty = sysRoleRaw ? sysRoleRaw.charAt(0) + sysRoleRaw.slice(1).toLowerCase() : "";

    if (access?.isAccountOwner) return sysRolePretty || "Owner";
    return String(access?.customRoleName || "").trim() || "Sub user";
  }, [authTick]);

  return (
    <div className={`appShell2 ${collapsed ? "appShell2_collapsed" : ""}`}>
      <Sidebar
        variant={variant}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onOpenMobile={() => setMobileOpen(true)}
        onCloseMobile={() => setMobileOpen(false)}
        onNavigate={() => setMobileOpen(false)}
        userName={userName || "User"}
        userEmail={userEmail || ""}
        businessName={userBusinessName || ""}
        gstNumber={userGstNumber || ""}
      />

      <div className="appShell2Main">
        <AppHeader
          title={title}
          userName={userName}
          userRole={userRoleLabel}
          onMenuClick={() => setMobileOpen(true)}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          collapsed={collapsed}
        />
        <AnnouncementBar />
        <div className="appShell2Content" data-app-main="true">
          {children}
        </div>
      </div>
    </div>
  );
}

