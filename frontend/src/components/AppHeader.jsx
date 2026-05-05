import ProfileDropdown from "./ProfileDropdown.jsx";
import NotificationCenter from "./NotificationCenter.jsx";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { APP_DISPLAY_NAME } from "../constants/brand.js";
import { clearAuth, readAuth } from "../services/authStorage.js";
import { logout } from "../services/authService.js";
import { ROUTE_LABELS } from "../constants/navLabels.js";
import Breadcrumbs from "./Breadcrumbs.jsx";
import { IconLogout, IconMenu, IconProfile, MessageSquare, Search, Settings } from "./ui/AppIcons.jsx";
import "./AppHeader.css";

export default function AppHeader({
  title = APP_DISPLAY_NAME,
  userName = "User",
  userRole = "User",
  onMenuClick,
  onToggleCollapse,
  collapsed
}) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const [animateOnMount] = useState(() => {
    try {
      if (typeof window === "undefined") return true;
      if (window.__medicoHdrAnimatedOnce) return false;
      window.__medicoHdrAnimatedOnce = true;
      return true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => searchRef.current?.focus?.(), 0);
    return () => clearTimeout(t);
  }, [searchOpen]);

  return (
    <header className={`hdr ${animateOnMount ? "" : "hdrNoAnim"}`}>
      <div className="hdrLeft">
        <button className="hdrToggle hdrToggleMobile" type="button" title="Open menu" aria-label="Open menu" onClick={onMenuClick}>
          <IconMenu />
        </button>
      </div>

      <div className="hdrCenter">
        <div className="hdrCrumbPill">
          <Breadcrumbs rootLabel={title || APP_DISPLAY_NAME} rootTo="/dashboard" labels={ROUTE_LABELS} />
        </div>
      </div>

      <div className="hdrRight">
        <div className="hdrSearchWrap">
          <div
            className={`hdrSearch ${searchOpen ? "open" : ""}`}
            role="search"
            onClick={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchOpen(false);
            }}
          >
            <Search aria-hidden="true" size={18} strokeWidth={2.2} />
            <input ref={searchRef} type="text" placeholder="Search invoices, products, customers…" onBlur={() => setSearchOpen(false)} />
            <span className="hdrShortcut">⌘K</span>
          </div>
        </div>

        <div className="hdrIconGroup" aria-label="Header actions">
          <NotificationCenter />
          <button className="hdrIconBtn" type="button" title="Messages" aria-label="Messages">
            <MessageSquare aria-hidden="true" size={18} strokeWidth={2.1} />
          </button>
          <button className="hdrIconBtn" type="button" title="Settings" aria-label="Settings">
            <Settings aria-hidden="true" size={18} strokeWidth={2.1} />
          </button>
        </div>

        <div className="hdrProfile">
          <ProfileDropdown
            userName={userName || "User"}
            userRole={userRole || "User"}
            userEmail={readAuth()?.user?.email || readAuth()?.email || ""}
            roleChipText={String(userRole || "").toUpperCase()}
            footerVersionText={"v1 · User Panel"}
            menuItems={[
              {
                key: "profile",
                icon: <IconProfile />,
                label: "Profile settings",
                desc: "Edit your details & documents",
                onClick: () => navigate("/profile")
              },
              { key: "div1", type: "divider" },
              {
                key: "logout",
                icon: <IconLogout />,
                label: "Log out",
                danger: true,
                onClick: () => {
                  const auth = readAuth();
                  if (auth?.email && auth?.refreshToken) {
                    logout({ email: auth.email, refreshToken: auth.refreshToken }).catch(() => {});
                  }
                  clearAuth();
                  navigate("/login", { replace: true });
                }
              }
            ]}
          />
        </div>
      </div>
    </header>
  );
}

