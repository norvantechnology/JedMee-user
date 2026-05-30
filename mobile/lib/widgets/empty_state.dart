import 'package:flutter/material.dart';

import '../core/app_icons.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_motion.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';
import 'branding/jedmee_logo.dart';

/// Premium empty state — clean, minimal, enterprise-grade.
class EmptyState extends StatefulWidget {
  const EmptyState({
    super.key,
    required this.title,
    this.message,
    this.icon = AppIcons.document,
    this.useBrandMark = false,
    this.actionLabel,
    this.onAction,
    this.secondaryActionLabel,
    this.onSecondaryAction,
    this.filledAction = true,
    this.compact = false,
  });

  final String title;
  final String? message;
  final IconData icon;
  final bool useBrandMark;
  final String? actionLabel;
  final VoidCallback? onAction;
  final String? secondaryActionLabel;
  final VoidCallback? onSecondaryAction;
  final bool filledAction;
  final bool compact;

  @override
  State<EmptyState> createState() => _EmptyStateState();
}

class _EmptyStateState extends State<EmptyState>
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
      begin: const Offset(0, 0.06),
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
    final compact = widget.compact;

    return FadeTransition(
      opacity: _opacity,
      child: SlideTransition(
        position: _slide,
        child: Center(
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: compact ? AppSpacing.md : AppSpacing.xl,
              vertical: compact ? AppSpacing.md : AppSpacing.xxl,
            ),
            child: Container(
              width: double.infinity,
              constraints: const BoxConstraints(maxWidth: 400),
              padding: EdgeInsets.symmetric(
                horizontal: compact ? AppSpacing.md : 28,
                vertical: compact ? AppSpacing.md : 32,
              ),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(AppTheme.layoutCardRadius),
                border: Border.all(color: AppColors.border),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x080F172A),
                    blurRadius: 16,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _EmptyStateIcon(
                    icon: widget.icon,
                    useBrandMark: widget.useBrandMark,
                    compact: compact,
                  ),
                  SizedBox(height: compact ? AppSpacing.sm : AppSpacing.md),
                  Text(
                    widget.title,
                    textAlign: TextAlign.center,
                    style: compact
                        ? AppTypography.labelSemibold
                        : AppTypography.sectionTitle,
                  ),
                  if (widget.message != null) ...[
                    SizedBox(height: compact ? 4 : AppSpacing.xs),
                    Text(
                      widget.message!,
                      textAlign: TextAlign.center,
                      style: AppTypography.secondary.copyWith(
                        height: 1.5,
                      ),
                    ),
                  ],
                  if (widget.actionLabel != null && widget.onAction != null) ...[
                    SizedBox(height: compact ? AppSpacing.sm : AppSpacing.lg),
                    _EmptyStateActions(
                      actionLabel: widget.actionLabel!,
                      onAction: widget.onAction!,
                      secondaryActionLabel: widget.secondaryActionLabel,
                      onSecondaryAction: widget.onSecondaryAction,
                      filledAction: widget.filledAction,
                      compact: compact,
                    ),
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

class _EmptyStateIcon extends StatelessWidget {
  const _EmptyStateIcon({
    required this.icon,
    required this.useBrandMark,
    required this.compact,
  });

  final IconData icon;
  final bool useBrandMark;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final size = compact ? 48.0 : 72.0;
    final iconSize = compact ? 22.0 : 32.0;
    final radius = compact ? AppTheme.radiusMd : 20.0;

    if (useBrandMark) {
      return Container(
        width: size,
        height: size,
        padding: EdgeInsets.all(compact ? 10 : 14),
        decoration: BoxDecoration(
          color: AppColors.primaryLight,
          borderRadius: BorderRadius.circular(radius),
          border: Border.all(color: AppColors.primarySubtle),
        ),
        child: JedMeeMark(size: compact ? 28 : 44),
      );
    }

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.primaryLight,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: AppColors.primarySubtle),
      ),
      child: Icon(icon, size: iconSize, color: AppColors.primary),
    );
  }
}

class _EmptyStateActions extends StatelessWidget {
  const _EmptyStateActions({
    required this.actionLabel,
    required this.onAction,
    this.secondaryActionLabel,
    this.onSecondaryAction,
    required this.filledAction,
    required this.compact,
  });

  final String actionLabel;
  final VoidCallback onAction;
  final String? secondaryActionLabel;
  final VoidCallback? onSecondaryAction;
  final bool filledAction;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final primary = filledAction
        ? FilledButton(onPressed: onAction, child: Text(actionLabel))
        : OutlinedButton(onPressed: onAction, child: Text(actionLabel));

    if (secondaryActionLabel == null || onSecondaryAction == null) {
      return SizedBox(
        width: compact ? null : double.infinity,
        child: primary,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        primary,
        const SizedBox(height: 8),
        TextButton(
          onPressed: onSecondaryAction,
          child: Text(secondaryActionLabel!),
        ),
      ],
    );
  }
}

/// Compact inline empty state for list sections.
class InlineEmptyState extends StatelessWidget {
  const InlineEmptyState({
    super.key,
    required this.title,
    this.message,
    this.icon = AppIcons.document,
    this.padding,
  });

  final String title;
  final String? message;
  final IconData icon;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ??
          const EdgeInsets.symmetric(
            horizontal: AppSpacing.xl,
            vertical: AppSpacing.xxl,
          ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppTheme.radiusMd),
              border: Border.all(color: AppColors.border),
            ),
            child: Icon(icon, size: 22, color: AppColors.textMuted),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppTypography.labelSemibold.copyWith(
              color: AppColors.textMuted,
            ),
          ),
          if (message != null) ...[
            const SizedBox(height: 4),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: AppTypography.secondary,
            ),
          ],
        ],
      ),
    );
  }
}

/// Error state for failed data loads.
class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    this.message = 'Something went wrong',
    this.onRetry,
  });

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.xl),
          decoration: BoxDecoration(
            color: AppColors.dangerLight,
            borderRadius: BorderRadius.circular(AppTheme.layoutCardRadius),
            border: Border.all(color: AppColors.alertRedBorder),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  border: Border.all(color: AppColors.alertRedBorder),
                ),
                child: const Icon(
                  AppIcons.error,
                  size: 26,
                  color: AppColors.danger,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Unable to load',
                style: AppTypography.labelSemibold.copyWith(
                  color: AppColors.dangerDark,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                message,
                textAlign: TextAlign.center,
                style: AppTypography.secondary.copyWith(
                  color: AppColors.alertRedIcon,
                ),
              ),
              if (onRetry != null) ...[
                const SizedBox(height: AppSpacing.md),
                OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(AppIcons.refresh, size: 16),
                  label: const Text('Try again'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.danger,
                    side: const BorderSide(color: AppColors.alertRedBorder),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
