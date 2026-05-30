import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_typography.dart';

/// Subtle record count + optional clear action (no borders).
class ListResultsBar extends StatelessWidget {
  const ListResultsBar({
    super.key,
    required this.count,
    this.countLabel,
    this.onClearFilters,
    this.clearLabel = 'Clear filters',
  });

  final int count;
  final String? countLabel;
  final VoidCallback? onClearFilters;
  final String clearLabel;

  @override
  Widget build(BuildContext context) {
    final label = countLabel ??
        '$count result${count == 1 ? '' : 's'}';

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.xxs,   // reduced from sm (12) to xxs (4)
        AppSpacing.md,
        AppSpacing.xxs,   // reduced from xs (8) to xxs (4)
      ),
      child: Row(
        children: [
          Text(
            label,
            style: AppTypography.secondary.copyWith(
              color: AppColors.textMuted,
              fontWeight: FontWeight.w500,
            ),
          ),
          if (onClearFilters != null) ...[
            Text(
              ' · ',
              style: AppTypography.secondary.copyWith(
                color: AppColors.textFaint,
              ),
            ),
            GestureDetector(
              onTap: onClearFilters,
              child: Text(
                clearLabel,
                style: AppTypography.secondary.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
