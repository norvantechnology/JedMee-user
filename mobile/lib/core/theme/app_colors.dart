import 'package:flutter/material.dart';

/// Canonical palette — premium enterprise SaaS design system.
/// Aligned with Stripe/Linear/Notion aesthetic.
class AppColors {
  AppColors._();

  // ─── Primary (Indigo) ────────────────────────────────────────────────────
  static const Color primary = Color(0xFF4F46E5);
  static const Color primaryDark = Color(0xFF4338CA);
  static const Color primaryLight = Color(0xFFEEF2FF);
  static const Color primaryDarker = Color(0xFF312E81);
  static const Color primarySubtle = Color(0xFFE0E7FF);
  static const Color primaryMid = Color(0xFF6366F1);

  // ─── Semantic ────────────────────────────────────────────────────────────
  static const Color success = Color(0xFF059669);
  static const Color successDark = Color(0xFF047857);
  static const Color successLight = Color(0xFFECFDF5);
  static const Color successMid = Color(0xFF10B981);

  static const Color danger = Color(0xFFDC2626);
  static const Color dangerDark = Color(0xFFB91C1C);
  static const Color dangerLight = Color(0xFFFEF2F2);
  static const Color dangerMid = Color(0xFFEF4444);

  static const Color warning = Color(0xFFD97706);
  static const Color warningDark = Color(0xFFB45309);
  static const Color warningLight = Color(0xFFFFFBEB);
  static const Color warningMid = Color(0xFFF59E0B);

  // ─── Spec tokens (mobile UI) ─────────────────────────────────────────────
  static const Color filterBarBg = Color(0xFFF1EFE8);
  static const Color badgeConfirmedBg = Color(0xFFE6F1FB);
  static const Color badgeConfirmedText = Color(0xFF0C447C);
  static const Color badgeConfirmedBorder = Color(0xFFB5D4F4);
  static const Color badgePaidBg = Color(0xFFEAF3DE);
  static const Color badgePaidText = Color(0xFF27500A);
  static const Color badgePaidBorder = Color(0xFFC0DD97);
  static const Color alertAmberBg = Color(0xFFFAEEDA);
  static const Color alertAmberBorder = Color(0xFFFAC775);
  static const Color alertAmberIcon = Color(0xFFBA7517);
  static const Color alertAmberText = Color(0xFF854F0B);
  static const Color alertRedBg = Color(0xFFFCEBEB);
  static const Color alertRedBorder = Color(0xFFF7C1C1);
  static const Color alertRedIcon = Color(0xFFA32D2D);
  // ─── Expiry badge tokens ─────────────────────────────────────────────────
  static const Color expiryWarningBg = Color(0xFFFAEEDA);
  static const Color expiryWarningText = Color(0xFF854F0B);
  static const Color expiryWarningBorder = Color(0xFFF5C97A);
  static const Color expiryDangerBg = Color(0xFFFCEBEB);
  static const Color expiryDangerText = Color(0xFFA32D2D);
  static const Color expiryDangerBorder = Color(0xFFF7C1C1);
  static const Color expirySafeBg = Color(0xFFEAF3DE);
  static const Color expirySafeText = Color(0xFF27500A);
  static const Color expirySafeBorder = Color(0xFFB8D98F);
  // ─── Status badge cancelled/draft tokens ─────────────────────────────────
  static const Color badgeCancelledBg = Color(0xFFF5F5F7);
  static const Color badgeCancelledText = Color(0x73000000);
  static const Color badgeDraftBg = Color(0xFFFFF8E1);
  static const Color badgeDraftText = Color(0xFF7A5C00);
  // ─── Detail row bool value colors ────────────────────────────────────────
  static const Color boolYesText = Color(0xFF27500A);
  static const Color boolYesIcon = Color(0xFF3B6D11);
  static const Color boolNoText = Color(0x4D000000);
  static const Color kpiPayablesAccent = Color(0xFFE24B4A);
  static const Color kpiReceivablesAccent = Color(0xFF1D9E75);
  static const Color saveDraftLink = Color(0xFF6366F1);

