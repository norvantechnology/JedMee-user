import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Premium shadow system — layered, soft, enterprise-grade.
/// Inspired by Linear, Stripe, and Notion design systems.
class AppElevation {
  AppElevation._();

  /// Subtle card shadow — default surface elevation.
  static List<BoxShadow> get card => const [
        BoxShadow(
          color: Color(0x08000000),
          blurRadius: 1,
          offset: Offset(0, 1),
        ),
        BoxShadow(
          color: Color(0x0A0F172A),
          blurRadius: 8,
          offset: Offset(0, 2),
        ),
        BoxShadow(
          color: Color(0x060F172A),
          blurRadius: 16,
          offset: Offset(0, 4),
        ),
      ];

  /// Elevated card — for interactive or highlighted cards.
  static List<BoxShadow> get cardElevated => const [
        BoxShadow(
          color: Color(0x0A000000),
          blurRadius: 2,
          offset: Offset(0, 1),
        ),
        BoxShadow(
          color: Color(0x0D0F172A),
          blurRadius: 12,
          offset: Offset(0, 4),
        ),
        BoxShadow(
          color: Color(0x080F172A),
          blurRadius: 24,
          offset: Offset(0, 8),
        ),
      ];

  /// Hover state shadow — adds primary color glow.
  static List<BoxShadow> get cardHover => [
        ...card,
        BoxShadow(
          color: AppColors.primary.withOpacity(0.08),
          blurRadius: 20,
          offset: const Offset(0, 6),
        ),
      ];

  /// Modal / bottom sheet shadow.
  static List<BoxShadow> get modal => const [
        BoxShadow(
          color: Color(0x1A0F172A),
          blurRadius: 40,
          offset: Offset(0, -8),
        ),
        BoxShadow(
          color: Color(0x0A0F172A),
          blurRadius: 16,
          offset: Offset(0, -2),
        ),
      ];

  /// App bar shadow — very subtle.
  static List<BoxShadow> get appBar => const [
        BoxShadow(
          color: Color(0x06000000),
          blurRadius: 1,
          offset: Offset(0, 1),
        ),
        BoxShadow(
          color: Color(0x080F172A),
          blurRadius: 8,
          offset: Offset(0, 2),
        ),
      ];

  /// Drawer / sidebar shadow.
  static List<BoxShadow> get drawer => const [
        BoxShadow(
          color: Color(0x1A000000),
          blurRadius: 8,
          offset: Offset(2, 0),
        ),
        BoxShadow(
          color: Color(0x26000000),
          blurRadius: 32,
          offset: Offset(8, 0),
        ),
      ];

  /// Floating action button shadow.
  static List<BoxShadow> get fab => [
        BoxShadow(
          color: AppColors.primary.withOpacity(0.3),
          blurRadius: 16,
          offset: const Offset(0, 6),
        ),
        BoxShadow(
          color: AppColors.primary.withOpacity(0.15),
          blurRadius: 32,
          offset: const Offset(0, 12),
        ),
      ];

  /// Avatar / icon container shadow.
  static List<BoxShadow> get avatar => [
        BoxShadow(
          color: AppColors.primary.withOpacity(0.25),
          blurRadius: 12,
          offset: const Offset(0, 4),
        ),
      ];

  /// Dropdown / popover shadow.
  static List<BoxShadow> get popover => const [
        BoxShadow(
          color: Color(0x0A000000),
          blurRadius: 2,
          offset: Offset(0, 1),
        ),
        BoxShadow(
          color: Color(0x120F172A),
          blurRadius: 16,
          offset: Offset(0, 4),
        ),
        BoxShadow(
          color: Color(0x0A0F172A),
          blurRadius: 32,
          offset: Offset(0, 8),
        ),
      ];

  /// KPI / stat card shadow with accent.
  static List<BoxShadow> kpiCard(Color accentColor) => [
        BoxShadow(
          color: accentColor.withOpacity(0.12),
          blurRadius: 20,
          offset: const Offset(0, 6),
        ),
        ...card,
      ];
}
