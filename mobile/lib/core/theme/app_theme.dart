import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';
import 'app_motion.dart';
import 'app_spacing.dart';

/// Premium Material 3 theme — enterprise SaaS aesthetic.
/// Aligned with Stripe, Linear, Notion design language.
///
/// PERFORMANCE OPTIMIZATION:
/// The [light] getter is called every time MaterialApp rebuilds (e.g. on
/// locale change, brightness change, or hot reload). GoogleFonts.plusJakartaSans
/// TextTheme() is expensive — it creates a full TextTheme object with 13 styles.
/// Caching it as a static field means it is computed exactly once per app
/// lifecycle, saving ~2–5 ms per rebuild.
class AppTheme {
  AppTheme._();

  // ─── Radius tokens ────────────────────────────────────────────────────────
  static const double radiusXs = 6;
  static const double radiusSm = 8;
  static const double radius = 10;
  static const double radiusMd = 12;
  static const double radiusLg = 14;
  static const double radiusXl = 16;
  static const double radiusXxl = 20;
  static const double layoutCardRadius = 14;
  static const double modalRadius = 20;
  static const double pillRadius = 100;

  // PERFORMANCE: Cache the Google Fonts text theme — computed once, reused
  // on every theme access. Avoids repeated font-style object allocation.
  static final TextTheme _cachedBaseText = GoogleFonts.plusJakartaSansTextTheme(
    ThemeData.light(useMaterial3: true).textTheme,
  );

  // PERFORMANCE: Cache the full ThemeData — the light getter is called on
  // every MaterialApp rebuild. Caching avoids re-creating 30+ theme objects.
  static ThemeData? _cachedLight;

  static ThemeData get light {
    if (_cachedLight != null) return _cachedLight!;
    final baseText = _cachedBaseText;
    _cachedLight = _buildLight(baseText);
    return _cachedLight!;
  }

