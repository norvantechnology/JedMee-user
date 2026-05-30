import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Premium type scale — Plus Jakarta Sans.
/// Hierarchy: Display → Title → Label → Body → Caption
/// NOTE: All styles explicitly set decoration: TextDecoration.none to prevent
/// Flutter's default yellow underline from appearing in dialogs/overlays.
class AppTypography {
  AppTypography._();

  // ─── Size scale ───────────────────────────────────────────────────────────
  static const double displaySize = 28;
  static const double headingSize = 22;
  static const double titleSize = 18;
  static const double subtitleSize = 16;
  static const double labelSize = 14;
  static const double bodySize = 14;
  static const double captionSize = 12;
  static const double overlineSize = 11;

  // ─── Display ─────────────────────────────────────────────────────────────
  static const TextStyle display = TextStyle(
    fontSize: displaySize,
    fontWeight: FontWeight.w800,
    color: AppColors.text,
    height: 1.2,
    letterSpacing: -0.5,
    decoration: TextDecoration.none,
  );

  // ─── Headings ─────────────────────────────────────────────────────────────
  static const TextStyle heading = TextStyle(
    fontSize: headingSize,
    fontWeight: FontWeight.w700,
    color: AppColors.text,
    height: 1.25,
    letterSpacing: -0.3,
    decoration: TextDecoration.none,
  );

  static const TextStyle pageTitle = TextStyle(
    fontSize: titleSize,
    fontWeight: FontWeight.w700,
    color: AppColors.text,
    height: 1.25,
    letterSpacing: -0.2,
    decoration: TextDecoration.none,
  );

  static const TextStyle sectionTitle = TextStyle(
    fontSize: subtitleSize,
    fontWeight: FontWeight.w700,
    color: AppColors.text,
    height: 1.3,
    letterSpacing: -0.1,
    decoration: TextDecoration.none,
  );

  static const TextStyle cardTitle = TextStyle(
    fontSize: labelSize,
    fontWeight: FontWeight.w700,
    color: AppColors.text,
    height: 1.3,
    decoration: TextDecoration.none,
  );

  // ─── Labels ───────────────────────────────────────────────────────────────
  static const TextStyle label = TextStyle(
    fontSize: labelSize,
    fontWeight: FontWeight.w500,
    color: AppColors.text,
    height: 1.4,
    decoration: TextDecoration.none,
  );

  static const TextStyle labelSemibold = TextStyle(
    fontSize: labelSize,
    fontWeight: FontWeight.w600,
    color: AppColors.text,
    height: 1.4,
    decoration: TextDecoration.none,
  );

  static const TextStyle labelBold = TextStyle(
    fontSize: labelSize,
    fontWeight: FontWeight.w700,
    color: AppColors.text,
    height: 1.4,
    decoration: TextDecoration.none,
  );

  static const TextStyle labelMuted = TextStyle(
    fontSize: labelSize,
    fontWeight: FontWeight.w500,
    color: AppColors.textMuted,
    height: 1.4,
    decoration: TextDecoration.none,
  );

  // ─── Body ─────────────────────────────────────────────────────────────────
  static const TextStyle body = TextStyle(
    fontSize: bodySize,
    fontWeight: FontWeight.w400,
    color: AppColors.text,
    height: 1.55,
    decoration: TextDecoration.none,
  );

  static const TextStyle bodyMedium = TextStyle(
    fontSize: bodySize,
    fontWeight: FontWeight.w500,
    color: AppColors.text,
    height: 1.55,
    decoration: TextDecoration.none,
  );

  // ─── Caption / Secondary ──────────────────────────────────────────────────
  static const TextStyle secondary = TextStyle(
    fontSize: captionSize,
    fontWeight: FontWeight.w400,
    color: AppColors.textFaint,
    height: 1.35,
    decoration: TextDecoration.none,
  );

  static const TextStyle secondaryMedium = TextStyle(
    fontSize: captionSize,
    fontWeight: FontWeight.w500,
    color: AppColors.textFaint,
    height: 1.35,
    decoration: TextDecoration.none,
  );

