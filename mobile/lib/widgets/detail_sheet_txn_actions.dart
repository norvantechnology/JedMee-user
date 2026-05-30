import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';

/// Transaction detail footer — primary action + optional secondary/ghost buttons.
/// Destructive (Cancel) is always ghost with red border — never filled red.
/// Primary (Confirm) is always filled primary.
class DetailSheetTxnActions extends StatelessWidget {
  const DetailSheetTxnActions({
    super.key,
    this.primaryLabel,
    this.onPrimary,
    this.secondaryLabel,
    this.onSecondary,
    this.destructiveLabel,
    this.onDestructive,
  });

  final String? primaryLabel;
  final VoidCallback? onPrimary;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;
  final String? destructiveLabel;
  final VoidCallback? onDestructive;

  @override
  Widget build(BuildContext context) {
    final buttons = <Widget>[];

    if (destructiveLabel != null && onDestructive != null) {
      buttons.add(
        Expanded(
          child: SizedBox(
            height: 44,
            child: OutlinedButton(
              onPressed: onDestructive,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.alertRedIcon,
                side: const BorderSide(color: AppColors.alertRedBorder, width: 0.75),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
                textStyle: AppTypography.labelSemibold,
              ),
              child: Text(destructiveLabel!),
            ),
          ),
        ),
      );
    }

    if (secondaryLabel != null && onSecondary != null) {
      if (buttons.isNotEmpty) buttons.add(const SizedBox(width: 10));
      buttons.add(
        Expanded(
          child: SizedBox(
            height: 44,
            child: OutlinedButton(
              onPressed: onSecondary,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.textMuted,
                side: BorderSide(
                  color: AppColors.colorMix(AppColors.text, 18, AppColors.border),
                  width: 0.5,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
                textStyle: AppTypography.labelSemibold,
              ),
              child: Text(secondaryLabel!),
            ),
          ),
        ),
      );
    }

    if (primaryLabel != null && onPrimary != null) {
      if (buttons.isNotEmpty) buttons.add(const SizedBox(width: 10));
      buttons.add(
        Expanded(
          flex: buttons.length > 1 ? 2 : 1,
          child: SizedBox(
            height: 44,
            child: FilledButton(
              onPressed: onPrimary,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
                textStyle: AppTypography.labelSemibold,
              ),
              child: Text(primaryLabel!),
            ),
          ),
        ),
      );
    }

    if (buttons.isEmpty) return const SizedBox.shrink();
    return Row(children: buttons);
  }
}
