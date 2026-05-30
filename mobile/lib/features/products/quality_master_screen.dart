import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_icons.dart';
import '../../core/export/export_columns.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/access.dart';
import '../../core/utils/api_helpers.dart';
import '../../core/utils/product_stock.dart';
import '../../core/utils/record_fields.dart';
import '../../providers/app_providers.dart';
import '../../providers/auth_controller.dart';
import '../../widgets/app_bottom_nav.dart';
import '../../widgets/app_bottom_sheet.dart';
import '../../widgets/app_section_tabs.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/bulk_select_bar.dart';
import '../../widgets/confirm_dialog.dart';
import '../../widgets/data_list_tile.dart';
import '../../widgets/product_batches_sheet.dart';
import '../../widgets/product_list_tile.dart';
import '../../widgets/snackbar.dart';
import '../shared/async_list_page.dart';
import '../shared/master_ui.dart';
import '../shared/permission_gate.dart';
import '../shared/product_batch_form_sheet.dart';
import '../shared/product_form_sheet.dart';

// ── Filter model ──────────────────────────────────────────────────────────────

class _ProductFilters {
  const _ProductFilters({
    this.mfgId = '',
    this.divisionId = '',
    this.batchPresence = '',
    this.expiry = '',
    this.stockAlert = '',
  });

  final String mfgId;
  final String divisionId;
  final String batchPresence;
  final String expiry;
  final String stockAlert;

  bool get isActive =>
      mfgId.isNotEmpty ||
      divisionId.isNotEmpty ||
      batchPresence.isNotEmpty ||
      expiry.isNotEmpty ||
      stockAlert.isNotEmpty;

  int get activeCount {
    var n = 0;
    if (mfgId.isNotEmpty) n++;
    if (divisionId.isNotEmpty) n++;
    if (batchPresence.isNotEmpty) n++;
    if (expiry.isNotEmpty) n++;
    if (stockAlert.isNotEmpty) n++;
    return n;
  }

  _ProductFilters copyWith({
    String? mfgId,
    String? divisionId,
    String? batchPresence,
    String? expiry,
    String? stockAlert,
  }) =>
      _ProductFilters(
        mfgId: mfgId ?? this.mfgId,
        divisionId: divisionId ?? this.divisionId,
        batchPresence: batchPresence ?? this.batchPresence,
        expiry: expiry ?? this.expiry,
        stockAlert: stockAlert ?? this.stockAlert,
      );
}

// ── Screen ────────────────────────────────────────────────────────────────────

/// Quality master — mirrors web: **Products** (masters) + **All batches** (inventory rows).
class QualityMasterScreen extends ConsumerStatefulWidget {
  const QualityMasterScreen({super.key, this.initialDetailId});

  /// When set (deep link / notification tap), the product detail sheet for
  /// this product ID is opened automatically after the screen loads.
  final String? initialDetailId;

  @override
  ConsumerState<QualityMasterScreen> createState() => _QualityMasterScreenState();
}

