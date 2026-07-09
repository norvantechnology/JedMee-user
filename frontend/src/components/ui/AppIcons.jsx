import React from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  AlertTriangle,
  Bell,
  Ban,
  BarChart3,
  BadgeIndianRupee,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsDown,
  ChevronsUp,
  Check,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Keyboard,
  Layers,
  Layers3,
  LayoutGrid,
  Loader2,
  MessageSquare,
  Package2,
  Phone,
  Pencil,
  Printer,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Truck,
  Upload,
  Users,
  UsersRound,
  WalletCards,
  XCircle,
  Zap,
  Flag,
  BadgeCheck,
  Banknote,
  ClipboardList,
  BookOpenText,
  PencilRuler,
  Store,
  Pill,
  Folder,
  MapPin,
  Building2,
  Mail,
  Lock,
} from "lucide-react";

// ── Re-export frequently used lucide icons (direct passthrough) ──────────────
export {
  LayoutGrid, Package2, Building2, Truck, UsersRound, ClipboardList,
  WalletCards, RotateCcw, ShieldCheck, BarChart3, BadgeIndianRupee,
  CreditCard, Users, Upload, Download, ChevronLeft, ChevronDown, Search, Calendar,
  ChevronRight, MessageSquare, Settings, FileSpreadsheet, Loader2,
  Keyboard, Layers, Trash2, Flag, Store, BadgeCheck, Lock,
  // Additional icons for transaction/report pages
  Phone, MapPin, Check, Zap, Printer, AlertTriangle, FileText, Mail,
  Eye, Pencil, BookOpenText, TrendingUp, Banknote,
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH PAGE ICONS
// pages/AuthPage.jsx, pages/ForgotPasswordPage.jsx, pages/VerifyOtpPage.jsx,
// pages/ForceChangePasswordPage.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconAuthMail  email input leading icon (auth pages).
 * 3D envelope with fold shadow line and depth illusion.
 */
export function IconAuthMail(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" />
      <path d="M3 6l9 7 9-7" strokeWidth="2.1" />
      <path d="M4.5 5.5h15" strokeWidth="0.8" strokeOpacity="0.25" />
      <path d="M3 17l6-5" strokeWidth="1" strokeOpacity="0.3" />
      <path d="M21 17l-6-5" strokeWidth="1" strokeOpacity="0.3" />
    </svg>
  );
}

/**
 * IconAuthLock  password/OTP leading icon (auth pages).
 * 3D padlock with shackle arc, body depth, and keyhole detail.
 */
export function IconAuthLock(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" strokeWidth="0" />
      <line x1="12" y1="17.5" x2="12" y2="19" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 11.5h14" strokeWidth="0.7" strokeOpacity="0.22" />
    </svg>
  );
}

/**
 * IconAuthEye  password visibility toggle icon (auth pages).
 * Refined eye with iris depth ring and lash detail.
 */
export function IconAuthEye(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M2.5 12C4.5 7.5 8 5 12 5s7.5 2.5 9.5 7c-2 4.5-5.5 7-9.5 7s-7.5-2.5-9.5-7z" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" strokeWidth="0" />
      <path d="M10 10.5a2.5 2.5 0 0 1 2.8-.5" strokeWidth="0.9" strokeOpacity="0.3" />
    </svg>
  );
}

/**
 * IconAuthBack  back navigation icon (auth flows).
 * Arrow with subtle tail depth.
 */
export function IconAuthBack(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M19 12H5" />
      <path d="M10 7l-5 5 5 5" />
      <path d="M19 9v6" strokeWidth="0.7" strokeOpacity="0.25" />
    </svg>
  );
}

/**
 * IconAuthCheck  success/check mark (auth flows success state).
 * Animated-feel checkmark inside a soft circle ring.
 */
export function IconAuthCheck(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="9.5" strokeWidth="1.5" strokeOpacity="0.3" />
      <path d="M7.5 12.5l3 3 6-7" strokeWidth="2.4" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER / CATALOG ICONS
// components/orders/OrderPlaceWizardModal.jsx
// components/orders/OrderCatalogProductDetailsModal.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconPill  product/medicine glyph for order/catalog UI.
 * 3D capsule with halved color body and specular highlight arc.
 */
export function IconPill(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="3" y="9.5" width="18" height="5" rx="2.5" />
      <line x1="12" y1="9.5" x2="12" y2="14.5" strokeWidth="1.8" />
      <path d="M4.5 11a2 2 0 0 1 3.5 0" strokeWidth="0.9" strokeOpacity="0.3" />
      <path d="M4 13.5h16" strokeWidth="0.7" strokeOpacity="0.2" />
      <path d="M15 10.5a2 2 0 0 1 3.5 0" strokeWidth="0.9" strokeOpacity="0.3" />
    </svg>
  );
}

/**
 * IconStore  wholesaler/store glyph in catalog details.
 * 3D storefront with awning depth, door, and window reflections.
 * Used in: `components/orders/OrderCatalogProductDetailsModal.jsx` (Wholesaler Details header).
 */
export function IconStore(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M3 9.5l1.5-5h15l1.5 5" />
      <path d="M3 9.5h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" strokeWidth="1.7" />
      <rect x="9" y="14" width="6" height="7" rx="0.8" strokeWidth="1.5" />
      <path d="M5 9.5v1.8" strokeWidth="0.8" strokeOpacity="0.3" />
      <path d="M19 9.5v1.8" strokeWidth="0.8" strokeOpacity="0.3" />
    </svg>
  );
}

/**
 * IconChevronsUp  "min" quantity indicator icon.
 * Used in: OrderCatalogProductDetailsModal.jsx (Minimum Order Qty).
 */
export function IconChevronsUp(p) {
  return <ChevronsUp aria-hidden="true" size={16} strokeWidth={2.2} {...p} />;
}

/**
 * IconChevronsDown  "max" quantity indicator icon.
 * Used in: OrderCatalogProductDetailsModal.jsx (Maximum Order Qty).
 */
export function IconChevronsDown(p) {
  return <ChevronsDown aria-hidden="true" size={16} strokeWidth={2.2} {...p} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER MASTER MODAL
// components/CommonModal.jsx (customer form)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconCustomerMark  header icon for Customer master modal.
 * 3D user silhouette with layered depth ring and secondary profile ghost.
 */
export function IconCustomerMark(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <ellipse cx="12" cy="21.5" rx="7.5" ry="1.2" strokeWidth="1" strokeOpacity="0.15" />
      <circle cx="12" cy="8" r="4" />
      <path d="M10.2 6.5a2.8 2.8 0 0 1 3.2 0" strokeWidth="0.9" strokeOpacity="0.3" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
      <path d="M17.5 11.5a3 3 0 0 1 3.5 4.5" strokeWidth="1.3" strokeOpacity="0.45" />
    </svg>
  );
}

/**
 * IconChevronMini  small chevron for inline show/hide toggles.
 * Used in: CommonModal.jsx customer form (retailer compliance toggle).
 */
