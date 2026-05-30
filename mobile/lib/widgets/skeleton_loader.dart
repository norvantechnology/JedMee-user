import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_motion.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_theme.dart';

/// Animated shimmer skeleton loader — replaces simple spinners.
/// Use for list items, cards, and content placeholders.
class SkeletonLoader extends StatefulWidget {
  const SkeletonLoader({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  State<SkeletonLoader> createState() => _SkeletonLoaderState();
}

class _SkeletonLoaderState extends State<SkeletonLoader>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _shimmer;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat();
    // Wider travel range for a smoother diagonal sweep
    _shimmer = Tween<double>(begin: -2.0, end: 3.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOutSine),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _shimmer,
      builder: (context, child) {
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) {
            // Diagonal shimmer (45°) — more premium than horizontal
            return LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: const [
                Color(0xFFE8EDF5),  // base
                Color(0xFFEDF1F8),  // base
                Color(0xFFF8FAFF),  // bright highlight
                Color(0xFFFFFFFF),  // peak
                Color(0xFFF8FAFF),  // bright highlight
                Color(0xFFEDF1F8),  // base
                Color(0xFFE8EDF5),  // base
              ],
              stops: [
                (_shimmer.value - 0.8).clamp(0.0, 1.0),
                (_shimmer.value - 0.4).clamp(0.0, 1.0),
                (_shimmer.value - 0.15).clamp(0.0, 1.0),
                (_shimmer.value).clamp(0.0, 1.0),
                (_shimmer.value + 0.15).clamp(0.0, 1.0),
                (_shimmer.value + 0.4).clamp(0.0, 1.0),
                (_shimmer.value + 0.8).clamp(0.0, 1.0),
              ],
            ).createShader(bounds);
          },
          child: child,
        );
      },
      child: widget.child,
    );
  }
}

/// A single skeleton block (rectangle placeholder).
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    this.width,
    this.height = 16,
    this.radius,
    this.color,
  });

  final double? width;
  final double height;
  final double? radius;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: color ?? AppColors.surface2,
        borderRadius: BorderRadius.circular(radius ?? AppTheme.radiusSm),
      ),
    );
  }
}

/// Skeleton circle (for avatars, icons).
class SkeletonCircle extends StatelessWidget {
  const SkeletonCircle({super.key, this.size = 40, this.color});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color ?? AppColors.surface2,
        shape: BoxShape.circle,
      ),
    );
  }
}

/// Skeleton for a list tile row (icon + two lines of text).
class SkeletonListTile extends StatelessWidget {
  const SkeletonListTile({
    super.key,
    this.showLeading = true,
    this.showTrailing = false,
    this.titleWidth,
    this.subtitleWidth,
  });

  final bool showLeading;
  final bool showTrailing;
  final double? titleWidth;
  final double? subtitleWidth;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      child: Row(
        children: [
          if (showLeading) ...[
            const SkeletonBox(
              width: 40,
              height: 40,
              radius: AppTheme.radiusSm,
            ),
            const SizedBox(width: AppSpacing.sm),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBox(
                  width: titleWidth,
                  height: 14,
                  radius: AppTheme.radiusXs,
                ),
                const SizedBox(height: 6),
                SkeletonBox(
                  width: subtitleWidth ?? 120,
                  height: 11,
                  radius: AppTheme.radiusXs,
                ),
              ],
            ),
          ),
          if (showTrailing) ...[
            const SizedBox(width: AppSpacing.sm),
            const SkeletonBox(
              width: 60,
              height: 14,
              radius: AppTheme.radiusXs,
            ),
          ],
        ],
      ),
    );
  }
}

/// Skeleton for a KPI / stat card.
class SkeletonKpiCard extends StatelessWidget {
  const SkeletonKpiCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(AppTheme.layoutCardRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SkeletonBox(width: 60, height: 10, radius: 4),
          SizedBox(height: 10),
          SkeletonBox(height: 22, radius: 6),
          SizedBox(height: 6),
          SkeletonBox(width: 80, height: 10, radius: 4),
        ],
      ),
    );
  }
}

