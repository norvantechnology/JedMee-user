import 'package:flutter/material.dart';

/// Unified modal animation tokens — single source of truth for every overlay,
/// bottom sheet, dialog, toast, tooltip, and drawer in the app.
///
/// Flutter translation of the MODAL_TOKENS design spec:
///   easeOpen  → Cubic(0.32, 0.72, 0, 1)   — decelerate: fast start, soft land
///   easeClose → Cubic(0.4,  0,   1, 0.6)  — accelerate: slow start, quick exit
///
/// Usage:
///   CurvedAnimation(
///     parent: controller,
///     curve: ModalAnimationTokens.easeOpen,
///     reverseCurve: ModalAnimationTokens.easeClose.flipped,
///   )
abstract final class ModalAnimationTokens {
  // ─── Durations ──────────────────────────────────────────────────────────────

  /// Center modal (dialog, alert, form) — open.
  static const Duration durationOpen = Duration(milliseconds: 180);

  /// Center modal — close.
  static const Duration durationClose = Duration(milliseconds: 120);

  /// Bottom sheet — open (slightly longer for the slide-up feel).
  static const Duration durationBottomOpen = Duration(milliseconds: 200);

  /// Bottom sheet — close.
  static const Duration durationBottomClose = Duration(milliseconds: 120);

  /// Toast / snackbar — open.
  static const Duration durationToastOpen = Duration(milliseconds: 180);

  /// Toast / snackbar — close.
  static const Duration durationToastClose = Duration(milliseconds: 120);

  /// Toast auto-dismiss hold time.
  static const Duration durationToastHold = Duration(milliseconds: 3000);

  /// Tooltip sheet — open.
  static const Duration durationTooltipOpen = Duration(milliseconds: 180);

  /// Tooltip sheet — close.
  static const Duration durationTooltipClose = Duration(milliseconds: 140);

  /// Full-screen overlay — open.
  static const Duration durationFullscreenOpen = Duration(milliseconds: 320);

  /// Full-screen overlay — close.
  static const Duration durationFullscreenClose = Duration(milliseconds: 200);

  /// Reduced-motion fallback — opacity-only crossfade.
  static const Duration durationReducedMotion = Duration(milliseconds: 150);

  // ─── Curves ─────────────────────────────────────────────────────────────────

  /// Decelerate — fast start, soft land. Used for OPEN transitions.
  /// Equivalent to CSS cubic-bezier(0.32, 0.72, 0, 1).
  static const Curve easeOpen = Cubic(0.32, 0.72, 0, 1);

  /// Accelerate — slow start, quick exit. Used for CLOSE transitions.
  /// Equivalent to CSS cubic-bezier(0.4, 0, 1, 0.6).
  static const Curve easeClose = Cubic(0.4, 0, 1, 0.6);

  // ─── Transform values ───────────────────────────────────────────────────────

  /// Backdrop opacity target (0 → this on open, this → 0 on close).
  static const double backdropOpacity = 0.45;

  /// Center modal: scale origin on open (0.94 → 1.0).
  static const double scaleFrom = 0.94;

  /// Center modal: scale target on close (1.0 → 0.96).
  static const double scaleTo = 0.96;

  /// Bottom sheet: translateY origin on open (logical pixels, downward).
  static const double translateYFrom = 40.0;

  /// Bottom sheet: translateY target on close (logical pixels, downward).
  static const double translateYClose = 60.0;

  /// Toast / top drawer: translateY origin on open (negative = from above).
  static const double translateYFromTop = -20.0;

  // ─── Content stagger delays ─────────────────────────────────────────────────
  // Applied to modal children after the container animation begins.
  // Only opacity is animated on children (no transform — avoids layout reflow).

  /// Modal title fades in at +40ms after open begins.
  static const Duration staggerTitle = Duration(milliseconds: 40);

  /// Modal body fades in at +80ms after open begins.
  static const Duration staggerBody = Duration(milliseconds: 80);

  /// Modal action buttons fade in at +120ms after open begins.
  static const Duration staggerActions = Duration(milliseconds: 120);

  /// Bottom sheet drag handle scales in at +60ms after sheet open begins.
  static const Duration staggerHandle = Duration(milliseconds: 60);

  // ─── Z-index (Overlay priority) ─────────────────────────────────────────────
  // Flutter uses insertion order in Overlay; these constants document intent.
  // Higher value = rendered on top.

  static const int zTooltip    = 600;
  static const int zToast      = 500;
  static const int zCenterModal = 400;
  static const int zBottomSheet = 300;
  static const int zDrawer     = 200;
  static const int zBackdrop   = 100;

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /// Returns a [CurvedAnimation] pre-configured with [easeOpen] forward and
  /// [easeClose] reverse. Pass this to all modal [Tween.animate] calls.
  static CurvedAnimation curvedAnimation(Animation<double> parent) =>
      CurvedAnimation(
        parent: parent,
        curve: easeOpen,
        reverseCurve: easeClose.flipped,
      );

  /// Returns the appropriate duration for [reduceMotion] contexts.
  static Duration openDuration(bool reduceMotion) =>
      reduceMotion ? durationReducedMotion : durationOpen;

  static Duration closeDuration(bool reduceMotion) =>
      reduceMotion ? durationReducedMotion : durationClose;
}