export function IconChevronMini(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIVISION MASTER MODAL
// components/DivisionMasterModal.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconDivisionMark  header icon for Division master modal.
 * 3D hexagonal prism with inner edge lines and depth faces.
 */
export function IconDivisionMark(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M12 3.2L4.2 7.6v8.8l7.8 4.4 7.8-4.4V7.6L12 3.2z" />
      <path d="M12 3.2v18.6" strokeWidth="1" strokeOpacity="0.45" />
      <path d="M4.2 7.6L12 12l7.8-4.4" strokeWidth="1" strokeOpacity="0.45" />
      <path d="M8 14.5h8" strokeWidth="1.4" strokeOpacity="0.55" />
      <path d="M7 10.5l5 2.8 5-2.8" strokeWidth="0.8" strokeOpacity="0.3" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADING COMPONENT
// components/CommonLoading.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconLoadingRing  page loader ring SVG (track + animated arc).
 * Used in: CommonLoading.jsx variant="page".
 * CSS classes cl__track and cl__arc must exist in global stylesheet.
 */
export function IconLoadingRing(p) {
  return (
    <svg viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...p}>
      <circle className="cl__track" cx="26" cy="26" r="22" />
      <circle className="cl__arc" cx="26" cy="26" r="22" transform="rotate(-90 26 26)" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUFACTURER MASTER MODAL
// components/MfgCompanyMasterModal.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconMfgMark  header icon for Manufacturer (MFG company) master modal.
 * Premium 3D factory with smokestack, elevated roof line, and floor shadow.
 */
export function IconMfgMark(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <ellipse cx="12" cy="21.5" rx="9" ry="0.9" strokeWidth="0.9" strokeOpacity="0.15" />
      <path d="M4.5 21V10l7.5-4.2L19.5 10v11" />
      <rect x="7.5" y="14.5" width="9" height="6.5" rx="0.8" strokeWidth="1.6" />
      <rect x="15.5" y="5.2" width="3" height="4.8" rx="0.6" strokeWidth="1.4" />
      <line x1="16" y1="6" x2="18" y2="6" strokeWidth="0.9" strokeOpacity="0.3" />
      <line x1="10" y1="10.5" x2="14" y2="10.5" strokeWidth="1.3" strokeOpacity="0.55" />
      <rect x="9.2" y="14.8" width="2.2" height="2.2" rx="0.4" strokeWidth="1.3" />
      <rect x="12.6" y="14.8" width="2.2" height="2.2" rx="0.4" strokeWidth="1.3" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT MASTER MODAL
// components/ProductMasterModal.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconProductMark  header icon for Product master modal.
 * 3D shield-capsule hybrid with inner cross (+) indicating medicine product.
 */
export function IconProductMark(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M12 3l8.5 4.8v5.5c0 4.5-3.3 8.5-8.5 9.7C6.8 21.8 3.5 17.8 3.5 13.3V7.8L12 3z" />
      <path d="M12 5.5l6.5 3.7v4.1c0 3.4-2.5 6.4-6.5 7.3-4-.9-6.5-3.9-6.5-7.3V9.2L12 5.5z"
        strokeWidth="0.8" strokeOpacity="0.22" />
      <line x1="12" y1="9" x2="12" y2="15.5" strokeWidth="1.9" />
      <line x1="8.8" y1="12.2" x2="15.2" y2="12.2" strokeWidth="1.9" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SETTINGS PAGE
// pages/ProfileSettingsPage.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconPsPencil  avatar edit pencil button.
 */
export function IconPsPencil(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M15.5 4.5l4 4L7 21H3v-4L15.5 4.5z" />
      <path d="M13.5 6.5l4 4" strokeWidth="1" strokeOpacity="0.35" />
      <path d="M3 17l4 0" strokeWidth="1" strokeOpacity="0.35" />
    </svg>
  );
}

/**
 * IconPsUser  user silhouette icon (badges/section icons/input leading icons).
 */
export function IconPsUser(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
      <path d="M10.3 6.5a2.7 2.7 0 0 1 3 0" strokeWidth="0.9" strokeOpacity="0.3" />
    </svg>
  );
}

/**
 * IconPsMail  email badge and email input icon.
 */
export function IconPsMail(p) {
  return <IconAuthMail {...p} />;
}

/**
 * IconPsCheck  account status pill checkmark.
 */
export function IconPsCheck(p) {
  return <IconAuthCheck {...p} />;
}

/**
 * IconPsBell  "Notifications" ghost button.
 * 3D bell with clapper dot and depth shadow base arc.
 */
export function IconPsBell(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M6 10.5a6 6 0 0 1 12 0v4l1.5 2.5H4.5L6 14.5v-4z" />
      <path d="M10 17.5a2 2 0 0 0 4 0" />
      <path d="M12 4.5V3" />
      <path d="M5.5 14.5h13" strokeWidth="0.8" strokeOpacity="0.22" />
    </svg>
  );
}

/**
 * IconPsSettings  "Preferences" ghost button gear icon.
 * Precision gear with bolt hole and inner ring depth.
 */
export function IconPsSettings(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        strokeWidth="2" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" strokeWidth="0" opacity="0.4" />
    </svg>
  );
}

/**
 * IconPsChevronDown  section collapse/expand chevron.
 */
export function IconPsChevronDown(p) {
  return <ChevronDown aria-hidden="true" size={18} strokeWidth={2.6} {...p} />;
}

/**
 * IconPsPhone  phone input leading icon.
 */
export function IconPsPhone(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M6.5 3.5l2.4 4a1 1 0 0 1-.2 1.3L7.4 10a12.5 12.5 0 0 0 6.6 6.6l1.2-1.3a1 1 0 0 1 1.3-.2l4 2.4a1 1 0 0 1 .4 1.4C20 20.9 18.1 22 16 22 9.4 22 2 14.6 2 8c0-2.1 1.1-4 2.1-4.9a1 1 0 0 1 1.4.4z" />
      <path d="M14.5 4.5a5.5 5.5 0 0 1 5 5" strokeWidth="1.3" strokeOpacity="0.45" />
    </svg>
  );
}

/**
 * IconPsBuilding  Business section icon.
 * 3D office tower with window grid.
 */
export function IconPsBuilding(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16" />
      <path d="M2 21h20" strokeWidth="1.8" />
      <rect x="8" y="7" width="2.5" height="2.5" rx="0.4" strokeWidth="1.3" />
      <rect x="13.5" y="7" width="2.5" height="2.5" rx="0.4" strokeWidth="1.3" />
      <rect x="8" y="12" width="2.5" height="2.5" rx="0.4" strokeWidth="1.3" />
      <rect x="13.5" y="12" width="2.5" height="2.5" rx="0.4" strokeWidth="1.3" />
      <rect x="10" y="17" width="4" height="4" rx="0.4" strokeWidth="1.4" />
    </svg>
  );
}

/**
 * IconPsCalendar  GST field icon / date-related identifier.
 */
