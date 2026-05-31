import 'package:flutter/material.dart';

import '../core/app_icons.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_theme.dart';
import '../core/utils/list_row_ui.dart';
import '../core/utils/product_expiry.dart';
import '../core/utils/record_fields.dart';
import 'expiry_badge.dart';
import 'list_card_surface.dart';
import 'status_badge.dart';

/// Compact premium list row — shared across masters, transactions, and reports.
class DataListTile extends StatelessWidget {
  const DataListTile({
    super.key,
    this.title,
    this.subtitle,
    this.secondarySubtitle,
    this.boldSubtitle,
    this.boldSubtitleColor,
    this.secondarySubtitleColor,
    this.trailing,
    this.status,
    this.secondaryStatus,
    this.onTap,
    this.onLongPress,
    this.leading,
    this.row,
    this.compact = true,
    this.showLeadingIcon,
    this.isSelected,
    this.onSelect,
  });

  final String? title;
  final String? subtitle;
  final String? secondarySubtitle;
  final String? boldSubtitle;
  /// Override color for [boldSubtitle]. Defaults to [AppColors.text].
  final Color? boldSubtitleColor;
  /// Override color for the secondary subtitle dot + text. Defaults to [AppColors.warning].
  final Color? secondarySubtitleColor;
  final Widget? trailing;
  final String? status;
  final String? secondaryStatus;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final Widget? leading;
  final Map<String, dynamic>? row;
  final bool compact;
  final bool? showLeadingIcon;

  /// When non-null the tile is in selection mode.
  /// [true] = checked, [false] = unchecked.
  final bool? isSelected;

  /// Called when the checkbox / tile is tapped in selection mode.
  final VoidCallback? onSelect;

  static IconData _iconForEntity(RecordEntity entity) {
    return switch (entity) {
      RecordEntity.customer => AppIcons.customer,
      RecordEntity.vendor => AppIcons.supplier,
      RecordEntity.division => AppIcons.divisions,
      RecordEntity.mfgCompany => AppIcons.manufacturers,
      RecordEntity.product => AppIcons.product,
      RecordEntity.productBatch => AppIcons.product,
      RecordEntity.payment => AppIcons.payment,
      RecordEntity.user => AppIcons.idCard,
      RecordEntity.salesInvoice => AppIcons.invoice,
      RecordEntity.purchaseInvoice => AppIcons.purchases,
      RecordEntity.order => AppIcons.orders,
      _ => AppIcons.document,
    };
  }

  static Color _colorForEntity(RecordEntity entity) {
    return switch (entity) {
      RecordEntity.customer => AppColors.kpiReceivablesAccent,
      RecordEntity.vendor => AppColors.primaryMid,
      RecordEntity.division => AppColors.warning,
      RecordEntity.mfgCompany => AppColors.successMid,
      RecordEntity.product => AppColors.primary,
      RecordEntity.productBatch => AppColors.primary,
      RecordEntity.payment => AppColors.kpiPayablesAccent,
      RecordEntity.salesInvoice => AppColors.primary,
      RecordEntity.purchaseInvoice => AppColors.primaryMid,
      RecordEntity.order => AppColors.primary,
      _ => AppColors.primary,
    };
  }

