import 'package:flutter/material.dart';

import '../core/app_icons.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';
import '../core/utils/display_labels.dart';

/// Premium status badge — pill-shaped, semantic colors, clean typography.
class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.status,
    this.size = StatusBadgeSize.medium,
  });

  final String status;
  final StatusBadgeSize size;

  _BadgeColors _colors(String s) {
    final u = s.toUpperCase();
    if (u.contains('CONFIRM') ||
        u.contains('APPROVED') ||
        u.contains('DISPATCH')) {
      return const _BadgeColors(
        bg: AppColors.badgeConfirmedBg,
        fg: AppColors.badgeConfirmedText,
        border: AppColors.badgeConfirmedBorder,
        dot: AppColors.badgeConfirmedText,
      );
    }
    if (u.contains('PAID') ||
        u.contains('ACTIVE') ||
        u.contains('DELIVER') ||
        u.contains('IN STOCK') ||
        u.contains('HEALTHY') ||
        u.contains('COMPLETE')) {
      return const _BadgeColors(
        bg: AppColors.badgePaidBg,
        fg: AppColors.badgePaidText,
        border: AppColors.badgePaidBorder,
        dot: AppColors.success,
      );
    }
    if (u.contains('DRAFT') || u.contains('PENDING')) {
      return const _BadgeColors(
        bg: AppColors.badgeNormalBg,
        fg: AppColors.badgeNormalText,
        border: AppColors.badgeNormalBorder,
        dot: AppColors.textMuted,
      );
    }
    if (u.contains('CANCEL') ||
        u.contains('REJECT') ||
        u.contains('UNPAID') ||
        u.contains('BLOCK') ||
        u.contains('EXPIRED') ||
        u.contains('OUT OF STOCK') ||
        u.contains('NO STOCK')) {
      return _BadgeColors(
        bg: AppColors.badgeExpiredBg,
        fg: AppColors.badgeExpiredText,
        border: AppColors.badgeExpiredBorder,
        dot: AppColors.danger,
      );
    }
    if (u.contains('PARTIAL') ||
        u.contains('SOON') ||
        u.contains('NEAR') ||
        u.contains('LOW') ||
        u.contains('EXPIRING') ||
        u.contains('WARNING')) {
      return const _BadgeColors(
        bg: AppColors.alertAmberBg,
        fg: AppColors.alertAmberIcon,
        border: AppColors.alertAmberBorder,
        dot: AppColors.warning,
      );
    }
    return const _BadgeColors(
      bg: AppColors.badgeNormalBg,
      fg: AppColors.badgeNormalText,
      border: AppColors.badgeNormalBorder,
      dot: AppColors.textMuted,
    );
  }

  @override
  Widget build(BuildContext context) {
    final label = displayStatusLabel(status);
    if (label == '—') return const SizedBox.shrink();
    final c = _colors(label);

    final isSmall = size == StatusBadgeSize.small;
    final hPad = isSmall ? 7.0 : 10.0;
    final vPad = isSmall ? 2.0 : 3.5;
    final fontSize = isSmall ? 10.0 : 11.0;

    return Container(
      padding: EdgeInsets.symmetric(horizontal: hPad, vertical: vPad),
      decoration: BoxDecoration(
        color: c.bg,
        borderRadius: BorderRadius.circular(AppTheme.pillRadius),
        border: Border.all(color: c.border, width: 0.75),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: isSmall ? 5 : 6,
            height: isSmall ? 5 : 6,
            decoration: BoxDecoration(
              color: c.dot,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: AppTypography.badge.copyWith(
              color: c.fg,
              fontSize: fontSize,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

enum StatusBadgeSize { small, medium }

class _BadgeColors {
  const _BadgeColors({
    required this.bg,
    required this.fg,
    required this.border,
    required this.dot,
  });

  final Color bg;
  final Color fg;
  final Color border;
  final Color dot;
}

/// Compact count badge (for notification counts, pending items).
class CountBadge extends StatelessWidget {
  const CountBadge({
    super.key,
    required this.count,
    this.color,
    this.max = 99,
  });

  final int count;
  final Color? color;
  final int max;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    final label = count > max ? '$max+' : '$count';
    final bg = color ?? AppColors.danger;

    return Container(
      constraints: const BoxConstraints(minWidth: 18),
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppTheme.pillRadius),
        boxShadow: [
          BoxShadow(
            color: bg.withOpacity(0.35),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Text(
        label,
        textAlign: TextAlign.center,
        style: AppTypography.badgeSmall.copyWith(color: Colors.white),
      ),
    );
  }
}

/// Tag chip — for categories, labels, filters.
class AppTag extends StatelessWidget {
  const AppTag({
    super.key,
    required this.label,
    this.color,
    this.onRemove,
    this.icon,
  });

  final String label;
  final Color? color;
  final VoidCallback? onRemove;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final fg = color ?? AppColors.primary;
    final bg = color?.withOpacity(0.1) ?? AppColors.primaryLight;
    final border = color?.withOpacity(0.25) ?? AppColors.primarySubtle;

    return Container(
      padding: EdgeInsets.fromLTRB(
        icon != null ? 7 : 10,
        3,
        onRemove != null ? 4 : 10,
        3,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppTheme.pillRadius),
        border: Border.all(color: border, width: 0.75),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: AppTypography.badge.copyWith(
              color: fg,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (onRemove != null) ...[
            const SizedBox(width: 3),
            GestureDetector(
              onTap: onRemove,
              child: Icon(
                AppIcons.close,
                size: 13,
                color: fg.withOpacity(0.7),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