export function IconPsCalendar(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18" strokeWidth="1.8" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
      <circle cx="8" cy="13" r="1" fill="currentColor" strokeWidth="0" />
      <circle cx="12" cy="13" r="1" fill="currentColor" strokeWidth="0" />
      <circle cx="16" cy="13" r="1" fill="currentColor" strokeWidth="0" />
      <circle cx="8" cy="17" r="1" fill="currentColor" strokeWidth="0" />
      <circle cx="12" cy="17" r="1" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * IconPsFileText  Drug license number field icon.
 */
export function IconPsFileText(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M6 2.8h9l4 4V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2z" />
      <path d="M15 2.8v4h4" strokeWidth="1.3" strokeOpacity="0.4" />
      <line x1="8" y1="10" x2="16" y2="10" strokeWidth="1.5" />
      <line x1="8" y1="13.5" x2="16" y2="13.5" strokeWidth="1.5" />
      <line x1="8" y1="17" x2="12" y2="17" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * IconPsFolder  Documents section icon.
 * 3D folder with open-tab depth and shadow floor.
 */
export function IconPsFolder(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M3 9.5h18" strokeWidth="0.9" strokeOpacity="0.25" />
      <line x1="8" y1="14" x2="16" y2="14" strokeWidth="1.3" strokeOpacity="0.5" />
      <line x1="8" y1="17" x2="13" y2="17" strokeWidth="1.3" strokeOpacity="0.5" />
    </svg>
  );
}

/**
 * IconPsMapPin  Address section pin.
 * 3D teardrop pin with inner highlight dot and depth base.
 */
export function IconPsMapPin(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M12 2C8.7 2 6 4.7 6 8c0 5 6 13 6 13s6-8 6-13c0-3.3-2.7-6-6-6z" />
      <circle cx="12" cy="8" r="2.2" />
      <path d="M10.5 7a1.8 1.8 0 0 1 2.2 0" strokeWidth="0.9" strokeOpacity="0.3" />
      <ellipse cx="12" cy="21" rx="3.5" ry="0.8" strokeWidth="0.8" strokeOpacity="0.2" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT-SUPPLIER REPORT PAGE
// pages/ProductSupplierReportPage.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconPsrPackage  product↔supplier report header icon.
 * 3D isometric open box with depth faces and lid.
 */
export function IconPsrPackage(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M3 10l9 5 9-5" />
      <path d="M3 10v9l9 5 9-5v-9" />
      <path d="M3 10l9-5 9 5" strokeOpacity="0.4" strokeWidth="1.4" />
      <line x1="12" y1="5" x2="12" y2="15" strokeWidth="1" strokeOpacity="0.3" />
      <path d="M7 7.5l3-1.5" strokeWidth="1.2" strokeOpacity="0.4" />
      <path d="M17 7.5l-3-1.5" strokeWidth="1.2" strokeOpacity="0.4" />
    </svg>
  );
}

/**
 * IconPsrGrid  "Total products" stat icon.
 */
export function IconPsrGrid(p) {
  return <LayoutGrid aria-hidden="true" size={18} strokeWidth={2.1} {...p} />;
}

/**
 * IconPsrSuppliers  "Active suppliers" stat icon.
 */
export function IconPsrSuppliers(p) {
  return <UsersRound aria-hidden="true" size={18} strokeWidth={2.1} {...p} />;
}

/**
 * IconPsrOutOfStock  "Out of stock" stat icon.
 */
export function IconPsrOutOfStock(p) {
  return <XCircle aria-hidden="true" size={18} strokeWidth={2.2} {...p} />;
}

/**
 * IconPsrSearch  report search bar icon.
 */
export function IconPsrSearch(p) {
  return <Search aria-hidden="true" size={18} strokeWidth={2.2} {...p} />;
}

/**
 * IconPsrChevronDown  "Load more results" dropdown chevron.
 */
export function IconPsrChevronDown(p) {
  return <ChevronDown aria-hidden="true" size={14} strokeWidth={2.2} {...p} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// pages/DashboardPage.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconDashZap  "Quick Actions" card title lightning.
 * 3D bolt with perspective tail line.
 */
export function IconDashZap(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M13 2L4.5 13.5h7L9 22l10.5-12H12.5L13 2z" />
      <path d="M5.5 13.5l1-1.5" strokeWidth="0.8" strokeOpacity="0.3" />
    </svg>
  );
}

/**
 * DashTrendChartSvg  SVG stage for Dashboard "Sales Trend" line chart.
 */
export function DashTrendChartSvg({ children, className = "chart-svg", ...p }) {
  return (
    <svg className={className} viewBox="0 0 600 200" preserveAspectRatio="none" {...p}>
      {children}
    </svg>
  );
}

/**
 * DashWeekLineChartSvg  SVG stage for Dashboard weekly line chart (LINE mode).
 */
export function DashWeekLineChartSvg({ children, className = "chart-svg", ...p }) {
  return (
    <svg className={className} viewBox="0 0 600 160" preserveAspectRatio="none" {...p}>
      {children}
    </svg>
  );
}

/**
 * DashDonutChartSvg  SVG stage for Dashboard donut/arc chart (DONUT mode).
 */
export function DashDonutChartSvg({ children, className = "donut-svg", ...p }) {
  return (
    <svg className={className} viewBox="0 0 120 120" {...p}>
      {children}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE ACTION ICONS (used via TableActionKit / CommonTable row actions)
// ─────────────────────────────────────────────────────────────────────────────
const ACTION_PROPS = { size: 22, strokeWidth: 2.1, "aria-hidden": true, focusable: "false" };

/**
 * IconView  "View / Details" row action.
 * 3D eye with iris depth and lash highlights.
 */
export function IconView() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <path d="M2.5 12C4.5 7.5 8 5 12 5s7.5 2.5 9.5 7c-2 4.5-5.5 7-9.5 7s-7.5-2.5-9.5-7z" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" strokeWidth="0" />
      <path d="M10 10.5a2.5 2.5 0 0 1 2.8-.5" strokeWidth="0.9" strokeOpacity="0.3" />
    </svg>
  );
}

/**
 * IconEdit  "Edit" row action / master edit CTA.
 * Precision pencil with ruled line and eraser base.
 */
export function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <path d="M15.5 4.5l4 4L7 21H3v-4L15.5 4.5z" />
      <path d="M13.5 6.5l4 4" strokeWidth="1" strokeOpacity="0.35" />
      <path d="M3 19.5h3.5" strokeWidth="1" strokeOpacity="0.35" />
    </svg>
  );
}

/**
 * IconConfirm  "Confirm / Approve / Verified" action.
 * Shield with checkmark  stronger than a plain checkmark for approval flows.
 */
export function IconConfirm() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <path d="M12 2.5l8 4.5v6c0 4.5-3.2 8.5-8 9.8-4.8-1.3-8-5.3-8-9.8V7l8-4.5z" />
      <path d="M8.5 12.5l2.5 2.5 5-5" strokeWidth="2" />
    </svg>
  );
}

/**
 * IconCancel  "Cancel / Reject / Dismiss" destructive action.
 * Circle X with depth notch.
 */
export function IconCancel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" strokeWidth="2.1" />
      <circle cx="12" cy="12" r="9" strokeOpacity="0.2" strokeWidth="0.8" transform="scale(0.88) translate(1.4 1.4)" />
    </svg>
  );
}

/**
 * IconReturn  "Return / Reverse stock" action.
 * Circular reverse arrow wrapping a box corner.
 */
export function IconReturn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <path d="M5 8h9a6 6 0 0 1 0 12H8" />
      <path d="M5 8l3-3M5 8l3 3" />
    </svg>
  );
}

/**
 * IconPayment  "Record / Capture Payment" action.
 * Banknote with fold lines and currency symbol.
 */
export function IconPayment() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <rect x="2" y="6.5" width="20" height="11" rx="2" />
      <path d="M2 9.5h20" strokeWidth="1" strokeOpacity="0.3" />
      <path d="M2 15h20" strokeWidth="1" strokeOpacity="0.3" />
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="5" cy="12" r="1.2" strokeWidth="1.4" strokeOpacity="0.5" />
      <circle cx="19" cy="12" r="1.2" strokeWidth="1.4" strokeOpacity="0.5" />
    </svg>
  );
}

/**
 * IconPrint  "Print document" action.
 * 3D printer with paper tray and output slot.
 */
