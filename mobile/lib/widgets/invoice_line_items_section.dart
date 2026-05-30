import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_typography.dart';
import '../core/utils/api_data.dart';
import '../core/utils/format.dart';
import 'section_divider.dart';

/// Line items table for sales / purchase invoice detail sheets.
class InvoiceLineItemsSection extends StatelessWidget {
  const InvoiceLineItemsSection({
    super.key,
    required this.items,
    this.isPurchase = false,
  });

  final List<Map<String, dynamic>> items;
  final bool isPurchase;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionDividerLabel(label: 'Line items (${items.length})'),
        const SizedBox(height: 6),
        // Individual cards per item — light grey tint, radius 10px
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(height: 6),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface2,
              borderRadius: BorderRadius.circular(10),
            ),
            child: _LineRow(item: items[i], isPurchase: isPurchase, index: i + 1),
          ),
        ],
      ],
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({
    required this.item,
    required this.isPurchase,
    required this.index,
  });

  final Map<String, dynamic> item;
  final bool isPurchase;
  final int index;

  @override
  Widget build(BuildContext context) {
    final product =
        (item['product_name'] ?? item['productName'] ?? 'Product').toString();
    final batch = (item['batch_no'] ?? item['batchNo'] ?? '').toString();
    final qty = parseInt(item['qty']);
    final freeQty = parseInt(item['free_qty'] ?? item['freeQty']);
    final rate = isPurchase
        ? parseDouble(item['purchase_rate'] ?? item['purchaseRate'])
        : parseDouble(item['sales_rate'] ?? item['salesRate'] ?? item['rate']);
    final disc = parseDouble(item['discount_percent'] ?? item['discountPercent']);
    final lineTotal = parseDouble(
      item['line_total'] ??
          item['lineTotal'] ??
          item['amount'] ??
          qty * rate * (1 - disc / 100),
    );

    // Meta line: "Batch 23 · Qty 70 · ₹90.00"
    final meta = <String>[
      if (batch.isNotEmpty) 'Batch $batch',
      'Qty $qty${freeQty > 0 ? ' + $freeQty free' : ''}',
      if (rate > 0) fmtCurrency(rate),
    ];

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Item number circle
          Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.primarySubtle,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              '$index',
              style: AppTypography.caption.copyWith(
                color: AppColors.primaryDark,
                fontWeight: FontWeight.w700,
                fontSize: 11,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product,
                  style: AppTypography.labelSemibold.copyWith(fontSize: 14),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (meta.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    meta.join(' · '),
                    style: AppTypography.caption.copyWith(
                      color: AppColors.textMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Amount — brand color, weight 600
          Text(
            fmtCurrency(lineTotal),
            style: AppTypography.labelSemibold.copyWith(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.primaryDark,
            ),
          ),
        ],
      ),
    );
  }
}
