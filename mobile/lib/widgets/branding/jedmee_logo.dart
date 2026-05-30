import 'package:flutter/material.dart';

import '../../core/app_icons.dart';
import '../../core/constants/brand.dart';
import '../../core/theme/app_colors.dart';

/// JedMee logo from web assets (`/logo.png`).
class JedMeeLogo extends StatelessWidget {
  const JedMeeLogo({
    super.key,
    this.height = 48,
    this.inverted = false,
    this.showTagline = false,
    this.taglineColor,
  });

  final double height;
  /// White logo on dark backgrounds (matches web `.auLeft .au-logo-img`).
  final bool inverted;
  final bool showTagline;
  final Color? taglineColor;

  @override
  Widget build(BuildContext context) {
    // Use WebP (13 KB) — logo.png (206 KB) is no longer bundled in the APK.
    // If webp fails to decode, fall back to the text/icon mark widget.
    Widget image = Image.asset(
      Brand.logoWebpAsset,
      height: height,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.medium,
      cacheHeight: (height * 3).toInt(), // 3× for high-DPI screens
      errorBuilder: (_, __, ___) => _fallbackMark(),
    );

    if (inverted) {
      image = ColorFiltered(
        colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
        child: image,
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        image,
        if (showTagline) ...[
          const SizedBox(height: 6),
          Text(
            Brand.tagline,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              letterSpacing: 0.04,
              color: taglineColor ?? AppColors.textFaint,
            ),
          ),
        ],
      ],
    );
  }

  Widget _fallbackMark() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: height,
          height: height,
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(AppIcons.product, color: AppColors.onPrimary, size: height * 0.55),
        ),
        const SizedBox(width: 10),
        Text(
          Brand.appName,
          style: TextStyle(
            fontSize: height * 0.42,
            fontWeight: FontWeight.w700,
            color: inverted ? Colors.white : AppColors.text,
          ),
        ),
      ],
    );
  }
}

/// Compact mark for drawer / app bar (favicon-style).
class JedMeeMark extends StatelessWidget {
  const JedMeeMark({super.key, this.size = 36});

  final double size;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Image.asset(
        Brand.faviconAsset,
        width: size,
        height: size,
        fit: BoxFit.cover,
        // Limit decode size to 3× display size for high-DPI screens.
        cacheWidth: (size * 3).toInt(),
        cacheHeight: (size * 3).toInt(),
        errorBuilder: (_, __, ___) => Container(
          width: size,
          height: size,
          color: AppColors.primary,
          child: Icon(AppIcons.product, color: AppColors.onPrimary, size: size * 0.55),
        ),
      ),
    );
  }
}