export function IconPrint() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <path d="M7 7V3h10v4" />
      <rect x="2" y="7" width="20" height="11" rx="1.5" />
      <path d="M7 14h10v6H7v-6z" />
      <line x1="9" y1="17" x2="15" y2="17" strokeWidth="1.3" />
      <line x1="9" y1="19.5" x2="13" y2="19.5" strokeWidth="1.3" />
      <circle cx="18" cy="11" r="1" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * IconEmail  "Email document / notification" action.
 */
export function IconEmail() {
  return <IconAuthMail aria-hidden="true" width="22" height="22" />;
}

/**
 * IconMessageChannelDeco  message/inbox inline notification UI.
 * 3D chat bubble with depth tail and dot indicators.
 */
export function IconMessageChannelDeco() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7.5L3 21V5z" />
      <circle cx="8.5" cy="10.5" r="1" fill="currentColor" strokeWidth="0" />
      <circle cx="12" cy="10.5" r="1" fill="currentColor" strokeWidth="0" />
      <circle cx="15.5" cy="10.5" r="1" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * IconTrash  "Delete / Remove" destructive action.
 * Lid-open bin with depth body lines.
 */
export function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <path d="M3 6h18" strokeWidth="2" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1.5 14.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" strokeWidth="1.5" strokeOpacity="0.5" />
      <line x1="14" y1="11" x2="14" y2="17" strokeWidth="1.5" strokeOpacity="0.5" />
    </svg>
  );
}

/**
 * IconLedger  "Open Ledger / Account book" navigation.
 * 3D open book with spine, page lines, and bookmark ribbon.
 */
export function IconLedger() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <path d="M3 6a2 2 0 0 1 2-2h6v16H5a2 2 0 0 1-2-2V6z" />
      <path d="M21 6a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 0 2-2V6z" />
      <path d="M11 4v16" strokeWidth="1.2" strokeOpacity="0.4" />
      <line x1="6" y1="9" x2="9" y2="9" strokeWidth="1.3" strokeOpacity="0.5" />
      <line x1="6" y1="12" x2="9" y2="12" strokeWidth="1.3" strokeOpacity="0.5" />
      <line x1="6" y1="15" x2="8" y2="15" strokeWidth="1.3" strokeOpacity="0.5" />
      <line x1="15" y1="9" x2="18" y2="9" strokeWidth="1.3" strokeOpacity="0.5" />
      <line x1="15" y1="12" x2="18" y2="12" strokeWidth="1.3" strokeOpacity="0.5" />
    </svg>
  );
}

/**
 * IconLayers  "Layers / stacked multi-section view" icon.
 */
export function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
    </svg>
  );
}

/**
 * IconPlus  "Add / Create" primary CTA.
 * Bold plus with subtle intersection depth.
 */
export function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

/**
 * IconLinkOut  "Open in new / jump to record" action.
 */
export function IconLinkOut() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="22" height="22" focusable="false">
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

