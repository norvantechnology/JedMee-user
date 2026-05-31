import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/navigation/app_page_transitions.dart';
import '../core/utils/access.dart';
import '../features/auth/approval_pending_screen.dart';
import '../features/auth/forgot_password_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/verify_otp_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/catalog/catalog_screen.dart';
import '../features/customers/customers_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/divisions/divisions_screen.dart';
import '../features/mfg/mfg_companies_screen.dart';
import '../features/orders/orders_screen.dart';
import '../features/payments/customer_payments_screen.dart';
import '../features/payments/vendor_payments_screen.dart';
import '../features/products/quality_master_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/purchase/purchase_invoice_editor_screen.dart';
import '../features/purchase/purchase_invoices_screen.dart';
import '../features/purchase/purchase_returns_screen.dart';
import '../features/reports/day_book_screen.dart';
import '../features/reports/gst/gst_b2b_b2c_screen.dart';
import '../features/reports/gst/gst_r1_screen.dart';
import '../features/reports/gst/gst_r2_screen.dart';
import '../features/reports/gst/gst_r3b_screen.dart';
import '../features/reports/inventory_reports_screen.dart';
import '../features/reports/ledger_reports_screen.dart';
import '../features/reports/sales_stock_analysis_screen.dart';
import '../features/sales/sales_billing_screen.dart';
import '../features/sales/sales_invoice_editor_screen.dart';
import '../features/sales/sales_returns_screen.dart';
import '../features/users/roles_access_screen.dart';
import '../features/users/users_screen.dart';
import '../features/vendors/vendors_screen.dart';
import '../providers/app_providers.dart';
import '../providers/auth_controller.dart';
import 'placeholder_screen.dart';

class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<void> stream) {
    _sub = stream.listen((_) => notifyListeners());
  }

  late final StreamSubscription<void> _sub;

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

