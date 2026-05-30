import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/access.dart';
import '../../core/utils/api_helpers.dart';
import '../../providers/app_providers.dart';
import '../../providers/auth_controller.dart';
import '../../widgets/app_bottom_sheet.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/bulk_select_bar.dart';
import '../../widgets/page_bottom_bars.dart';
import '../../widgets/confirm_dialog.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/list_page_header.dart';
import '../../widgets/skeleton_loader.dart';
import '../../widgets/snackbar.dart';
import '../../widgets/searchable_picker.dart';
import '../../widgets/status_badge.dart';
import '../shared/permission_gate.dart';
import '../shared/master_ui.dart';

class UsersScreen extends ConsumerStatefulWidget {
  const UsersScreen({super.key});

  @override
  ConsumerState<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends ConsumerState<UsersScreen> {
  String _search = '';
  bool _loading  = true;
  String? _error;
  List<Map<String, dynamic>> _users = [];
  List<Map<String, dynamic>> _roles = [];

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
      title: 'Delete $count user${count == 1 ? '' : 's'}?',
      message: 'This action cannot be undone.',
      destructive: true,
    );
    if (ok != true || !context.mounted) return;
    final ids = _selectedIds.toList();
    _exitSelectionMode();
    await withSavingOverlay(context, () async {
      final resp = await ref.read(userRepositoryProvider).bulkDeleteAccountUsers(ids);
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context,
            message: '$count user${count == 1 ? '' : 's'} deleted',
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
      _error   = null;
    });
    final repo = ref.read(userRepositoryProvider);
    final results = await Future.wait([
      repo.listAccountUsers(),
      repo.listUserRoles(),
    ]);
    if (!mounted) return;
    final usersResult = listFromResponse(results[0]);
    final rolesResult = listFromResponse(results[1]);
    setState(() {
      _loading = false;
      _users   = usersResult.rows;
      _roles   = rolesResult.rows;
      _error   = usersResult.error;
    });
  }

  List<Map<String, dynamic>> get _filtered {
    if (_search.trim().isEmpty) return _users;
    final q = _search.trim().toLowerCase();
    return _users.where((u) {
      final name  = (u['full_name'] ?? u['fullName'] ?? '').toString().toLowerCase();
      final email = (u['email'] ?? '').toString().toLowerCase();
      return name.contains(q) || email.contains(q);
    }).toList();
  }

  Future<void> _create() async {
    final result = await _showUserFormSheet(
      context,
      title: 'New user',
      roles: _roles,
    );
    if (result == null || !mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(userRepositoryProvider).createAccountUser({
        'fullName': result['fullName'],
        'email': result['email'],
        'password': result['password'],
      });
      if (!mounted) return resp.ok;
      if (resp.ok) {
        final roleId = result['roleId'];
        if (roleId != null && roleId.toString().isNotEmpty && resp.data is Map) {
          final userId =
              (resp.data as Map)['id'] ?? (resp.data as Map)['user']?['id'];
          if (userId != null) {
            await ref.read(userRepositoryProvider).assignAccountUserRole(userId, roleId);
          }
        }
        showAppSnack(context, message: 'User created', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _edit(Map<String, dynamic> row) async {
    final result = await _showUserFormSheet(
      context,
      title: 'Edit user',
      initial: {
        'fullName': (row['full_name'] ?? row['fullName'] ?? '').toString(),
        'email': (row['email'] ?? '').toString(),
        'roleId': (row['custom_role_id'] ?? row['customRoleId'] ?? '').toString(),
      },
      roles: _roles,
      isEdit: true,
    );
    if (result == null || !mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(userRepositoryProvider).updateAccountUser(
        row['id']!,
        {'fullName': result['fullName']},
      );
      if (!mounted) return resp.ok;
      if (resp.ok) {
        final roleId = result['roleId'];
        if (roleId != null && roleId.toString().isNotEmpty) {
          await ref.read(userRepositoryProvider).assignAccountUserRole(row['id']!, roleId);
        }
        showAppSnack(context, message: 'User updated', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _delete(Map<String, dynamic> row) async {
    final name =
        (row['full_name'] ?? row['fullName'] ?? row['email'] ?? 'this user').toString();
    final ok = await showConfirmDialog(
      context,
      title: 'Delete user?',
      message: 'Remove $name from your account?',
      destructive: true,
    );
    if (ok != true || !mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(userRepositoryProvider).deleteAccountUser(row['id']!);
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'User deleted', type: AppSnackType.success);
        _load();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<void> _toggleBlock(Map<String, dynamic> row) async {
    final blocked = row['is_blocked'] == true || row['isBlocked'] == true;
    final name = (row['full_name'] ?? row['fullName'] ?? row['email'] ?? 'this user').toString();
    final ok = await showConfirmDialog(
      context,
      title: blocked ? 'Unblock $name?' : 'Block $name?',
      message: blocked
          ? 'This user will be able to log in again.'
          : 'This user will be prevented from logging in.',
      destructive: !blocked,
    );
    if (ok != true || !mounted) return;
    final resp = await ref.read(userRepositoryProvider).updateAccountUser(
      row['id']!,
      {'isBlocked': !blocked},
    );
    if (!mounted) return;
    if (resp.ok) {
      showAppSnack(
        context,
        message: blocked ? 'User unblocked' : 'User blocked',
        type: AppSnackType.success,
      );
      _load();
    } else {
      showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
    }
  }

  void _showDetail(Map<String, dynamic> row) {
    final auth      = ref.read(authControllerProvider).auth;
    final canUpdate = can(auth, 'USERS', 'UPDATE');
    final canDelete = can(auth, 'USERS', 'DELETE');

    showAppBottomSheet<void>(
      context: context,
      builder: (_) => _UserDetailSheet(
        row: row,
        roles: _roles,
        canUpdate: canUpdate,
        canDelete: canDelete,
        onEdit: () {
          Navigator.pop(context);
          _edit(row);
        },
        onDelete: () {
          Navigator.pop(context);
          _delete(row);
        },
        onToggleBlock: canUpdate
            ? () {
                Navigator.pop(context);
                _toggleBlock(row);
              }
            : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth   = ref.watch(authControllerProvider).auth;
    final canAdd = can(auth, 'USERS', 'ADD');
    final canDelete = can(auth, 'USERS', 'DELETE');

    return PermissionGate(
      resource: 'USERS',
      action: 'VIEW',
      title: 'Users',
      child: AppShell(
        title: _selectionMode ? '${_selectedIds.length} selected' : 'Users',
        bottomBar: _selectionMode
            ? BulkSelectBar(
                selectedCount: _selectedIds.length,
                totalCount: _filtered.length,
                onCancel: _exitSelectionMode,
                onSelectAll: () => setState(() {
                  _selectedIds
                    ..clear()
                    ..addAll(_filtered.map((r) => r['id'].toString()));
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
            : PageBottomBars.adminList(
          primaryLabel: 'New User',
          canCreate: canAdd,
          onCreate: _create,
          onRefresh: _load,
        ),
        child: Column(
          children: [
            ListPageHeader(
              search: _search,
              searchHint: 'Search users…',
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
                              title: 'No users',
                              message: _search.isNotEmpty
                                  ? 'No users match your search.'
                                  : 'Invite team members to collaborate.',
                              icon: AppIcons.customers,
                              actionLabel: canAdd ? 'Add user' : null,
                              onAction: canAdd ? _create : null,
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
                                  final id = row['id'].toString();
                                  final selected = _selectedIds.contains(id);
                                  return GestureDetector(
                                    onTap: _selectionMode
                                        ? () => _toggleSelection(id)
                                        : () => _showDetail(row),
                                    onLongPress: _selectionMode
                                        ? null
                                        : () => _enterSelectionMode(id),
                                    child: Stack(
                                      children: [
                                        _UserTile(
                                          row: row,
                                          roles: _roles,
                                          onTap: _selectionMode
                                              ? () => _toggleSelection(id)
                                              : () => _showDetail(row),
                                        ),
                                        if (_selectionMode)
                                          Positioned(
                                            top: 10,
                                            left: 10,
                                            child: AnimatedContainer(
                                              duration: const Duration(milliseconds: 150),
                                              width: 22,
                                              height: 22,
                                              decoration: BoxDecoration(
                                                color: selected
                                                    ? AppColors.primary
                                                    : Colors.white,
                                                border: Border.all(
                                                  color: selected
                                                      ? AppColors.primary
                                                      : AppColors.border,
                                                  width: 1.8,
                                                ),
                                                borderRadius: BorderRadius.circular(5),
                                              ),
                                              child: selected
                                                  ? const Icon(Icons.check,
                                                      size: 14,
                                                      color: Colors.white)
                                                  : null,
                                            ),
                                          ),
                                      ],
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

// ─── User tile ────────────────────────────────────────────────────────────────

class _UserTile extends StatelessWidget {
  const _UserTile({
    required this.row,
    required this.roles,
    required this.onTap,
  });

  final Map<String, dynamic> row;
  final List<Map<String, dynamic>> roles;
  final VoidCallback onTap;

  String _roleName() {
    final roleId = (row['custom_role_id'] ?? row['customRoleId'] ?? '').toString();
    if (roleId.isEmpty) return '';
    final role = roles.firstWhere(
      (r) => r['id']?.toString() == roleId,
      orElse: () => {},
    );
    return (role['name'] ?? '').toString();
  }

  @override
  Widget build(BuildContext context) {
    final name   = (row['full_name'] ?? row['fullName'] ?? '').toString();
    final email  = (row['email'] ?? '').toString();
    final status = (row['status'] ?? '').toString().toUpperCase();
    final blocked = row['is_blocked'] == true || row['isBlocked'] == true;
    final roleName = _roleName();

    final initials = _initials(name.isNotEmpty ? name : email);

    return AppCard(
      // Compact vertical padding — consistent with DataListTile
      padding: const EdgeInsets.symmetric(
        horizontal: 14,
        vertical: 10,
      ),
      onTap: onTap,
      child: Row(
        children: [
          // Avatar — slightly smaller for compact look
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              gradient: AppColors.primaryGradient,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            ),
            alignment: Alignment.center,
            child: Text(
              initials,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
          const SizedBox(width: 10),

          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name.isNotEmpty ? name : email,
                  style: AppTypography.labelSemibold.copyWith(fontSize: 13.5),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
                if (name.isNotEmpty && email.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(
                    email,
                    style: AppTypography.secondary.copyWith(
                      color: AppColors.textMuted,
                      fontSize: 12,
                    ),
                    overflow: TextOverflow.ellipsis,
                    maxLines: 1,
                  ),
                ],
                // Role shown inline as a small tag — no extra line needed
                if (roleName.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                      color: AppColors.primaryLight,
                      borderRadius: BorderRadius.circular(AppTheme.pillRadius),
                      border: Border.all(color: AppColors.primarySubtle, width: 0.75),
                    ),
                    child: Text(
                      roleName,
                      style: AppTypography.badgeSmall.copyWith(
                        color: AppColors.primaryDark,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Status badge — right side
          if (blocked)
            const StatusBadge(status: 'BLOCKED', size: StatusBadgeSize.small)
          else if (status.isNotEmpty)
            StatusBadge(status: status, size: StatusBadgeSize.small),

          const SizedBox(width: 6),
          const Icon(
            AppIcons.chevronRight,
            size: 16,
            color: AppColors.textFaint,
          ),
        ],
      ),
    );
  }

  static String _initials(String name) {
    final s = name.trim();
    if (s.isEmpty) return 'U';
    if (s.contains('@')) return s[0].toUpperCase();
    final parts = s.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return s.length >= 2 ? s.substring(0, 2).toUpperCase() : s.toUpperCase();
  }
}

// ─── User detail sheet ────────────────────────────────────────────────────────

class _UserDetailSheet extends StatelessWidget {
  const _UserDetailSheet({
    required this.row,
    required this.roles,
    required this.canUpdate,
    required this.canDelete,
    required this.onEdit,
    required this.onDelete,
    this.onToggleBlock,
  });

  final Map<String, dynamic> row;
  final List<Map<String, dynamic>> roles;
  final bool canUpdate;
  final bool canDelete;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback? onToggleBlock;

  String _roleName() {
    final roleId = (row['custom_role_id'] ?? row['customRoleId'] ?? '').toString();
    if (roleId.isEmpty) return '—';
    final role = roles.firstWhere(
      (r) => r['id']?.toString() == roleId,
      orElse: () => {},
    );
    return (role['name'] ?? '—').toString();
  }

  @override
  Widget build(BuildContext context) {
    final name    = (row['full_name'] ?? row['fullName'] ?? '').toString();
    final email   = (row['email'] ?? '').toString();
    final status  = (row['status'] ?? '').toString().toUpperCase();
    final blocked = row['is_blocked'] == true || row['isBlocked'] == true;
    // expose blocked to action buttons

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppTheme.modalRadius),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.md,
        AppSpacing.xxl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Handle
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
          const SizedBox(height: AppSpacing.md),

          // Header
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  gradient: AppColors.primaryGradient,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
                alignment: Alignment.center,
                child: Text(
                  _UserTile._initials(name.isNotEmpty ? name : email),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.isNotEmpty ? name : email,
                      style: AppTypography.labelSemibold,
                    ),
                    if (name.isNotEmpty)
                      Text(email, style: AppTypography.secondary),
                  ],
                ),
              ),
              if (blocked)
                const StatusBadge(status: 'BLOCKED')
              else if (status.isNotEmpty)
                StatusBadge(status: status),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: AppSpacing.md),

          // Details
          _DetailRow(label: 'Role', value: _roleName()),
          _DetailRow(
            label: 'Status',
            value: blocked ? 'Blocked' : (status.isNotEmpty ? status : '—'),
          ),
          _DetailRow(
            label: 'Email verified',
            value: row['email_verified'] == true ? 'Yes' : 'No',
          ),
          const SizedBox(height: AppSpacing.md),

          // Actions
          if (canUpdate)
            FilledButton.icon(
              onPressed: onEdit,
              icon: const Icon(AppIcons.edit, size: 16),
              label: const Text('Edit user'),
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 48),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
          if (canUpdate && onToggleBlock != null) ...[
            const SizedBox(height: AppSpacing.xs),
            OutlinedButton.icon(
              onPressed: onToggleBlock,
              icon: Icon(
                blocked ? AppIcons.lockOpen : AppIcons.cancelled,
                size: 16,
              ),
              label: Text(blocked ? 'Unblock user' : 'Block user'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 48),
                foregroundColor: blocked ? AppColors.success : AppColors.warning,
                side: BorderSide(
                  color: blocked
                      ? AppColors.success.withOpacity(0.5)
                      : AppColors.warning.withOpacity(0.5),
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
          ],
          if (canDelete) ...[
            const SizedBox(height: AppSpacing.xs),
            OutlinedButton.icon(
              onPressed: onDelete,
              icon: const Icon(AppIcons.delete, size: 16),
              label: const Text('Delete user'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 48),
                foregroundColor: AppColors.danger,
                side: const BorderSide(color: AppColors.danger),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: AppTypography.secondary),
          ),
          Expanded(
            child: Text(value, style: AppTypography.body),
          ),
        ],
      ),
    );
  }
}

// ─── User form sheet ──────────────────────────────────────────────────────────

Future<Map<String, String>?> _showUserFormSheet(
  BuildContext context, {
  required String title,
  required List<Map<String, dynamic>> roles,
  Map<String, String>? initial,
  bool isEdit = false,
}) async {
  return showAppBottomSheet<Map<String, String>>(
    context: context,
    builder: (_) => _UserFormSheet(
      title: title,
      roles: roles,
      initial: initial,
      isEdit: isEdit,
    ),
  );
}

class _UserFormSheet extends StatefulWidget {
  const _UserFormSheet({
    required this.title,
    required this.roles,
    this.initial,
    this.isEdit = false,
  });

  final String title;
  final List<Map<String, dynamic>> roles;
  final Map<String, String>? initial;
  final bool isEdit;

  @override
  State<_UserFormSheet> createState() => _UserFormSheetState();
}

class _UserFormSheetState extends State<_UserFormSheet> {
  final _formKey     = GlobalKey<FormState>();
  final _nameCtrl    = TextEditingController();
  final _emailCtrl   = TextEditingController();
  final _passCtrl    = TextEditingController();
  String? _roleId;
  bool _submitted    = false;

  @override
  void initState() {
    super.initState();
    _nameCtrl.text  = widget.initial?['fullName'] ?? '';
    _emailCtrl.text = widget.initial?['email'] ?? '';
    _roleId         = widget.initial?['roleId']?.isNotEmpty == true
        ? widget.initial!['roleId']
        : null;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    setState(() => _submitted = true);
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(context, {
      'fullName': _nameCtrl.text.trim(),
      'email':    _emailCtrl.text.trim(),
      'password': _passCtrl.text.trim(),
      'roleId':   _roleId ?? '',
    });
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppTheme.modalRadius),
        ),
      ),
      padding: EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.md,
        AppSpacing.lg + bottomInset,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Handle
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
            const SizedBox(height: AppSpacing.md),
            Text(widget.title, style: AppTypography.cardTitle),
            const SizedBox(height: AppSpacing.md),

            // Full name
            _FormField(
              controller: _nameCtrl,
              label: 'Full name',
              hint: 'Jane Smith',
              icon: AppIcons.customer,
              validator: (v) {
                if (_submitted && (v == null || v.trim().length < 2)) {
                  return 'Full name is required';
                }
                return null;
              },
            ),
            const SizedBox(height: AppSpacing.sm),

            // Email
            _FormField(
              controller: _emailCtrl,
              label: 'Email',
              hint: 'jane@example.com',
              icon: AppIcons.email,
              keyboardType: TextInputType.emailAddress,
              readOnly: widget.isEdit,
              validator: (v) {
                if (_submitted && !widget.isEdit &&
                    (v == null || !v.contains('@'))) {
                  return 'Enter a valid email';
                }
                return null;
              },
            ),
            const SizedBox(height: AppSpacing.sm),

            // Password (create only)
            if (!widget.isEdit) ...[
              _FormField(
                controller: _passCtrl,
                label: 'Password',
                hint: '••••••••',
                icon: AppIcons.lock,
                obscureText: true,
                validator: (v) {
                  if (_submitted && (v == null || v.trim().length < 6)) {
                    return 'Password must be at least 6 characters';
                  }
                  return null;
                },
              ),
              const SizedBox(height: AppSpacing.sm),
            ],

            // Role assignment
            if (widget.roles.isNotEmpty) ...[
              SearchablePickerField(
                compact: true,
                label: 'Role',
                value: _roleId,
                hint: 'No role assigned',
                items: widget.roles
                    .map(
                      (r) => SearchablePickerItem(
                        value: r['id']?.toString() ?? '',
                        label: (r['name'] ?? '').toString(),
                      ),
                    )
                    .where((e) => e.value.isNotEmpty)
                    .toList(),
                onChanged: (v) => setState(() => _roleId = v),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            const SizedBox(height: AppSpacing.md),

            // Actions
            Row(
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
                    onPressed: _submit,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 48),
                      shape: RoundedRectangleBorder(
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusMd),
                      ),
                    ),
                    child: Text(widget.isEdit ? 'Save changes' : 'Create user'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _FormField extends StatelessWidget {
  const _FormField({
    required this.controller,
    required this.label,
    this.hint,
    this.icon,
    this.keyboardType,
    this.obscureText = false,
    this.readOnly = false,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final String? hint;
  final IconData? icon;
  final TextInputType? keyboardType;
  final bool obscureText;
  final bool readOnly;
  final FormFieldValidator<String>? validator;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.inputLabel),
        const SizedBox(height: 5),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          obscureText: obscureText,
          readOnly: readOnly,
          validator: validator,
          style: AppTypography.body,
          decoration: InputDecoration(
            hintText: hint,
            filled: readOnly,
            fillColor: readOnly ? AppColors.surface : null,
            prefixIcon: icon != null
                ? Padding(
                    padding: const EdgeInsets.only(left: 12, right: 8),
                    child: Icon(icon, size: 17, color: AppColors.textMuted),
                  )
                : null,
            prefixIconConstraints:
                const BoxConstraints(),
          ),
        ),
      ],
    );
  }
}
