import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_typography.dart';
import 'list_card_surface.dart';
import '../core/utils/api_data.dart';
import '../core/utils/format.dart';
import '../core/utils/record_fields.dart';
import 'status_badge.dart';

/// Premium transaction list tile — invoice/order/return row.
/// Clean card design with hover state and smooth interactions.
class TransactionListTile extends StatelessWidget {
  const TransactionListTile({
    super.key,
    required this.row,
    required this.onTap,
    this.amount,
  });

  final Map<String, dynamic> row;
  final VoidCallback onTap;
  final String? amount;

  @override
  Widget build(BuildContext context) {
    final title = invoiceRowTitle(row);
    final subtitle = listRowSubtitleFor(row);
    final status = row['status']?.toString();
    final payment =
        (row['payment_status'] ?? row['paymentStatus'])?.toString();
    final amt = amount ?? fmtCurrency(invoiceRowAmount(row));

    return ListCardSurface(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.labelSemibold,
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.secondary.copyWith(color: AppColors.text2),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(amt, style: AppTypography.amount),
              if (status != null && status.isNotEmpty) ...[
                const SizedBox(height: 5),
                Wrap(
                  spacing: 4,
                  runSpacing: 3,
                  alignment: WrapAlignment.end,
                  children: [
                    StatusBadge(
                      status: status,
                      size: StatusBadgeSize.small,
                    ),
                    if (payment != null &&
                        payment.isNotEmpty &&
                        payment.toUpperCase() != status.toUpperCase())
                      StatusBadge(
                        status: payment,
                        size: StatusBadgeSize.small,
                      ),
                  ],
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
