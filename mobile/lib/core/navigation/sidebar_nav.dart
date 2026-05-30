/// Sidebar nav item mirroring userSidebarNav.js item shape.
class SidebarNavItem {
  const SidebarNavItem({
    required this.to,
    required this.label,
    this.badge,
    this.fnKey,
  });

  final String to;
  final String label;
  final String? badge;
  final int? fnKey;

  SidebarNavItem copyWith({
    String? to,
    String? label,
    String? badge,
    int? fnKey,
  }) {
    return SidebarNavItem(
      to: to ?? this.to,
      label: label ?? this.label,
      badge: badge ?? this.badge,
      fnKey: fnKey ?? this.fnKey,
    );
  }
}

/// Sidebar section with titled group of routes.
class SidebarNavSection {
  const SidebarNavSection({
    required this.title,
    required this.items,
  });

  final String title;
  final List<SidebarNavItem> items;
}

/// Context for building user sidebar sections.
class SidebarNavContext {
  const SidebarNavContext({
    required this.isOwner,
    required this.perms,
    required this.isRetailer,
    this.pendingOrderCount = 0,
    this.taxLabel = 'GST',
  });

  final bool isOwner;
  final Map<String, dynamic> perms;
  final bool isRetailer;
  final int pendingOrderCount;
  final String taxLabel;
}

const _maxSidebarFn = 24;

bool _perm(Map<String, dynamic> perms, String resource, String action) {
  final r = perms[resource];
  if (r is! Map) return false;
  return r[action] == true;
}