String? _authRedirect(GoRouterState state, AuthState auth) {
  final path = state.uri.path;
  final isAuthed = auth.isAuthed;
  final mustChange = auth.mustChangePassword;
  final approval = auth.approvalGate;

  const publicPaths = {'/login', '/verify-otp', '/forgot-password', '/onboarding'};

  if (!isAuthed) {
    if (publicPaths.contains(path)) return null;
    return '/login';
  }

  if (mustChange && path != '/first-login-change-password') {
    if (publicPaths.contains(path)) return '/first-login-change-password';
    if (path != '/first-login-change-password') return '/first-login-change-password';
  }

  if (approval && path != '/approval') {
    if (path == '/login') return '/approval';
    if (!publicPaths.contains(path) && path != '/approval') return '/approval';
  }

  if (publicPaths.contains(path) && !mustChange && !approval) {
    return '/dashboard';
  }

  if (path == '/divisions' && isRetailer(auth.auth)) {
    return '/vendors';
  }

  // Retailer → vendor-payments is valid; wholesaler → redirect to division-payments.
  if (path == '/vendor-payments' && !isRetailer(auth.auth)) {
    return '/division-payments';
  }

  // Wholesaler → division-payments is valid; retailer → redirect to vendor-payments.
  if (path == '/division-payments' && isRetailer(auth.auth)) {
    return '/vendor-payments';
  }

  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  final authStorage = ref.watch(authStorageProvider);
  final refresh = GoRouterRefreshStream(authStorage.onAuthChanged);

  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/onboarding',
    refreshListenable: Listenable.merge([
      refresh,
      _AuthListenable(ref),
    ]),
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      if (auth.status == AuthStatus.initial) {
        return null;
      }
      return _authRedirect(state, auth);
    },
    routes: [
      GoRoute(
        path: '/onboarding',
        builder: (_, __) => const OnboardingScreen(),
      ),
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(
        path: '/register',
        redirect: (_, __) => '/login',
      ),
      GoRoute(
        path: '/verify-otp',
        builder: (_, state) => VerifyOtpScreen(
          email: state.uri.queryParameters['email'],
          role: state.uri.queryParameters['role'],
          rememberMe: state.uri.queryParameters['rememberMe'] == '1',
        ),
      ),
      GoRoute(path: '/forgot-password', builder: (_, __) => const ForgotPasswordScreen()),
      GoRoute(
        path: '/change-password',
        builder: (_, __) => const PlaceholderScreen(title: 'Change password'),
      ),
      GoRoute(
        path: '/first-login-change-password',
        builder: (_, __) => const PlaceholderScreen(
          title: 'Change password',
          useShell: false,
        ),
      ),
      GoRoute(path: '/approval', builder: (_, __) => const ApprovalPendingScreen()),
      GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
      GoRoute(path: '/users', builder: (_, __) => const UsersScreen()),
      GoRoute(path: '/divisions', builder: (_, __) => const DivisionsScreen()),
      GoRoute(path: '/vendors', builder: (_, __) => const VendorsScreen()),
      GoRoute(path: '/quality-master', builder: (_, __) => const QualityMasterScreen()),
      GoRoute(path: '/mfg-companies', builder: (_, __) => const MfgCompaniesScreen()),
      GoRoute(
        path: '/purchase-invoices',
        builder: (_, state) => PurchaseInvoicesScreen(
          initialDateFrom: state.uri.queryParameters['dateFrom'],
          initialDateTo: state.uri.queryParameters['dateTo'],
        ),
      ),
      GoRoute(
        path: '/purchase-invoices/new',
        pageBuilder: (c, s) => AppPageTransitions.slide(
          state: s,
          child: PurchaseInvoiceEditorScreen(
            initialBatch: s.extra is Map<String, dynamic>
                ? s.extra as Map<String, dynamic>
                : null,
          ),
        ),
      ),
      GoRoute(
        path: '/purchase-invoices/edit/:id',
        pageBuilder: (c, s) => AppPageTransitions.slide(
          state: s,
          child: PurchaseInvoiceEditorScreen(
            invoiceId: s.pathParameters['id'],
          ),
        ),
      ),
      GoRoute(path: '/customers', builder: (_, __) => const CustomersScreen()),
      GoRoute(
        path: '/sales-billing',
        builder: (_, state) => SalesBillingScreen(
          initialDateFrom: state.uri.queryParameters['dateFrom'],
          initialDateTo: state.uri.queryParameters['dateTo'],
        ),
      ),
      GoRoute(
        path: '/sales-billing/new',
        pageBuilder: (c, s) => AppPageTransitions.slide(
          state: s,
          child: SalesInvoiceEditorScreen(
            initialBatch: s.extra is Map<String, dynamic>
                ? s.extra as Map<String, dynamic>
                : null,
          ),
        ),
      ),
      GoRoute(
        path: '/sales-billing/edit/:id',
        pageBuilder: (c, s) => AppPageTransitions.slide(
          state: s,
          child: SalesInvoiceEditorScreen(
            invoiceId: s.pathParameters['id'],
          ),
        ),
      ),
      GoRoute(path: '/sales-returns', builder: (_, __) => const SalesReturnsScreen()),
      GoRoute(path: '/purchase-returns', builder: (_, __) => const PurchaseReturnsScreen()),
      GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
      GoRoute(
        path: '/my-orders',
        builder: (_, __) => const OrdersScreen(retailerMode: true),
      ),
      GoRoute(
        path: '/prescriptions',
        builder: (_, __) => const PlaceholderScreen(title: 'Prescriptions'),
      ),
      GoRoute(
        path: '/reports/inventory',
        builder: (_, state) => InventoryReportsScreen(
          initialTab: state.uri.queryParameters['tab'],
        ),
      ),
      GoRoute(path: '/reports/day-book', builder: (_, __) => const DayBookScreen()),
      GoRoute(
        path: '/reports/gst-r1',
        builder: (_, __) => const GstR1Screen(),
      ),
      GoRoute(
        path: '/reports/gst-b2b-b2c',
        builder: (_, __) => const GstB2bB2cScreen(),
      ),
      GoRoute(
        path: '/reports/gst-r2',
        builder: (_, __) => const GstR2Screen(),
      ),
      GoRoute(
        path: '/reports/gst-r3b',
        builder: (_, __) => const GstR3bScreen(),
      ),
      GoRoute(
        path: '/reports/ledger',
        builder: (_, state) => LedgerReportsScreen(
          initialTab: state.uri.queryParameters['tab'],
        ),
      ),
      GoRoute(
        path: '/reports/sales-stock-analysis',
        builder: (_, __) => const SalesStockAnalysisScreen(),
      ),
      GoRoute(path: '/customer-payments', builder: (_, __) => const CustomerPaymentsScreen()),
      GoRoute(path: '/division-payments', builder: (_, __) => const VendorPaymentsScreen()),
      GoRoute(path: '/vendor-payments',   builder: (_, __) => const VendorPaymentsScreen()),
      GoRoute(
        path: '/my-catalog',
        builder: (_, __) => const CatalogScreen(),
      ),
      GoRoute(
        path: '/order-catalog',
        builder: (_, __) => const CatalogScreen(isOrderCatalog: true),
      ),
      GoRoute(path: '/roles-access', builder: (_, __) => const RolesAccessScreen()),
      // /products is an alias for /quality-master (used by dashboard quick actions & alerts)
      GoRoute(
        path: '/products',
        redirect: (_, __) => '/quality-master',
      ),

      // ── Deep link / notification-tap routes (:id sub-routes) ──────────────
      // Orders — open list and auto-show detail sheet for the given order ID
      GoRoute(
        path: '/orders/:id',
        builder: (_, s) => OrdersScreen(
          initialDetailId: s.pathParameters['id'],
        ),
      ),
      GoRoute(
        path: '/my-orders/:id',
        builder: (_, s) => OrdersScreen(
          retailerMode: true,
          initialDetailId: s.pathParameters['id'],
        ),
      ),
      // Products — open list and auto-show product detail sheet
      GoRoute(
        path: '/quality-master/:id',
        builder: (_, s) => QualityMasterScreen(
          initialDetailId: s.pathParameters['id'],
        ),
      ),
      // /products/:id alias
      GoRoute(
        path: '/products/:id',
        redirect: (_, s) => '/quality-master/${s.pathParameters['id']}',
      ),
      // Sales invoice — redirect to the existing edit/view route
      GoRoute(
        path: '/sales-billing/:id',
        redirect: (_, s) {
          final id = s.pathParameters['id']!;
          return '/sales-billing/edit/$id';
        },
      ),
      // Purchase invoice — redirect to the existing edit/view route
      GoRoute(
        path: '/purchase-invoices/:id',
        redirect: (_, s) {
          final id = s.pathParameters['id']!;
          return '/purchase-invoices/edit/$id';
        },
      ),
      // Customers — navigate to list (detail sheet opens on tap)
      GoRoute(
        path: '/customers/:id',
        builder: (_, __) => const CustomersScreen(),
      ),
      // Vendors — navigate to list (detail sheet opens on tap)
      GoRoute(
        path: '/vendors/:id',
        builder: (_, __) => const VendorsScreen(),
      ),
      // Sales returns — navigate to list
      GoRoute(
        path: '/sales-returns/:id',
        builder: (_, __) => const SalesReturnsScreen(),
      ),
      // Purchase returns — navigate to list
      GoRoute(
        path: '/purchase-returns/:id',
        builder: (_, __) => const PurchaseReturnsScreen(),
      ),
    ],
  );
});

class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this._ref) {
    _sub = _ref.listen<AuthState>(
      authControllerProvider,
      (_, __) => notifyListeners(),
    );
  }

  final Ref _ref;
  late final ProviderSubscription<AuthState> _sub;

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}
