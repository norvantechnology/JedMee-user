import 'package:flutter/material.dart';

/// Premium animation system — fast, smooth, professional.
/// Inspired by Linear and Stripe interaction design.
class AppMotion {
  AppMotion._();

  // ─── Durations ────────────────────────────────────────────────────────────
  /// Micro-interactions: icon state changes, checkbox toggles.
  static const Duration micro = Duration(milliseconds: 100);

  /// Fast: hover states, button feedback, badge updates.
  static const Duration fast = Duration(milliseconds: 150);

  /// Normal: panel transitions, drawer open/close, tab switches.
  static const Duration normal = Duration(milliseconds: 220);

  /// Slow: page transitions, modal open/close, complex animations.
  static const Duration slow = Duration(milliseconds: 320);

  /// Very slow: onboarding, splash, large layout shifts.
  static const Duration verySlow = Duration(milliseconds: 450);

  // ─── Curves ───────────────────────────────────────────────────────────────
  /// Standard easing — most UI transitions.
  static const Curve standard = Curves.easeOutCubic;

  /// Enter — elements appearing on screen.
  static const Curve enter = Curves.easeOutCubic;

  /// Exit — elements leaving screen.
  static const Curve exit = Curves.easeInCubic;

  /// Spring — bouncy, playful interactions.
  static const Curve spring = Curves.elasticOut;

  /// Decelerate — fast start, slow end (like drag release).
  static const Curve decelerate = Curves.decelerate;

  /// Emphasize — Material 3 emphasized easing.
  static const Curve emphasize = Curves.easeInOutCubicEmphasized;

  /// Modal open curve (matches web / modal tokens).
  static const Curve easeOpen = Cubic(0.32, 0.72, 0, 1);

  /// Modal close curve.
  static const Curve easeClose = Cubic(0.4, 0, 1, 0.6);

  // ─── Stagger helpers ──────────────────────────────────────────────────────
  /// Stagger delay for list items (index * staggerDelay).
  static const Duration staggerDelay = Duration(milliseconds: 40);

  /// Max stagger items before capping delay.
  static const int maxStaggerItems = 8;

  static Duration staggerFor(int index) {
    final capped = index.clamp(0, maxStaggerItems);
    return Duration(milliseconds: capped * staggerDelay.inMilliseconds);
  }
}

/// Subtle fade + slide page transition — web-app feel.
class AppPageTransitionsBuilder extends PageTransitionsBuilder {
  const AppPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final curved = CurvedAnimation(parent: animation, curve: AppMotion.enter);
    final exitCurved = CurvedAnimation(
      parent: secondaryAnimation,
      curve: AppMotion.exit,
    );

    return FadeTransition(
      opacity: Tween<double>(begin: 0.0, end: 1.0).animate(curved),
      child: FadeTransition(
        opacity: Tween<double>(begin: 1.0, end: 0.96).animate(exitCurved),
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.016),
            end: Offset.zero,
          ).animate(curved),
          child: child,
        ),
      ),
    );
  }
}

/// Fade-in animation wrapper for staggered list items.
class FadeInWidget extends StatefulWidget {
  const FadeInWidget({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.duration = AppMotion.normal,
    this.curve = AppMotion.enter,
    this.slideOffset = const Offset(0, 0.04),
  });

  final Widget child;
  final Duration delay;
  final Duration duration;
  final Curve curve;
  final Offset slideOffset;

  @override
  State<FadeInWidget> createState() => _FadeInWidgetState();
}

class _FadeInWidgetState extends State<FadeInWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _opacity;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: widget.duration);
    final curved = CurvedAnimation(parent: _controller, curve: widget.curve);
    _opacity = Tween<double>(begin: 0.0, end: 1.0).animate(curved);
    _slide = Tween<Offset>(begin: widget.slideOffset, end: Offset.zero)
        .animate(curved);

    if (widget.delay == Duration.zero) {
      _controller.forward();
    } else {
      Future.delayed(widget.delay, () {
        if (mounted) _controller.forward();
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: SlideTransition(position: _slide, child: widget.child),
    );
  }
}

/// Animated scale + fade for button press feedback.
class PressScaleWidget extends StatefulWidget {
  const PressScaleWidget({
    super.key,
    required this.child,
    this.scale = 0.97,
    this.onTap,
  });

  final Widget child;
  final double scale;
  final VoidCallback? onTap;

  @override
  State<PressScaleWidget> createState() => _PressScaleWidgetState();
}

class _PressScaleWidgetState extends State<PressScaleWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: AppMotion.micro,
      reverseDuration: AppMotion.fast,
    );
    _scale = Tween<double>(begin: 1.0, end: widget.scale).animate(
      CurvedAnimation(parent: _controller, curve: AppMotion.standard),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _controller.forward(),
      onTapUp: (_) {
        _controller.reverse();
        widget.onTap?.call();
      },
      onTapCancel: () => _controller.reverse(),
      child: ScaleTransition(scale: _scale, child: widget.child),
    );
  }
}
