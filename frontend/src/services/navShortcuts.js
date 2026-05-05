import { can } from "../utils/access.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import { readAuth } from "./authStorage.js";
import { isRetailerAuth } from "../utils/businessRole.js";

function isTypingTarget(el) {
  const tag = String(el?.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el?.isContentEditable) return true;
  return false;
}

function isBlockingOverlayOpen() {
  // CommonModal root (only exists when open)
  if (document.querySelector(".cmRoot")) return true;
  // UserDetailPanel drawer stays mounted; check aria-hidden
  if (document.querySelector('.udpRoot[aria-hidden="false"]')) return true;
  return false;
}

export function getNavShortcutTargets() {
  // Order matches sidebar. Only include routes the user can view.
  const auth = readAuth();
  const isRetailer = isRetailerAuth(auth);
  const items = [{ key: "h", to: "/dashboard", label: NAV_LABELS.dashboard }];
  items.push({ key: "k", to: "/profile", label: NAV_LABELS.profile });
  if (can("USERS", "VIEW")) items.push({ key: "u", to: "/users", label: NAV_LABELS.users });
  if (can("DIVISIONS", "VIEW") || can("VENDORS", "VIEW")) items.push({ key: "d", to: "/divisions", label: NAV_LABELS.divisions });
  if (can("MFG_COMPANIES", "VIEW")) items.push({ key: "m", to: "/mfg-companies", label: NAV_LABELS.mfgCompanies });
  if (can("PRODUCT_BATCHES", "VIEW")) items.push({ key: "q", to: "/quality-master", label: NAV_LABELS.qualityMaster });
  if (can("CUSTOMERS", "VIEW")) items.push({ key: "c", to: "/customers", label: NAV_LABELS.customers });
  if (can("PURCHASE_INVOICES", "VIEW")) items.push({ key: "i", to: "/purchase-invoices", label: NAV_LABELS.purchaseInvoices });
  if (can("SALES_INVOICES", "VIEW")) items.push({ key: "b", to: "/sales-billing", label: NAV_LABELS.salesBilling });
  if (can("SALES_RETURNS", "VIEW")) items.push({ key: "s", to: "/sales-returns", label: NAV_LABELS.salesReturns });
  if (can("PURCHASE_ORDERS", "VIEW")) {
    items.push({ key: "l", to: isRetailer ? "/order-catalog" : "/my-catalog", label: isRetailer ? NAV_LABELS.orderCatalog : NAV_LABELS.myCatalog });
    items.push({ key: "o", to: isRetailer ? "/my-orders" : "/orders", label: isRetailer ? NAV_LABELS.myOrders : NAV_LABELS.orders });
  }
  if (can("DIVISION_PAYMENTS", "VIEW") || can("VENDOR_PAYMENTS", "VIEW")) items.push({ key: "p", to: "/division-payments", label: NAV_LABELS.divisionPayments });
  if (can("CUSTOMER_PAYMENTS", "VIEW")) items.push({ key: "y", to: "/customer-payments", label: NAV_LABELS.customerPayments });
  if (can("ROLES", "VIEW")) items.push({ key: "r", to: "/roles-access", label: NAV_LABELS.rolesAccess });
  return items;
}

export function installNavShortcuts(navigate) {
  function onKeyDown(e) {
    // Alt+<letter> navigation (works on Windows/Linux). Skip if typing.
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (isTypingTarget(e.target)) return;
    if (isBlockingOverlayOpen()) return;
    const k = String(e.key || "").trim().toLowerCase();
    const targets = getNavShortcutTargets();
    const hit = targets.find((t) => t.key === k);
    if (!hit) return;
    e.preventDefault();
    navigate(hit.to, { preventScrollReset: true });
  }

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}

