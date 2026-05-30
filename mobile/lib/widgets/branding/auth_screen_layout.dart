import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/app_icons.dart';
import '../../core/constants/brand.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_motion.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import 'auth_brand_panel.dart';
import 'jedmee_logo.dart';

/// Premium split auth layout — brand panel + form.
/// Mobile: compact gradient header + scrollable form card.
/// Wide: side-by-side brand panel + form.
class AuthScreenLayout extends StatelessWidget {
  const AuthScreenLayout({
    super.key,
    required this.title,
    this.subtitle,
    required this.child,
    this.footer,
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final Widget? footer;

  static const double _wideBreakpoint = 820;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= _wideBreakpoint;

    if (wide) {
      return Scaffold(
        body: Row(
          children: [
            const Expanded(child: AuthBrandPanel()),
            Expanded(
              child: ColoredBox(
                color: AppColors.bg,
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 40,
                      vertical: 48,
                    ),
                    child: AuthFormCard(
                      title: title,
                      subtitle: subtitle,
                      footer: footer,
                      child: child,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    final screenWidth = MediaQuery.sizeOf(context).width;
    final hPad = screenWidth < 360 ? 12.0 : 16.0;

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _MobileAuthHeader(),
          Expanded(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(hPad, 0, hPad, 20),
              child: Transform.translate(
                offset: const Offset(0, -20),
                child: AuthFormCard(
                  title: title,
                  subtitle: subtitle,
                  showLogo: false,
                  footer: footer,
                  child: child,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Premium form card for auth screens.
class AuthFormCard extends StatefulWidget {
  const AuthFormCard({
    super.key,
    required this.title,
    this.subtitle,
    required this.child,
    this.showLogo = true,
    this.footer,
    this.maxWidth = 440,
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final bool showLogo;
  final Widget? footer;
  final double maxWidth;

  @override
  State<AuthFormCard> createState() => _AuthFormCardState();
}

class _AuthFormCardState extends State<AuthFormCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _opacity;
  late Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: AppMotion.slow,
    );
    _opacity = CurvedAnimation(parent: _controller, curve: AppMotion.enter);
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.04),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _controller, curve: AppMotion.enter));
    _controller.forward();
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
      child: SlideTransition(
        position: _slide,
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: widget.maxWidth),
            child: Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(AppTheme.modalRadius),
                border: Border.all(color: AppColors.border),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x0C0F172A),
                    blurRadius: 40,
                    offset: Offset(0, 16),
                  ),
                  BoxShadow(
                    color: Color(0x060F172A),
                    blurRadius: 8,
                    offset: Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (widget.showLogo) ...[
                    const JedMeeLogo(height: 40, showTagline: true),
                    const SizedBox(height: AppSpacing.xl),
                    const Divider(height: 1, color: AppColors.border),
                    const SizedBox(height: AppSpacing.xl),
                  ],
                  Text(
                    widget.title,
                    style: AppTypography.heading.copyWith(fontSize: 19),
                  ),
                  if (widget.subtitle != null) ...[
                    const SizedBox(height: 3),
                    Text(
                      widget.subtitle!,
                      style: AppTypography.secondary.copyWith(
                        color: AppColors.textMuted,
                        height: 1.4,
                        fontSize: 12,
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  widget.child,
                  if (widget.footer != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    widget.footer!,
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Mobile auth header — compact gradient header with brand logo.
/// Uses JedMeeLogo for professional branding (no generic icons).
class _MobileAuthHeader extends StatelessWidget {
  const _MobileAuthHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF2D1560),
            Color(0xFF4E2A8A),
            Color(0xFF6B3FA0),
            Color(0xFF8B5CC8),
          ],
        ),
        borderRadius: const BorderRadius.vertical(
          bottom: Radius.circular(24),
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF6B3FA0).withOpacity(0.28),
            blurRadius: 14,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const SizedBox(height: 8),
            Center(
              child: const JedMeeLogo(
                height: 30,
                inverted: true,
                showTagline: false,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              Brand.tagline,
              style: TextStyle(
                fontSize: 11,
                color: Colors.white.withOpacity(0.60),
                fontWeight: FontWeight.w400,
                letterSpacing: 0.3,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

/// Dev-only API base hint (hidden in release builds).
class AuthDevApiHint extends StatelessWidget {
  const AuthDevApiHint({super.key, required this.apiBase});

  final String apiBase;

  @override
  Widget build(BuildContext context) {
    if (!kDebugMode) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const Icon(
            AppIcons.devMode,
            size: 13,
            color: AppColors.textMuted,
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              'API: $apiBase',
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textMuted,
                fontFamily: 'monospace',
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

/// Divider with centered label (for "or continue with" separators).
class AuthDividerLabel extends StatelessWidget {
  const AuthDividerLabel({super.key, this.label = 'or'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider(color: AppColors.border)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
          child: Text(
            label,
            style: AppTypography.secondary.copyWith(
              color: AppColors.textMuted,
            ),
          ),
        ),
        const Expanded(child: Divider(color: AppColors.border)),
      ],
    );
  }
}
