import 'package:flutter/material.dart';

import '../core/app_icons.dart';
import 'app_bottom_nav.dart';

/// Reusable [AppBottomActionBar] presets for list / report screens.
///
/// Centralises bottom-nav layout so new pages only pass callbacks and labels
/// instead of duplicating five-button wiring.
class PageBottomBars {
  PageBottomBars._();

  /// Master-data lists (manufacturers, divisions, suppliers, customers…).
  /// [Import, Refresh] | New | [Export]
  static AppBottomActionBar masterList({
    required String primaryLabel,
    required VoidCallback? onCreate,
    VoidCallback? onImport,
    VoidCallback? onRefresh,
    VoidCallback? onExport,
    bool canCreate = true,
    bool canExport = true,
  }) {
    return AppBottomActionBar(
      primaryAction: BottomAction(
        icon: AppIcons.add,
        label: primaryLabel,
        tooltip: primaryLabel,
        onTap: canCreate ? onCreate : null,
        enabled: canCreate,
      ),
      leadingActions: [
        if (onImport != null)
          BottomAction(
            icon: AppIcons.importFile,
            tooltip: 'Import (CSV)',
            onTap: onImport,
          ),
        BottomAction(
          icon: AppIcons.refresh,
          tooltip: 'Refresh list',
          onTap: onRefresh,
        ),
      ],
      trailingActions: [
        BottomAction(
          icon: AppIcons.download,
          tooltip: 'Export (CSV)',
          onTap: canExport ? onExport : null,
          enabled: canExport,
        ),
      ],
    );
  }

  /// Admin lists without CSV (users, roles).
  /// [Refresh] | New | (spare slot unused — keeps primary centred)
  static AppBottomActionBar adminList({
    required String primaryLabel,
    required VoidCallback? onCreate,
    VoidCallback? onRefresh,
    bool canCreate = true,
  }) {
    return AppBottomActionBar(
      primaryAction: BottomAction(
        icon: AppIcons.add,
        label: primaryLabel,
        tooltip: primaryLabel,
        onTap: canCreate ? onCreate : null,
        enabled: canCreate,
      ),
      leadingActions: [
        BottomAction(
          icon: AppIcons.refresh,
          tooltip: 'Refresh list',
          onTap: onRefresh,
        ),
      ],
    );
  }

  /// My Catalog — wholesaler product catalog management.
  /// [Refresh] | Add Product
  static AppBottomActionBar catalog({
    required VoidCallback? onAdd,
    VoidCallback? onRefresh,
    bool canAdd = true,
  }) {
    return AppBottomActionBar(
      primaryAction: BottomAction(
        icon: AppIcons.add,
        label: 'Add Product',
        tooltip: 'Add product to catalog',
        onTap: canAdd ? onAdd : null,
        enabled: canAdd,
      ),
      leadingActions: [
        BottomAction(
          icon: AppIcons.refresh,
          tooltip: 'Refresh catalog',
          onTap: onRefresh,
        ),
      ],
    );
  }

  /// Order catalog (retailer browse) — with cart support.
  /// [Refresh] | Cart (badge) | [Filter]
  static AppBottomActionBar orderCatalog({
    VoidCallback? onFilter,
    VoidCallback? onRefresh,
    VoidCallback? onCart,
    int cartCount = 0,
  }) {
    return AppBottomActionBar(
      primaryAction: BottomAction(
        icon: AppIcons.purchases,
        label: cartCount > 0 ? 'Cart ($cartCount)' : 'Cart',
        tooltip: 'View cart',
        onTap: onCart,
        badge: cartCount > 0 ? cartCount : null,
      ),
      leadingActions: [
        if (onFilter != null)
          BottomAction(
            icon: AppIcons.filter,
            tooltip: 'Filter catalog',
            onTap: onFilter,
          ),
        BottomAction(
          icon: AppIcons.refresh,
          tooltip: 'Refresh catalog',
          onTap: onRefresh,
        ),
      ],
    );
  }

  /// Purchase orders (wholesaler incoming / retailer my orders).
  /// [Filter, Export] | New Order (retailer) or Refresh (wholesaler)
  static AppBottomActionBar orders({
    VoidCallback? onFilter,
    VoidCallback? onRefresh,
    VoidCallback? onExport,
    VoidCallback? onNewOrder,
    bool isRetailer = false,
  }) {
    return AppBottomActionBar(
      primaryAction: isRetailer && onNewOrder != null
          ? BottomAction(
              icon: AppIcons.add,
              label: 'New Order',
              tooltip: 'Place new order',
              onTap: onNewOrder,
            )
          : BottomAction(
              icon: AppIcons.refresh,
              label: 'Refresh',
              tooltip: 'Refresh orders',
              onTap: onRefresh,
            ),
      leadingActions: [
        if (onFilter != null)
          BottomAction(
            icon: AppIcons.filter,
            tooltip: 'Filter orders',
            onTap: onFilter,
          ),
        if (onExport != null)
          BottomAction(
            icon: AppIcons.download,
            tooltip: 'Export orders',
            onTap: onExport,
          ),
        if (isRetailer)
          BottomAction(
            icon: AppIcons.refresh,
            tooltip: 'Refresh orders',
            onTap: onRefresh,
          ),
      ],
    );
  }