  // ─── Surfaces ────────────────────────────────────────────────────────────
  static const Color bg = Color(0xFFF8FAFC);
  static const Color bgSubtle = Color(0xFFF1F5F9);
  static const Color modalBg = Color(0xFFF0F4F7);
  static const Color surface = Color(0xFFF1F5F9);
  static const Color surface2 = Color(0xFFE2E8F0);
  static const Color surface3 = Color(0xFFCBD5E1);
  static const Color card = Color(0xFFFFFFFF);
  static const Color cardHover = Color(0xFFFAFBFC);

  // ─── Borders ─────────────────────────────────────────────────────────────
  static const Color border = Color(0xFFE2E8F0);
  static const Color borderStrong = Color(0xFFCBD5E1);
  static const Color borderFocus = primary;
  static const Color borderSubtle = Color(0xFFEFF2F7);

  // ─── Text ────────────────────────────────────────────────────────────────
  static const Color text = Color(0xFF0F172A);
  static const Color text2 = Color(0xFF1E293B);
  static const Color text3 = Color(0xFF374151);
  static const Color text4 = Color(0xFF4B5563);
  static const Color textMuted = Color(0xFF64748B);
  static const Color textFaint = Color(0xFF94A3B8);
  static const Color textPlaceholder = Color(0xFFCBD5E1);

  // ─── On-color ────────────────────────────────────────────────────────────
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color onDanger = Color(0xFFFFFFFF);

  // ─── Sidebar (premium dark navy) ─────────────────────────────────────────
  static const Color sidebarBg = Color(0xFF0F172A);
  static const Color sidebarBgAccent = Color(0xFF1E293B);
  static const Color sidebarBorder = Color(0xFF1E293B);
  static const Color sidebarBorderSubtle = Color(0xFF334155);
  static const Color sidebarText = Color(0xFF94A3B8);
  static const Color sidebarTextActive = Color(0xFFF8FAFC);
  static const Color sidebarTextMuted = Color(0xFF64748B);
  static const Color sidebarActiveBg = Color(0xFF1E293B);
  static const Color sidebarActiveBorder = primary;
  static const Color sidebarSectionLabel = Color(0xFF475569);
  static const Color sidebarIconBg = Color(0xFF1E293B);
  static const Color sidebarIconBgActive = Color(0xFF312E81);

  // ─── Info (alias of primary) ─────────────────────────────────────────────
  static const Color info = primary;
  static const Color infoDark = primaryDark;
  static const Color infoLight = primaryLight;
  static const Color infoSubtle = primarySubtle;

  // ─── Color aliases ───────────────────────────────────────────────────────
  static const Color colorBg = bg;
  static const Color colorCard = card;
  static const Color colorSurface = surface;
  static const Color colorSurface2 = surface2;
  static const Color colorSurface3 = borderStrong;
  static const Color colorBorder = border;
  static const Color colorBorderStrong = borderStrong;
  static const Color colorBorderFocus = primary;
  static const Color colorPrimarySoft = primaryLight;
  static const Color colorBgSoft = surface;
  static const Color colorText = text;
  static const Color colorText2 = text2;
  static const Color colorText3 = text3;
  static const Color colorText4 = text4;
  static const Color colorTextHeading = text;
  static const Color colorTextMuted = textMuted;
  static const Color colorTextFaint = textFaint;
  static const Color colorOnPrimary = onPrimary;
  static const Color colorOnDanger = onDanger;

  // ─── Derived via color-mix (approximated) ────────────────────────────────
  static Color get colorBorderSoft => colorMix(border, 68, card);
  static Color get colorSuccessSubtle => colorMix(success, 14, card);
  static Color get colorDangerSubtle => colorMix(danger, 12, card);
  static Color get colorWarningSubtle => colorMix(warning, 14, card);

