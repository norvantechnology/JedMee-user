import 'package:flutter/material.dart';

import '../core/theme/modal_animation_tokens.dart';

// ─── Modal type enum ──────────────────────────────────────────────────────────

enum AppModalType {
  /// Center dialog / alert / form modal.
  /// Animation: scale(0.94)+opacity(0) → scale(1)+opacity(1).
  center,

  /// Bottom sheet (filter panel, export, date picker, new-record form).
  /// Animation: translateY(40px)+opacity(0) → translateY(0)+opacity(1).
  bottom,

  /// Left-side navigation drawer.
  /// Animation: translateX(-100%) → translateX(0).
  drawer,

  /// Toast / snackbar (success, error, warning).
  /// Animation: translateY(-20px)+opacity(0) → translateY(0)+opacity(1).
  toast,

  /// Inline tooltip / help overlay.
  /// Animation: scale(0.9)+opacity(0) → scale(1)+opacity(1).
  tooltip,

  /// Full-screen overlay (PDF viewer, QR scanner, image preview).
  /// Animation: opacity(0)+translateY(12px) → opacity(1)+translateY(0).
  fullscreen,
}

// ─── Unified animated modal wrapper ──────────────────────────────────────────

/// Wraps any modal content with the correct enter/exit animation based on
/// [type]. Compose all modals, sheets, drawers, toasts, and overlays from this.
///
/// The wrapper respects [MediaQuery.disableAnimations]: when the user has
/// enabled "Reduce Motion", all transform animations are skipped and only a
/// 150ms opacity crossfade is applied.
///
/// Example — bottom sheet body:
/// ```dart
/// AppAnimatedModal(
///   type: AppModalType.bottom,
///   animation: animation,  // from showGeneralDialog transitionBuilder
///   child: MySheetContent(),
/// )
/// ```
class AppAnimatedModal extends StatelessWidget {
  const AppAnimatedModal({
    super.key,
    required this.type,
    required this.animation,
    required this.child,
  });

  final AppModalType type;

  /// The route animation (0→1 open, 1→0 close) provided by the modal system.
  final Animation<double> animation;

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;

    if (reduceMotion) {
      return FadeTransition(
        opacity: Tween<double>(begin: 0.0, end: 1.0).animate(
          CurvedAnimation(parent: animation, curve: Curves.easeOut),
        ),
        child: child,
      );
    }

    final curved = ModalAnimationTokens.curvedAnimation(animation);

    return switch (type) {
      AppModalType.center    => _CenterModalTransition(curved: curved, child: child),
      AppModalType.bottom    => _BottomSheetTransition(curved: curved, child: child),
      AppModalType.drawer    => _DrawerTransition(curved: curved, child: child),
      AppModalType.toast     => _ToastTransition(curved: curved, child: child),
      AppModalType.tooltip   => _TooltipTransition(curved: curved, child: child),
      AppModalType.fullscreen => _FullscreenTransition(curved: curved, child: child),
    };
  }
}

// ─── Per-type transition widgets ─────────────────────────────────────────────

/// Center modal: scale(0.94)+opacity(0) → scale(1)+opacity(1).
class _CenterModalTransition extends StatelessWidget {
  const _CenterModalTransition({required this.curved, required this.child});
  final Animation<double> curved;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: Tween<double>(
        begin: ModalAnimationTokens.scaleFrom,
        end: 1.0,
      ).animate(curved),
      child: FadeTransition(
        opacity: Tween<double>(begin: 0.0, end: 1.0).animate(curved),
        child: child,
      ),
    );
  }
}

/// Bottom sheet: translateY(40px)+opacity(0) → translateY(0)+opacity(1).
class _BottomSheetTransition extends StatelessWidget {
  const _BottomSheetTransition({required this.curved, required this.child});
  final Animation<double> curved;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: curved,
      builder: (_, Widget? c) => Transform.translate(
        offset: Offset(
          0,
          Tween<double>(
            begin: ModalAnimationTokens.translateYFrom,
            end: 0.0,
          ).evaluate(curved),
        ),
        child: Opacity(
          opacity: Tween<double>(begin: 0.0, end: 1.0).evaluate(curved),
          child: c,
        ),
      ),
      child: child,
    );
  }
}

/// Side drawer: translateX(-100%) → translateX(0).
class _DrawerTransition extends StatelessWidget {
  const _DrawerTransition({required this.curved, required this.child});
  final Animation<double> curved;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return SlideTransition(
      position: Tween<Offset>(
        begin: const Offset(-1.0, 0.0),
        end: Offset.zero,
      ).animate(curved),
      child: child,
    );
  }
}

/// Toast: translateY(-20px)+opacity(0) → translateY(0)+opacity(1).
class _ToastTransition extends StatelessWidget {
  const _ToastTransition({required this.curved, required this.child});
  final Animation<double> curved;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: curved,
      builder: (_, Widget? c) => Transform.translate(
        offset: Offset(
          0,
          Tween<double>(
            begin: ModalAnimationTokens.translateYFromTop,
            end: 0.0,
          ).evaluate(curved),
        ),
        child: Opacity(
          opacity: Tween<double>(begin: 0.0, end: 1.0).evaluate(curved),
          child: c,
        ),
      ),
      child: child,
    );
  }
}

/// Tooltip: scale(0.9)+opacity(0) → scale(1)+opacity(1).
class _TooltipTransition extends StatelessWidget {
  const _TooltipTransition({required this.curved, required this.child});
  final Animation<double> curved;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: Tween<double>(begin: 0.9, end: 1.0).animate(curved),
      alignment: Alignment.topCenter,
      child: FadeTransition(
        opacity: Tween<double>(begin: 0.0, end: 1.0).animate(curved),
        child: child,
      ),
    );
  }
}

/// Full-screen overlay: opacity(0)+translateY(12px) → opacity(1)+translateY(0).
class _FullscreenTransition extends StatelessWidget {
  const _FullscreenTransition({required this.curved, required this.child});
  final Animation<double> curved;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: curved,
      builder: (_, Widget? c) => Transform.translate(
        offset: Offset(
          0,
          Tween<double>(begin: 12.0, end: 0.0).evaluate(curved),
        ),
        child: Opacity(
          opacity: Tween<double>(begin: 0.0, end: 1.0).evaluate(curved),
          child: c,
        ),
      ),
      child: child,
    );
  }
}

// ─── Staggered modal content wrapper ─────────────────────────────────────────

/// Wraps a modal child with a staggered opacity fade-in.
/// Use for title (+40ms), body (+80ms), and actions (+120ms) inside any modal.
/// Only opacity is animated — no transform on children (avoids layout reflow).
class ModalContentFadeIn extends StatefulWidget {
  const ModalContentFadeIn({
    super.key,
    required this.child,
    this.delay = Duration.zero,
  });

  final Widget child;

  /// Delay before this child begins fading in.
  /// Use [ModalAnimationTokens.staggerTitle], [staggerBody], [staggerActions].
  final Duration delay;

  @override
  State<ModalContentFadeIn> createState() => _ModalContentFadeInState();
}

class _ModalContentFadeInState extends State<ModalContentFadeIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 180),
    );
    _opacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _ctrl, curve: ModalAnimationTokens.easeOpen),
    );
    if (widget.delay == Duration.zero) {
      _ctrl.forward();
    } else {
      Future.delayed(widget.delay, () {
        if (mounted) _ctrl.forward();
      });
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    if (reduceMotion) return widget.child;
    return FadeTransition(opacity: _opacity, child: widget.child);
  }
}