/** IconCopy  copy to clipboard (compact inline action). */
export function IconCopy(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/** IconBan  block/ban user (danger affordance). */
export function IconBan(p) {
  return <Ban aria-hidden="true" size={18} strokeWidth={2.2} {...p} />;
}

/** IconChevronDown  native select chevron. */
export function IconChevronDown(p) {
  return <ChevronDown aria-hidden="true" size={16} strokeWidth={2.4} {...p} />;
}

/**
 * IconSettings  Settings / configuration icon.
 */
export function IconSettings() {
  return <IconPsSettings width="22" height="22" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR / NAVIGATION / BRAND ICONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconPulse  Dashboard heartbeat / insights.
 * ECG waveform with dot endpoint.
 */
export function IconPulse(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M2 12h3.5l2.5-7 4 14 3-10 2 3H22" />
      <circle cx="22" cy="12" r="1" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * IconCollapseChevron  expand/collapse chevron for side panels.
 */
export function IconCollapseChevron(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

/**
 * IconMenu  hamburger menu / sidebar toggle.
 */
export function IconMenu(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h12" />
    </svg>
  );
}

/**
 * IconDots  3-dots overflow / "More" menu.
 * Vertical pill dots with subtle sizing variation for depth feel.
 */
export function IconDots(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="5" r="1.2" fill="currentColor" strokeWidth="0" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" strokeWidth="0" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * IconX  close / dismiss modal, popover, chip.
 */
export function IconX(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

/**
 * IconChevronLeft  back/previous navigation.
 */
export function IconChevronLeft(p) {
  return <ChevronLeft aria-hidden="true" size={16} strokeWidth={2.6} {...p} />;
}

/**
 * IconChevronRight  forward/next navigation.
 */
export function IconChevronRight(p) {
  return <ChevronRight aria-hidden="true" size={16} strokeWidth={2.6} {...p} />;
}

/**
 * IconAlert  generic warning/alert triangle.
 * 3D triangle with inner glow and double-border for urgency.
 */
export function IconAlert(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M12 3L2.5 20.5h19L12 3z" />
      <path d="M12 3.8L3.5 20h17L12 3.8z" strokeOpacity="0.2" strokeWidth="0.7" />
      <line x1="12" y1="9.5" x2="12" y2="14.5" strokeWidth="2" />
      <circle cx="12" cy="17.5" r="1" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * IconArrowRight  inline action link arrow.
 */
export function IconArrowRight(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </svg>
  );
}

/**
 * IconCheck  standard checkmark (mark all read, selection states).
 */
export function IconCheck(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/**
 * IconInfo  info/informational severity (notification center).
 * Circle with raised "i" and serif base dash.
 */
export function IconInfo(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="8" r="0.8" fill="currentColor" strokeWidth="0" />
      <path d="M12 11v5" strokeWidth="2" />
      <path d="M10.5 16h3" strokeWidth="1.5" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM DIALOG ICONS
// components/ConfirmDialog.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconConfirmMarkDanger  danger confirmation dialog mark (shield + exclamation).
 * Used in: ConfirmDialog.jsx with danger=true.
 */
export function IconConfirmMarkDanger(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M12 2.5L20.5 7v7c0 4.3-3.3 8.1-8.5 9.5C6.8 22.1 3.5 18.3 3.5 14V7L12 2.5z" />
      <path d="M12 8v5.5" strokeWidth="2.1" />
      <circle cx="12" cy="16.5" r="1.1" fill="currentColor" strokeWidth="0" />
      <path d="M12 4.8l7 3.9v5.3c0 3.4-2.6 6.4-7 7.5" strokeWidth="0.8" strokeOpacity="0.22" />
    </svg>
  );
}

/**
 * IconConfirmMarkOk  ok/safe confirmation dialog mark (shield + checkmark).
 * Used in: ConfirmDialog.jsx with danger=false.
 */
export function IconConfirmMarkOk(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M12 2.5L20.5 7v7c0 4.3-3.3 8.1-8.5 9.5C6.8 22.1 3.5 18.3 3.5 14V7L12 2.5z" />
      <path d="M8.5 13l2.5 2.5 5-5.5" strokeWidth="2.1" />
      <path d="M12 4.8l7 3.9v5.3c0 3.4-2.6 6.4-7 7.5" strokeWidth="0.8" strokeOpacity="0.22" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT UPLOAD FIELD
// components/DocumentUploadField.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconDocMark  document/ID glyph for upload tile.
 * 3D folded-corner document with text lines and depth fold.
 */
export function IconDocMark(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M6.5 2.5H15l4 4v15.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-18.5a1 1 0 0 1 1-1z" />
      <path d="M15 2.5v4h4" strokeWidth="1.3" strokeOpacity="0.4" />
      <line x1="8.5" y1="10.5" x2="15.5" y2="10.5" strokeWidth="1.5" />
      <line x1="8.5" y1="13.5" x2="15.5" y2="13.5" strokeWidth="1.5" />
      <line x1="8.5" y1="16.5" x2="12" y2="16.5" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * IconEyeMark  preview/eye glyph for upload tile preview action.
 */
export function IconEyeMark(p) {
  return <IconAuthEye {...p} />;
}

/**
 * IconDownloadMark  download arrow glyph for upload tile download action.
 */
export function IconDownloadMark(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M12 3v12" />
      <path d="M8 11l4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

/**
 * IconUploadMark  upload arrow glyph for upload tile upload/replace action.
 */
export function IconUploadMark(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHONE INPUT COMPONENT
// components/PhoneInput.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconTelGlobe  globe/country code selector glyph.
 * 3D globe with latitude line and vertical meridian.
 */
export function IconTelGlobe(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h19" />
      <path d="M12 2.5c-3 3.5-4.5 6-4.5 9.5s1.5 6 4.5 9.5c3-3.5 4.5-6 4.5-9.5s-1.5-6-4.5-9.5z" />
      <path d="M4.5 7a17 17 0 0 1 15 0" strokeWidth="0.8" strokeOpacity="0.3" />
      <path d="M4.5 17a17 17 0 0 0 15 0" strokeWidth="0.8" strokeOpacity="0.3" />
    </svg>
  );
}

/**
 * IconTelHandset  phone handset glyph for PhoneInput ribbon + number field.
 * 3D handset with mouthpiece and earpiece detail.
 */
export function IconTelHandset(p) {
  return <IconPsPhone {...p} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE FILTERS / TOOLBAR (see components/ui/tableFilters.jsx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconTableFunnel  funnel/filter for table controls.
 * Tapering funnel with 3D slot lines.
 */
export function IconTableFunnel(p) {
  return (
    <svg className="tcIco tcIco3d" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 4h16l-6 8v7l-4-2v-5L4 4z" />
      <path d="M4.5 4.5h15" strokeWidth="0.7" strokeOpacity="0.25" />
    </svg>
  );
}

/**
 * IconTableCalendar  calendar for table date range controls.
 */
export function IconTableCalendar(p) {
  return (
    <svg className="tcIco tcIco3d" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18" strokeWidth="1.7" />
      <line x1="8" y1="3" x2="8" y2="7" strokeWidth="2" />
      <line x1="16" y1="3" x2="16" y2="7" strokeWidth="2" />
      <circle cx="8" cy="13" r="1" fill="currentColor" strokeWidth="0" />
      <circle cx="12" cy="13" r="1" fill="currentColor" strokeWidth="0" />
      <circle cx="16" cy="13" r="1" fill="currentColor" strokeWidth="0" />
      <circle cx="8" cy="17" r="1" fill="currentColor" strokeWidth="0" />
      <circle cx="12" cy="17" r="1" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION CENTER
// NotificationCenter component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BellMark  notification bell trigger button.
 * 3D bell with clapper and base arc.
 */
export function BellMark(p) {
  return <IconPsBell {...p} />;
}

/**
 * IconSuccess  success toast / status badge.
 * Layered circle checkmark with outer ring.
 */
export function IconSuccess(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="9.5" strokeOpacity="0.2" strokeWidth="0.8"
        transform="scale(0.85) translate(2.1 2.1)" />
      <path d="M7.5 12.5l3 3 6-7" strokeWidth="2.1" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE DROPDOWN MENU
// ProfileDropdown component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconProfile  user/profile menu item.
 */
export function IconProfile(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="15" height="15" {...p}>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

/**
 * IconLogout  logout/sign out menu item.
 * Door with exit arrow  clear affordance.
 */
export function IconLogout(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      width="15" height="15" {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDICAL SAAS MODAL HEADER ICONS (Premium 3D custom SVGs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconUser  Staff / User account modal header.
 * 3D user silhouette with depth shadow ellipse and shoulder arc.
 */
export function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="22" rx="7.5" ry="1.2" strokeWidth="0.9" strokeOpacity="0.15" />
      <circle cx="12" cy="8" r="4.2" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      <path d="M10.2 6.4a2.8 2.8 0 0 1 3.2 0" strokeWidth="0.9" strokeOpacity="0.28" />
    </svg>
  );
}

/**
 * IconShieldKey  security / access control / roles modal header.
 * 3D shield with key hole and inner depth ring.
 */
export function IconShieldKey() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5L20.5 7v6.5c0 4.5-3.3 8.3-8.5 9.7C6.8 21.8 3.5 18 3.5 13.5V7L12 2.5z" />
      <path d="M12 5l7 3.9v4.6c0 3.6-2.6 6.7-7 7.8" strokeWidth="0.8" strokeOpacity="0.2" />
      <circle cx="14" cy="10.5" r="2" strokeWidth="1.7" />
      <path d="M12 12.5l-2 2.5h3" strokeWidth="1.6" strokeLinejoin="round" />
      <line x1="11.5" y1="15" x2="11.5" y2="16.2" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * IconFactory  Manufacturer / pharma company modal header.
 * See IconMfgMark  alias for modal system consistency.
 */
export function IconFactory() {
  return <IconMfgMark />;
}

/**
 * IconReceipt  Bill / Invoice / GST receipt modal header.
 * 3D layered receipt with zigzag base and ruled content lines.
 */
export function IconReceipt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 2h10v20l-2.5-2L12 22l-2.5-2L7 22V2z" />
      <path d="M8.5 2.5h7" strokeWidth="0.7" strokeOpacity="0.22" />
      <line x1="9.5" y1="8" x2="14.5" y2="8" strokeWidth="1.5" />
      <line x1="9.5" y1="11.5" x2="14.5" y2="11.5" strokeWidth="1.5" />
      <line x1="9.5" y1="15" x2="12.5" y2="15" strokeWidth="1.5" />
      <path d="M7.5 2.5h9" strokeOpacity="0.2" strokeWidth="0.7" />
    </svg>
  );
}

/**
 * IconWallet  payment wallet / balance modal header.
 * 3D wallet with card slot, coin circle, and clasp line.
 */
export function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 8a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V8z" />
      <path d="M2.5 11h19" strokeWidth="0.9" strokeOpacity="0.25" />
      <path d="M6 6V4.5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 18 4.5V6" strokeWidth="1.3" />
      <rect x="14.5" y="12" width="6" height="4" rx="1.5" strokeWidth="1.6" />
      <circle cx="17.5" cy="14" r="1.1" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * IconRotateBox  sales returns / reverse stock modal header.
 * Box with circular return arrow indicating reversal/return flow.
 */
export function IconRotateBox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="8.5" width="9" height="9" rx="1.5" />
      <path d="M4.5 8.5l2-3h5l2 3" strokeWidth="1.5" />
      <path d="M17 6.5a6 6 0 0 1 1.8 7.5" />
      <path d="M19 14.5l0.5-1.8 1.8 0.5" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * IconProducts  Medicine / Product catalogue modal header.
 * Clipboard with pill and cross detail for medical catalogue feel.
 */
export function IconProducts() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1.5" />
      <rect x="7.5" y="11" width="4.5" height="2.2" rx="1.1" strokeWidth="1.5" />
      <line x1="7.5" y1="16" x2="12" y2="16" strokeWidth="1.5" />
      <line x1="15" y1="10.5" x2="15" y2="15" strokeWidth="1.7" />
      <line x1="12.8" y1="12.7" x2="17.2" y2="12.7" strokeWidth="1.7" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDICAL-SPECIFIC SPECIALTY ICONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconMedicinePill  capsule/pill for individual medicine items in lists.
 * 3D dual-color capsule with specular highlight arc and depth line.
 */
export function IconMedicinePill(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="3" y="9.5" width="18" height="5" rx="2.5" />
      <line x1="12" y1="9.5" x2="12" y2="14.5" strokeWidth="1.8" />
      <path d="M4.8 11a1.8 1.8 0 0 1 2.8 0" strokeWidth="0.9" strokeOpacity="0.3" />
      <path d="M3.5 13.5h17" strokeWidth="0.7" strokeOpacity="0.2" />
    </svg>
  );
}

/**
 * IconExpiry  expiry date / shelf life tracking.
 * Calendar with embedded clock  critical pharma stock icon.
 */
export function IconExpiry(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="2.5" y="3.5" width="13" height="12" rx="2" />
      <path d="M2.5 7.5h13" strokeWidth="0.9" strokeOpacity="0.3" />
      <line x1="6.5" y1="2" x2="6.5" y2="5.5" />
      <line x1="11.5" y1="2" x2="11.5" y2="5.5" />
      <circle cx="17.5" cy="17.5" r="4.5" strokeWidth="1.8" />
      <path d="M17.5 15v2.5l1.5 1.5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * IconBatch  batch/lot number tracking.
 * 3 layered panels with diminishing opacity conveying batches/lots.
 */
export function IconBatch(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="4" y="15" width="16" height="4.5" rx="1.5" strokeOpacity="0.3" strokeWidth="1.3" />
      <rect x="4" y="10.5" width="16" height="4.5" rx="1.5" strokeOpacity="0.6" strokeWidth="1.6" />
      <rect x="4" y="6" width="16" height="4.5" rx="1.5" />
      <line x1="7" y1="8.3" x2="13.5" y2="8.3" strokeWidth="1.3" />
      <line x1="7" y1="10" x2="10.5" y2="10" strokeWidth="1.1" strokeOpacity="0.5" />
    </svg>
  );
}

/**
 * IconStockAlert  low stock / reorder warning.
 * Bottle with descending liquid level and exclamation mark overlay.
 */
export function IconStockAlert(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M9 3h6v2l2 3H7L9 5V3z" />
      <path d="M7 8h10l1 2.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5V10.5L7 8z" />
      <path d="M7.5 15h9" strokeWidth="1.2" strokeOpacity="0.35" />
      <path d="M11 13.5l1-2 1 2h-2z" strokeWidth="1.3" fill="currentColor" fillOpacity="0.5" />
      <line x1="12" y1="15" x2="12" y2="16.5" strokeWidth="1.2" />
    </svg>
  );
}

/**
 * IconSupplier  Supplier/vendor management.
 * 3D delivery truck with medical cross on cargo and wheel depth.
 * Used in: `components/VendorMasterModal.jsx` (New/Edit supplier/vendor modal header).
 */
export function IconSupplier(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="1" y="7" width="14" height="10" rx="1.5" />
      <path d="M15 10.5h4l3 3v3.5h-7V10.5z" />
      <circle cx="5.5" cy="19.5" r="2" strokeWidth="1.8" />
      <circle cx="17.5" cy="19.5" r="2" strokeWidth="1.8" />
      <line x1="5" y1="11.5" x2="5" y2="15.5" strokeWidth="1.7" />
      <line x1="3" y1="13.5" x2="7" y2="13.5" strokeWidth="1.7" />
    </svg>
  );
}

/**
 * IconPrescription  Prescription / Rx order tracking.
 * Clipboard with classic Rx symbol and content lines.
 */
export function IconPrescription(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M9.5 7h2.8a2 2 0 0 1 0 4H9.5V7z" strokeWidth="1.8" />
      <path d="M11.5 11l3 5" strokeWidth="1.8" />
      <path d="M9 16h4.5" strokeWidth="1.5" strokeOpacity="0.5" />
      <path d="M9 19h3" strokeWidth="1.5" strokeOpacity="0.5" />
    </svg>
  );
}

/**
 * IconInventory  Inventory / stock overview.
 * 3D isometric crate with open top, content depth and shadow base.
 */
export function IconInventory(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M2.5 9.5l9.5 5.5 9.5-5.5" strokeWidth="1.8" />
      <path d="M2.5 9.5v9l9.5 5.5 9.5-5.5v-9" />
      <path d="M2.5 9.5l9.5-5.5 9.5 5.5" strokeOpacity="0.4" strokeWidth="1.4" />
      <line x1="12" y1="4" x2="12" y2="15" strokeWidth="0.9" strokeOpacity="0.3" />
    </svg>
  );
}

/**
 * IconPharmacy  pharmacy/dispensing unit page icon.
 * Mortar and pestle  universal pharmacy symbol with pestle arc.
 */
export function IconPharmacy(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M5 10h14l-2 9H7L5 10z" />
      <path d="M4 10h16" strokeWidth="2" />
      <path d="M8 19.5h8" strokeWidth="1" strokeOpacity="0.22" />
      <path d="M14.5 4c1.5 0 3 1 3 3s-1.5 3-3 3" strokeWidth="2" fill="none" />
      <path d="M14.5 4c-1.5 0-3.5 0-3.5 0v6" strokeWidth="2" />
      <line x1="10" y1="4" x2="10" y2="7" strokeWidth="1.6" />
      <line x1="8.5" y1="5.5" x2="11.5" y2="5.5" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * IconGST  GST / tax compliance document icon.
 * Document with rupee symbol and tax band.
 */
export function IconGST(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M5 2.5h10l4 4.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
      <path d="M15 2.5v4.5h4" strokeWidth="1.3" strokeOpacity="0.4" />
      <path d="M8 10h5" strokeWidth="1.5" />
      <path d="M8 10a2 2 0 0 1 2 2h-2" strokeWidth="1.5" />
      <line x1="8" y1="12" x2="12" y2="17" strokeWidth="1.5" />
      <line x1="8" y1="15" x2="13" y2="15" strokeWidth="1.4" strokeOpacity="0.5" />
    </svg>
  );
}

/**
 * IconDamaged  damaged/rejected goods icon.
 * Box with fracture lightning bolt crack lines.
 */
export function IconDamaged(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="3" y="7" width="18" height="14" rx="1.5" />
      <path d="M3 11h18" strokeWidth="1" strokeOpacity="0.28" />
      <path d="M10.5 7l-2 4.5 2.5 0.8-2 4.5" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * IconReorder  reorder / purchase order icon.
 * Circular arrows around a clipboard/order item  restock cycle.
 */
export function IconReorder(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="7" y="8.5" width="10" height="9.5" rx="1.5" />
      <line x1="9.5" y1="12" x2="14.5" y2="12" strokeWidth="1.4" />
      <line x1="9.5" y1="15" x2="12.5" y2="15" strokeWidth="1.4" />
      <path d="M5 9A7 7 0 0 1 14 3" fill="none" strokeWidth="1.8" />
      <path d="M12 2l2.5 1.2-1 2.2" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M19 15a7 7 0 0 1-9 6" fill="none" strokeWidth="1.8" />
      <path d="M12 22l-2.5-1.2 1-2.2" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * IconSalesReturn  sales return / customer return action icon.
 * Shopping bag with reverse arrow indicating return flow.
 */
export function IconSalesReturn(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M6 7h12l-1.5 13H7.5L6 7z" />
      <path d="M9.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
      <path d="M10.5 14h3" strokeWidth="1.7" />
      <path d="M10.5 14l1.8-2.2" strokeWidth="1.6" />
      <path d="M10.5 14l1.8 2.2" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * IconPurchaseOrder  purchase order / PO management icon.
 * Document with delivery truck emblem at base.
 */
export function IconPurchaseOrder(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M6 2h9l4 4v8H6V2z" />
      <path d="M15 2v4h4" strokeWidth="1.3" strokeOpacity="0.4" />
      <line x1="9" y1="7" x2="14" y2="7" strokeWidth="1.5" />
      <line x1="9" y1="10" x2="13" y2="10" strokeWidth="1.5" />
      <rect x="3" y="15" width="7" height="5" rx="1" strokeWidth="1.5" />
      <path d="M10 16.8h3l1.5 1.5v1.7H10" strokeWidth="1.5" />
      <circle cx="5.5" cy="21" r="1.1" strokeWidth="1.3" />
      <circle cx="12" cy="21" r="1.1" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * IconCreditNote  credit note / debit note document icon.
 * Document with circular credit badge and minus/plus symbol.
 */
export function IconCreditNote(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M5 3h14a1 1 0 0 1 1 1v10H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <line x1="7" y1="7.5" x2="16" y2="7.5" strokeWidth="1.5" />
      <line x1="7" y1="10.5" x2="12" y2="10.5" strokeWidth="1.5" />
      <circle cx="14" cy="17.5" r="4.5" strokeWidth="1.8" />
      <path d="M15.8 15.8a2.5 2.5 0 1 0 0 3.4" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

/**
 * IconAuditLog  audit trail / activity log icon.
 * Shield with checklist lines inside  compliance/audit affordance.
 */
export function IconAuditLog(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M12 2.5L20.5 7v6.5c0 4.5-3.3 8.3-8.5 9.7C6.8 21.8 3.5 18 3.5 13.5V7L12 2.5z" />
      <path d="M12 5l7 3.9v4.6c0 3.6-2.6 6.7-7 7.8" strokeWidth="0.8" strokeOpacity="0.2" />
      <line x1="9" y1="10.5" x2="15" y2="10.5" strokeWidth="1.4" />
      <line x1="9" y1="13" x2="13" y2="13" strokeWidth="1.4" />
      <path d="M8.5 15.5l1.5 1.5 3-3" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * IconDrugCategory  drug category / schedule classification icon.
 * Tag with molecular dot pattern  categorisation affordance.
 */
export function IconDrugCategory(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M3 7.5a2 2 0 0 1 2-2h7l7 7-8 8-7-7V7.5z" />
      <circle cx="7" cy="9" r="1.3" strokeWidth="1.5" />
      <circle cx="10.5" cy="10.8" r="1" strokeWidth="1.3" strokeOpacity="0.7" />
      <circle cx="13.5" cy="13.8" r="1" strokeWidth="1.3" strokeOpacity="0.7" />
      <line x1="10.5" y1="10.8" x2="13.5" y2="13.8" strokeWidth="1.1" strokeOpacity="0.5" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW ICONS (added for Orders module, payments, reports, and advanced UI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconOrder  Order module / cart icon.
 * 3D shopping cart with product stack and badge counter area.
 * Used in: Sidebar "Orders" / "My Orders" nav item.
 */
export function IconOrder(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M2.5 3.5h2l2.5 11h9.5l2-7.5H7" />
      <circle cx="9.5" cy="18.5" r="1.8" strokeWidth="1.7" />
      <circle cx="16" cy="18.5" r="1.8" strokeWidth="1.7" />
      <path d="M7 12h10" strokeWidth="0.9" strokeOpacity="0.3" />
    </svg>
  );
}

/**
 * IconPlaceOrder  cart/checkout icon for “Place order” actions (table + wizard).
 * Reuses the Order cart glyph but keeps a separate semantic name for UI intent.
 * Used in: `pages/CatalogMarketplacePage.jsx` (Order action column),
 *          `components/orders/OrderPlaceWizardModal.jsx` (wizard primary actions).
 */
export function IconPlaceOrder(p) {
  return <IconOrder {...p} />;
}

/**
 * IconCatalog  Wholesaler catalog / product listing.
 * 3D open catalog/binder with tabbed pages and price tag.
 * Used in: Sidebar "My Catalog" / "Order Catalog" nav item.
 */
export function IconCatalog(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M4 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M4 3h14" strokeOpacity="0.2" strokeWidth="0.8" />
      <line x1="7" y1="8" x2="15" y2="8" strokeWidth="1.5" />
      <line x1="7" y1="11.5" x2="15" y2="11.5" strokeWidth="1.5" />
      <line x1="7" y1="15" x2="12" y2="15" strokeWidth="1.5" />
      <path d="M18.5 8l2 1-2 1V8z" strokeWidth="1.3" fill="currentColor" fillOpacity="0.4" />
    </svg>
  );
}

/**
 * IconDispatch  Order dispatched / shipped status icon.
 * Truck with forward motion lines and package on bed.
 * Used in: Order status badge "DISPATCHED", dispatch action button.
 */
export function IconDispatch(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M1 7h13v10H1z" rx="1" />
      <path d="M14 10h5l3 3v4h-8V10z" />
      <circle cx="4.5" cy="19.5" r="1.8" strokeWidth="1.7" />
      <circle cx="17" cy="19.5" r="1.8" strokeWidth="1.7" />
      <path d="M1 5l2-2 2 2" strokeWidth="1.5" strokeOpacity="0.4" />
      <path d="M5 3v4" strokeWidth="1.5" strokeOpacity="0.4" />
    </svg>
  );
}

/**
 * IconDelivered  Order delivered / received confirmation icon.
 * Box with open lid and checkmark inside  receipt confirmation.
 * Used in: Order status badge "DELIVERED", confirm delivery button.
 */
export function IconDelivered(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M3 10.5l9 5 9-5" strokeWidth="1.5" />
      <path d="M3 10.5v9l9 5 9-5v-9" />
      <path d="M3 10.5L12 5.5l9 5" strokeOpacity="0.4" strokeWidth="1.3" />
      <path d="M8.5 14l2.5 2.5 5-5.5" strokeWidth="2" />
    </svg>
  );
}

/**
 * IconAdvancePayment  advance / on-account payment icon.
 * Wallet with upward arrow indicating pre-payment / credit deposit.
 * Used in: Advance payment recording UI, customer/supplier balance chips.
 */
export function IconAdvancePayment(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="2.5" y="8" width="19" height="12" rx="2" />
      <path d="M2.5 12h19" strokeWidth="0.9" strokeOpacity="0.25" />
      <path d="M6.5 6V4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V6" strokeWidth="1.3" />
      <path d="M12 18V14" strokeWidth="1.8" />
      <path d="M9.5 16.5L12 14l2.5 2.5" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * IconDayBook  day book / cash book daily summary icon.
 * Calendar page with coin stack detail  daily accounting.
 * Used in: Reports sidebar "Day Book" page.
 */
export function IconDayBook(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 8.5h18" strokeWidth="1.8" />
      <line x1="8" y1="3" x2="8" y2="6.5" strokeWidth="2" />
      <line x1="16" y1="3" x2="16" y2="6.5" strokeWidth="2" />
      <path d="M8 13h5" strokeWidth="1.4" />
      <path d="M8 16h3.5" strokeWidth="1.4" />
      <circle cx="16.5" cy="14.5" r="3" strokeWidth="1.6" />
      <path d="M15.5 14.5h2" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * IconNonMoving  non-moving / dead stock inventory alert icon.
 * Box with cobweb corner detail indicating inactivity / idle stock.
 * Used in: Reports sidebar "Non-Moving" page, billing ticker.
 */
export function IconNonMoving(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="4" y="7" width="16" height="14" rx="1.5" />
      <path d="M4 11h16" strokeWidth="0.9" strokeOpacity="0.28" />
      <path d="M8 7l2-3h4l2 3" strokeWidth="1.5" />
      <path d="M4 7l4 4" strokeWidth="1.2" strokeOpacity="0.4" />
      <path d="M4 7l2 0" strokeWidth="1.2" strokeOpacity="0.4" />
      <path d="M4 9l0-2" strokeWidth="1.2" strokeOpacity="0.4" />
      <line x1="9" y1="16" x2="15" y2="16" strokeWidth="1.4" strokeOpacity="0.5" />
      <line x1="11" y1="14" x2="11" y2="18" strokeWidth="1.4" strokeOpacity="0.5" />
    </svg>
  );
}

/**
 * IconNearExpiry  near-expiry stock warning icon.
 * Hourglass with warning triangle overlay  time-critical expiry.
 * Used in: Reports sidebar "Near-Expiry" page, billing ticker.
 */
export function IconNearExpiry(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M5 3h14" />
      <path d="M5 21h14" />
      <path d="M6 3l6 8-6 10" />
      <path d="M18 3l-6 8 6 10" />
      <path d="M9 12h6" strokeWidth="0.9" strokeOpacity="0.3" />
      <path d="M12 16l-1 2h2l-1-2z" fill="currentColor" fillOpacity="0.6" strokeWidth="0" />
      <circle cx="12" cy="19" r="0.8" fill="currentColor" strokeWidth="0" />
    </svg>
  );
}

/**
 * IconSalesRegister  sales register / transaction history report icon.
 * Scroll/register with currency lines and date stamp.
 * Used in: Reports sidebar "Sales Register" page.
 */
export function IconSalesRegister(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" />
      <line x1="9" y1="7" x2="15" y2="7" strokeWidth="1.5" />
      <line x1="9" y1="10.5" x2="15" y2="10.5" strokeWidth="1.5" />
      <line x1="9" y1="14" x2="13" y2="14" strokeWidth="1.5" />
      <path d="M9 17h2" strokeWidth="1.3" strokeOpacity="0.5" />
    </svg>
  );
}

/**
 * IconStockReport  full inventory / stock report icon.
 * 3D bar chart with stacked inventory layers and search lens.
 * Used in: Reports sidebar "Stock Report" page.
 */
export function IconStockReport(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="3" y="14" width="4" height="7" rx="0.8" />
      <rect x="9.5" y="9" width="4" height="12" rx="0.8" />
      <rect x="16" y="5" width="4" height="16" rx="0.8" />
      <path d="M3 21h18" strokeWidth="1.8" />
      <circle cx="7" cy="7" r="3.5" strokeWidth="1.5" />
      <path d="M9.5 9.5l3 3" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * IconMfgStockist  manufacturer-stockist directory report icon.
 * Tree hierarchy showing mfg → stockist chain.
 * Used in: Reports sidebar "Mfg-Stockist" page.
 */
export function IconMfgStockist(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="8" y="2" width="8" height="5" rx="1.2" />
      <line x1="12" y1="7" x2="12" y2="11" strokeWidth="1.8" />
      <line x1="5" y1="11" x2="19" y2="11" strokeWidth="1.8" />
      <line x1="5" y1="11" x2="5" y2="13" strokeWidth="1.8" />
      <line x1="12" y1="11" x2="12" y2="13" strokeWidth="1.8" />
      <line x1="19" y1="11" x2="19" y2="13" strokeWidth="1.8" />
      <rect x="2" y="13" width="6" height="4" rx="1" />
      <rect x="9" y="13" width="6" height="4" rx="1" />
      <rect x="16" y="13" width="6" height="4" rx="1" />
    </svg>
  );
}
/**
 * IconSalesStock  sales & stock analysis report icon.
 * Bar chart with an upward trend arrow and a stock box below - sold vs. in-hand.
 * Used in: InventoryReportsPage.jsx "Sales & Stock" tab.
 */
export function IconSalesStock(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {/* Bar chart columns */}
      <rect x="2" y="12" width="4" height="9" rx="0.8" />
      <rect x="8" y="7" width="4" height="14" rx="0.8" />
      <rect x="14" y="9" width="4" height="12" rx="0.8" />
      {/* Trend arrow */}
      <path d="M19 4l2 2-2 2" strokeWidth="1.8" />
      <path d="M3 6h12l6 0" strokeWidth="1.5" strokeOpacity="0.5" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS PAGE ICONS
// pages/OrdersPage.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconOpSearch  search box leading icon for Orders page toolbar.
 * Magnifying glass with clean stroke.
 */
export function IconOpSearch(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

/**
 * IconOpCart  "Total orders" stat pill icon.
 * Shopping cart outline.
 */
export function IconOpCart(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 1.95-1.57L23 6H6" />
    </svg>
  );
}

/**
 * IconOpClock  "Pending" stat pill icon.
 * Clock with hour/minute hands.
 */
export function IconOpClock(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

/**
 * IconOpAccepted  "Accepted" stat pill icon.
 * Checkmark inside circle.
 */
export function IconOpAccepted(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

/**
 * IconOpSend  "Dispatched" stat pill icon.
 * Paper plane / send arrow.
 */
export function IconOpSend(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

/**
 * IconOpDelivered  "Delivered" stat pill icon.
 * Simple checkmark.
 */
export function IconOpDelivered(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * IconOpRejected  "Rejected" stat pill icon.
 * Circle with X inside.
 */
export function IconOpRejected(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

/**
 * IconOpCancelled  "Cancelled" stat pill icon.
 * Simple X lines.
 */
export function IconOpCancelled(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// MY CATALOG PAGE ICONS
// pages/CatalogMarketplacePage.jsx
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IconMcTotal  "Total Products" stat pill icon.
 * Clipboard with list lines - catalog count affordance.
 */
export function IconMcTotal(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" strokeWidth="1.5" />
      <line x1="9" y1="15" x2="13" y2="15" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * IconMcVisible  "Visible to retailers" stat pill / toggle icon.
 * Eye with iris - product is shown in retailer catalog.
 */
export function IconMcVisible(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * IconMcHidden  "Hidden from retailers" stat pill / toggle icon.
 * Eye-off with diagonal slash - product is hidden in retailer catalog.
 */
export function IconMcHidden(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M6.72 6.72a3 3 0 1 0 4.24 4.24" strokeWidth="1.8" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/**
 * IconMcOos  "Out of Stock" stat pill icon.
 * Alert circle with exclamation - zero-stock warning.
 */
export function IconMcOos(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/**
 * IconMcProduct  product card header icon.
 * Pill/medicine box - individual catalog product affordance.
 */
export function IconMcProduct(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <path d="M4.5 12h5" strokeWidth="1.2" strokeOpacity="0.35" />
    </svg>
  );
}
/** IconTrendUp  gross profit / upward trend indicator. */
export function IconTrendUp(p) {
  return <TrendingUp aria-hidden="true" size={18} strokeWidth={2.2} {...p} />;
}