/// Skeleton for a card with header + content lines.
class SkeletonCard extends StatelessWidget {
  const SkeletonCard({
    super.key,
    this.lines = 3,
    this.showHeader = true,
  });

  final int lines;
  final bool showHeader;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(AppTheme.layoutCardRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showHeader) ...[
            const Row(
              children: [
                SkeletonBox(
                  width: 32,
                  height: 32,
                  radius: AppTheme.radiusSm,
                ),
                SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SkeletonBox(height: 14, radius: 4),
                      SizedBox(height: 5),
                      SkeletonBox(width: 100, height: 10, radius: 4),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            const Divider(height: 1),
            const SizedBox(height: AppSpacing.md),
          ],
          for (var i = 0; i < lines; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            SkeletonBox(
              width: i == lines - 1 ? 140 : null,
              height: 12,
              radius: 4,
            ),
          ],
        ],
      ),
    );
  }
}

/// Full-page skeleton for list screens.
class SkeletonListPage extends StatelessWidget {
  const SkeletonListPage({
    super.key,
    this.itemCount = 6,
    this.showHeader = true,
  });

  final int itemCount;
  final bool showHeader;

  @override
  Widget build(BuildContext context) {
    return SkeletonLoader(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (showHeader) ...[
            const Padding(
              padding: EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.sm,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: SkeletonBox(height: 36, radius: AppTheme.radiusMd),
                  ),
                  SizedBox(width: AppSpacing.sm),
                  SkeletonBox(
                    width: 80,
                    height: 36,
                    radius: AppTheme.radiusMd,
                  ),
                ],
              ),
            ),
          ],
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.all(AppSpacing.md),
              itemCount: itemCount,
              separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.xs),
              itemBuilder: (_, i) => Container(
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(AppTheme.layoutCardRadius),
                  border: Border.all(color: AppColors.border),
                ),
                child: SkeletonListTile(
                  showTrailing: i % 2 == 0,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Skeleton for dashboard KPI grid.
class SkeletonDashboard extends StatelessWidget {
  const SkeletonDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    return const SkeletonLoader(
      child: Padding(
        padding: EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Date range bar
            SkeletonBox(height: 44, radius: AppTheme.radiusMd),
            SizedBox(height: AppSpacing.md),
            // KPI grid
            Row(
              children: [
                Expanded(child: SkeletonKpiCard()),
                SizedBox(width: AppSpacing.xs),
                Expanded(child: SkeletonKpiCard()),
              ],
            ),
            SizedBox(height: AppSpacing.xs),
            Row(
              children: [
                Expanded(child: SkeletonKpiCard()),
                SizedBox(width: AppSpacing.xs),
                Expanded(child: SkeletonKpiCard()),
              ],
            ),
            SizedBox(height: AppSpacing.lg),
            // Chart
            SkeletonCard(lines: 1, showHeader: false),
            SizedBox(height: AppSpacing.md),
            // Recent list
            SkeletonCard(lines: 4),
          ],
        ),
      ),
    );
  }
}

/// Inline skeleton for a single text line.
class SkeletonText extends StatelessWidget {
  const SkeletonText({
    super.key,
    this.width,
    this.style,
  });

  final double? width;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final fontSize = style?.fontSize ?? 14;
    return SkeletonBox(
      width: width,
      height: fontSize * 1.2,
      radius: 4,
    );
  }
}

/// Wraps content with a fade-in once [loaded] is true.
class SkeletonFadeIn extends StatefulWidget {
  const SkeletonFadeIn({
    super.key,
    required this.loaded,
    required this.skeleton,
    required this.child,
  });

  final bool loaded;
  final Widget skeleton;
  final Widget child;

  @override
  State<SkeletonFadeIn> createState() => _SkeletonFadeInState();
}

class _SkeletonFadeInState extends State<SkeletonFadeIn>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: AppMotion.normal,
    );
    _opacity = CurvedAnimation(parent: _controller, curve: AppMotion.enter);
    if (widget.loaded) _controller.value = 1.0;
  }

  @override
  void didUpdateWidget(SkeletonFadeIn oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.loaded && !oldWidget.loaded) {
      _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.loaded) return widget.skeleton;
    return FadeTransition(opacity: _opacity, child: widget.child);
  }
}