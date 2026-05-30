import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';
import 'app_filter_chips.dart';
import 'search_bar.dart';

/// Premium list header: soft search surface, filters, optional footer — minimal lines.
class ListPageHeader extends StatelessWidget {
  const ListPageHeader({
    super.key,
    required this.search,
    required this.onSearchChanged,
    this.searchHint = 'Search…',
    this.statusFilter,
    this.onStatusChanged,
    this.statusOptions = const [],
    this.header,
    this.footer,
    this.compactSearch = false,
    this.actions,
  });

  final String search;
  final ValueChanged<String> onSearchChanged;
  final String searchHint;
  final String? statusFilter;
  final ValueChanged<String?>? onStatusChanged;
  final List<String> statusOptions;
  final Widget? header;
  final Widget? footer;
  final bool compactSearch;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.bg,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.xs,   // reduced from sm (12) to xs (8)
        AppSpacing.md,
        AppSpacing.xs,   // reduced from sm (12) to xs (8)
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (header != null) ...[
            header!,
            const SizedBox(height: AppSpacing.xs),
          ],
          // Unified search + actions (single soft block, no dividers)
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppTheme.radiusMd),
            ),
            child: Row(
              children: [
                Expanded(
                  child: AppSearchBar(
                    value: search,
                    hint: searchHint,
                    onChanged: onSearchChanged,
                    compact: compactSearch,
                    filled: true,
                  ),
                ),
                if (actions != null && actions!.isNotEmpty) ...[
                  const SizedBox(width: 3),
                  ...actions!,
                ],
              ],
            ),
          ),
          if (statusOptions.isNotEmpty && onStatusChanged != null) ...[
            const SizedBox(height: AppSpacing.xs),
            AppFilterChipsBar(
              selected: statusFilter,
              options: statusOptions,
              onSelected: onStatusChanged!,
            ),
          ],
          if (footer != null) ...[
            const SizedBox(height: AppSpacing.xs),
            footer!,
          ],
        ],
      ),
    );
  }
}

/// Page title with optional count (borderless badge).
class ListPageTitle extends StatelessWidget {
  const ListPageTitle({
    super.key,
    required this.title,
    this.count,
    this.subtitle,
    this.action,
  });

  final String title;
  final int? count;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.md,
        AppSpacing.xs,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(title, style: AppTypography.pageTitle),
                    if (count != null) ...[
                      const SizedBox(width: AppSpacing.xs),
                      _CountBadge(count: count!),
                    ],
                  ],
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: AppTypography.secondary),
                ],
              ],
            ),
          ),
          if (action != null) action!,
        ],
      ),
    );
  }
}

class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.primary.withOpacity(0.1),
        borderRadius: BorderRadius.circular(AppTheme.pillRadius),
      ),
      child: Text(
        '$count',
        style: AppTypography.badgeSmall.copyWith(
          color: AppColors.primaryDark,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
