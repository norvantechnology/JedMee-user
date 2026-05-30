import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_icons.dart';
import '../../core/cache/api_cache.dart';
import '../../core/export/csv_export.dart';
import '../../core/export/export_columns.dart';
import '../../core/performance/list_scroll.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/access.dart';
import '../../core/utils/api_helpers.dart';
import '../../core/utils/list_sort.dart';
import '../../core/utils/record_fields.dart';
import '../../providers/app_providers.dart';
import '../../providers/auth_controller.dart';
import '../../widgets/app_bottom_nav.dart';
import '../../widgets/app_filter_chips.dart';
import '../../widgets/bulk_select_bar.dart';
import '../../widgets/confirm_dialog.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/csv_import_sheet.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/list_page_header.dart';
import '../../widgets/list_results_bar.dart';
import '../../widgets/skeleton_loader.dart';
import '../../widgets/snackbar.dart';
import '../shared/customer_form_sheet.dart';
import '../shared/master_ui.dart';
import '../shared/party_bill_history.dart';
import '../shared/party_pending_helpers.dart';
import '../shared/permission_gate.dart';

class CustomersScreen extends ConsumerStatefulWidget {
  const CustomersScreen({super.key});

  @override
  ConsumerState<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends ConsumerState<CustomersScreen> {
  String _search = '';
  String? _typeFilter;   // customer type filter
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _allRows = [];
  List<Map<String, dynamic>> _rows = [];

  // ── Bulk selection ──────────────────────────────────────────────────────────
  bool _selectionMode = false;
  final Set<String> _selectedIds = {};

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

  Future<void> _bulkDelete(BuildContext context) async {
    if (_selectedIds.isEmpty) return;
    final count = _selectedIds.length;
    final ok = await showConfirmDialog(
      context,
      title: 'Delete $count customer${count == 1 ? '' : 's'}?',
      message: 'This action cannot be undone.',
      destructive: true,
    );
    if (ok != true || !context.mounted) return;
    final ids = _selectedIds.toList();
    _exitSelectionMode();
    await withSavingOverlay(context, () async {
      final resp = await ref.read(customerRepositoryProvider).bulkDelete(ids);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context,
            message: '$count customer${count == 1 ? '' : 's'} deleted',
            type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context,
            message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _applyFilters() {
    setState(() {
      _rows = _allRows.where((r) {
        if (_typeFilter != null) {
          final type = (r['customer_type'] ?? r['customerType'] ?? '').toString();
          if (type != _typeFilter) return false;
        }
        return true;
      }).toList();
    });
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    ApiCache.instance.invalidateContaining('/customers');
    final resp = await ref.read(customerRepositoryProvider).list({
      if (_search.isNotEmpty) 'search': _search,
      ...kCreatedAtDescSort,
    });
    final result = listFromResponse(resp);
    if (!mounted) return;
    var rows = result.rows;
    if (result.error == null) {
      rows = await enrichPartyOutstanding(
        ref: ref,
        kind: PartyKind.customer,
        rows: rows,
      );
    }
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = result.error;
      _allRows = rows;
    });
    _applyFilters();
  }

  Future<void> _create(BuildContext context) async {
    final auth = ref.read(authControllerProvider).auth;
    if (!can(auth, 'CUSTOMERS', 'ADD')) return;
    final data = await showCustomerFormSheet(context, ref, title: 'New customer');
    if (data == null || !context.mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(customerRepositoryProvider).create(data);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Customer created', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _edit(BuildContext context, Map<String, dynamic> row) async {
    final data = await showCustomerFormSheet(
      context,
      ref,
      title: 'Edit customer',
      initial: row,
    );
    if (data == null || !context.mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(customerRepositoryProvider).update(row['id']!, data);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Customer updated', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _delete(BuildContext context, Map<String, dynamic> row) async {
    await withSavingOverlay(context, () async {
      final resp = await ref.read(customerRepositoryProvider).delete(row['id']!);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Customer deleted', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _triggerImport() async {
    final done = await showCsvImportSheet(context, entityType: 'CUSTOMERS');
    if (done == true) _load();
  }

  Future<void> _triggerExport() async {
    try {
      await CsvExport.download(
        filename: 'customers',
        columns: ExportColumns.customers(),
        rows: _rows,
      );
      if (mounted) showAppSnack(context, message: 'Export downloaded', type: AppSnackType.success);
    } catch (e) {
      if (mounted) showAppSnack(context, message: e.toString(), type: AppSnackType.error);
    }
  }

  Future<void> _openDetail(
    BuildContext context,
    Map<String, dynamic> row, {
    required bool canUpdate,
    required bool canDelete,
    required bool canViewBills,
  }) async {
    final pending = partyOutstandingAmount(row);
    await openMasterDetailSheet(
      context,
      title: rowLabel(row),
      row: row,
      entity: RecordEntity.customer,
      subtitle: partyDetailSubtitle(row),
      canUpdate: canUpdate,
      canDelete: canDelete,
      onEdit: () => _edit(context, row),
      onDelete: () => _delete(context, row),
      deleteConfirmTitle: 'Delete customer?',
      extraActions: canViewBills
          ? [
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  showPartyBillHistorySheet(
                    context,
                    ref,
                    kind: PartyBillKind.customer,
                    partyId: row['id'].toString(),
                    partyName: rowLabel(row),
                    pendingAmount: pending,
                  );
                },
                icon: const Icon(AppIcons.invoice, size: 18),
                label: const Text('Sales bills'),
              ),
            ]
          : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).auth;
    final canAdd = can(auth, 'CUSTOMERS', 'ADD');
    final canUpdate = can(auth, 'CUSTOMERS', 'UPDATE');
    final canDelete = can(auth, 'CUSTOMERS', 'DELETE');
    final canViewBills = can(auth, 'SALES_INVOICES', 'VIEW');

    return PermissionGate(
      resource: 'CUSTOMERS',
      action: 'VIEW',
      title: 'Customers',
      child: AppShell(
        title: _selectionMode ? '${_selectedIds.length} selected' : 'Customers',
        bottomBar: _selectionMode
            ? BulkSelectBar(
                selectedCount: _selectedIds.length,
                totalCount: _rows.length,
                onCancel: _exitSelectionMode,
                onSelectAll: () => setState(() {
                  _selectedIds
                    ..clear()
                    ..addAll(_rows.map((r) => r['id'].toString()));
                }),
                onDeselectAll: () => setState(() => _selectedIds.clear()),
                actions: [
                  if (canDelete)
                    BulkAction(
                      label: 'Delete',
                      icon: AppIcons.delete,
                      destructive: true,
                      onTap: () => _bulkDelete(context),
                    ),
                ],
              )
            : AppBottomActionBar(
          primaryAction: BottomAction(
            icon: AppIcons.add,
            label: 'New Customer',
            tooltip: 'Add a new customer',
            onTap: canAdd ? () => _create(context) : null,
            enabled: canAdd,
          ),
          leadingActions: [
            BottomAction(
              icon: AppIcons.importFile,
              tooltip: 'Import customers (CSV)',
              onTap: _triggerImport,
            ),
            BottomAction(
              icon: AppIcons.refresh,
              tooltip: 'Refresh list',
              onTap: _load,
            ),
          ],
          trailingActions: [
            BottomAction(
              icon: AppIcons.download,
              tooltip: 'Export customers (CSV)',
              onTap: _rows.isNotEmpty ? _triggerExport : null,
              enabled: _rows.isNotEmpty,
            ),
          ],
        ),
        child: Column(
          children: [
            ListPageHeader(
              search: _search,
              searchHint: 'Search customers…',
              onSearchChanged: (v) {
                setState(() => _search = v);
                _load();
              },
              compactSearch: true,
              footer: AppFilterChipsBar(
                selected: _typeFilter,
                options: const [
                  'RETAILER',
                  'HOSPITAL',
                  'CLINIC',
                  'PATIENT',
                  'DOCTOR',
                  'OTHER',
                ],
                onSelected: (v) {
                  setState(() => _typeFilter = v);
                  _applyFilters();
                },
              ),
            ),
            if (!_loading && _error == null)
              ListResultsBar(
                count: _rows.length,
                countLabel:
                    '${_rows.length} customer${_rows.length == 1 ? '' : 's'}',
                onClearFilters: _typeFilter != null
                    ? () {
                        setState(() => _typeFilter = null);
                        _applyFilters();
                      }
                    : null,
              ),

            // ── List ────────────────────────────────────────────────────────
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.translucent,
                onHorizontalDragEnd: (details) {
                  const kVelocity = 300.0;
                  final v = details.primaryVelocity ?? 0;
                  const typeOptions = <String?>[
                    null,
                    'RETAILER',
                    'HOSPITAL',
                    'CLINIC',
                    'PATIENT',
                    'DOCTOR',
                    'OTHER',
                  ];
                  final idx = typeOptions.indexOf(_typeFilter);
                  if (v < -kVelocity) {
                    final next = (idx + 1).clamp(0, typeOptions.length - 1);
                    if (next != idx) {
                      setState(() => _typeFilter = typeOptions[next]);
                      _applyFilters();
                    }
                  } else if (v > kVelocity) {
                    final prev = (idx - 1).clamp(0, typeOptions.length - 1);
                    if (prev != idx) {
                      setState(() => _typeFilter = typeOptions[prev]);
                      _applyFilters();
                    }
                  }
                },
                child: _loading
                  ? const SkeletonListPage(showHeader: false)
                  : _error != null
                      ? EmptyState(
                          title: 'Could not load',
                          message: _error,
                          icon: AppIcons.wifiOff,
                          actionLabel: 'Try again',
                          onAction: _load,
                        )
                      : _rows.isEmpty
                          ? EmptyState(
                              title: 'No customers found',
                              message: _search.isNotEmpty || _typeFilter != null
                                  ? 'Try adjusting your search or filter.'
                                  : 'Add your first customer to get started.',
                              icon: AppIcons.customers,
                              actionLabel: canAdd ? 'Add customer' : null,
                              onAction: canAdd ? () => _create(context) : null,
                            )
                          : RefreshIndicator(
                              onRefresh: _load,
                              child: ListView.builder(
                                padding: ListScroll.listPadding(
                                  bottom: AppSpacing.fabClearance,
                                ),
                                physics: ListScroll.physics,
                                cacheExtent: ListScroll.cacheExtent,
                                keyboardDismissBehavior: ListScroll.keyboardDismiss,
                                itemCount: _rows.length,
                                itemBuilder: (_, i) {
                                  final row = _rows[i];
                                  final id = row['id'].toString();
                                  final isActive = row['is_active'] == true;
                                  return partyMasterListTile(
                                    row: row,
                                    title: rowLabel(row),
                                    subtitle: (row['phone_number'] ?? row['phoneNumber'] ?? '')
                                        .toString()
                                        .trim(),
                                    status: isActive ? 'ACTIVE' : 'INACTIVE',
                                    isSelected: _selectionMode ? _selectedIds.contains(id) : null,
                                    onSelect: () => _toggleSelection(id),
                                    onLongPress: () => _enterSelectionMode(id),
                                    onTap: _selectionMode
                                        ? () => _toggleSelection(id)
                                        : () => _openDetail(
                                              context,
                                              row,
                                              canUpdate: canUpdate,
                                              canDelete: canDelete,
                                              canViewBills: canViewBills,
                                            ),
                                  );
                                },
                              ),
                            ),
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