  @override
  Widget build(BuildContext context) {
    final entity = row != null ? detectRecordEntity(row!) : RecordEntity.generic;
    final vm = row != null ? presentListRow(row!, status: status) : null;

    final displayTitle = title ?? vm?.title ?? '—';
    final displaySubtitle = subtitle ?? vm?.subtitle ?? '';
    final displayMeta = vm?.meta;
    final amountText = trailing == null ? vm?.amount : null;
    final displayStatus = status ?? vm?.status;
    final displaySecondaryStatus = secondaryStatus ?? vm?.secondaryStatus;
    final useIcon = showLeadingIcon ?? vm?.showLeadingIcon ?? true;
    final extraLine = (secondarySubtitle ?? vm?.secondarySubtitle)?.trim();
    final hasExtra = extraLine != null && extraLine.isNotEmpty;
    final boldLine = (boldSubtitle ?? vm?.boldSubtitle)?.trim();
    final hasBoldLine = boldLine != null && boldLine.isNotEmpty;

    final urgency = entity == RecordEntity.productBatch && row != null
        ? productExpiryUrgency(row!)
        : null;

    final isOrder = entity == RecordEntity.order;
    final inSelectionMode = isSelected != null;

    // In selection mode the leading widget becomes a checkbox.
    Widget? lead = leading;
    if (inSelectionMode) {
      lead = AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: isSelected! ? AppColors.primary : Colors.transparent,
          border: Border.all(
            color: isSelected! ? AppColors.primary : AppColors.border,
            width: 1.8,
          ),
          borderRadius: BorderRadius.circular(6),
        ),
        child: isSelected!
            ? const Icon(Icons.check, size: 16, color: Colors.white)
            : null,
      );
    } else if (lead == null && useIcon) {
      final entityColor = _colorForEntity(entity);
      final iconBoxSize = isOrder ? 38.0 : 30.0;
      final iconSize = isOrder ? 20.0 : 15.0;
      lead = Container(
        width: iconBoxSize,
        height: iconBoxSize,
        decoration: BoxDecoration(
          color: entityColor.withOpacity(0.09),
          borderRadius: BorderRadius.circular(isOrder ? 10 : AppTheme.radiusSm),
        ),
        child: Icon(
          _iconForEntity(entity),
          color: entityColor,
          size: iconSize,
        ),
      );
    }

    if (isOrder) {
      final productLine = (extraLine != null && extraLine.isNotEmpty) ? extraLine : null;
      return ListCardSurface(
        onTap: inSelectionMode ? onSelect : onTap,
        onLongPress: inSelectionMode ? null : onLongPress,
        compact: compact,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        minHeight: 64,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (lead != null) ...[
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: lead,
              ),
              const SizedBox(width: 10),
            ],
            // ── Left: order number + party · items + product names ─────────
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Order number
                  Text(
                    displayTitle,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.text,
                      height: 1.3,
                    ),
                  ),
                  // Party name · item count
                  if (displaySubtitle.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      displaySubtitle,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                        color: AppColors.textMuted,
                        height: 1.3,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  // Product names preview (if available from API)
                  if (productLine != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      productLine,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w400,
                        color: AppColors.textFaint,
                        height: 1.3,
                        fontStyle: FontStyle.italic,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            // ── Right: date / amount / status ──────────────────────────────
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Date meta — small, muted
                if (displayMeta != null && displayMeta.isNotEmpty)
                  Text(
                    displayMeta,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w400,
                      color: AppColors.textFaint,
                      height: 1.3,
                    ),
                  ),
                // Amount — bold
                if (amountText != null) ...[
                  if (displayMeta != null && displayMeta.isNotEmpty)
                    const SizedBox(height: 2),
                  Text(
                    amountText,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.text,
                      height: 1.3,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
                // Status badge
                if (displayStatus != null && displayStatus.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  StatusBadge(
                    status: displayStatus,
                    size: StatusBadgeSize.small,
                  ),
                ],
              ],
            ),
          ],
        ),
      );
    }

    final hasRightSide =
        trailing != null || amountText != null || displayStatus != null;

    return ListCardSurface(
      onTap: inSelectionMode ? onSelect : onTap,
      onLongPress: inSelectionMode ? null : onLongPress,
      compact: compact,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.rowPaddingH,
        vertical: AppSpacing.rowPaddingV,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Leading icon
          if (lead != null) ...[
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: lead,
            ),
            const SizedBox(width: 10),
          ],

          // ── Left column: title / subtitle / extra ──────────────────────────
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Title — bold, primary text
                Text(
                  displayTitle,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.text,
                    height: 1.3,
                  ),
                ),

                // Subtitle — party name / product code / phone
                if (displaySubtitle.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    displaySubtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w400,
                      color: AppColors.textMuted,
                      height: 1.35,
                    ),
                  ),
                ],

                // Stock qty — bold on its own line (products)
                if (hasBoldLine) ...[
                  const SizedBox(height: 4),
                  Text(
                    boldLine,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: boldSubtitleColor ?? AppColors.text,
                      height: 1.3,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],

                // Extra line — batch/low-stock info
                if (hasExtra) ...[
                  const SizedBox(height: 4),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 5,
                        height: 5,
                        decoration: BoxDecoration(
                          color: secondarySubtitleColor ?? AppColors.warning,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Flexible(
                        child: Text(
                          extraLine,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: secondarySubtitleColor ?? AppColors.warning,
                            height: 1.3,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),

          // ── Right column: date / amount / badges ───────────────────────────
          if (hasRightSide) ...[
            const SizedBox(width: 12),
            trailing ??
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Date / meta (small, muted — shown above amount)
                    if (displayMeta != null && displayMeta.isNotEmpty)
                      Text(
                        displayMeta,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w400,
                          color: AppColors.textFaint,
                          height: 1.3,
                        ),
                      ),

                    // Amount — bold, tabular figures
                    if (amountText != null) ...[
                      if (displayMeta != null) const SizedBox(height: 2),
                      Text(
                        amountText,
                        style: const TextStyle(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.text,
                          height: 1.3,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],

                    // Primary status badge (invoice status)
                    if (displayStatus != null && displayStatus.isNotEmpty) ...[
                      const SizedBox(height: 5),
                      StatusBadge(
                        status: displayStatus,
                        size: StatusBadgeSize.small,
                      ),
                    ],

                    // Secondary status badge (payment status)
                    if (displaySecondaryStatus != null &&
                        displaySecondaryStatus.isNotEmpty &&
                        displaySecondaryStatus.toUpperCase() !=
                            (displayStatus ?? '').toUpperCase()) ...[
                      const SizedBox(height: 3),
                      StatusBadge(
                        status: displaySecondaryStatus,
                        size: StatusBadgeSize.small,
                      ),
                    ],

                    // Expiry badge for product batches
                    if (urgency != null && showExpiryBadgeOnList(urgency)) ...[
                      const SizedBox(height: 3),
                      ExpiryBadge(urgency: urgency, compact: true),
                    ],
                  ],
                ),
          ],
        ],
      ),
    );
  }
}
