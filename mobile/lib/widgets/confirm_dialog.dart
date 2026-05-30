import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';
import '../core/theme/modal_animation_tokens.dart';
import 'app_animated_modal.dart';

/// Show a confirmation dialog with the spec's center-modal animation:
///   OPEN:  scale(0.94) + opacity(0) → scale(1) + opacity(1)
///          280ms, easeOpen cubic-bezier(0.32, 0.72, 0, 1)
///   CLOSE: scale(1) + opacity(1) → scale(0.96) + opacity(0)
///          220ms, easeClose cubic-bezier(0.4, 0, 1, 0.6)
///   Backdrop: opacity 0 → 0.45
///
/// Internal content staggers:
///   title   fades in at +40ms
///   message fades in at +80ms
///   actions fade in at +120ms
///
/// Respects [MediaQuery.disableAnimations]: falls back to 150ms opacity-only.
Future<bool?> showConfirmDialog(
  BuildContext context, {
  required String title,
  String? message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool destructive = false,
}) {
  if (destructive) {
    HapticFeedback.heavyImpact();
  } else {
    HapticFeedback.mediumImpact();
  }

  final reduceMotion = MediaQuery.of(context).disableAnimations;

  return showGeneralDialog<bool>(
    context: context,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black.withOpacity(ModalAnimationTokens.backdropOpacity),
    transitionDuration: reduceMotion
        ? ModalAnimationTokens.durationReducedMotion
        : ModalAnimationTokens.durationOpen,
    pageBuilder: (ctx, animation, secondaryAnimation) {
      return _ConfirmDialogContent(
        title: title,
        message: message,
        confirmLabel: confirmLabel,
        cancelLabel: cancelLabel,
        destructive: destructive,
      );
    },
    transitionBuilder: (ctx, animation, secondaryAnimation, child) {
      return AppAnimatedModal(
        type: AppModalType.center,
        animation: animation,
        child: child,
      );
    },
  );
}

// ─── Dialog content with staggered children ───────────────────────────────────

class _ConfirmDialogContent extends StatelessWidget {
  const _ConfirmDialogContent({
    required this.title,
    required this.message,
    required this.confirmLabel,
    required this.cancelLabel,
    required this.destructive,
  });

  final String title;
  final String? message;
  final String confirmLabel;
  final String cancelLabel;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Material(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(AppTheme.modalRadius),
            clipBehavior: Clip.antiAlias,
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppTheme.modalRadius),
                border: Border.all(color: AppColors.border, width: 0.5),
              ),
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Title — stagger +40ms
                  ModalContentFadeIn(
                    delay: ModalAnimationTokens.staggerTitle,
                    child: Text(title, style: AppTypography.sectionTitle),
                  ),

                  // Body — stagger +80ms
                  if (message != null) ...[
                    const SizedBox(height: 10),
                    ModalContentFadeIn(
                      delay: ModalAnimationTokens.staggerBody,
                      child: Text(
                        message!,
                        style: AppTypography.caption.copyWith(height: 1.5),
                      ),
                    ),
                  ],

                  // Actions — stagger +120ms
                  const SizedBox(height: 20),
                  ModalContentFadeIn(
                    delay: ModalAnimationTokens.staggerActions,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        OutlinedButton(
                          onPressed: () {
                            HapticFeedback.lightImpact();
                            Navigator.of(context).pop(false);
                          },
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.textMuted,
                            side: const BorderSide(
                                color: AppColors.border, width: 0.5),
                          ),
                          child: Text(cancelLabel),
                        ),
                        const SizedBox(width: 10),
                        FilledButton(
                          onPressed: () {
                            if (destructive) {
                              HapticFeedback.heavyImpact();
                            } else {
                              HapticFeedback.mediumImpact();
                            }
                            Navigator.of(context).pop(true);
                          },
                          style: destructive
                              ? FilledButton.styleFrom(
                                  backgroundColor: AppColors.danger)
                              : null,
                          child: Text(confirmLabel),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
