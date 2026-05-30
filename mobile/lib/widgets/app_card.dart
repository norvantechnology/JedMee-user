import 'package:flutter/material.dart';

import '../core/app_icons.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_elevation.dart';
import '../core/theme/app_motion.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';

/// Premium surface card — border, soft shadow, consistent radius.
/// Supports hover states, accent borders, and tap interactions.
class AppCard extends StatefulWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.onTap,
    this.color,
    this.borderColor,
    this.accent,
    this.elevated = true,
    this.interactive = false,
    this.radius,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;
  final BorderSide? accent;
  final bool elevated;
  final bool interactive;
  final double? radius;

  @override
  State<AppCard> createState() => _AppCardState();
}

class _AppCardState extends State<AppCard> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final r = widget.radius ?? AppTheme.layoutCardRadius;
    final borderRadius = BorderRadius.circular(r);
    final isInteractive = widget.onTap != null || widget.interactive;

    final decoration = BoxDecoration(
      color: widget.color ?? AppColors.card,
      borderRadius: borderRadius,
      border: widget.accent != null
          ? Border(
              left: widget.accent!,
              top: BorderSide(color: widget.borderColor ?? AppColors.border),
              right: BorderSide(color: widget.borderColor ?? AppColors.border),
              bottom: BorderSide(color: widget.borderColor ?? AppColors.border),
            )
          : Border.all(
              color: _hovered && isInteractive
                  ? AppColors.borderStrong
                  : widget.borderColor ?? AppColors.border,
            ),
      boxShadow: widget.elevated
          ? (_hovered && isInteractive ? AppElevation.cardHover : AppElevation.card)
          : null,
    );

    Widget content = AnimatedContainer(
      duration: AppMotion.fast,
      curve: AppMotion.standard,
      margin: widget.margin,
      decoration: decoration,
      child: Padding(
        padding: widget.padding ?? const EdgeInsets.all(AppSpacing.cardPadding),
        child: widget.child,
      ),
    );

    if (widget.onTap != null) {
      content = MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        cursor: SystemMouseCursors.click,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: borderRadius,
            splashColor: AppColors.primary.withOpacity(0.06),
            highlightColor: AppColors.primary.withOpacity(0.03),
            child: content,
          ),
        ),
      );
    } else if (widget.interactive) {
      content = MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: content,
      );
    }

    return content;
  }
}

/// Section title + optional subtitle + trailing action.
class AppSectionHeader extends StatelessWidget {
  const AppSectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.padding,
    this.icon,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final EdgeInsetsGeometry? padding;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ?? const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        children: [
          if (icon != null) ...[
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: AppColors.primaryLight,
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              ),
              child: Icon(icon, size: 14, color: AppColors.primary),
            ),
            const SizedBox(width: AppSpacing.xs),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppTypography.sectionTitle),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: AppTypography.secondary),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// Compact action chip for dashboards and toolbars.
class AppQuickAction extends StatefulWidget {
  const AppQuickAction({
    super.key,
    required this.label,
    required this.icon,
    required this.onPressed,
    this.color,
  });

  final String label;
  final IconData icon;
  final VoidCallback onPressed;
  final Color? color;

  @override
  State<AppQuickAction> createState() => _AppQuickActionState();
}

class _AppQuickActionState extends State<AppQuickAction> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final color = widget.color ?? AppColors.primary;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      cursor: SystemMouseCursors.click,
      child: AnimatedContainer(
        duration: AppMotion.fast,
        curve: AppMotion.standard,
        decoration: BoxDecoration(
          color: _hovered ? AppColors.surface : AppColors.card,
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          border: Border.all(
            color: _hovered ? AppColors.borderStrong : AppColors.border,
          ),
          boxShadow: _hovered ? AppElevation.cardHover : AppElevation.card,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: widget.onPressed,
            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
            splashColor: color.withOpacity(0.08),
            highlightColor: color.withOpacity(0.04),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                    ),
                    child: Icon(widget.icon, size: 14, color: color),
                  ),
                  const SizedBox(width: 7),
                  Text(widget.label, style: AppTypography.labelSemibold),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Groups list rows inside one elevated card (clean separation).
class AppGroupedList extends StatelessWidget {
  const AppGroupedList({
    super.key,
    required this.children,
    this.padding,
    this.dividerIndent = 56,
  });

  final List<Widget> children;
  final EdgeInsetsGeometry? padding;
  final double dividerIndent;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();

    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0)
              Divider(
                height: 1,
                thickness: 1,
                indent: dividerIndent,
                endIndent: 0,
                color: AppColors.border,
              ),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// Horizontal info row for detail sheets (label + value).
class AppDetailRow extends StatelessWidget {
  const AppDetailRow({
    super.key,
    required this.label,
    required this.value,
    this.valueWidget,
    this.onTap,
    this.labelWidth = 120,
  });

  final String label;
  final String value;
  final Widget? valueWidget;
  final VoidCallback? onTap;
  final double labelWidth;

  @override
  Widget build(BuildContext context) {
    Widget row = Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: 6,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: labelWidth,
            child: Text(label, style: AppTypography.detailLabel),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: valueWidget ??
                Text(
                  value,
                  style: AppTypography.detailValue,
                  textAlign: TextAlign.end,
                ),
          ),
        ],
      ),
    );

    if (onTap != null) {
      row = InkWell(
        onTap: onTap,
        child: row,
      );
    }

    return row;
  }
}

/// Premium info card with colored left accent.
class AppAccentCard extends StatelessWidget {
  const AppAccentCard({
    super.key,
    required this.child,
    required this.accentColor,
    this.padding,
    this.onTap,
  });

  final Widget child;
  final Color accentColor;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: padding,
      onTap: onTap,
      accent: BorderSide(color: accentColor, width: 3),
      child: child,
    );
  }
}

/// Stat / metric display widget for dashboards.
class AppStatTile extends StatelessWidget {
  const AppStatTile({
    super.key,
    required this.label,
    required this.value,
    this.subtitle,
    this.icon,
    this.iconColor,
    this.trend,
    this.trendUp,
  });

  final String label;
  final String value;
  final String? subtitle;
  final IconData? icon;
  final Color? iconColor;
  final String? trend;
  final bool? trendUp;

  @override
  Widget build(BuildContext context) {
    final color = iconColor ?? AppColors.primary;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (icon != null) ...[
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Icon(icon, size: 16, color: color),
              ),
              const SizedBox(width: AppSpacing.xs),
            ],
            Expanded(
              child: Text(label, style: AppTypography.overline),
            ),
            if (trend != null) _TrendChip(trend: trend!, up: trendUp ?? true),
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          value,
          style: AppTypography.kpiAmount,
          overflow: TextOverflow.ellipsis,
          maxLines: 1,
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 2),
          Text(subtitle!, style: AppTypography.secondary),
        ],
      ],
    );
  }
}

class _TrendChip extends StatelessWidget {
  const _TrendChip({required this.trend, required this.up});

  final String trend;
  final bool up;

  @override
  Widget build(BuildContext context) {
    final color = up ? AppColors.success : AppColors.danger;
    final icon = up ? AppIcons.trendUp : AppIcons.trendDown;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppTheme.pillRadius),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 2),
          Text(
            trend,
            style: AppTypography.badgeSmall.copyWith(color: color),
          ),
        ],
      ),
    );
  }
}
