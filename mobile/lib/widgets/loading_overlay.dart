import 'package:flutter/material.dart';

import '../core/theme/app_typography.dart';
import '../core/theme/modal_animation_tokens.dart';
import 'app_animated_modal.dart';

/// Centered spinner card — used in dialogs and form sheets.
class AppLoadingIndicator extends StatelessWidget {
  const AppLoadingIndicator({super.key, this.message});

  final String? message;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            if (message != null && message!.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text(message!, style: AppTypography.secondary, textAlign: TextAlign.center),
            ],
          ],
        ),
      ),
    );
  }
}

/// Blocking full-screen overlay while async work runs (save, fetch, etc.).
///
/// Uses the spec's center-modal animation:
///   OPEN:  scale(0.94) + opacity(0) → scale(1) + opacity(1), 280ms easeOpen
///   CLOSE: scale(1) + opacity(1) → scale(0.96) + opacity(0), 220ms easeClose
///   Backdrop: opacity 0 → 0.45
///
/// The close animation completes before the overlay is unmounted — the
/// [Navigator.pop] call is deferred until [action] resolves, satisfying the
/// spec's "close before unmount" rule.
Future<T?> withLoadingOverlay<T>(
  BuildContext context,
  Future<T?> Function() action, {
  String? message,
}) async {
  final reduceMotion = MediaQuery.of(context).disableAnimations;

  showGeneralDialog<void>(
    context: context,
    barrierDismissible: false,
    barrierLabel: '',
    barrierColor: Colors.black.withOpacity(ModalAnimationTokens.backdropOpacity),
    useRootNavigator: true,
    transitionDuration: reduceMotion
        ? ModalAnimationTokens.durationReducedMotion
        : ModalAnimationTokens.durationOpen,
    pageBuilder: (ctx, animation, secondaryAnimation) {
      return Center(child: AppLoadingIndicator(message: message));
    },
    transitionBuilder: (ctx, animation, secondaryAnimation, child) {
      return AppAnimatedModal(
        type: AppModalType.center,
        animation: animation,
        child: child,
      );
    },
  );

  try {
    return await action();
  } finally {
    if (context.mounted) {
      Navigator.of(context, rootNavigator: true).pop();
    }
  }
}