  static Color get modalHeadBg => colorMix(primary, 7, card);
  static Color get modalHeadBgLow => colorMix(surface, 40, card);
  static Color get modalHeadBorder => colorMix(primary, 10, border);
  static Color get modalHeadIconBg => colorMix(primary, 12, card);
  static Color get modalHeadCloseHover => colorMix(primary, 7, surface);
  static Color get modalPanelHeadBg => colorMix(surface, 36, card);
  static Color get modalPanelBodyBg => colorMix(surface, 14, card);
  static Color get modalFieldBgHover => colorMix(surface, 28, card);
  static Color get modalFieldBgDisabled => colorMix(surface, 55, card);
  static Color get modalSectionTitle => colorMix(primary, 10, text3);

  static Color get controlBorderDefault => colorMix(text, 58, borderStrong);
  static Color get controlBorderHover => colorMix(text, 44, borderStrong);
  static Color get modalFieldBorder => colorMix(text, 62, borderStrong);
  static Color get modalFieldBorderHover => colorMix(text, 48, borderStrong);

  static Color get overlayScrim => colorMixWithTransparent(text2, 42);
  static Color get overlayScrimStrong => colorMixWithTransparent(text2, 74);
  static Color get onPrimaryMuted => colorMixWithTransparent(onPrimary, 72);

  static Color get toolbarBackground =>
      colorMix(card, 92, Colors.transparent);

  // ─── Badge tokens ────────────────────────────────────────────────────────
  static Color get badgeLiveBorder => colorMix(success, 26, border);
  static Color get badgeExpiredBorder => colorMix(danger, 26, border);
  static Color get badgeSoonBorder => colorMix(warning, 26, border);
  static Color get badgeLowBorder => colorMix(danger, 22, border);
  static Color get badgeNoneBorder => colorMix(warning, 22, border);
  static Color get badgeRxBorder => colorMix(primary, 24, border);
  static Color get badgeOtcBorder => colorMix(primary, 24, border);
  static Color get badgeFlagBorder => colorMix(primary, 24, border);

  static const Color badgeLiveBg = successLight;
  static const Color badgeLiveText = successDark;
  static const Color badgeExpiredBg = dangerLight;
  static const Color badgeExpiredText = dangerDark;
  static const Color badgeSoonBg = warningLight;
  static const Color badgeSoonText = warningDark;
  static const Color badgeLowBg = dangerLight;
  static const Color badgeLowText = dangerDark;
  static const Color badgeNormalBg = surface;
  static const Color badgeNormalText = text3;
  static const Color badgeNormalBorder = border;
  static const Color badgeNoneBg = warningLight;
  static const Color badgeNoneText = warningDark;
  static const Color badgeRxBg = primaryLight;
  static const Color badgeRxText = primaryDark;
  static const Color badgeOtcBg = primaryLight;
  static const Color badgeOtcText = primaryDark;
  static const Color badgeHalfBg = bg;
  static const Color badgeHalfText = textMuted;
  static const Color badgeHalfBorder = border;
  static const Color badgeFlagBg = primaryLight;
  static const Color badgeFlagText = primaryDark;

  // ─── Gradient presets ────────────────────────────────────────────────────
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
  );

  static const LinearGradient sidebarHeaderGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF1E293B), Color(0xFF0F172A)],
  );

  static const LinearGradient successGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF059669), Color(0xFF10B981)],
  );

  static const LinearGradient dangerGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFDC2626), Color(0xFFEF4444)],
  );

  /// CSS `color-mix(in srgb, A p%, B)` — blend [percentA]% of [a] with the rest of [b].
  static Color colorMix(Color a, double percentA, Color b) {
    final t = (percentA / 100).clamp(0.0, 1.0);
    if (b.alpha == 0) {
      return a.withAlpha((t * a.alpha).round().clamp(0, 255));
    }
    return Color.lerp(b, a, t)!;
  }

  /// CSS `color-mix(in srgb, color p%, transparent)`.
  static Color colorMixWithTransparent(Color color, double percent) {
    final alpha = ((percent / 100) * 255).round().clamp(0, 255);
    return color.withAlpha(alpha);
  }
}