  /// GST reports (GSTR-1 / 2 / 3B / B2B-B2C).
  /// [Refresh, File?] | Generate | [PDF, CSV]
  static AppBottomActionBar gstReport({
    required VoidCallback? onGenerate,
    VoidCallback? onRefresh,
    VoidCallback? onPdf,
    VoidCallback? onCsv,
    VoidCallback? onFile,
    bool loading = false,
    bool fetched = false,
  }) {
    final enabled = !loading;
    final hasData = fetched;

    final leading = <BottomAction>[
      if (hasData && onRefresh != null)
        BottomAction(
          icon: AppIcons.refresh,
          tooltip: 'Refresh report',
          onTap: enabled ? onRefresh : null,
          enabled: enabled,
        ),
      if (hasData && onFile != null)
        BottomAction(
          icon: Icons.lock_outline,
          label: 'File',
          tooltip: 'File GSTR snapshot',
          onTap: enabled ? onFile : null,
          enabled: enabled,
        ),
    ];

    final trailing = <BottomAction>[
      if (hasData && onPdf != null)
        BottomAction(
          icon: AppIcons.pdf,
          tooltip: 'Export PDF',
          onTap: enabled ? onPdf : null,
          enabled: enabled,
        ),
      if (hasData && onCsv != null)
        BottomAction(
          icon: AppIcons.download,
          tooltip: 'Export CSV',
          onTap: enabled ? onCsv : null,
          enabled: enabled,
        ),
    ];

    return AppBottomActionBar(
      primaryAction: BottomAction(
        icon: AppIcons.reports,
        label: loading ? 'Loading…' : 'Generate',
        tooltip: 'Generate report',
        onTap: enabled ? onGenerate : null,
        enabled: enabled,
      ),
      leadingActions: leading.take(2).toList(),
      trailingActions: trailing.take(2).toList(),
    );
  }

  /// Day book — pick date in content; actions in bottom bar.
  /// [Today] | Refresh
  static AppBottomActionBar dayBook({
    required VoidCallback? onRefresh,
    VoidCallback? onToday,
    bool loading = false,
  }) {
    return AppBottomActionBar(
      leadingActions: [
        if (onToday != null)
          BottomAction(
            icon: AppIcons.date,
            label: 'Today',
            tooltip: 'Jump to today',
            onTap: loading ? null : onToday,
            enabled: !loading,
          ),
      ],
      primaryAction: BottomAction(
        icon: AppIcons.refresh,
        label: loading ? 'Loading…' : 'Refresh',
        tooltip: 'Load day book',
        onTap: loading ? null : onRefresh,
        enabled: !loading,
      ),
    );
  }

  /// Date-range reports (sales-stock, inventory tabs with filters).
  /// [Refresh?] | Apply
  static AppBottomActionBar dateRangeReport({
    required VoidCallback? onApply,
    VoidCallback? onRefresh,
    bool loading = false,
    bool showRefresh = false,
  }) {
    final enabled = !loading;
    return AppBottomActionBar(
      leadingActions: showRefresh && onRefresh != null
          ? [
              BottomAction(
                icon: AppIcons.refresh,
                label: 'Refresh',
                tooltip: 'Reload with same dates',
                onTap: enabled ? onRefresh : null,
                enabled: enabled,
              ),
            ]
          : const [],
      primaryAction: BottomAction(
        icon: AppIcons.confirm,
        label: loading ? 'Loading…' : 'Apply',
        tooltip: 'Apply filters and load',
        onTap: enabled ? onApply : null,
        enabled: enabled,
      ),
    );
  }

  /// Inventory report tabs — refresh-only or apply + refresh.
  static AppBottomActionBar inventoryReport({
    required VoidCallback? onRefresh,
    VoidCallback? onApply,
    bool loading = false,
    bool showApply = false,
  }) {
    final enabled = !loading;
    if (showApply) {
      return AppBottomActionBar(
        leadingActions: onRefresh != null
            ? [
                BottomAction(
                  icon: AppIcons.refresh,
                  label: 'Refresh',
                  tooltip: 'Reload report',
                  onTap: enabled ? onRefresh : null,
                  enabled: enabled,
                ),
              ]
            : const [],
        primaryAction: BottomAction(
          icon: AppIcons.confirm,
          label: loading ? 'Loading…' : 'Apply',
          tooltip: 'Apply filters',
          onTap: enabled ? onApply : null,
          enabled: enabled,
        ),
      );
    }
    return AppBottomActionBar(
      primaryAction: BottomAction(
        icon: AppIcons.refresh,
        label: loading ? 'Loading…' : 'Refresh',
        tooltip: 'Refresh report',
        onTap: enabled ? onRefresh : null,
        enabled: enabled,
      ),
    );
  }

  /// GST B2B/B2C — no CSV; optional PDF only.
  static AppBottomActionBar gstB2bB2c({
    required VoidCallback? onGenerate,
    VoidCallback? onRefresh,
    VoidCallback? onPdf,
    bool loading = false,
    bool fetched = false,
  }) {
    final enabled = !loading;
    final hasData = fetched;
    return AppBottomActionBar(
      primaryAction: BottomAction(
        icon: AppIcons.reports,
        label: loading ? 'Loading…' : 'Generate',
        tooltip: 'Generate report',
        onTap: enabled ? onGenerate : null,
        enabled: enabled,
      ),
      leadingActions: hasData && onRefresh != null
          ? [
              BottomAction(
                icon: AppIcons.refresh,
                tooltip: 'Refresh report',
                onTap: enabled ? onRefresh : null,
                enabled: enabled,
              ),
            ]
          : const [],
      trailingActions: hasData && onPdf != null
          ? [
              BottomAction(
                icon: AppIcons.pdf,
                tooltip: 'Export PDF',
                onTap: enabled ? onPdf : null,
                enabled: enabled,
              ),
            ]
          : const [],
    );
  }
}
