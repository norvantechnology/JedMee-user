import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_icons.dart';
import '../../core/auth/auth_storage.dart';
import '../../core/utils/access.dart';
import '../../providers/auth_controller.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/empty_state.dart';

class PermissionGate extends ConsumerWidget {
  const PermissionGate({
    super.key,
    required this.resource,
    required this.action,
    required this.title,
    required this.child,
    this.anyOf,
  });

  final String resource;
  final String action;
  final String title;
  final Widget child;
  final List<({String resource, String action})>? anyOf;

  bool _allowed(AuthData? auth) {
    if (anyOf != null && anyOf!.isNotEmpty) {
      return anyOf!.any((p) => can(auth, p.resource, p.action));
    }
    return can(auth, resource, action);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).auth;
    if (!_allowed(auth)) {
      return AppShell(
        title: title,
        child: const EmptyState(
          title: 'No permission',
          message: "You don't have permission to view this page.",
          icon: AppIcons.lock,
        ),
      );
    }
    return child;
  }
}
