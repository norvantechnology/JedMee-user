import 'package:flutter/material.dart';

import '../core/app_icons.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';
import '../core/theme/modal_animation_tokens.dart';
import 'app_animated_modal.dart';

// ─── Toast type ───────────────────────────────────────────────────────────────

enum AppToastType { success, error, warning, info }

// ─── Public API ───────────────────────────────────────────────────────────────

/// Show a floating toast with the spec's top-entry animation:
///   OPEN:  translateY(-20px) + opacity(0) → translateY(0) + opacity(1)
///          240ms, easeOpen cubic-bezier(0.32, 0.72, 0, 1)
///   AUTO-DISMISS after 3000ms
///   CLOSE: translateY(0) → translateY(-16px) + opacity(0)
///          180ms, easeClose cubic-bezier(0.4, 0, 1, 0.6)
///
/// Respects [MediaQuery.disableAnimations]: falls back to 150ms opacity-only.
///
/// This replaces [ScaffoldMessenger.showSnackBar] for all API response toasts.
/// The [snackbar.dart] helper is kept for backward compatibility but delegates
/// here when called from contexts that have an [Overlay].
void showAppToast(
  BuildContext context, {
  required String message,
  AppToastType type = AppToastType.info,
  String? actionLabel,
  VoidCallback? onAction,
  Duration hold = ModalAnimationTokens.durationToastHold,
}) {
  final overlay = Overlay.of(context, rootOverlay: true);
  late OverlayEntry entry;

  entry = OverlayEntry(
    builder: (_) => _AppToastOverlay(
      message: message,
      type: type,
      actionLabel: actionLabel,
      onAction: onAction,
      hold: hold,
      onDismiss: () => entry.remove(),
    ),
  );

  overlay.insert(entry);
}

// ─── Overlay widget ───────────────────────────────────────────────────────────

class _AppToastOverlay extends StatefulWidget {
  const _AppToastOverlay({
    required this.message,
    required this.type,
    required this.hold,
    required this.onDismiss,
    this.actionLabel,
    this.onAction,
  });

  final String message;
  final AppToastType type;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Duration hold;
  final VoidCallback onDismiss;

  @override
  State<_AppToastOverlay> createState() => _AppToastOverlayState();
}

class _AppToastOverlayState extends State<_AppToastOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    final reduceMotion = WidgetsBinding.instance.platformDispatcher
        .accessibilityFeatures
        .reduceMotion;

    _ctrl = AnimationController(
      vsync: this,
      duration: reduceMotion
          ? ModalAnimationTokens.durationReducedMotion
          : ModalAnimationTokens.durationToastOpen,
      reverseDuration: reduceMotion
          ? ModalAnimationTokens.durationReducedMotion
          : ModalAnimationTokens.durationToastClose,
    );

    _ctrl.forward().then((_) {
      // Hold, then close. Close animation completes before onDismiss removes
      // the overlay entry — satisfying the spec's "close before unmount" rule.
      Future.delayed(widget.hold, _dismiss);
    });
  }

  Future<void> _dismiss() async {
    if (!mounted) return;
    await _ctrl.reverse();
    if (mounted) widget.onDismiss();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final (bg, icon, iconColor) = switch (widget.type) {
      AppToastType.success => (AppColors.success, AppIcons.success, Colors.white),
      AppToastType.error   => (AppColors.danger,  AppIcons.error,   Colors.white),
      AppToastType.warning => (AppColors.warning, AppIcons.alert,   Colors.white),
      AppToastType.info    => (AppColors.text,    AppIcons.info,    Colors.white),
    };

    return Positioned(
      // Top of screen, respecting safe area — spec §4 (top entry).
      top: MediaQuery.of(context).padding.top + 12,
      left: 16,
      right: 16,
      child: AppAnimatedModal(
        type: AppModalType.toast,
        animation: _ctrl,
        child: Material(
          color: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(AppTheme.radiusMd),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.15),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              children: [
                Icon(icon, size: 18, color: iconColor),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    widget.message,
                    style: AppTypography.secondary.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                if (widget.actionLabel != null && widget.onAction != null) ...[
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () {
                      widget.onAction!();
                      _dismiss();
                    },
                    child: Text(
                      widget.actionLabel!,
                      style: AppTypography.secondary.copyWith(
                        color: Colors.white.withOpacity(0.9),
                        fontWeight: FontWeight.w600,
                        decoration: TextDecoration.underline,
                        decorationColor: Colors.white.withOpacity(0.6),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}