  static const TextStyle caption = TextStyle(
    fontSize: captionSize,
    fontWeight: FontWeight.w400,
    color: AppColors.textMuted,
    height: 1.35,
    decoration: TextDecoration.none,
  );

  // ─── Overline ─────────────────────────────────────────────────────────────
  static const TextStyle overline = TextStyle(
    fontSize: overlineSize,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.8,
    color: AppColors.textFaint,
    height: 1.2,
    decoration: TextDecoration.none,
  );

  static const TextStyle overlineMuted = TextStyle(
    fontSize: overlineSize,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.6,
    color: AppColors.textMuted,
    height: 1.2,
    decoration: TextDecoration.none,
  );

  // ─── Numeric / Amount ─────────────────────────────────────────────────────
  static const TextStyle amount = TextStyle(
    fontSize: labelSize,
    fontWeight: FontWeight.w600,
    color: AppColors.text,
    height: 1.3,
    decoration: TextDecoration.none,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle amountLarge = TextStyle(
    fontSize: subtitleSize,
    fontWeight: FontWeight.w700,
    color: AppColors.text,
    height: 1.2,
    decoration: TextDecoration.none,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle kpiAmount = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.w700,
    color: AppColors.text,
    height: 1.15,
    letterSpacing: -0.3,
    decoration: TextDecoration.none,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle kpiAmountSmall = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w700,
    color: AppColors.text,
    height: 1.2,
    letterSpacing: -0.2,
    decoration: TextDecoration.none,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  // ─── Badge ────────────────────────────────────────────────────────────────
  static const TextStyle badge = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w600,
    height: 1.2,
    letterSpacing: 0.1,
    decoration: TextDecoration.none,
  );

  static const TextStyle badgeSmall = TextStyle(
    fontSize: 10,
    fontWeight: FontWeight.w700,
    height: 1.2,
    letterSpacing: 0.2,
    decoration: TextDecoration.none,
  );

  // ─── Detail rows ──────────────────────────────────────────────────────────
  static const TextStyle detailLabel = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: AppColors.textMuted,
    height: 1.35,
    decoration: TextDecoration.none,
  );

  static const TextStyle detailValue = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w500,
    color: AppColors.text2,
    height: 1.35,
    decoration: TextDecoration.none,
  );

  // ─── Form ─────────────────────────────────────────────────────────────────
  static const TextStyle inputLabel = TextStyle(
    fontSize: captionSize,
    fontWeight: FontWeight.w600,
    color: AppColors.textMuted,
    height: 1.3,
    letterSpacing: 0.1,
    decoration: TextDecoration.none,
  );

  static const TextStyle requiredNote = TextStyle(
    fontSize: captionSize,
    fontWeight: FontWeight.w400,
    color: AppColors.textFaint,
    height: 1.35,
    decoration: TextDecoration.none,
  );

  static const TextStyle helperText = TextStyle(
    fontSize: captionSize,
    fontWeight: FontWeight.w400,
    color: AppColors.textMuted,
    height: 1.4,
    decoration: TextDecoration.none,
  );

  // ─── Navigation ───────────────────────────────────────────────────────────
  static const TextStyle navItem = TextStyle(
    fontSize: labelSize,
    fontWeight: FontWeight.w500,
    color: AppColors.sidebarText,
    height: 1.25,
    decoration: TextDecoration.none,
  );

  static const TextStyle navItemActive = TextStyle(
    fontSize: labelSize,
    fontWeight: FontWeight.w600,
    color: AppColors.sidebarTextActive,
    height: 1.25,
    decoration: TextDecoration.none,
  );

  static const TextStyle navSectionLabel = TextStyle(
    fontSize: overlineSize,
    fontWeight: FontWeight.w700,
    letterSpacing: 1.0,
    color: AppColors.sidebarSectionLabel,
    height: 1.2,
    decoration: TextDecoration.none,
  );
}
