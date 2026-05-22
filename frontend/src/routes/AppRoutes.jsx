import { Navigate, Route, Routes } from "react-router-dom";
import SalesStockAnalysisPage from "../pages/SalesStockAnalysisPage.jsx";
import LandingPage from "../pages/LandingPage.jsx";
import AboutPage from "../pages/AboutPage.jsx";
import TermsPage from "../pages/TermsPage.jsx";
import ContactPage from "../pages/ContactPage.jsx";
import AuthUnifiedPage from "../pages/AuthUnifiedPage.jsx";
import DashboardPage from "../pages/DashboardPage.jsx";
import ForgotPasswordPage from "../pages/ForgotPasswordPage.jsx";
import VerifyOtpPage from "../pages/VerifyOtpPage.jsx";
import RolesAccessPage from "../pages/RolesAccessPage.jsx";
import UsersPage from "../pages/UsersPage.jsx";
import DivisionsPage from "../pages/DivisionsPage.jsx";
import QualityMasterPage from "../pages/QualityMasterPage.jsx";
import MfgCompaniesPage from "../pages/MfgCompaniesPage.jsx";
import PurchaseInvoicesPage from "../pages/PurchaseInvoicesPage.jsx";
import PurchaseReturnsPage from "../pages/PurchaseReturnsPage.jsx";
import CustomersPage from "../pages/CustomersPage.jsx";
import SalesBillingPage from "../pages/SalesBillingPage.jsx";
import SalesReturnsPage from "../pages/SalesReturnsPage.jsx";
import CustomerPaymentsPage from "../pages/CustomerPaymentsPage.jsx";
import VendorPaymentsPage from "../pages/VendorPaymentsPage.jsx";
import VendorsPage from "../pages/VendorsPage.jsx";
import PrescriptionsPage from "../pages/PrescriptionsPage.jsx";
import InventoryReportsPage from "../pages/InventoryReportsPage.jsx";
import DayBookReportPage from "../pages/DayBookReportPage.jsx";
import LedgerReportsPage from "../pages/LedgerReportsPage.jsx";
import GstReportPage from "../pages/GstReportPage.jsx";
import Gstr3bPage from "../pages/Gstr3bPage.jsx";
import Gstr2Page from "../pages/Gstr2Page.jsx";
import CustomerLedgerPage from "../pages/CustomerLedgerPage.jsx";
import VendorLedgerPage from "../pages/VendorLedgerPage.jsx";
import ProfileSettingsPage from "../pages/ProfileSettingsPage.jsx";
import ChangePasswordPage from "../pages/ChangePasswordPage.jsx";
import ForceChangePasswordPage from "../pages/ForceChangePasswordPage.jsx";
import ApprovalPendingPage from "../pages/ApprovalPendingPage.jsx";
import CatalogMarketplacePage from "../pages/CatalogMarketplacePage.jsx";
import OrdersPage from "../pages/OrdersPage.jsx";
import { readAuth, clearAuth, saveAuthUser, onAuthChanged, hasValidAccessToken } from "../services/authStorage.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { useEffect, useRef, useState } from "react";
import { getMe } from "../services/userService.js";
import { getMyAccess } from "../services/accessService.js";