/// Build sidebar sections mirroring buildUserSidebarSections in userSidebarNav.js.
///
/// 6 groups (in order):
///   1. (no label)         — Dashboard
///   2. MASTER DATA        — Products, Manufacturers, Divisions, Suppliers, Customers
///   3. CATALOG            — My Catalog
///   4. TRANSACTIONS       — Sales & Billing, Purchases, Sales Returns, Purchase Returns, Orders
///   5. REPORTS & ACCOUNTS — Inventory Report, Day Book, GST reports, Ledger, Payments
///   6. TEAM               — Users, Roles & Access
List<SidebarNavSection> buildUserSidebarSections(SidebarNavContext ctx) {
  final isOwner = ctx.isOwner;
  final perms = ctx.perms;
  final isRetailer = ctx.isRetailer;
  final pendingOrderCount = ctx.pendingOrderCount;
  final taxLabel = ctx.taxLabel;

  var fnCounter = 0;

  SidebarNavItem withFn(SidebarNavItem item) {
    fnCounter += 1;
    if (fnCounter > _maxSidebarFn) return item;
    return item.copyWith(fnKey: fnCounter);
  }

  final canUsers = isOwner || _perm(perms, 'USERS', 'VIEW');
  final canRoles = isOwner || _perm(perms, 'ROLES', 'VIEW');
  final canDivisions =
      !isRetailer && (isOwner || _perm(perms, 'DIVISIONS', 'VIEW'));
  final canVendors = isOwner || _perm(perms, 'VENDORS', 'VIEW');
  final canQuality = isOwner || _perm(perms, 'PRODUCT_BATCHES', 'VIEW');
  final canMfg = isOwner || _perm(perms, 'MFG_COMPANIES', 'VIEW');
  final canPurchase = isOwner || _perm(perms, 'PURCHASE_INVOICES', 'VIEW');
  final canCustomers = isOwner || _perm(perms, 'CUSTOMERS', 'VIEW');
  final canSales = isOwner || _perm(perms, 'SALES_INVOICES', 'VIEW');
  final canSalesReturns = isOwner || _perm(perms, 'SALES_RETURNS', 'VIEW');
  final canPurchaseReturns =
      isOwner || _perm(perms, 'PURCHASE_RETURNS', 'VIEW');
  final canDivisionPayments = !isRetailer &&
      (isOwner || _perm(perms, 'DIVISION_PAYMENTS', 'VIEW'));
  final canVendorPayments = isRetailer &&
      (isOwner || _perm(perms, 'VENDOR_PAYMENTS', 'VIEW'));
  final canCustomerPayments =
      isOwner || _perm(perms, 'CUSTOMER_PAYMENTS', 'VIEW');
  final canPrescriptions = isOwner || _perm(perms, 'PRESCRIPTIONS', 'VIEW');
  final canOrders = isOwner || _perm(perms, 'PURCHASE_ORDERS', 'VIEW');

  // ── GROUP 1: no label — Dashboard only ──────────────────────────────────
  final out = <SidebarNavSection>[
    SidebarNavSection(
      title: '',
      items: [
        withFn(const SidebarNavItem(to: '/dashboard', label: 'Dashboard')),
      ],
    ),
  ];

  // ── GROUP 2: MASTER DATA ─────────────────────────────────────────────────
  final masterDataItems = <SidebarNavItem>[
    if (canQuality)
      withFn(const SidebarNavItem(to: '/quality-master', label: 'Products')),
    if (canMfg)
      withFn(const SidebarNavItem(to: '/mfg-companies', label: 'Manufacturers')),
    if (canDivisions)
      withFn(const SidebarNavItem(to: '/divisions', label: 'Divisions')),
    if (canVendors)
      withFn(const SidebarNavItem(to: '/vendors', label: 'Suppliers')),
    if (canCustomers)
      withFn(const SidebarNavItem(to: '/customers', label: 'Customers')),
  ];
  if (masterDataItems.isNotEmpty) {
    out.add(SidebarNavSection(title: 'MASTER DATA', items: masterDataItems));
  }

  // ── GROUP 3: CATALOG ─────────────────────────────────────────────────────
  final catalogItems = <SidebarNavItem>[
    if (canOrders)
      withFn(SidebarNavItem(
        to: isRetailer ? '/order-catalog' : '/my-catalog',
        label: isRetailer ? 'Order Catalog' : 'My Catalog',
      )),
  ];
  if (catalogItems.isNotEmpty) {
    out.add(SidebarNavSection(title: 'CATALOG', items: catalogItems));
  }

  // ── GROUP 4: TRANSACTIONS — Sales first, then Purchases, then Returns ────
  final txnItems = <SidebarNavItem>[
    if (canSales)
      withFn(const SidebarNavItem(to: '/sales-billing', label: 'Sales & Billing')),
    if (canPurchase)
      withFn(const SidebarNavItem(to: '/purchase-invoices', label: 'Purchases')),
    if (canSalesReturns)
      withFn(const SidebarNavItem(to: '/sales-returns', label: 'Sales Returns')),
    if (canPurchaseReturns)
      withFn(const SidebarNavItem(to: '/purchase-returns', label: 'Purchase Returns')),
    if (canOrders)
      withFn(SidebarNavItem(
        to: isRetailer ? '/my-orders' : '/orders',
        label: isRetailer ? 'My Orders' : 'Orders',
        badge: !isRetailer && pendingOrderCount > 0
            ? (pendingOrderCount > 99 ? '99+' : '$pendingOrderCount')
            : null,
      )),
    if (isRetailer && canPrescriptions)
      withFn(const SidebarNavItem(to: '/prescriptions', label: 'Prescriptions')),
  ];
  if (txnItems.isNotEmpty) {
    out.add(SidebarNavSection(title: 'TRANSACTIONS', items: txnItems));
  }

  // ── GROUP 5: REPORTS & ACCOUNTS (reports + payments merged) ─────────────
  final reportsAccountsItems = <SidebarNavItem>[
    if (canQuality || canMfg)
      withFn(const SidebarNavItem(to: '/reports/inventory', label: 'Inventory Report')),
    if (canSales)
      withFn(const SidebarNavItem(to: '/reports/day-book', label: 'Day Book')),
    if (canSales)
      withFn(SidebarNavItem(to: '/reports/gst-r1', label: '$taxLabel Report (R1)')),
    if (canSales)
      withFn(SidebarNavItem(to: '/reports/gst-b2b-b2c', label: '$taxLabel B2B / B2C')),
    if (canPurchase)
      withFn(SidebarNavItem(to: '/reports/gst-r2', label: '$taxLabel ITC Report')),
    if (canSales)
      withFn(SidebarNavItem(to: '/reports/gst-r3b', label: '$taxLabel Return (3B)')),
    if (canCustomers || canDivisions || canVendors)
      withFn(const SidebarNavItem(to: '/reports/ledger', label: 'Ledger')),
    if (canDivisionPayments)
      withFn(const SidebarNavItem(to: '/division-payments', label: 'Division Payments')),
    if (canVendorPayments)
      withFn(const SidebarNavItem(to: '/vendor-payments', label: 'Supplier Payments')),
    if (canCustomerPayments)
      withFn(const SidebarNavItem(to: '/customer-payments', label: 'Customer Payments')),
  ];
  if (reportsAccountsItems.isNotEmpty) {
    out.add(SidebarNavSection(title: 'REPORTS & ACCOUNTS', items: reportsAccountsItems));
  }

  // ── GROUP 6: TEAM ────────────────────────────────────────────────────────
  final teamItems = <SidebarNavItem>[
    if (canUsers)
      withFn(const SidebarNavItem(to: '/users', label: 'Users')),
    if (canRoles)
      withFn(const SidebarNavItem(to: '/roles-access', label: 'Roles & Access')),
  ];
  if (teamItems.isNotEmpty) {
    out.add(SidebarNavSection(title: 'TEAM', items: teamItems));
  }

  return out;
}

/// Flattened routes in sidebar order (for F1… navigation).
List<String> getSidebarFlatNavRoutes(SidebarNavContext ctx) {
  return buildUserSidebarSections(ctx)
      .expand((section) => section.items)
      .map((item) => item.to)
      .toList();
}
