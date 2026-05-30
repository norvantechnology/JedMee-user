import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_motion.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/modal_animation_tokens.dart';
import '../../core/utils/access.dart';
import '../../core/utils/api_helpers.dart';
import '../../providers/app_providers.dart';
import '../../providers/auth_controller.dart';
import '../../widgets/app_animated_modal.dart';
import '../../widgets/app_bottom_sheet.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/page_bottom_bars.dart';
import '../../widgets/confirm_dialog.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/list_page_header.dart';
import '../../widgets/skeleton_loader.dart';
import '../../widgets/snackbar.dart';
import '../shared/permission_gate.dart';
import '../shared/master_ui.dart';

// ─── Default permission resources (mirrors web fallback list) ─────────────────
const _kDefaultResources = [
  (resource: 'USERS',             label: 'Users'),
  (resource: 'ROLES',             label: 'Roles & Permissions'),
  (resource: 'DIVISIONS',         label: 'Divisions'),
  (resource: 'VENDORS',           label: 'Vendors / Suppliers'),
  (resource: 'DIVISION_PAYMENTS', label: 'Division Payments'),
  (resource: 'VENDOR_PAYMENTS',   label: 'Vendor Payments'),
  (resource: 'CUSTOMERS',         label: 'Customers'),
  (resource: 'MFG_COMPANIES',     label: 'Manufacturers'),
  (resource: 'PRODUCT_BATCHES',   label: 'Quality Master'),
  (resource: 'PURCHASE_INVOICES', label: 'Purchases'),
  (resource: 'SALES_INVOICES',    label: 'Sales & Billing'),
  (resource: 'SALES_RETURNS',     label: 'Sales Returns'),
  (resource: 'PURCHASE_RETURNS',  label: 'Purchase Returns'),
  (resource: 'PURCHASE_ORDERS',   label: 'Orders'),
  (resource: 'CUSTOMER_PAYMENTS', label: 'Customer Payments'),
  (resource: 'PRESCRIPTIONS',     label: 'Prescriptions'),
];

const _kPermActions = ['VIEW', 'ADD', 'UPDATE', 'DELETE'];

class RolesAccessScreen extends ConsumerStatefulWidget {
  const RolesAccessScreen({super.key});

  @override
  ConsumerState<RolesAccessScreen> createState() => _RolesAccessScreenState();
}

class _RolesAccessScreenState extends ConsumerState<RolesAccessScreen> {
  String _search = '';
  bool _loading  = true;
  String? _error;
  List<Map<String, dynamic>> _roles = [];
  List<({String resource, String label})> _resources = _kDefaultResources;

