import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/modal_animation_tokens.dart';
import 'app_animated_modal.dart';

/// Consistent modal bottom sheet with the spec's enter/exit animation:
///   OPEN:  translateY(+40px) + opacity(0) → translateY(0) + opacity(1)
///          300ms, easeOpen cubic-bezier(0.32, 0.72, 0, 1)
///   CLOSE: translateY(0) → translateY(+40px) + opacity(0)
///          200ms, easeClose cubic-bezier(0.4, 0, 1, 0.6)
///   Backdrop: opacity 0 → 0.45
///
/// Respects [MediaQuery.disableAnimations] (Reduce Motion): falls back to
/// 150ms opacity-only crossfade when enabled.
Future<T?> showAppBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  bool useSafeArea = true,
  bool showDragHandle = true,
}) {
  final reduceMotion = MediaQuery.of(context).disableAnimations;

  return showGeneralDialog<T>(
    context: context,
    useRootNavigator: true,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black.withOpacity(ModalAnimationTokens.backdropOpacity),
    transitionDuration: reduceMotion
        ? ModalAnimationTokens.durationReducedMotion
        : ModalAnimationTokens.durationBottomOpen,
    pageBuilder: (ctx, animation, secondaryAnimation) {
      final mq = MediaQuery.of(ctx);
      // Reserve status-bar height + 16 px breathing room so the sheet never
      // slides under the status bar / app header when content is very tall.
      final maxSheetHeight = mq.size.height - mq.padding.top - 16;

      // Wrap in SafeArea and align to bottom — mirrors showModalBottomSheet layout.
      //
      // When showDragHandle is false, the child sheet (e.g. a DraggableScrollableSheet)
      // manages its own background, border-radius, and sizing. Using a transparent
      // Material prevents the white AppColors.card background from showing through
      // the area not covered by the DraggableScrollableSheet (e.g. when initialChildSize
      // < 1.0, the gap between the sheet and the top of the dialog would be white).
      Widget sheet = Align(
        alignment: Alignment.bottomCenter,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxSheetHeight),
          child: Material(
            color: showDragHandle ? AppColors.card : Colors.transparent,
            borderRadius: showDragHandle
                ? const BorderRadius.vertical(
                    top: Radius.circular(AppTheme.radiusLg),
                  )
                : BorderRadius.zero,
            clipBehavior: showDragHandle ? Clip.antiAlias : Clip.none,
            elevation: showDragHandle ? 8 : 0,
            child: useSafeArea
                ? SafeArea(top: false, child: builder(ctx))
                : builder(ctx),
          ),
        ),
      );

      if (showDragHandle) {
        sheet = Align(
          alignment: Alignment.bottomCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: maxSheetHeight),
            child: Material(
              color: AppColors.card,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(AppTheme.radiusLg),
              ),
              clipBehavior: Clip.antiAlias,
              elevation: 8,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Drag handle — scales in at +60ms after sheet open (spec §2)
                  ModalContentFadeIn(
                    delay: ModalAnimationTokens.staggerHandle,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 10, bottom: 4),
                      child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: AppColors.border,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  ),
                  // Flexible gives the child a bounded max-height (remaining space
                  // after the drag handle) instead of the unbounded height that a
                  // plain Column(mainAxisSize: min) child would receive. This is
                  // required for DraggableScrollableSheet children, which crash with
                  // RenderBox layout assertions when given infinite height constraints.
                  Flexible(
                    child: useSafeArea
                        ? SafeArea(top: false, child: builder(ctx))
                        : builder(ctx),
                  ),
                ],
              ),
            ),
          ),
        );
      }

      return sheet;
    },
    transitionBuilder: (ctx, animation, secondaryAnimation, child) {
      return AppAnimatedModal(
        type: AppModalType.bottom,
        animation: animation,
        child: child,
      );
    },
  );
}
