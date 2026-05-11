import { readAuth } from "./authStorage.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { getSidebarFlatNavRoutes } from "../navigation/userSidebarNav.js";

const MAX_FN = 24;

function isTypingTarget(el) {
  const tag = String(el?.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el?.isContentEditable) return true;
  return false;
}

function isBlockingOverlayOpen() {
  if (document.querySelector(".cmRoot, .mcm")) return true;
  if (document.querySelector('.udpRoot[aria-hidden="false"]')) return true;
  return false;
}

function sidebarNavContextFromAuth() {
  const auth = readAuth();
  const access = auth?.access || null;
  const perms = access?.permissions || {};
  const isOwner = Boolean(access?.isAccountOwner);
  const isRetailer = isRetailerAuth(auth);
  const pendingOrderCount = 0;
  const taxLabel = "GST";
  return { isOwner, perms, isRetailer, pendingOrderCount, taxLabel };
}

/** @returns {number | null} 1-based F-key index from `e.key` (e.g. F1 → 1). */
function parseFunctionKeyIndex(e) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const k = String(e.key || "");
  const m = /^F(\d+)$/i.exec(k);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1 || n > MAX_FN) return null;
  return n;
}

/**
 * Global F1…F24: jump to Nth visible sidebar destination (same order as Sidebar).
 */
export function installNavShortcuts(navigate) {
  function onKeyDown(e) {
    const n = parseFunctionKeyIndex(e);
    if (!n) return;
    if (isTypingTarget(e.target)) return;
    if (isBlockingOverlayOpen()) return;

    const ctx = sidebarNavContextFromAuth();
    const routes = getSidebarFlatNavRoutes(ctx);
    const to = routes[n - 1];
    if (!to) return;
    e.preventDefault();
    e.stopPropagation();
    navigate(to, { preventScrollReset: true });
  }

  document.addEventListener("keydown", onKeyDown, true);
  return () => document.removeEventListener("keydown", onKeyDown, true);
}