  static ThemeData _buildLight(TextTheme baseText) {

    // NOTE: decoration: TextDecoration.none is set on every style to prevent
    // Flutter's default yellow underline from appearing in dialogs/overlays
    // that don't have an explicit Material ancestor.
    final textTheme = baseText.copyWith(
      displayLarge: baseText.displayLarge?.copyWith(
        fontSize: 32,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.8,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      displayMedium: baseText.displayMedium?.copyWith(
        fontSize: 28,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.5,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      displaySmall: baseText.displaySmall?.copyWith(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      headlineLarge: baseText.headlineLarge?.copyWith(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      headlineMedium: baseText.headlineMedium?.copyWith(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      headlineSmall: baseText.headlineSmall?.copyWith(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      titleLarge: baseText.titleLarge?.copyWith(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      titleMedium: baseText.titleMedium?.copyWith(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.1,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      titleSmall: baseText.titleSmall?.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      bodyLarge: baseText.bodyLarge?.copyWith(
        fontSize: 15,
        height: 1.55,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      bodyMedium: baseText.bodyMedium?.copyWith(
        fontSize: 14,
        height: 1.55,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      bodySmall: baseText.bodySmall?.copyWith(
        fontSize: 12,
        height: 1.4,
        color: AppColors.textFaint,
        decoration: TextDecoration.none,
      ),
      labelLarge: baseText.labelLarge?.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.1,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      labelMedium: baseText.labelMedium?.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.2,
        color: AppColors.text,
        decoration: TextDecoration.none,
      ),
      labelSmall: baseText.labelSmall?.copyWith(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.5,
        color: AppColors.textMuted,
        decoration: TextDecoration.none,
      ),
    );

    const colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.primary,
      onPrimary: AppColors.onPrimary,
      primaryContainer: AppColors.primaryLight,
      onPrimaryContainer: AppColors.primaryDarker,
      secondary: AppColors.primaryMid,
      onSecondary: AppColors.onPrimary,
      secondaryContainer: AppColors.primarySubtle,
      onSecondaryContainer: AppColors.primaryDark,
      tertiary: AppColors.successMid,
      onTertiary: Colors.white,
      error: AppColors.danger,
      onError: AppColors.onDanger,
      errorContainer: AppColors.dangerLight,
      onErrorContainer: AppColors.dangerDark,
      surface: AppColors.card,
      onSurface: AppColors.text,
      // ignore: deprecated_member_use
      background: AppColors.bg,
      // ignore: deprecated_member_use
      onBackground: AppColors.text,
      onSurfaceVariant: AppColors.textMuted,
      outline: AppColors.border,
      outlineVariant: AppColors.borderSubtle,
      shadow: Color(0x1A000000),
      scrim: Color(0x66000000),
      inverseSurface: AppColors.text2,
      onInverseSurface: AppColors.card,
      inversePrimary: AppColors.primaryLight,
    );

    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.bg,
      textTheme: textTheme,
    );

    return base.copyWith(
      splashFactory: InkSparkle.splashFactory,
      highlightColor: AppColors.primary.withOpacity(0.05),
      splashColor: AppColors.primary.withOpacity(0.08),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: AppPageTransitionsBuilder(),
          TargetPlatform.iOS: AppPageTransitionsBuilder(),
          TargetPlatform.linux: AppPageTransitionsBuilder(),
          TargetPlatform.macOS: AppPageTransitionsBuilder(),
          TargetPlatform.windows: AppPageTransitionsBuilder(),
          TargetPlatform.fuchsia: AppPageTransitionsBuilder(),
        },
      ),
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: AppColors.card,
        foregroundColor: AppColors.text,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        toolbarHeight: 52,
        systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
          statusBarBrightness: Brightness.light,
        ),
        titleTextStyle: textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.2,
        ),
        iconTheme: const IconThemeData(color: AppColors.text, size: 20),
        actionsIconTheme: const IconThemeData(color: AppColors.textMuted, size: 20),
      ),
      cardTheme: CardThemeData(
        color: AppColors.card,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(layoutCardRadius),
          side: const BorderSide(color: AppColors.border),
        ),
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.border,
        thickness: 1,
        space: 1,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.card,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        constraints: const BoxConstraints(minHeight: 44),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: AppColors.borderFocus, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: AppColors.danger),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: const BorderSide(color: AppColors.danger, width: 1.5),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: BorderSide(color: AppColors.border.withOpacity(0.5)),
        ),
        labelStyle: textTheme.bodySmall?.copyWith(
          fontWeight: FontWeight.w500,
          color: AppColors.textMuted,
        ),
        floatingLabelStyle: textTheme.bodySmall?.copyWith(
          fontWeight: FontWeight.w600,
          color: AppColors.primary,
          fontSize: 11,
        ),
        hintStyle: textTheme.bodyMedium?.copyWith(
          color: AppColors.textPlaceholder,
          fontWeight: FontWeight.w400,
        ),
        errorStyle: textTheme.bodySmall?.copyWith(
          color: AppColors.danger,
          fontSize: 11,
        ),
        helperStyle: textTheme.bodySmall?.copyWith(
          color: AppColors.textMuted,
          fontSize: 11,
        ),
        prefixIconColor: AppColors.textMuted,
        suffixIconColor: AppColors.textMuted,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.onPrimary,
          elevation: 0,
          minimumSize: const Size(0, 40),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
          ),
          textStyle: textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w600,
            letterSpacing: 0.1,
          ),
        ).copyWith(
          overlayColor: MaterialStateProperty.resolveWith((states) {
            if (states.contains(MaterialState.pressed)) {
              return Colors.white.withOpacity(0.15);
            }
            if (states.contains(MaterialState.hovered)) {
              return Colors.white.withOpacity(0.08);
            }
            return null;
          }),
          backgroundColor: MaterialStateProperty.resolveWith((states) {
            if (states.contains(MaterialState.disabled)) {
              return AppColors.border;
            }
            return AppColors.primary;
          }),
          foregroundColor: MaterialStateProperty.resolveWith((states) {
            if (states.contains(MaterialState.disabled)) {
              return AppColors.textMuted;
            }
            return AppColors.onPrimary;
          }),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.onPrimary,
          elevation: 0,
          shadowColor: Colors.transparent,
          minimumSize: const Size(0, 40),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
          ),
          textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.text,
          side: const BorderSide(color: AppColors.border),
          minimumSize: const Size(0, 40),
          padding: const EdgeInsets.symmetric(horizontal: 18),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
          ),
          textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
          backgroundColor: AppColors.card,
        ).copyWith(
          side: MaterialStateProperty.resolveWith((states) {
            if (states.contains(MaterialState.focused) ||
                states.contains(MaterialState.hovered)) {
              return const BorderSide(color: AppColors.borderStrong);
            }
            return const BorderSide(color: AppColors.border);
          }),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          textStyle: textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w600,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusSm),
          ),
        ),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: MaterialStateProperty.resolveWith((states) {
          if (states.contains(MaterialState.selected)) return AppColors.primary;
          return AppColors.card;
        }),
        checkColor: MaterialStateProperty.all(AppColors.onPrimary),
        side: const BorderSide(color: AppColors.borderStrong, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        overlayColor: MaterialStateProperty.all(AppColors.primary.withOpacity(0.08)),
      ),
      radioTheme: RadioThemeData(
        fillColor: MaterialStateProperty.resolveWith((states) {
          if (states.contains(MaterialState.selected)) return AppColors.primary;
          return AppColors.borderStrong;
        }),
        overlayColor: MaterialStateProperty.all(AppColors.primary.withOpacity(0.08)),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: MaterialStateProperty.resolveWith((states) {
          if (states.contains(MaterialState.selected)) return AppColors.onPrimary;
          return AppColors.textMuted;
        }),
        trackColor: MaterialStateProperty.resolveWith((states) {
          if (states.contains(MaterialState.selected)) return AppColors.primary;
          return AppColors.surface2;
        }),
        trackOutlineColor: MaterialStateProperty.all(Colors.transparent),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surface,
        selectedColor: AppColors.primaryLight,
        disabledColor: AppColors.surface,
        labelStyle: textTheme.bodySmall!.copyWith(
          fontWeight: FontWeight.w500,
          color: AppColors.text3,
        ),
        side: const BorderSide(color: AppColors.border),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(pillRadius),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        elevation: 0,
        pressElevation: 0,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: AppColors.primary,
        unselectedLabelColor: AppColors.textMuted,
        labelStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
        unselectedLabelStyle: textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w500,
          color: AppColors.textMuted,
        ),
        indicatorColor: AppColors.primary,
        indicatorSize: TabBarIndicatorSize.label,
        dividerColor: AppColors.border,
        overlayColor: MaterialStateProperty.all(AppColors.primary.withOpacity(0.05)),
        indicator: const UnderlineTabIndicator(
          borderSide: BorderSide(color: AppColors.primary, width: 2),
          insets: EdgeInsets.symmetric(horizontal: 4),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.text,
        contentTextStyle: textTheme.bodyMedium?.copyWith(
          color: AppColors.card,
          fontWeight: FontWeight.w500,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMd),
        ),
        behavior: SnackBarBehavior.floating,
        elevation: 8,
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        actionTextColor: AppColors.primaryLight,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppColors.card,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shadowColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(modalRadius),
          side: const BorderSide(color: AppColors.border),
        ),
        titleTextStyle: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        contentTextStyle: textTheme.bodyMedium,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        showDragHandle: false,
        dragHandleColor: AppColors.borderStrong,
        dragHandleSize: Size(40, 4),
      ),
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: 2,
        ),
        minVerticalPadding: 6,
        titleTextStyle: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500),
        subtitleTextStyle: textTheme.bodySmall,
        iconColor: AppColors.textMuted,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusSm),
        ),
      ),
      dropdownMenuTheme: DropdownMenuThemeData(
        menuStyle: MenuStyle(
          elevation: MaterialStateProperty.all(8),
          backgroundColor: MaterialStateProperty.all(AppColors.card),
          surfaceTintColor: MaterialStateProperty.all(Colors.transparent),
          shape: MaterialStateProperty.all(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(radiusMd),
              side: const BorderSide(color: AppColors.border),
            ),
          ),
          maximumSize: MaterialStateProperty.all(
            const Size(double.infinity, 320),
          ),
          padding: MaterialStateProperty.all(
            const EdgeInsets.symmetric(vertical: 6),
          ),
        ),
      ),
      navigationDrawerTheme: const NavigationDrawerThemeData(
        backgroundColor: AppColors.sidebarBg,
        indicatorColor: AppColors.sidebarActiveBg,
        elevation: 0,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: AppColors.primary,
        linearTrackColor: AppColors.primaryLight,
        circularTrackColor: AppColors.primaryLight,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        elevation: 0,
        highlightElevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusLg),
        ),
        extendedPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        extendedTextStyle: textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w600,
          letterSpacing: 0.1,
        ),
      ),
      scrollbarTheme: ScrollbarThemeData(
        radius: const Radius.circular(4),
        thickness: MaterialStateProperty.all(3),
        thumbColor: MaterialStateProperty.all(AppColors.borderStrong),
        trackColor: MaterialStateProperty.all(Colors.transparent),
        crossAxisMargin: 2,
        mainAxisMargin: 4,
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: AppColors.text,
          borderRadius: BorderRadius.circular(radiusSm),
        ),
        textStyle: textTheme.bodySmall?.copyWith(
          color: AppColors.card,
          fontWeight: FontWeight.w500,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        waitDuration: const Duration(milliseconds: 600),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: AppColors.card,
        elevation: 8,
        shadowColor: const Color(0x1A000000),
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          side: const BorderSide(color: AppColors.border),
        ),
        textStyle: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500),
        position: PopupMenuPosition.under,
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: AppColors.textMuted,
          highlightColor: AppColors.primary.withOpacity(0.08),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusSm),
          ),
        ),
      ),
    );
  }
}
