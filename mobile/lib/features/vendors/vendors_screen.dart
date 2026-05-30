import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_icons.dart';
import '../../core/cache/api_cache.dart';
import '../../core/export/csv_export.dart';
import '../../core/export/export_columns.dart';
import '../../core/performance/list_scroll.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/access.dart';
import '../../core/utils/api_helpers.dart';
import '../../core/utils/record_fields.dart';
import '../../widgets/app_bottom_sheet.dart';
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
import '../shared/master_ui.dart';
import '../shared/party_bill_history.dart';
import '../shared/party_pending_helpers.dart';
import '../shared/permission_gate.dart';
import '../../widgets/form_sheet_loading.dart';
import '../../widgets/searchable_picker.dart';

class VendorsScreen extends ConsumerStatefulWidget {
  const VendorsScreen({super.key});

  @override
  ConsumerState<VendorsScreen> createState() => _VendorsScreenState();
}

class _VendorsScreenState extends ConsumerState<VendorsScreen> {
  String _search = '';
  String? _statusFilter; // 'ACTIVE' | 'INACTIVE' | null
  String? _typeFilter; // 'WHOLESALER' | 'DISTRIBUTOR' | 'DIRECT_MFG' | 'OTHER' | null
  bool _loading = true;
  String? _error;
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
      title: 'Delete $count supplier${count == 1 ? '' : 's'}?',
      message: 'This action cannot be undone.',
      destructive: true,
    );
    if (ok != true || !context.mounted) return;
    final ids = _selectedIds.toList();
    _exitSelectionMode();
    await withSavingOverlay(context, () async {
      final resp = await ref.read(vendorRepositoryProvider).bulkDelete(ids);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context,
            message: '$count supplier${count == 1 ? '' : 's'} deleted',
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

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    ApiCache.instance.invalidateContaining('/vendors');
    final resp = await ref.read(vendorRepositoryProvider).list({
      if (_search.isNotEmpty) 'search': _search,
    });
    final result = listFromResponse(resp);
    if (!mounted) return;
    var rows = result.rows;
    if (result.error == null) {
      rows = await enrichPartyOutstanding(
        ref: ref,
        kind: PartyKind.vendor,
        rows: rows,
      );
    }
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = result.error;
      _rows = rows.where((v) {
        final isActive = v['is_active'] == true;
        if (_statusFilter == 'ACTIVE' && !isActive) return false;
        if (_statusFilter == 'INACTIVE' && isActive) return false;
        if (_typeFilter != null) {
          final type = (v['vendor_type'] ?? 'WHOLESALER').toString();
          if (type != _typeFilter) return false;
        }
        return true;
      }).toList();
    });
  }

  Future<void> _create(BuildContext context) async {
    final auth = ref.read(authControllerProvider).auth;
    if (!can(auth, 'VENDORS', 'ADD')) return;
    final result = await showVendorFormSheet(context, ref, title: 'New supplier');
    if (result == null || !context.mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(vendorRepositoryProvider).create(result);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Supplier created', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _edit(BuildContext context, Map<String, dynamic> row) async {
    final result = await showVendorFormSheet(context, ref, title: 'Edit supplier', initial: row);
    if (result == null || !context.mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(vendorRepositoryProvider).update(row['id']!, result);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Supplier updated', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _delete(BuildContext context, Map<String, dynamic> row) async {
    await withSavingOverlay(context, () async {
      final resp = await ref.read(vendorRepositoryProvider).delete(row['id']!);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Supplier deleted', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _triggerImport() async {
    final done = await showCsvImportSheet(context, entityType: 'SUPPLIERS');
    if (done == true) _load();
  }

  Future<void> _triggerExport() async {
    try {
      await CsvExport.download(
        filename: 'suppliers',
        columns: ExportColumns.vendors(),
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
      title: rowLabel(row, ['firm_name', 'name']),
      row: row,
      entity: RecordEntity.vendor,
      subtitle: partyDetailSubtitle(row),
      canUpdate: canUpdate,
      canDelete: canDelete,
      onEdit: () => _edit(context, row),
      onDelete: () => _delete(context, row),
      deleteConfirmTitle: 'Delete supplier?',
      extraActions: canViewBills
          ? [
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  showPartyBillHistorySheet(
                    context,
                    ref,
                    kind: PartyBillKind.vendor,
                    partyId: row['id'].toString(),
                    partyName: rowLabel(row, ['firm_name', 'name']),
                    pendingAmount: pending,
                  );
                },
                icon: const Icon(AppIcons.invoice, size: 18),
                label: const Text('Purchase bills'),
              ),
            ]
          : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).auth;
    final canAdd = can(auth, 'VENDORS', 'ADD');
    final canUpdate = can(auth, 'VENDORS', 'UPDATE');
    final canDelete = can(auth, 'VENDORS', 'DELETE');
    final canViewBills = can(auth, 'PURCHASE_INVOICES', 'VIEW');

    return PermissionGate(
      resource: 'VENDORS',
      action: 'VIEW',
      title: 'Suppliers',
      child: AppShell(
        title: _selectionMode
            ? '${_selectedIds.length} selected'
            : 'Suppliers',
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
                onDeselectAll: () =>
                    setState(() => _selectedIds.clear()),
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
            label: 'New Supplier',
            tooltip: 'Add a new supplier',
            onTap: canAdd ? () => _create(context) : null,
            enabled: canAdd,
          ),
          leadingActions: [
            BottomAction(
              icon: AppIcons.importFile,
              tooltip: 'Import suppliers (CSV)',
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
              tooltip: 'Export suppliers (CSV)',
              onTap: _rows.isNotEmpty ? _triggerExport : null,
              enabled: _rows.isNotEmpty,
            ),
          ],
        ),
        child: Column(
          children: [
            ListPageHeader(
              search: _search,
              searchHint: 'Search suppliers…',
              onSearchChanged: (v) {
                setState(() => _search = v);
                _load();
              },
              compactSearch: true,
              footer: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppFilterChipsBar(
                    selected: _statusFilter,
                    options: const ['ACTIVE', 'INACTIVE'],
                    onSelected: (v) {
                      setState(() => _statusFilter = v);
                      _load();
                    },
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  AppFilterChipsBar(
                    selected: _typeFilter,
                    options: const [
                      'WHOLESALER',
                      'DISTRIBUTOR',
                      'DIRECT_MFG',
                      'OTHER',
                    ],
                    onSelected: (v) {
                      setState(() => _typeFilter = v);
                      _load();
                    },
                  ),
                ],
              ),
            ),
            if (!_loading && _error == null)
              ListResultsBar(
                count: _rows.length,
                countLabel: '${_rows.length} supplier${_rows.length == 1 ? '' : 's'}',
                onClearFilters: (_statusFilter != null || _typeFilter != null)
                    ? () {
                        setState(() {
                          _statusFilter = null;
                          _typeFilter = null;
                        });
                        _load();
                      }
                    : null,
              ),
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.translucent,
                onHorizontalDragEnd: (details) {
                  const kVelocity = 300.0;
                  final v = details.primaryVelocity ?? 0;
                  const typeOptions = <String?>[
                    null,
                    'WHOLESALER',
                    'DISTRIBUTOR',
                    'DIRECT_MFG',
                    'OTHER',
                  ];
                  final idx = typeOptions.indexOf(_typeFilter);
                  if (v < -kVelocity) {
                    final next = (idx + 1).clamp(0, typeOptions.length - 1);
                    if (next != idx) {
                      setState(() => _typeFilter = typeOptions[next]);
                      _load();
                    }
                  } else if (v > kVelocity) {
                    final prev = (idx - 1).clamp(0, typeOptions.length - 1);
                    if (prev != idx) {
                      setState(() => _typeFilter = typeOptions[prev]);
                      _load();
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
                              title: 'No suppliers found',
                              message: _search.isNotEmpty || _statusFilter != null || _typeFilter != null
                                  ? 'Try adjusting your search or filters.'
                                  : 'Add your first supplier to get started.',
                              icon: AppIcons.supplier,
                              actionLabel: canAdd ? 'Add supplier' : null,
                              onAction: canAdd ? () => _create(context) : null,
                            )
                          : RefreshIndicator(
                              onRefresh: _load,
                              child: ListView.builder(
                                padding: ListScroll.listPadding(bottom: AppSpacing.fabClearance),
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
                                    title: rowLabel(row, ['firm_name', 'name']),
                                    subtitle: () {
                                      final phone = (row['phone_number'] ?? row['phoneNumber'] ?? '').toString().trim();
                                      if (phone.isNotEmpty) return phone;
                                      return (row['main_company'] ?? row['mainCompany'] ?? '').toString().trim();
                                    }(),
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

// ─────────────────────────────────────────────────────────────────────────────
// Vendor form sheet — mirrors web VendorMasterModal.jsx field parity
// ─────────────────────────────────────────────────────────────────────────────

const _vendorTypes = [
  ('WHOLESALER', 'Wholesaler'),
  ('DISTRIBUTOR', 'Distributor'),
  ('DIRECT_MFG', 'Direct manufacturer'),
  ('OTHER', 'Other'),
];

/// Shows the vendor add/edit form as a bottom sheet.
/// Returns the payload map on success, null on cancel.
Future<Map<String, dynamic>?> showVendorFormSheet(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  Map<String, dynamic>? initial,
}) async {
  if (!context.mounted) return null;

  return showAppBottomSheet<Map<String, dynamic>>(
    context: context,
    builder: (ctx) => _VendorFormSheet(
      title: title,
      initial: initial,
      isRetailer: isRetailer(ref.read(authControllerProvider).auth),
      isEdit: initial != null,
    ),
  );
}

class _VendorFormSheet extends ConsumerStatefulWidget {
  const _VendorFormSheet({
    required this.title,
    this.initial,
    required this.isRetailer,
    required this.isEdit,
  });

  final String title;
  final Map<String, dynamic>? initial;
  final bool isRetailer;
  final bool isEdit;

  @override
  ConsumerState<_VendorFormSheet> createState() => _VendorFormSheetState();
}

class _VendorFormSheetState extends ConsumerState<_VendorFormSheet> {
  bool _loadingDeps = true;
  String? _depsError;
  List<Map<String, dynamic>> _mfgRows = [];
  final _formKey = GlobalKey<FormState>();
  bool _submitted = false;

  late final TextEditingController _name;
  late final TextEditingController _code;
  late final TextEditingController _shortName;
  late final TextEditingController _creditDays;
  late final TextEditingController _phoneNumber;
  late final TextEditingController _email;
  late final TextEditingController _address;
  late final TextEditingController _rackNumber;
  late final TextEditingController _mainCompany;
  late final TextEditingController _notes;

  String _vendorType = 'WHOLESALER';
  String? _mfgCompanyId;
  bool _isActive = true;

  @override
  void initState() {
    super.initState();
    final r = widget.initial ?? {};
    _name = TextEditingController(text: _str(r, ['name', 'firm_name']));
    _code = TextEditingController(text: _str(r, ['code']));
    _shortName = TextEditingController(text: _str(r, ['short_name', 'shortName']));
    _creditDays = TextEditingController(
      text: (r['credit_days'] ?? r['creditDays'] ?? '').toString().replaceAll('null', ''),
    );
    _phoneNumber = TextEditingController(text: _str(r, ['phone_number', 'phoneNumber']));
    _email = TextEditingController(text: _str(r, ['email']));
    _address = TextEditingController(text: _str(r, ['address']));
    _rackNumber = TextEditingController(text: _str(r, ['rack_number', 'rackNumber']));
    _mainCompany = TextEditingController(text: _str(r, ['main_company', 'mainCompany']));
    _notes = TextEditingController(text: _str(r, ['notes']));
    final vt = _str(r, ['vendor_type', 'vendorType']);
    _vendorType = vt.isNotEmpty ? vt : 'WHOLESALER';
    final mfgId = _str(r, ['mfg_company_id', 'mfgCompanyId']);
    _mfgCompanyId = mfgId.isNotEmpty ? mfgId : null;
    _isActive = r['is_active'] != false && r['isActive'] != false;
    if (widget.isRetailer) {
      _loadingDeps = false;
    } else {
      _seedMfgFromInitial();
      _loadDeps();
    }
  }

  void _seedMfgFromInitial() {
    if (_mfgCompanyId == null || widget.initial == null) return;
    final r = widget.initial!;
    _mfgRows = [
      {
        'id': _mfgCompanyId,
        'name': _str(r, ['mfg_company_name', 'mfgCompanyName']),
        'code': _str(r, ['mfg_company_code', 'mfgCompanyCode']),
      },
    ];
    _loadingDeps = false;
  }

  Future<void> _loadDeps() async {
    try {
      final mfgResp =
          await ref.read(mfgRepositoryProvider).list({'sortBy': 'name', 'sortDir': 'asc'});
      if (!mounted) return;
      final rows = listFromResponse(mfgResp).rows;
      final seen = _mfgRows.map((e) => e['id']?.toString()).whereType<String>().toSet();
      setState(() {
        _mfgRows = [
          ..._mfgRows,
          ...rows.where((e) => !seen.contains(e['id']?.toString())),
        ];
        _loadingDeps = false;
        _depsError = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingDeps = false;
        _depsError = 'Could not load manufacturers. Tap retry.';
      });
    }
  }

  String _str(Map<String, dynamic> r, List<String> keys) {
    for (final k in keys) {
      final v = r[k];
      if (v != null && v.toString().isNotEmpty && v.toString() != 'null') {
        return v.toString();
      }
    }
    return '';
  }

  @override
  void dispose() {
    _name.dispose();
    _code.dispose();
    _shortName.dispose();
    _creditDays.dispose();
    _phoneNumber.dispose();
    _email.dispose();
    _address.dispose();
    _rackNumber.dispose();
    _mainCompany.dispose();
    _notes.dispose();
    super.dispose();
  }

  void _submit() {
    setState(() => _submitted = true);
    if (!_formKey.currentState!.validate()) return;

    // Phone is required — matches web VendorMasterModal canSubmit check
    final phoneDigits = _phoneNumber.text.trim().replaceAll(RegExp(r'\D'), '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) return;

    final creditDaysVal = int.tryParse(_creditDays.text.trim()) ?? 0;

    final payload = <String, dynamic>{
      'name': _name.text.trim(),
      'vendorType': _vendorType,
      'creditDays': creditDaysVal < 0 ? 0 : creditDaysVal,
      'phoneCountryCode': phoneDigits.isNotEmpty ? '+91' : '',
      'phoneNumber': phoneDigits,
      'email': _email.text.trim(),
      'address': _address.text.trim(),
      'mainCompany': _mainCompany.text.trim(),
      'notes': _notes.text.trim(),
      'isActive': _isActive,
      if (_code.text.trim().isNotEmpty) 'code': _code.text.trim(),
      if (_shortName.text.trim().isNotEmpty) 'shortName': _shortName.text.trim(),
      if (!widget.isRetailer && _rackNumber.text.trim().isNotEmpty)
        'rackNumber': _rackNumber.text.trim(),
      if (!widget.isRetailer && _mfgCompanyId != null && _mfgCompanyId!.isNotEmpty)
        'mfgCompanyId': _mfgCompanyId,
      if (widget.isRetailer && widget.isEdit) 'mfgCompanyId': null,
    };

    Navigator.pop(context, payload);
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.sizeOf(context).height * 0.92;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final fieldBorderColor = AppColors.colorMix(AppColors.text, 14, AppColors.border);

    InputDecoration inputDec({String? hint}) => InputDecoration(
          hintText: hint,
          hintStyle: AppTypography.secondary,
          filled: true,
          fillColor: AppColors.card,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppTheme.radius),
            borderSide: BorderSide(color: fieldBorderColor, width: 0.5),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppTheme.radius),
            borderSide: BorderSide(color: fieldBorderColor, width: 0.5),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppTheme.radius),
            borderSide: const BorderSide(color: AppColors.primaryMid),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppTheme.radius),
            borderSide: const BorderSide(color: AppColors.danger),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppTheme.radius),
            borderSide: const BorderSide(color: AppColors.danger),
          ),
        );

    Widget label(String text, {bool required = false}) => Padding(
          padding: const EdgeInsets.only(bottom: 5),
          child: Row(
            children: [
              Text(text, style: AppTypography.inputLabel),
              if (required)
                Text(' •',
                    style: AppTypography.inputLabel.copyWith(
                      color: AppColors.danger,
                      fontWeight: FontWeight.w700,
                    )),
            ],
          ),
        );

    const gap = SizedBox(height: AppSpacing.formGap);

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxH),
        child: Container(
          decoration: const BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 12, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(widget.title, style: AppTypography.sectionTitle),
                          const SizedBox(height: 4),
                          Text('• Required fields', style: AppTypography.requiredNote),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(AppIcons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
              const Divider(height: 20),
              Flexible(
                child: _loadingDeps
                    ? const FormSheetLoadingBody(message: 'Loading form data…')
                    : _depsError != null
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(24),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(_depsError!, textAlign: TextAlign.center),
                                  const SizedBox(height: 12),
                                  FilledButton(
                                    onPressed: () {
                                      setState(() {
                                        _loadingDeps = true;
                                        _depsError = null;
                                      });
                                      _loadDeps();
                                    },
                                    child: const Text('Retry'),
                                  ),
                                ],
                              ),
                            ),
                          )
                        : Form(
                  key: _formKey,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                    shrinkWrap: true,
                    children: [
                      // Supplier name (required)
                      label('Supplier name', required: true),
                      TextFormField(
                        controller: _name,
                        style: AppTypography.body,
                        decoration: inputDec(),
                        validator: (v) =>
                            (v == null || v.trim().length < 2) ? 'Name is required (min 2 chars)' : null,
                      ),
                      gap,

                      // Credit days
                      label('Credit days'),
                      TextFormField(
                        controller: _creditDays,
                        style: AppTypography.body,
                        keyboardType: TextInputType.number,
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                        decoration: inputDec(hint: '0'),
                      ),
                      gap,

                      // Code
                      label('Code'),
                      TextFormField(
                        controller: _code,
                        style: AppTypography.body,
                        decoration: inputDec(hint: 'Optional e.g. SUP-0001'),
                      ),
                      gap,

                      // Short name
                      label('Short name'),
                      TextFormField(
                        controller: _shortName,
                        style: AppTypography.body,
                        decoration: inputDec(),
                      ),
                      gap,

                      // Supplier type (dropdown — matches web vendorType)
                      SearchablePickerField(
                        compact: true,
                        label: 'Supplier type',
                        value: _vendorType,
                        items: _vendorTypes
                            .map((t) => SearchablePickerItem(value: t.$1, label: t.$2))
                            .toList(),
                        onChanged: (v) => setState(() => _vendorType = v ?? 'WHOLESALER'),
                      ),
                      gap,

                      // Rack / shelf (wholesaler only)
                      if (!widget.isRetailer) ...[
                        label('Rack / shelf'),
                        TextFormField(
                          controller: _rackNumber,
                          style: AppTypography.body,
                          decoration: inputDec(hint: 'e.g. A-01'),
                        ),
                        gap,
                      ],

                      // Main company / brand
                      label('Main company'),
                      TextFormField(
                        controller: _mainCompany,
                        style: AppTypography.body,
                        decoration: inputDec(hint: 'Parent or flagship name'),
                      ),
                      gap,

                      // Linked manufacturer (wholesaler only)
                      if (!widget.isRetailer && _mfgRows.isNotEmpty) ...[
                        SearchablePickerField(
                          compact: true,
                          label: 'Linked manufacturer',
                          value: _mfgCompanyId,
                          hint: 'None — optional',
                          items: _mfgRows
                              .map((m) {
                                final id = m['id']?.toString() ?? '';
                                final name = (m['name'] ?? '').toString();
                                final code = (m['code'] ?? '').toString();
                                return SearchablePickerItem(
                                  value: id,
                                  label: code.isNotEmpty ? '$name ($code)' : name,
                                );
                              })
                              .where((e) => e.value.isNotEmpty)
                              .toList(),
                          onChanged: (v) => setState(() => _mfgCompanyId = v),
                        ),
                        gap,
                      ],

                      // Phone (required — matches web)
                      label('Phone', required: true),
                      TextFormField(
                        controller: _phoneNumber,
                        style: AppTypography.body,
                        keyboardType: TextInputType.phone,
                        decoration: inputDec(hint: '7–15 digits'),
                        validator: (v) {
                          if (!_submitted) return null;
                          final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                          if (digits.length < 7 || digits.length > 15) {
                            return 'Phone must be 7–15 digits';
                          }
                          return null;
                        },
                      ),
                      gap,

                      // Email
                      label('Email'),
                      TextFormField(
                        controller: _email,
                        style: AppTypography.body,
                        keyboardType: TextInputType.emailAddress,
                        decoration: inputDec(hint: 'billing@example.com'),
                      ),
                      gap,

                      // Address
                      label('Address'),
                      TextFormField(
                        controller: _address,
                        style: AppTypography.body,
                        maxLines: 2,
                        decoration: inputDec(),
                      ),
                      gap,

                      // Notes
                      label('Notes'),
                      TextFormField(
                        controller: _notes,
                        style: AppTypography.body,
                        maxLines: 3,
                        decoration: inputDec(hint: 'Payment instructions, delivery slots…'),
                      ),
                      gap,

                      // Active toggle
                      Row(
                        children: [
                          Switch(
                            value: _isActive,
                            onChanged: (v) => setState(() => _isActive = v),
                            activeColor: AppColors.primary,
                          ),
                          const SizedBox(width: 8),
                          Text('Active supplier', style: AppTypography.body),
                        ],
                      ),
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              ),
              if (!_loadingDeps && _depsError == null)
              Container(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  AppSpacing.sm,
                  AppSpacing.md,
                  AppSpacing.md + MediaQuery.paddingOf(context).bottom,
                ),
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: AppColors.border, width: 0.5)),
                  color: AppColors.card,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(context),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.textMuted,
                          side: BorderSide(
                            color: AppColors.colorMix(AppColors.text, 18, AppColors.border),
                            width: 0.5,
                          ),
                          minimumSize: const Size(0, 48),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                          ),
                          textStyle: AppTypography.labelSemibold,
                        ),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: FilledButton(
                        onPressed: _submit,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          minimumSize: const Size(0, 48),
                          elevation: 2,
                          shadowColor: AppColors.primary.withOpacity(0.28),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                          ),
                          textStyle: AppTypography.labelSemibold,
                        ),
                        child: Text(widget.initial != null ? 'Save changes' : 'Create supplier'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
