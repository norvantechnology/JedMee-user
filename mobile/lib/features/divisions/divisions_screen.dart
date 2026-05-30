import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_icons.dart';
import '../../core/cache/api_cache.dart';
import '../../core/export/export_columns.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/access.dart';
import '../../core/utils/api_helpers.dart';
import '../../core/utils/list_sort.dart';
import '../../core/utils/record_fields.dart';
import '../../providers/app_providers.dart';
import '../../providers/auth_controller.dart';
import '../../widgets/app_bottom_sheet.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/page_bottom_bars.dart';
import '../../widgets/snackbar.dart';
import '../shared/async_list_page.dart';
import '../shared/master_ui.dart';
import '../shared/party_bill_history.dart';
import '../shared/party_pending_helpers.dart';
import '../shared/permission_gate.dart';
import '../../widgets/form_sheet_loading.dart';
import '../../widgets/searchable_picker.dart';

class DivisionsScreen extends ConsumerStatefulWidget {
  const DivisionsScreen({super.key});

  @override
  ConsumerState<DivisionsScreen> createState() => _DivisionsScreenState();
}

class _DivisionsScreenState extends ConsumerState<DivisionsScreen> {
  final _listKey = GlobalKey<AsyncListPageState>();

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).auth;
    final canAdd = can(auth, 'DIVISIONS', 'ADD');
    final canUpdate = can(auth, 'DIVISIONS', 'UPDATE');
    final canDelete = can(auth, 'DIVISIONS', 'DELETE');

    final canViewBills = can(auth, 'PURCHASE_INVOICES', 'VIEW');

    return PermissionGate(
      resource: 'DIVISIONS',
      action: 'VIEW',
      title: 'Divisions',
      child: AppShell(
        title: 'Divisions',
        bottomBar: PageBottomBars.masterList(
          primaryLabel: 'New Division',
          canCreate: canAdd,
          onCreate: () => _create(context),
          onImport: () => _listKey.currentState?.triggerImport(),
          onRefresh: () => _listKey.currentState?.refresh(),
          onExport: () => _listKey.currentState?.triggerExport(),
        ),
        child: AsyncListPage(
          key: _listKey,
          title: 'Divisions',
          hideToolbar: true,
          importEntityType: 'DIVISIONS',
          exportColumns: ExportColumns.genericMaster(),
          exportFilename: 'divisions',
          load: (search, _) async {
            ApiCache.instance.invalidateContaining('/divisions');
            final resp = await ref.read(divisionRepositoryProvider).list({
              if (search.isNotEmpty) 'search': search,
              ...kCreatedAtDescSort,
            });
            final result = listFromResponse(resp);
            if (result.error != null) return result;
            final rows = await enrichPartyOutstanding(
              ref: ref,
              kind: PartyKind.division,
              rows: result.rows,
            );
            return (rows: rows, error: null);
          },
          rowBuilder: (row) => partyMasterListTile(
            row: row,
            title: rowLabel(row),
            subtitle: listRowSubtitleFor(row).isNotEmpty
                ? listRowSubtitleFor(row)
                : rowSubtitle(row),
            onTap: () => _openDetail(
              context,
              row,
              canUpdate: canUpdate,
              canDelete: canDelete,
              canViewBills: canViewBills,
            ),
          ),
        ),
      ),
    );
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
      entity: RecordEntity.division,
      subtitle: partyDetailSubtitle(row),
      canUpdate: canUpdate,
      canDelete: canDelete,
      onEdit: () => _edit(context, row),
      onDelete: () => _delete(context, row),
      deleteConfirmTitle: 'Delete division?',
      extraActions: canViewBills
          ? [
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  showPartyBillHistorySheet(
                    context,
                    ref,
                    kind: PartyBillKind.division,
                    partyId: row['id'].toString(),
                    partyName: rowLabel(row),
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

  Future<void> _create(BuildContext context) async {
    final result = await showDivisionFormSheet(context, ref, title: 'New division');
    if (result == null || !context.mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(divisionRepositoryProvider).create(result);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Division created', type: AppSnackType.success);
        _listKey.currentState?.refresh();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _edit(BuildContext context, Map<String, dynamic> row) async {
    final result = await showDivisionFormSheet(context, ref, title: 'Edit division', initial: row);
    if (result == null || !context.mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(divisionRepositoryProvider).update(row['id']!, result);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Division updated', type: AppSnackType.success);
        _listKey.currentState?.refresh();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _delete(BuildContext context, Map<String, dynamic> row) async {
    await withSavingOverlay(context, () async {
      final resp = await ref.read(divisionRepositoryProvider).delete(row['id']!);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Division deleted', type: AppSnackType.success);
        _listKey.currentState?.refresh();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }
}

/// Shows the division add/edit form as a bottom sheet.
/// Returns the payload map on success, null on cancel.
Future<Map<String, dynamic>?> showDivisionFormSheet(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  Map<String, dynamic>? initial,
}) async {
  if (!context.mounted) return null;

  return showAppBottomSheet<Map<String, dynamic>>(
    context: context,
    builder: (ctx) => _DivisionFormSheet(
      title: title,
      initial: initial,
    ),
  );
}

class _DivisionFormSheet extends ConsumerStatefulWidget {
  const _DivisionFormSheet({
    required this.title,
    this.initial,
  });

  final String title;
  final Map<String, dynamic>? initial;

  @override
  ConsumerState<_DivisionFormSheet> createState() => _DivisionFormSheetState();
}

class _DivisionFormSheetState extends ConsumerState<_DivisionFormSheet> {
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
  late final TextEditingController _notes;

  String? _mfgCompanyId;
  bool _isActive = true;

  @override
  void initState() {
    super.initState();
    final r = widget.initial ?? {};
    _name = TextEditingController(text: _str(r, ['name']));
    _code = TextEditingController(text: _str(r, ['code']));
    _shortName = TextEditingController(text: _str(r, ['short_name', 'shortName']));
    _creditDays = TextEditingController(
      text: (r['credit_days'] ?? r['creditDays'] ?? '').toString().replaceAll('null', ''),
    );
    _phoneNumber = TextEditingController(text: _str(r, ['phone_number', 'phoneNumber']));
    _email = TextEditingController(text: _str(r, ['email']));
    _address = TextEditingController(text: _str(r, ['address']));
    _notes = TextEditingController(text: _str(r, ['notes']));
    _mfgCompanyId = _str(r, ['mfg_company_id', 'mfgCompanyId']).isEmpty
        ? null
        : _str(r, ['mfg_company_id', 'mfgCompanyId']);
    _isActive = r['is_active'] != false && r['isActive'] != false;
    _seedMfgFromInitial();
    _loadDeps();
  }

  void _seedMfgFromInitial() {
    if (widget.initial == null || _mfgCompanyId == null) return;
    final r = widget.initial!;
    _mfgRows = [
      {
        'id': _mfgCompanyId,
        'name': _str(r, ['mfg_company_name', 'mfgCompanyName', 'name']),
        'code': _str(r, ['mfg_company_code', 'mfgCompanyCode', 'code']),
      },
    ];
    _loadingDeps = false;
  }

  Future<void> _loadDeps() async {
    try {
      final mfgResp =
          await ref.read(mfgRepositoryProvider).list({'sortBy': 'name', 'sortDir': 'asc'});
      if (!mounted) return;
      final rows = <Map<String, dynamic>>[];
      if (mfgResp.ok) {
        rows.addAll(extractList(mfgResp.data));
      }
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
    _notes.dispose();
    super.dispose();
  }

  void _submit() {
    setState(() => _submitted = true);
    if (!_formKey.currentState!.validate()) return;
    if (_mfgCompanyId == null || _mfgCompanyId!.isEmpty) return;

    // Phone is required (matches web DivisionMasterModal canSubmit check)
    final phoneDigits = _phoneNumber.text.trim().replaceAll(RegExp(r'\D'), '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) return;

    final creditDaysVal = int.tryParse(_creditDays.text.trim()) ?? 0;

    final payload = <String, dynamic>{
      'name': _name.text.trim(),
      'mfgCompanyId': _mfgCompanyId,
      'creditDays': creditDaysVal < 0 ? 0 : creditDaysVal,
      'phoneCountryCode': '+91',
      'phoneNumber': phoneDigits,
      'email': _email.text.trim(),
      'address': _address.text.trim(),
      'notes': _notes.text.trim(),
      'isActive': _isActive,
      if (_code.text.trim().isNotEmpty) 'code': _code.text.trim().toUpperCase(),
      if (_shortName.text.trim().isNotEmpty) 'shortName': _shortName.text.trim(),
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
                    ? const FormSheetLoadingBody(message: 'Loading manufacturers…')
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
                      // Manufacturer (required dropdown)
                      SearchablePickerField(
                        compact: true,
                        label: 'Manufacturer *',
                        value: _mfgCompanyId,
                        hint: 'Select manufacturer',
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
                        errorText: _submitted && (_mfgCompanyId == null || _mfgCompanyId!.isEmpty)
                            ? 'Manufacturer is required'
                            : null,
                      ),
                      gap,

                      // Name (required)
                      label('Division name', required: true),
                      TextFormField(
                        controller: _name,
                        style: AppTypography.body,
                        decoration: inputDec(hint: 'e.g. North Zone'),
                        validator: (v) =>
                            (v == null || v.trim().length < 2) ? 'Name is required (min 2 chars)' : null,
                      ),
                      gap,

                      // Code
                      label('Code'),
                      TextFormField(
                        controller: _code,
                        style: AppTypography.body,
                        decoration: inputDec(hint: 'Auto-generated if empty'),
                        textCapitalization: TextCapitalization.characters,
                      ),
                      gap,

                      // Short name
                      label('Short name'),
                      TextFormField(
                        controller: _shortName,
                        style: AppTypography.body,
                        decoration: inputDec(hint: 'Optional label'),
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

                      // Phone number (required — matches web)
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
                        decoration: inputDec(),
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
                          Text('Active division', style: AppTypography.body),
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
                        child: Text(widget.initial != null ? 'Save changes' : 'Create division'),
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