class _QualityMasterScreenState extends ConsumerState<QualityMasterScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _productsListKey = GlobalKey<AsyncListPageState>();
  final _batchesListKey = GlobalKey<AsyncListPageState>();

  _ProductFilters _filters = const _ProductFilters();
  List<Map<String, dynamic>> _mfgList = [];
  List<Map<String, dynamic>> _divisionList = [];

  bool _selectionMode = false;
  final Set<String> _selectedIds = {};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadFilterData();
    if (widget.initialDetailId != null) {
      // Defer until after first frame so the widget tree is ready.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _openProductById(widget.initialDetailId!);
      });
    }
  }

  Future<void> _loadFilterData() async {
    final mfgResp = await ref.read(mfgRepositoryProvider).list({'limit': '500', 'sortBy': 'name'});
    final divResp = await ref.read(divisionRepositoryProvider).list({'limit': '500', 'sortBy': 'name'});
    if (!mounted) return;
    setState(() {
      _mfgList = listFromResponse(mfgResp).rows;
      _divisionList = listFromResponse(divResp).rows;
    });
  }

  // ── Client-side filter ────────────────────────────────────────────────────
  List<Map<String, dynamic>> _applyFilters(List<Map<String, dynamic>> rows) {
    var out = rows;

    if (_filters.mfgId.isNotEmpty) {
      out = out.where((r) {
        final id = (r['mfg_company_id'] ?? r['mfgCompanyId'])?.toString() ?? '';
        return id == _filters.mfgId;
      }).toList();
    }

    if (_filters.divisionId.isNotEmpty) {
      out = out.where((r) {
        final id = (r['division_id'] ?? r['divisionId'])?.toString() ?? '';
        return id == _filters.divisionId;
      }).toList();
    }

    if (_filters.batchPresence == 'with') {
      out = out.where((r) => productActiveBatchCount(r) > 0).toList();
    } else if (_filters.batchPresence == 'without') {
      out = out.where((r) => productActiveBatchCount(r) == 0).toList();
    }

    if (_filters.stockAlert.isNotEmpty) {
      out = out.where((r) {
        final productLow = isProductLowStock(r);
        final lowBatches = productLowBatchCount(r);
        final anyLow = productLow || lowBatches > 0;
        switch (_filters.stockAlert) {
          case 'LOW_ANY':
            return anyLow;
          case 'LOW_PRODUCT':
            return productLow;
          case 'LOW_BATCH':
            return lowBatches > 0;
          case 'NORMAL':
            return !anyLow;
          case 'ALERTS_OFF':
            return !(r['low_stock_alert_enabled'] == true ||
                r['lowStockAlertEnabled'] == true);
          default:
            return true;
        }
      }).toList();
    }

    return out;
  }

  Future<void> _openFilterSheet() async {
    await showAppBottomSheet(
      context: context,
      builder: (_) => _ProductFilterSheet(
        filters: _filters,
        mfgList: _mfgList,
        divisionList: _divisionList,
        onApply: (f) => setState(() => _filters = f),
      ),
    );
  }

  void _enterSelectionMode(String id) {
    setState(() {
      _selectionMode = true;
      _selectedIds.add(id);
    });
    HapticFeedback.mediumImpact();
  }

  void _exitSelectionMode() {
    setState(() {
      _selectionMode = false;
      _selectedIds.clear();
    });
  }

  void _toggleSelection(String id) {
    setState(() {
      if (_selectedIds.contains(id)) {
        _selectedIds.remove(id);
        if (_selectedIds.isEmpty) _selectionMode = false;
      } else {
        _selectedIds.add(id);
      }
    });
  }

  Future<void> _bulkDeleteProducts(BuildContext context) async {
    if (_selectedIds.isEmpty) return;
    final count = _selectedIds.length;
    final ok = await showConfirmDialog(
      context,
      title: 'Delete $count product${count == 1 ? '' : 's'}?',
      message: 'This action cannot be undone.',
      destructive: true,
    );
    if (ok != true || !context.mounted) return;
    final ids = _selectedIds.toList();
    _exitSelectionMode();
    await withSavingOverlay(context, () async {
      final resp = await ref.read(productRepositoryProvider).bulkDelete(ids);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context,
            message: '$count product${count == 1 ? '' : 's'} deleted',
            type: AppSnackType.success);
        _refreshAll();
      } else {
        showAppSnack(context,
            message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _refreshProducts() => _productsListKey.currentState?.refresh();
  void _refreshBatches() => _batchesListKey.currentState?.refresh();
  void _refreshAll() {
    _refreshProducts();
    _refreshBatches();
  }

  /// Fetch a single product by ID and open its detail sheet (used for deep
  /// links and notification taps).
  Future<void> _openProductById(String id) async {
    final resp = await ref.read(productRepositoryProvider).getById(id);
    if (!mounted) return;
    if (resp.ok && resp.data is Map) {
      _openProductDetail(Map<String, dynamic>.from(resp.data as Map));
    }
  }

  void _openProductBatches(Map<String, dynamic> product) {
    final auth = ref.read(authControllerProvider).auth;
    final canUpdate = can(auth, 'PRODUCT_BATCHES', 'UPDATE');
    showProductBatchesSheet(
      context, ref,
      product: product,
      canUpdateProduct: canUpdate,
      onEditProduct: canUpdate ? () => _editProduct(product) : null,
      onBatchTap: _openBatchDetail,
    );
  }

  void _openProductDetail(Map<String, dynamic> product) {
    final auth = ref.read(authControllerProvider).auth;
    final canUpdate = can(auth, 'PRODUCT_BATCHES', 'UPDATE');
    final canDelete = can(auth, 'PRODUCT_BATCHES', 'DELETE');
    openProductDetailSheet(
      context,
      row: product,
      canUpdate: canUpdate,
      canDelete: canDelete,
      onViewBatches: () => _openProductBatches(product),
      onEdit: () => _editProduct(product),
      onDelete: () => _deleteProduct(product),
    );
  }

  void _openBatchDetail(Map<String, dynamic> batch) {
    final auth = ref.read(authControllerProvider).auth;
    final canUpdate = can(auth, 'PRODUCT_BATCHES', 'UPDATE');
    final canDelete = can(auth, 'PRODUCT_BATCHES', 'DELETE');
    openMasterDetailSheet(
      context,
      title: (batch['product_name'] ?? batch['productName'] ?? 'Product').toString(),
      row: batch,
      entity: RecordEntity.productBatch,
      canUpdate: canUpdate,
      canDelete: canDelete,
      onEdit: () => _editBatch(batch),
      onDelete: () => _deleteBatch(batch),
      deleteConfirmTitle: 'Delete batch?',
    );
  }

  Future<void> _createProduct() async {
    final payload = await showProductFormSheet(context, ref, title: 'New product');
    if (payload == null || !mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(productRepositoryProvider).create(payload);
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Product created', type: AppSnackType.success);
        _refreshAll();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _editProduct(Map<String, dynamic> row) async {
    final payload = await showProductFormSheet(
      context, ref, title: 'Edit product', initial: row, isEdit: true,
    );
    if (payload == null || !mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(productRepositoryProvider).update(row['id']!, payload);
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Product updated', type: AppSnackType.success);
        _refreshAll();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _deleteProduct(Map<String, dynamic> row) async {
    await withSavingOverlay(context, () async {
      final resp = await ref.read(productRepositoryProvider).delete(row['id']!);
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Product deleted', type: AppSnackType.success);
        _refreshAll();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _createBatch() async {
    final payload = await showProductBatchFormSheet(context, ref, title: 'New product batch');
    if (payload == null || !mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(productBatchRepositoryProvider).create(payload);
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Batch created', type: AppSnackType.success);
        _refreshAll();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _editBatch(Map<String, dynamic> row) async {
    final payload = await showProductBatchFormSheet(
      context, ref, title: 'Edit batch', initial: row, isEdit: true,
    );
    if (payload == null || !mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(productBatchRepositoryProvider).update(row['id']!, payload);
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Batch updated', type: AppSnackType.success);
        _refreshAll();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _deleteBatch(Map<String, dynamic> row) async {
    await withSavingOverlay(context, () async {
      final resp = await ref.read(productBatchRepositoryProvider).delete(row['id']!);
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Batch deleted', type: AppSnackType.success);
        _refreshAll();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).auth;
    final canAdd = can(auth, 'PRODUCT_BATCHES', 'ADD');
    final canUpdate = can(auth, 'PRODUCT_BATCHES', 'UPDATE');
    final canDelete = can(auth, 'PRODUCT_BATCHES', 'DELETE');
    final totalProductCount = _productsListKey.currentState?.rows.length ?? 0;

    return PermissionGate(
      resource: 'PRODUCT_BATCHES',
      action: 'VIEW',
      title: 'Products',
      child: AppShell(
        title: _selectionMode ? '${_selectedIds.length} selected' : 'Products',
        bottomBar: _selectionMode
            ? BulkSelectBar(
                selectedCount: _selectedIds.length,
                totalCount: totalProductCount,
                onCancel: _exitSelectionMode,
                onSelectAll: () => setState(() {
                  _selectedIds
                    ..clear()
                    ..addAll((_productsListKey.currentState?.rows ?? [])
                        .map((r) => r['id'].toString()));
                }),
                onDeselectAll: () => setState(() => _selectedIds.clear()),
                actions: [
                  if (canDelete)
                    BulkAction(
                      label: 'Delete',
                      icon: AppIcons.delete,
                      destructive: true,
                      onTap: () => _bulkDeleteProducts(context),
                    ),
                ],
              )
            : ListenableBuilder(
                listenable: _tabController,
                builder: (_, __) {
                  final isProducts = _tabController.index == 0;
                  final activeKey = isProducts ? _productsListKey : _batchesListKey;
                  return AppBottomActionBar(
                    primaryAction: BottomAction(
                      icon: AppIcons.add,
                      label: isProducts ? 'New Product' : 'New Batch',
                      tooltip: isProducts
                          ? 'Create new product master'
                          : 'Create new product batch',
                      onTap: canAdd
                          ? (isProducts ? _createProduct : _createBatch)
                          : null,
                      enabled: canAdd,
                    ),
                    leadingActions: [
                      BottomAction(
                        icon: AppIcons.importFile,
                        tooltip: 'Import (CSV)',
                        onTap: () => activeKey.currentState?.triggerImport(),
                      ),
                      BottomAction(
                        icon: AppIcons.refresh,
                        tooltip: 'Refresh list',
                        onTap: _refreshAll,
                      ),
                    ],
                    trailingActions: [
                      // Filter button — badge shows active filter count
                      BottomAction(
                        icon: AppIcons.filter,
                        tooltip: 'Filter products',
                        badge: _filters.isActive ? _filters.activeCount : null,
                        onTap: isProducts ? _openFilterSheet : null,
                      ),
                      BottomAction(
                        icon: AppIcons.download,
                        tooltip: 'Export (CSV)',
                        onTap: () => activeKey.currentState?.triggerExport(),
                      ),
                    ],
                  );
                },
              ),
        child: Column(
          children: [
            AppSectionTabs(
              controller: _tabController,
              tabs: const [
                Tab(text: 'Products'),
                Tab(text: 'All batches'),
              ],
            ),
            AnimatedBuilder(
              animation: _tabController,
              builder: (_, __) => Padding(
                padding: const EdgeInsets.fromLTRB(14, 6, 14, 0),
                child: Text(
                  _tabController.index == 0
                      ? 'Product masters — tap a row to view details or batches.'
                      : 'Every stock row is a product + batch (batch no, expiry, MRP).',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ),
            // Active filter chips
            if (_filters.isActive)
              _ActiveFilterBar(
                filters: _filters,
                mfgList: _mfgList,
                divisionList: _divisionList,
                onClear: () => setState(() => _filters = const _ProductFilters()),
              ),
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  AsyncListPage(
                    key: _productsListKey,
                    title: 'Products',
                    importEntityType: 'PRODUCTS',
                    exportColumns: ExportColumns.products(),
                    exportFilename: 'products',
                    hideToolbar: true,
                    clientFilter: _applyFilters,
                    load: (search, _) async {
                      final resp = await ref.read(productRepositoryProvider).listProducts({
                        if (search.isNotEmpty) 'search': search,
                        'limit': 500,
                      });
                      return listFromResponse(resp);
                    },
                    rowBuilder: (row) {
                      final id = row['id'].toString();
                      if (_selectionMode) {
                        return DataListTile(
                          row: row,
                          isSelected: _selectedIds.contains(id),
                          onSelect: () => _toggleSelection(id),
                          onLongPress: () => _enterSelectionMode(id),
                          onTap: () => _toggleSelection(id),
                        );
                      }
                      return GestureDetector(
                        onLongPress: () => _enterSelectionMode(id),
                        child: ProductMasterListTile(
                          row: row,
                          onTap: () => _openProductDetail(row),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (canUpdate)
                                IconButton(
                                  icon: const Icon(AppIcons.edit, size: 20),
                                  tooltip: 'Edit product',
                                  onPressed: () => _editProduct(row),
                                ),
                              IconButton(
                                icon: const Icon(AppIcons.batch, size: 20),
                                tooltip: 'View batches',
                                onPressed: () => _openProductBatches(row),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                  AsyncListPage(
                    key: _batchesListKey,
                    title: 'All batches',
                    importEntityType: 'PRODUCT_BATCHES',
                    exportColumns: ExportColumns.products(),
                    exportFilename: 'product-batches',
                    hideToolbar: true,
                    load: (search, _) async {
                      final resp = await ref.read(productBatchRepositoryProvider).list({
                        if (search.isNotEmpty) 'search': search,
                      });
                      return listFromResponse(resp);
                    },
                    rowBuilder: (row) => ProductListTile(
                      row: row,
                      onTap: () => _openBatchDetail(row),
                    ),
                    onRowTap: _openBatchDetail,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Active filter chips bar ───────────────────────────────────────────────────

class _ActiveFilterBar extends StatelessWidget {
  const _ActiveFilterBar({
    required this.filters,
    required this.mfgList,
    required this.divisionList,
    required this.onClear,
  });

  final _ProductFilters filters;
  final List<Map<String, dynamic>> mfgList;
  final List<Map<String, dynamic>> divisionList;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final chips = <String>[];
    if (filters.mfgId.isNotEmpty) {
      final mfg = mfgList.firstWhere(
        (m) => m['id']?.toString() == filters.mfgId,
        orElse: () => {},
      );
      chips.add(mfg['name']?.toString() ?? mfg['short_name']?.toString() ?? 'Manufacturer');
    }
    if (filters.divisionId.isNotEmpty) {
      final div = divisionList.firstWhere(
        (d) => d['id']?.toString() == filters.divisionId,
        orElse: () => {},
      );
      chips.add(div['name']?.toString() ?? 'Division');
    }
    if (filters.batchPresence == 'with') chips.add('Has batches');
    if (filters.batchPresence == 'without') chips.add('No batches');
    if (filters.expiry.isNotEmpty) {
      chips.add(switch (filters.expiry) {
        'EXPIRED' => 'Expired',
        'NEAR' => 'Near expiry',
        'VALID' => 'Valid',
        'NONE' => 'No batches',
        _ => filters.expiry,
      });
    }
    if (filters.stockAlert.isNotEmpty) {
      chips.add(switch (filters.stockAlert) {
        'LOW_ANY' => 'Low stock',
        'LOW_PRODUCT' => 'Product low',
        'LOW_BATCH' => 'Batch low',
        'NORMAL' => 'Normal stock',
        'ALERTS_OFF' => 'Alerts off',
        _ => filters.stockAlert,
      });
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 6, 4, 4),
      child: Row(
        children: [
          Expanded(
            child: Wrap(
              spacing: 6,
              runSpacing: 4,
              children: chips
                  .map((c) => Chip(
                        label: Text(c, style: const TextStyle(fontSize: 11)),
                        padding: EdgeInsets.zero,
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                      ))
                  .toList(),
            ),
          ),
          TextButton(
            onPressed: onClear,
            child: const Text('Clear', style: TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }
}

// ── Filter bottom sheet ───────────────────────────────────────────────────────

class _FilterOption {
  const _FilterOption({required this.value, required this.label});
  final String value;
  final String label;
}

class _ProductFilterSheet extends StatefulWidget {
  const _ProductFilterSheet({
    required this.filters,
    required this.mfgList,
    required this.divisionList,
    required this.onApply,
  });

  final _ProductFilters filters;
  final List<Map<String, dynamic>> mfgList;
  final List<Map<String, dynamic>> divisionList;
  final void Function(_ProductFilters) onApply;

  @override
  State<_ProductFilterSheet> createState() => _ProductFilterSheetState();
}

class _ProductFilterSheetState extends State<_ProductFilterSheet> {
  late _ProductFilters _draft;

  @override
  void initState() {
    super.initState();
    _draft = widget.filters;
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final mfgOptions = [
      const _FilterOption(value: '', label: 'All manufacturers'),
      ...widget.mfgList.map((m) => _FilterOption(
            value: m['id']?.toString() ?? '',
            label: m['name']?.toString() ?? m['short_name']?.toString() ?? 'Company',
          )),
    ];
    final divOptions = [
      const _FilterOption(value: '', label: 'All divisions'),
      ...widget.divisionList.map((d) => _FilterOption(
            value: d['id']?.toString() ?? '',
            label: d['name']?.toString() ?? 'Division',
          )),
    ];

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Handle bar
          Center(
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 10),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.withOpacity(0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Row(
            children: [
              const Text('Filter Products',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              const Spacer(),
              if (_draft.isActive)
                TextButton(
                  onPressed: () => setState(() => _draft = const _ProductFilters()),
                  child: const Text('Reset all', style: TextStyle(fontSize: 13)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          // Scrollable filter sections
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Manufacturer
                  _buildSection(
                    label: 'Manufacturer',
                    child: _buildDropdown(
                      value: _draft.mfgId,
                      options: mfgOptions,
                      onChanged: (v) =>
                          setState(() => _draft = _draft.copyWith(mfgId: v ?? '')),
                    ),
                  ),
                  // Division
                  _buildSection(
                    label: 'Division',
                    child: _buildDropdown(
                      value: _draft.divisionId,
                      options: divOptions,
                      onChanged: (v) =>
                          setState(() => _draft = _draft.copyWith(divisionId: v ?? '')),
                    ),
                  ),
                  // Batch presence
                  _buildSection(
                    label: 'Batches',
                    child: _buildChips(
                      value: _draft.batchPresence,
                      options: const [
                        _FilterOption(value: '', label: 'All products'),
                        _FilterOption(value: 'with', label: 'Has batches'),
                        _FilterOption(value: 'without', label: 'No batches yet'),
                      ],
                      onChanged: (v) =>
                          setState(() => _draft = _draft.copyWith(batchPresence: v)),
                    ),
                  ),
                  // Expiry
                  _buildSection(
                    label: 'Expiry',
                    child: _buildChips(
                      value: _draft.expiry,
                      options: const [
                        _FilterOption(value: '', label: 'All expiry'),
                        _FilterOption(value: 'EXPIRED', label: 'Expired'),
                        _FilterOption(value: 'NEAR', label: 'Near expiry (≤ 90d)'),
                        _FilterOption(value: 'VALID', label: 'Valid (> 90d)'),
                        _FilterOption(value: 'NONE', label: 'No batches'),
                      ],
                      onChanged: (v) =>
setState(() => _draft = _draft.copyWith(expiry: v)),
                    ),
                  ),
                  // Stock alerts
                  _buildSection(
                    label: 'Stock alerts',
                    child: _buildChips(
                      value: _draft.stockAlert,
                      options: const [
                        _FilterOption(value: '', label: 'All stock'),
                        _FilterOption(value: 'LOW_ANY', label: 'Low stock (any)'),
                        _FilterOption(value: 'LOW_PRODUCT', label: 'Product low'),
                        _FilterOption(value: 'LOW_BATCH', label: 'Batch low'),
                        _FilterOption(value: 'NORMAL', label: 'Normal'),
                        _FilterOption(value: 'ALERTS_OFF', label: 'Alerts off'),
                      ],
                      onChanged: (v) =>
                          setState(() => _draft = _draft.copyWith(stockAlert: v)),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          ),
          // ── Apply / Cancel buttons ──────────────────────────────────────
          const Divider(height: 1),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text('Cancel'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () {
                    widget.onApply(_draft);
                    Navigator.pop(context);
                  },
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text('Apply filters'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSection({required String label, required Widget child}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textMuted)),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }

  Widget _buildDropdown({
    required String value,
    required List<_FilterOption> options,
    required void Function(String?) onChanged,
  }) {
    return DropdownButtonFormField<String>(
      value: value.isEmpty ? '' : value,
      decoration: InputDecoration(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        isDense: true,
      ),
      items: options
          .map((o) => DropdownMenuItem(value: o.value, child: Text(o.label)))
          .toList(),
      onChanged: onChanged,
    );
  }

  Widget _buildChips({
    required String value,
    required List<_FilterOption> options,
    required void Function(String) onChanged,
  }) {
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      children: options.map((o) {
        final selected = value == o.value;
        return ChoiceChip(
          label: Text(o.label, style: const TextStyle(fontSize: 12)),
          selected: selected,
          onSelected: (_) => onChanged(o.value),
          visualDensity: VisualDensity.compact,
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        );
      }).toList(),
    );
  }
}