  @override
  void initState() {
    super.initState();
    _load();
    _loadResources();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error   = null;
    });
    final resp = await ref.read(userRepositoryProvider).listUserRoles();
    if (!mounted) return;
    final result = listFromResponse(resp);
    setState(() {
      _loading = false;
      _roles   = result.rows;
      _error   = result.error;
    });
  }

  Future<void> _loadResources() async {
    final resp = await ref.read(userRepositoryProvider).listPermissionResources();
    if (!mounted) return;
    if (resp.ok && resp.data is Map) {
      final list = (resp.data as Map)['resources'];
      if (list is List && list.isNotEmpty) {
        setState(() {
          _resources = list
              .map((e) => (
                    resource: (e['resource'] ?? '').toString(),
                    label: (e['display_name'] ?? e['resource'] ?? '').toString(),
                  ))
              .toList();
        });
      }
    }
  }

  List<Map<String, dynamic>> get _filtered {
    if (_search.trim().isEmpty) return _roles;
    final q = _search.trim().toLowerCase();
    return _roles
        .where((r) =>
            (r['name'] ?? '').toString().toLowerCase().contains(q))
        .toList();
  }

  Future<void> _createRole() async {
    final name = await _showNameDialog(context, title: 'New role');
    if (name == null || name.trim().isEmpty) return;
    await withSavingOverlay(context, () async {
      final resp =
          await ref.read(userRepositoryProvider).createUserRole(name: name.trim());
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Role created', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _deleteRole(Map<String, dynamic> row) async {
    final ok = await showConfirmDialog(
      context,
      title: 'Delete role?',
      message: 'Roles assigned to users cannot be deleted until reassigned.',
      destructive: true,
    );
    if (ok != true || !mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(userRepositoryProvider).deleteUserRole(row['id']!);
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Role deleted', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  void _openPermissions(Map<String, dynamic> row) {
    showAppBottomSheet<void>(
      context: context,
      showDragHandle: false,
      builder: (_) => _PermissionsSheet(
        role: row,
        resources: _resources,
        onSaved: _load,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth     = ref.watch(authControllerProvider).auth;
    final canAdd    = can(auth, 'ROLES', 'ADD');
    final canUpdate = can(auth, 'ROLES', 'UPDATE');
    final canDelete = can(auth, 'ROLES', 'DELETE');

    return PermissionGate(
      resource: 'ROLES',
      action: 'VIEW',
      title: 'Roles & Access',
      child: AppShell(
        title: 'Roles & Access',
        bottomBar: PageBottomBars.adminList(
          primaryLabel: 'New Role',
          canCreate: canAdd,
          onCreate: _createRole,
          onRefresh: _load,
        ),
        child: Column(
          children: [
            ListPageHeader(
              search: _search,
              searchHint: 'Search roles…',
              onSearchChanged: (v) => setState(() => _search = v),
              compactSearch: true,
            ),
            Expanded(
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
                      : _filtered.isEmpty
                          ? EmptyState(
                              title: 'No roles',
                              message: _search.isNotEmpty
                                  ? 'No roles match your search.'
                                  : 'Create a role to manage user permissions.',
                              icon: AppIcons.security,
                              actionLabel: canAdd ? 'Create role' : null,
                              onAction: canAdd ? _createRole : null,
                            )
                          : RefreshIndicator(
                              onRefresh: _load,
                              color: AppColors.primary,
                              child: ListView.separated(
                                padding: const EdgeInsets.fromLTRB(
                                  AppSpacing.md,
                                  AppSpacing.xs,
                                  AppSpacing.md,
                                  88,
                                ),
                                itemCount: _filtered.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: AppSpacing.xs),
                                itemBuilder: (_, i) {
                                  final row = _filtered[i];
                                  return _RoleTile(
                                    row: row,
                                    canUpdate: canUpdate,
                                    canDelete: canDelete,
                                    onManage: () => _openPermissions(row),
                                    onDelete: () => _deleteRole(row),
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

// ─── Role tile ────────────────────────────────────────────────────────────────

class _RoleTile extends StatelessWidget {
  const _RoleTile({
    required this.row,
    required this.canUpdate,
    required this.canDelete,
    required this.onManage,
    required this.onDelete,
  });

  final Map<String, dynamic> row;
  final bool canUpdate;
  final bool canDelete;
  final VoidCallback onManage;
  final VoidCallback onDelete;

  String _permSummary() {
    final perms = row['permissions'];
    if (perms is! Map) return 'No permissions';
    int total = 0;
    int granted = 0;
    for (final entry in perms.entries) {
      final p = entry.value;
      if (p is Map) {
        for (final a in _kPermActions) {
          total++;
          if (p[a.toLowerCase()] == true || p[a] == true) granted++;
        }
      }
    }
    if (total == 0) return 'No permissions configured';
    return '$granted / $total permissions granted';
  }

  @override
  Widget build(BuildContext context) {
    final name = (row['name'] ?? '—').toString();
    final isPreset = row['is_preset'] == true || row['isPreset'] == true;

    return AppCard(
      // Compact padding consistent with other custom tiles
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      onTap: canUpdate ? onManage : null,
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            ),
            child: const Icon(
              AppIcons.security,
              size: 15,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        name,
                        style: AppTypography.labelSemibold.copyWith(fontSize: 13.5),
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                      ),
                    ),
                    if (isPreset) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(AppTheme.pillRadius),
                          border: Border.all(color: AppColors.border, width: 0.75),
                        ),
                        child: Text(
                          'preset',
                          style: AppTypography.badgeSmall.copyWith(
                            color: AppColors.textMuted,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  _permSummary(),
                  style: AppTypography.secondary.copyWith(
                    color: AppColors.textMuted,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          // Action icons — compact
          if (canUpdate)
            IconButton(
              icon: const Icon(AppIcons.settings, size: 16),
              color: AppColors.textMuted,
              tooltip: 'Manage permissions',
              onPressed: onManage,
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.all(6),
              constraints: const BoxConstraints(),
            ),
          if (canDelete && !isPreset)
            IconButton(
              icon: const Icon(AppIcons.delete, size: 16),
              color: AppColors.danger,
              tooltip: 'Delete role',
              onPressed: onDelete,
              visualDensity: VisualDensity.compact,
              padding: const EdgeInsets.all(6),
              constraints: const BoxConstraints(),
            ),
        ],
      ),
    );
  }
}

// ─── Permissions bottom sheet ─────────────────────────────────────────────────

class _PermissionsSheet extends ConsumerStatefulWidget {
  const _PermissionsSheet({
    required this.role,
    required this.resources,
    required this.onSaved,
  });

  final Map<String, dynamic> role;
  final List<({String resource, String label})> resources;
  final VoidCallback onSaved;

  @override
  ConsumerState<_PermissionsSheet> createState() => _PermissionsSheetState();
}

class _PermissionsSheetState extends ConsumerState<_PermissionsSheet> {
  late Map<String, Map<String, bool>> _perms;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _perms = _parsePerms(widget.role['permissions']);
  }

  static Map<String, Map<String, bool>> _parsePerms(dynamic raw) {
    final result = <String, Map<String, bool>>{};
    if (raw is! Map) return result;
    for (final entry in raw.entries) {
      final resource = entry.key.toString();
      final p = entry.value;
      if (p is Map) {
        result[resource] = {
          for (final a in _kPermActions)
            a: p[a.toLowerCase()] == true || p[a] == true,
        };
      }
    }
    return result;
  }

  bool _get(String resource, String action) =>
      _perms[resource]?[action] ?? false;

  void _toggle(String resource, String action) {
    setState(() {
      _perms[resource] ??= {for (final a in _kPermActions) a: false};
      _perms[resource]![action] = !(_perms[resource]![action] ?? false);
      // If VIEW is turned off, turn off all others
      if (action == 'VIEW' && !(_perms[resource]!['VIEW'] ?? false)) {
        for (final a in _kPermActions) {
          _perms[resource]![a] = false;
        }
      }
      // If any non-VIEW is turned on, ensure VIEW is on
      if (action != 'VIEW' && (_perms[resource]![action] ?? false)) {
        _perms[resource]!['VIEW'] = true;
      }
    });
  }

  Map<String, dynamic> _buildPayload() {
    final permissions = <String, dynamic>{};
    for (final entry in _perms.entries) {
      permissions[entry.key] = {
        for (final a in _kPermActions)
          a.toLowerCase(): entry.value[a] ?? false,
      };
    }
    return {
      'name': widget.role['name'],
      'permissions': permissions,
    };
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final resp = await ref
        .read(userRepositoryProvider)
        .updateUserRole(widget.role['id']!, _buildPayload());
    if (!mounted) return;
    setState(() => _saving = false);
    if (resp.ok) {
      showAppSnack(context,
          message: 'Permissions updated', type: AppSnackType.success);
      widget.onSaved();
      Navigator.pop(context);
    } else {
      showAppSnack(context,
          message: resp.parseErrorMessage(), type: AppSnackType.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final roleName = (widget.role['name'] ?? '—').toString();
    final screenHeight = MediaQuery.of(context).size.height;

    return SizedBox(
      height: screenHeight * 0.85,
      child: Column(
        children: [
          // Handle
          const SizedBox(height: AppSpacing.sm),
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),

          // Header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppColors.primaryLight,
                    borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                  ),
                  child: const Icon(AppIcons.security,
                      size: 18, color: AppColors.primary),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Manage permissions',
                          style: AppTypography.cardTitle),
                      Text(roleName, style: AppTypography.secondary),
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
          const Divider(height: 1, color: AppColors.border),

          // Permission matrix
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.xxl,
              ),
              children: [
                // Column headers
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: Row(
                    children: [
                      const Expanded(
                        flex: 3,
                        child: Text('Resource',
                            style: AppTypography.overline),
                      ),
                      ..._kPermActions.map(
                        (a) => SizedBox(
                          width: 52,
                          child: Text(
                            a,
                            style: AppTypography.overline,
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1, color: AppColors.border),
                const SizedBox(height: AppSpacing.xs),

                // Resource rows
                ...widget.resources.map((res) {
                  return _PermissionRow(
                    label: res.label,
                    resource: res.resource,
                    getVal: (a) => _get(res.resource, a),
                    onToggle: (a) => _toggle(res.resource, a),
                  );
                }),
              ],
            ),
          ),

          // Footer
          Container(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.md,
              AppSpacing.lg,
            ),
            decoration: const BoxDecoration(
              color: AppColors.card,
              border: Border(
                top: BorderSide(color: AppColors.border),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 48),
                      shape: RoundedRectangleBorder(
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusMd),
                      ),
                    ),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    onPressed: _saving ? null : _save,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 48),
                      shape: RoundedRectangleBorder(
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusMd),
                      ),
                    ),
                    child: _saving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                  Colors.white),
                            ),
                          )
                        : const Text('Save permissions'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PermissionRow extends StatelessWidget {
  const _PermissionRow({
    required this.label,
    required this.resource,
    required this.getVal,
    required this.onToggle,
  });

  final String label;
  final String resource;
  final bool Function(String action) getVal;
  final void Function(String action) onToggle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(label, style: AppTypography.body),
          ),
          ..._kPermActions.map(
            (a) => SizedBox(
              width: 52,
              child: Center(
                child: AnimatedContainer(
                  duration: AppMotion.fast,
                  child: Checkbox(
                    value: getVal(a),
                    onChanged: (_) => onToggle(a),
                    activeColor: AppColors.primary,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

Future<String?> _showNameDialog(
  BuildContext context, {
  required String title,
  String? initial,
}) async {
  final ctrl = TextEditingController(text: initial ?? '');
  final reduceMotion = MediaQuery.of(context).disableAnimations;
  final result = await showGeneralDialog<String>(
    context: context,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black.withOpacity(ModalAnimationTokens.backdropOpacity),
    transitionDuration: reduceMotion
        ? ModalAnimationTokens.durationReducedMotion
        : ModalAnimationTokens.durationOpen,
    pageBuilder: (ctx, animation, secondaryAnimation) => Center(
      child: AlertDialog(
        title: Text(title, style: AppTypography.cardTitle),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Role name',
            labelText: 'Role name',
          ),
          textCapitalization: TextCapitalization.words,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    ),
    transitionBuilder: (ctx, animation, secondaryAnimation, child) =>
        AppAnimatedModal(
          type: AppModalType.center,
          animation: animation,
          child: child,
        ),
  );
  ctrl.dispose();
  return result;
}
