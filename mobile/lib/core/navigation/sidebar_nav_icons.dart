import 'package:flutter/widgets.dart';

import '../app_icons.dart';

/// Route → icon mapping aligned with web `Sidebar.jsx` `pickSidebarIcon`.
/// All icons come from AppIcons (lucide_icons) — no Material icons.
IconData iconForSidebarRoute(String path) {
  switch (path) {
    case '/dashboard':
      return AppIcons.dashboard;           // layoutDashboard
    case '/quality-master':
      return AppIcons.products;            // pill
    case '/mfg-companies':
      return AppIcons.manufacturers;       // factory
    case '/divisions':
      return AppIcons.divisions;           // layers
    case '/vendors':
      return AppIcons.suppliers;           // truck
    case '/customers':
      return AppIcons.customers;           // users
    case '/order-catalog':
    case '/my-catalog':
      return AppIcons.catalog;             // bookOpen
    case '/sales-billing':
      return AppIcons.sales;               // receipt
    case '/purchase-invoices':
      return AppIcons.purchases;           // shoppingCart
    case '/sales-returns':
    case '/purchase-returns':
      return AppIcons.salesReturns;        // arrowLeftRight
    case '/orders':
    case '/my-orders':
      return AppIcons.orders;              // packageCheck
    case '/prescriptions':
      return AppIcons.prescriptions;       // fileText
    case '/reports/inventory':
      return AppIcons.inventory;           // clipboardList
    case '/reports/day-book':
      return AppIcons.dayBook;             // bookMarked
    case '/reports/gst-r1':
      return AppIcons.gstReport;           // landmark
    case '/reports/gst-r2':
      return AppIcons.gstItcReport;        // fileText
    case '/reports/gst-r3b':
    case '/reports/gst-b2b-b2c':
      return AppIcons.gstReturn3B;         // fileClock
    case '/reports/ledger':
      return AppIcons.ledger;              // scrollText
    case '/reports/sales-stock':
    case '/reports/sales-stock-analysis':
      return AppIcons.reports;
    case '/division-payments':
    case '/vendor-payments':
      return AppIcons.divisionPayments;    // building2
    case '/customer-payments':
      return AppIcons.customerPayments;    // creditCard
    case '/users':
      return AppIcons.userRoundNav;        // userCircle2
    case '/roles-access':
      return AppIcons.rolesAccess;         // shieldCheck
    case '/profile':
      return AppIcons.profile;
    default:
      return AppIcons.circleDot;
  }
}
