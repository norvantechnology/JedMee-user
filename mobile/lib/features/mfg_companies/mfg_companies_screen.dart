import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_icons.dart';
import '../../core/performance/list_scroll.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/access.dart';
import '../../core/utils/api_helpers.dart';
import '../../core/utils/record_fields.dart';
import '../../providers/app_providers.dart';
import '../../providers/auth_controller.dart';
import '../../widgets/app_bottom_nav.dart';
import '../../widgets/app_bottom_sheet.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/data_list_tile.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/list_page_header.dart';
import '../../widgets/list_results_bar.dart';
import '../../widgets/loading_overlay.dart';
import '../../widgets/skeleton_loader.dart';
import '../../widgets/snackbar.dart';
import '../shared/master_ui.dart';
import '../shared/permission_gate.dart';

class MfgCompaniesScreen extends ConsumerStatefulWidget {
  const MfgCompaniesScreen({super.key});

  @override
  ConsumerState<MfgCompaniesScreen> createState() => _MfgCompaniesScreenState();
}

class _MfgCompaniesScreenState extends ConsumerState<MfgCompaniesScreen> {
  String _search = '';
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _rows = [];

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
    final resp = await ref.read(mfgRepositoryProvider).list({
      if (_search.isNotEmpty) 'search': _search,
    });
    final result = listFromResponse(resp);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = result.error;
      _rows = result.rows;
    });
  }

  Future<void> _save({Map<String, dynamic>? initial}) async {
    final payload = await showAppBottomSheet<Map<String, dynamic>>(
      context: context,
      builder: (_) => _MfgFormSheet(
        title: initial == null ? 'New manufacturer' : 'Edit manufacturer',
        initial: initial,
      ),
    );
    if (payload == null || !mounted) return;
    await withSavingOverlay(context, () async {
      final resp = initial == null
          ? await ref.read(mfgRepositoryProvider).create(payload)
          : await ref.read(mfgRepositoryProvider).update(initial['id']!, payload);
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Saved', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _delete(Map<String, dynamic> row) async {
    await withSavingOverlay(context, () async {
      final resp = await ref.read(mfgRepositoryProvider).delete(row['id']!);
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Deleted', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).auth;
    final canAdd = can(auth, 'MFG_COMPANIES', 'ADD');
    final canUpdate = can(auth, 'MFG_COMPANIES', 'UPDATE');
    final canDelete = can(auth, 'MFG_COMPANIES', 'DELETE');

    return PermissionGate(
      resource: 'MFG_COMPANIES',
      action: 'VIEW',
      title: 'Manufacturers',
      child: AppShell(
        title: 'Manufacturers',
        bottomBar: AppBottomActionBar(
          primaryAction: BottomAction(
            icon: AppIcons.add,
            label: 'New manufacturer',
            onTap: canAdd ? () => _save() : null,
            enabled: canAdd,
          ),
          leadingActions: [
            BottomAction(icon: AppIcons.refresh, tooltip: 'Refresh', onTap: _load),
          ],
        ),
        child: Column(
          children: [
            ListPageHeader(
              search: _search,
              searchHint: 'Search manufacturers…',
              onSearchChanged: (v) {
                setState(() => _search = v);
                _load();
              },
              compactSearch: true,
            ),
            if (!_loading && _error == null)
              ListResultsBar(
                count: _rows.length,
                countLabel: '${_rows.length} manufacturer${_rows.length == 1 ? '' : 's'}',
              ),
            Expanded(
              child: _loading
                  ? const SkeletonListPage(showHeader: false)
                  : _error != null
                      ? EmptyState(title: 'Could not load', message: _error, onAction: _load, actionLabel: 'Retry')
                      : _rows.isEmpty
                          ? EmptyState(
                              title: 'No manufacturers',
                              actionLabel: canAdd ? 'Add manufacturer' : null,
                              onAction: canAdd ? () => _save() : null,
                            )
                          : RefreshIndicator(
                              onRefresh: _load,
                              child: ListView.builder(
                                padding: ListScroll.listPadding(bottom: AppSpacing.fabClearance),
                                itemCount: _rows.length,
                                itemBuilder: (_, i) {
                                  final row = _rows[i];
                                  return DataListTile(
                                    title: rowLabel(row, ['name']),
                                    subtitle: (row['code'] ?? '').toString(),
                                    row: row,
                                    onTap: () => openMasterDetailSheet(
                                      context,
                                      title: rowLabel(row, ['name']),
                                      row: row,
                                      entity: RecordEntity.mfgCompany,
                                      canUpdate: canUpdate,
                                      canDelete: canDelete,
                                      onEdit: () => _save(initial: row),
                                      onDelete: () => _delete(row),
                                    ),
                                  );
                                },
                              ),
                            ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MfgFormSheet extends StatefulWidget {
  const _MfgFormSheet({required this.title, this.initial});

  final String title;
  final Map<String, dynamic>? initial;

  @override
  State<_MfgFormSheet> createState() => _MfgFormSheetState();
}

class _MfgFormSheetState extends State<_MfgFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _email;
  bool _active = true;

  @override
  void initState() {
    super.initState();
    final r = widget.initial ?? {};
    _name = TextEditingController(text: (r['name'] ?? '').toString());
    _email = TextEditingController(text: (r['email'] ?? '').toString());
    _active = r['is_active'] != false;
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(20),
              child: Text(widget.title, style: AppTypography.sectionTitle),
            ),
            Form(
              key: _formKey,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  children: [
                    TextFormField(
                      controller: _name,
                      decoration: const InputDecoration(labelText: 'Name *'),
                      validator: (v) => (v == null || v.trim().length < 2) ? 'Required' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _email,
                      decoration: const InputDecoration(labelText: 'Email'),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Active'),
                      value: _active,
                      onChanged: (v) => setState(() => _active = v),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: FilledButton(
                onPressed: () {
                  if (!_formKey.currentState!.validate()) return;
                  Navigator.pop(context, {
                    'name': _name.text.trim(),
                    if (_email.text.trim().isNotEmpty) 'email': _email.text.trim(),
                    'isActive': _active,
                  });
                },
                child: const Text('Save'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