export function AppRoutes() {
  const [authed, setAuthed] = useState(Boolean(readAuth()?.refreshToken));
  const [mustChange, setMustChange] = useState(Boolean(readAuth()?.user?.must_change_password));
  const [authTick, setAuthTick] = useState(0);
  const bootstrappedForTokenRef = useRef(null);
  const isBootstrappingRef = useRef(false);
  const [approvalGate, setApprovalGate] = useState(false);

  useEffect(() => {
    return onAuthChanged(() => {
      const a = readAuth();
      setAuthTick((v) => v + 1);
      setAuthed(Boolean(a?.refreshToken));
      setMustChange(Boolean(a?.user?.must_change_password));
      const status = String(a?.user?.status || "").toUpperCase();
      const blocked = Boolean(a?.user?.is_blocked);
      const needsGate = Boolean(a?.refreshToken) && (blocked || status === "PENDING" || status === "REJECTED");
      setApprovalGate(needsGate);
    });
  }, []);

  // Keep user profile (status) fresh on refresh/navigation
  useEffect(() => {
    const auth = readAuth();
    if (!auth?.refreshToken) return;
    // Avoid calling /me with an expired access token — App waits for bootstrapAuth first; this
    // guards StrictMode / edge timing so we never clear the session before silent refresh runs.
    if (!hasValidAccessToken(auth)) return;

    const hasUserAndAccess = Boolean(auth?.user) && Boolean(auth?.access);
    // In dev (React StrictMode), effects may run twice. Also avoid re-bootstrapping for the same token.
    if (bootstrappedForTokenRef.current === auth.refreshToken && hasUserAndAccess) return;
    // Prevent duplicate in-flight bootstrap requests (e.g. when saveAuthUser triggers authTick
    // before saveAuthAccess completes, which would otherwise fire a second /me + /access/me pair).
    if (isBootstrappingRef.current) return;

    bootstrappedForTokenRef.current = auth.refreshToken;
    isBootstrappingRef.current = true;

    (async () => {
      try {
        const resp = await getMe();
        if (resp.status === 401) {
          clearAuth();
          return;
        }
        const u = resp.json?.data?.user;
        if (u) saveAuthUser(u);

        const a = await getMyAccess();
        if (a.status === 401) {
          clearAuth();
          return;
        }
        const access = a.json?.data?.access;
        if (access) {
          const { saveAuthAccess } = await import("../services/authStorage.js");
          saveAuthAccess(access);
        }
      } finally {
        isBootstrappingRef.current = false;
      }
    })();
  }, [authed, authTick]);

  return (
    <Routes>
      {/* Landing page: always accessible, even when authenticated */}
      <Route path="/" element={<LandingPage />} />
      {/* Auth pages redirect to dashboard when already logged in */}
      <Route path="/login" element={authed ? <Navigate to={mustChange ? "/first-login-change-password" : approvalGate ? "/approval" : "/dashboard"} replace /> : <AuthUnifiedPage />} />
      <Route path="/register" element={authed ? <Navigate to={approvalGate ? "/approval" : "/dashboard"} replace /> : <AuthUnifiedPage />} />
      <Route path="/verify-otp" element={authed ? <Navigate to={approvalGate ? "/approval" : "/dashboard"} replace /> : <VerifyOtpPage />} />
      <Route path="/change-password" element={authed ? (approvalGate ? <Navigate to="/approval" replace /> : <ChangePasswordPage />) : <Navigate to="/login" replace />} />
      <Route path="/first-login-change-password" element={authed ? <ForceChangePasswordPage /> : <Navigate to="/login" replace />} />
      <Route path="/approval" element={authed ? <ApprovalPendingPage /> : <Navigate to="/login" replace />} />
      <Route
        path="/dashboard"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <DashboardPage />
        }
      />
      <Route
        path="/profile"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <ProfileSettingsPage />
        }
      />
      <Route
        path="/users"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <UsersPage />
        }
      />
      <Route
        path="/divisions"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : isRetailerAuth(readAuth()) ? <Navigate to="/vendors" replace /> : <DivisionsPage />
        }
      />
      <Route
        path="/vendors"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <VendorsPage />
        }
      />
      <Route path="/suppliers" element={<Navigate to="/vendors" replace />} />
      <Route path="/supplier-payments" element={<Navigate to="/division-payments" replace />} />
      <Route
        path="/my-catalog"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <CatalogMarketplacePage key="my-catalog" />
        }
      />
      <Route
        path="/order-catalog"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <CatalogMarketplacePage key="order-catalog" />
        }
      />
      <Route
        path="/quality-master"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <QualityMasterPage />
        }
      />
      <Route
        path="/mfg-companies"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <MfgCompaniesPage />
        }
      />
      <Route
        path="/purchase-invoices"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <PurchaseInvoicesPage />
        }
      />
      <Route
        path="/customers"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <CustomersPage />
        }
      />
      <Route
        path="/sales-billing"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <SalesBillingPage />
        }
      />
      <Route
        path="/sales-returns"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <SalesReturnsPage />
        }
      />
      <Route
        path="/purchase-returns"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <PurchaseReturnsPage />
        }
      />
      <Route
        path="/orders"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <OrdersPage key="orders" />
        }
      />
      <Route
        path="/my-orders"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <OrdersPage key="my-orders" retailerMode />
        }
      />
      <Route
        path="/prescriptions"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <PrescriptionsPage />
        }
      />
      <Route
        path="/reports/inventory"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <InventoryReportsPage />
        }
      />
      <Route
        path="/reports/day-book"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <DayBookReportPage />
        }
      />
      <Route
        path="/reports/gst-r1"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <GstReportPage />
        }
      />
      <Route
        path="/reports/gst-r2"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <Gstr2Page />
        }
      />
      <Route
        path="/reports/gst-r3b"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <Gstr3bPage />
        }
      />
      <Route
        path="/reports/ledger"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <LedgerReportsPage />
        }
      />

      {/* Sales & Stock Analysis standalone route */}
      <Route
        path="/reports/sales-stock-analysis"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <SalesStockAnalysisPage />
        }
      />

      {/* Backward-compatible report routes (redirect into merged hubs) */}
      <Route
        path="/reports/product-supplier"
        element={<Navigate to="/reports/inventory?tab=product-supplier" replace />}
      />
      <Route
        path="/reports/mfg-stockist"
        element={<Navigate to="/reports/inventory?tab=mfg-stockist" replace />}
      />
      <Route
        path="/reports/non-moving"
        element={<Navigate to="/reports/inventory?tab=non-moving" replace />}
      />
      <Route
        path="/reports/sales-stock"
        element={<Navigate to="/reports/inventory?tab=sales-stock" replace />}
      />
      <Route path="/reports/customer-ledger" element={<Navigate to="/reports/ledger?tab=customer" replace />} />
      <Route path="/reports/vendor-ledger" element={<Navigate to="/reports/ledger?tab=supplier" replace />} />
      <Route
        path="/customers/:id/ledger"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <CustomerLedgerPage />
        }
      />
      <Route
        path="/vendors/:id/ledger"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <VendorLedgerPage />
        }
      />
      <Route
        path="/customer-payments"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <CustomerPaymentsPage />
        }
      />
      <Route
        path="/division-payments"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <VendorPaymentsPage />
        }
      />
      <Route path="/vendor-payments" element={<Navigate to="/division-payments" replace />} />
      <Route
        path="/roles-access"
        element={
          !authed ? <Navigate to="/login" replace /> : mustChange ? <Navigate to="/first-login-change-password" replace /> : approvalGate ? <Navigate to="/approval" replace /> : <RolesAccessPage />
        }
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      {/* Public informational pages */}
      <Route path="/about" element={<AboutPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

