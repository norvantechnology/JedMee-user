import { useEffect, useId, useMemo, useRef, useState } from "react";
import "./ProfileDropdown.css";
import { IconChevronRight, IconX } from "./ui/AppIcons.jsx";

/* ── helpers ── */
function initialsFrom(nameOrEmail, fallback = "US") {
  const s = String(nameOrEmail || fallback).trim();
  if (!s) return fallback;
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase() || fallback;
  return s.slice(0, 2).toUpperCase();
}

function inferTone({ label, danger }) {
  if (danger) return "danger";
  const s = String(label || "").toLowerCase();
  if (s.includes("profile") || s.includes("account") || s.includes("setting")) return "teal";
  if (s.includes("notif") || s.includes("alert"))                               return "amber";
  if (s.includes("bill") || s.includes("plan") || s.includes("invoice"))        return "violet";
  return "teal";
}

/* Small inline icon for the role badge */
function LayersIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  );
}

/* ════════════════════════════════════════
   ProfileDropdown
   Props:
     userName          string
     userRole          string
     userEmail         string
     roleChipText      string           badge label
     menuItems         array            { key, label, desc, icon, danger, onClick } | { type:"divider", key }
     footerVersionText string
     footerActionLabel string
     onFooterAction    () => void
     stats             [{ key, value }]   up to 3
     initialsFallback  string
   ════════════════════════════════════════ */
export default function ProfileDropdown({
  userName,
  userRole,
  userEmail,
  roleChipText,
  menuItems = [],
  footerVersionText,
  footerActionLabel,
  onFooterAction,
  stats,
  initialsFallback = "US",
}) {
  const menuId   = useId();
  const initials = useMemo(
    () => initialsFrom(userName || userEmail, initialsFallback),
    [userName, userEmail, initialsFallback]
  );

  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  /* Close on outside click / Escape */
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown",   onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown",   onKey);
    };
  }, [open]);

  return (
    <div
      className={`pd-root${open ? " pd-root--open" : ""}`}
      ref={wrapRef}
    >
      {/* ── Trigger ── */}
      <button
        className="pd-trigger"
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pd-trigger-avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="pd-trigger-info">
          <span className="pd-trigger-name">{userName || "User"}</span>
          <span className="pd-trigger-role">{userRole  || "Member"}</span>
        </span>
        <span className="pd-trigger-chevron" aria-hidden="true">
          <span className="pd-trigger-chevronGlyph">
            <IconChevronRight />
          </span>
        </span>
      </button>

      {/* ── Panel ── */}
      <div
        id={menuId}
        className="pd-panel"
        role="menu"
        aria-label="Account menu"
        aria-hidden={open ? undefined : true}
      >
        {/* Glow orbs */}
        <div className="pd-glow pd-glow--a" aria-hidden="true" />
        <div className="pd-glow pd-glow--b" aria-hidden="true" />

        {/* ── Hero ── */}
        <div className="pd-hero">
          <div className="pd-hero-avatar-wrap" aria-hidden="true">
            <div className="pd-hero-avatar">{initials}</div>
            <span className="pd-hero-avatar-ring" />
            <span className="pd-status-dot" title="Online" />
          </div>

          <div className="pd-hero-meta">
            <p className="pd-hero-eyebrow">
              <span className="pd-hero-eyebrowDot" aria-hidden="true" />
              Signed in
            </p>
            <h3 className="pd-hero-name" title={userName || "User"}>
              {userName || "User"}
            </h3>
            <p className="pd-hero-email" title={userEmail || undefined}>
              {userEmail || ""}
            </p>
            {roleChipText && (
              <span className="pd-hero-badge">
                <LayersIcon />
                {roleChipText}
              </span>
            )}
          </div>

          <button
            className="pd-hero-close"
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <IconX />
          </button>
        </div>

        {/* ── Menu ── */}
        <div className="pd-actions" role="none">
          <p className="pd-actions-label">Quick Actions</p>
          <nav className="pd-nav" aria-label="Account links">
            {menuItems.map((it, idx) => {
              if (it?.type === "divider")
                return (
                  <div
                    key={it.key ?? `div-${idx}`}
                    className="pd-rule"
                    role="separator"
                  />
                );

              const tone = inferTone({ label: it?.label, danger: Boolean(it?.danger) });

              return (
                <button
                  key={it.key ?? idx}
                  type="button"
                  className={`pd-item${it?.danger ? " pd-item--danger" : ""}`}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    it?.onClick?.();
                  }}
                >
                  <span
                    className={`pd-item-icon pd-item-icon--${tone}`}
                    aria-hidden="true"
                  >
                    {it?.icon}
                  </span>
                  <span className="pd-item-body">
                    <span className="pd-item-label">{it?.label}</span>
                    {it?.desc && (
                      <span className="pd-item-desc">{it.desc}</span>
                    )}
                  </span>
                  <span className="pd-item-arrow" aria-hidden="true">
                    <IconChevronRight />
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* ── Dock / footer ── */}
        {(footerVersionText || (footerActionLabel && onFooterAction)) && (
          <div className="pd-dock">
            <span className="pd-dock-ver">{footerVersionText || ""}</span>
            {footerActionLabel && onFooterAction && (
              <button
                type="button"
                className="pd-dock-linkBtn"
                onClick={() => {
                  setOpen(false);
                  onFooterAction();
                }}
              >
                {footerActionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}