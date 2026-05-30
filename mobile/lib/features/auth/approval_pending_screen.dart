import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../providers/auth_controller.dart';

class ApprovalPendingScreen extends ConsumerWidget {
  const ApprovalPendingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).auth?.user;
    final status = (user?['status'] ?? 'PENDING').toString().toUpperCase();
    final blocked = user?['is_blocked'] == true;

    String title;
    String message;
    if (blocked) {
      title = 'Account blocked';
      message = 'Your account has been blocked. Contact support for help.';
    } else if (status == 'REJECTED') {
      title = 'Registration rejected';
      message = 'Your registration was not approved. Contact support if you believe this is an error.';
    } else {
      title = 'Approval pending';
      message = 'Your account is awaiting approval. You will be notified once it is activated.';
    }

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  blocked ? AppIcons.cancelled : AppIcons.pending,
                  size: 64,
                  color: AppColors.warning,
                ),
                const SizedBox(height: 16),
                Text(title, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.textFaint),
                ),
                const SizedBox(height: 24),
                OutlinedButton(
                  onPressed: () =>
                      ref.read(authControllerProvider.notifier).refreshProfile(),
                  child: const Text('Refresh status'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
