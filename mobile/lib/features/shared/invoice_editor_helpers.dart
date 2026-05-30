import 'package:flutter/material.dart';

import '../../core/app_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/api_data.dart';
import '../../core/utils/api_helpers.dart';
import '../../core/utils/date.dart';
import '../../core/utils/format.dart';
import '../../core/utils/product_stock.dart';
import '../../widgets/searchable_picker.dart';

/// Stable string id for API rows (UUID, int, etc.).
String recordIdStr(dynamic id) {
  if (id == null) return '';
  final s = id.toString().trim();
  return s == 'null' ? '' : s;
}

/// Searchable dropdown items from master/entity list rows.
///
/// Uses [labelKeys] to find the display label — falls back through
/// `name`, `firm_name`, `short_name`, `code` so vendors, divisions,
/// and customers all render a meaningful label even when some fields
/// are null or empty.
List<SearchablePickerItem> masterPickerItems(
  List<Map<String, dynamic>> rows, {
  List<String> labelKeys = const ['name', 'firm_name', 'short_name', 'code'],
}) {
  return rows
      .where((r) => recordIdStr(r['id']).isNotEmpty)
      .map(
        (r) => SearchablePickerItem(
          value: recordIdStr(r['id']),
          label: rowLabel(r, labelKeys),
        ),
      )
      .toList();
}

/// Ensures the batch's product exists in the local products list for pickers.
List<Map<String, dynamic>> ensureProductFromBatch(
  List<Map<String, dynamic>> products,
  Map<String, dynamic> batch,
) {
  final productId = recordIdStr(batch['product_id'] ?? batch['productId']);
  if (productId.isEmpty) return products;

  final name = (batch['product_name'] ?? batch['productName'] ?? '').toString();
  final code = (batch['product_code'] ?? batch['productCode'] ?? '').toString();
  final idx = products.indexWhere((p) => recordIdStr(p['id']) == productId);

  if (idx >= 0) {
    final updated = List<Map<String, dynamic>>.from(products);
    updated[idx] = {
      ...updated[idx],
      if (name.isNotEmpty) 'name': name,
      if (code.isNotEmpty) 'code': code,
    };
    return updated;
  }

  return [
    ...products,
    {
      'id': productId,
      'name': name,
      if (code.isNotEmpty) 'code': code,
    },
  ];
}

/// Ensures batch row is present with normalized ids for pickers.
List<Map<String, dynamic>> ensureBatchInList(
  List<Map<String, dynamic>> batches,
  Map<String, dynamic> batch,
) {
  final batchId = recordIdStr(batch['id'] ?? batch['batch_id'] ?? batch['batchId']);
  if (batchId.isEmpty) return batches;

  final productId = recordIdStr(batch['product_id'] ?? batch['productId']);
  final normalized = {
    ...batch,
    'id': batchId,
    'batch_id': batchId,
    'batchId': batchId,
    'product_id': productId,
    'productId': productId,
  };

  final idx = batches.indexWhere((b) => recordIdStr(b['id']) == batchId);
  if (idx >= 0) {
    final updated = List<Map<String, dynamic>>.from(batches);
    updated[idx] = {...updated[idx], ...normalized};
    return updated;
  }
  return [...batches, normalized];
}

/// Product row label for invoice pickers — includes total stock (matches Quality Master).
String productPickerLabel(Map<String, dynamic> product) {
  final name = rowLabel(product, ['name', 'code']);
  final qty = productTotalQuantity(product);
  if (qty <= 0) return name;
  return '$name · Stk ${formatStockQty(qty)}';
}

String productLineSummary(Map<String, dynamic> batch) {
  final name = (batch['product_name'] ?? batch['productName'] ?? 'Product').toString();
  final batchNo = (batch['batch_no'] ?? batch['batchNo'] ?? '').toString();
  final exp = fmtDisplayDate(batch['expiry_date'] ?? batch['expiryDate']);
  return [
    name,
    if (batchNo.isNotEmpty) 'Batch $batchNo',
    if (exp.isNotEmpty) 'Exp $exp',
  ].join(' · ');
}

Future<String?> pickInvoiceDate(BuildContext context, String current) async {
  final initial = DateTime.tryParse(current) ?? DateTime.now();
  final picked = await showDatePicker(
    context: context,
    initialDate: initial,
    firstDate: DateTime(2020),
    lastDate: DateTime(2100),
  );
  if (picked == null) return null;
  return todayYmdLocal(picked);
}

List<Map<String, dynamic>> batchesForProduct(
  List<Map<String, dynamic>> batches,
  String productId,
) {
  if (productId.isEmpty) return [];
  return batches
      .where(
        (b) => recordIdStr(b['product_id'] ?? b['productId']) == productId,
      )
      .toList();
}

String batchDropdownLabel(Map<String, dynamic> b) {
  final name = b['product_name'] ?? b['productName'] ?? 'Product';
  final batch = b['batch_no'] ?? b['batchNo'] ?? '';
  final exp = fmtDisplayDate(b['expiry_date'] ?? b['expiryDate']);
  final stock = batchTotalStock(b);
  final parts = [name, if (batch.toString().isNotEmpty) 'B:$batch'];
  if (exp.isNotEmpty) parts.add('Exp $exp');
  if (stock > 0 || b['opening_stock'] != null) {
    parts.add('Stk ${formatStockQty(stock)}');
  }
  return parts.join(' · ');
}

double lineAmount({
  required int qty,
  required double rate,
  double discountPercent = 0,
  double gstPercent = 0,
}) {
  final gross = qty * rate;
  final disc = gross * (discountPercent / 100);
  final taxable = gross - disc;
  if (gstPercent <= 0) return taxable;
  return taxable + taxable * (gstPercent / 100);
}

Map<String, dynamic>? findProductById(
  List<Map<String, dynamic>> products,
  String productId,
) {
  if (productId.isEmpty) return null;
  for (final p in products) {
    if (recordIdStr(p['id']) == productId) return p;
  }
  return null;
}

Map<String, dynamic>? findBatchById(
  List<Map<String, dynamic>> batches,
  String batchId,
) {
  if (batchId.isEmpty) return null;
  for (final b in batches) {
    if (recordIdStr(b['id']) == batchId) return b;
  }
  return null;
}

/// Division from batch row, else from linked product master.
String divisionIdFromBatchOrProduct(
  Map<String, dynamic> batch,
  List<Map<String, dynamic>> products,
) {
  final fromBatch = recordIdStr(batch['division_id'] ?? batch['divisionId']);
  if (fromBatch.isNotEmpty) return fromBatch;
  final product = findProductById(
    products,
    recordIdStr(batch['product_id'] ?? batch['productId']),
  );
  return recordIdStr(product?['division_id'] ?? product?['divisionId']);
}

/// Vendor/supplier from batch, else product supplier link.
String vendorIdFromBatchOrProduct(
  Map<String, dynamic> batch,
  List<Map<String, dynamic>> products,
) {
  final fromBatch = recordIdStr(
    batch['vendor_id'] ??
        batch['vendorId'] ??
        batch['supplier_id'] ??
        batch['supplierId'],
  );
  if (fromBatch.isNotEmpty) return fromBatch;
  final product = findProductById(
    products,
    recordIdStr(batch['product_id'] ?? batch['productId']),
  );
  return recordIdStr(
    product?['supplier_id'] ??
        product?['supplierId'] ??
        product?['sp_vendor_id'] ??
        product?['spVendorId'],
  );
}

double salesDiscountFromBatch(Map<String, dynamic> batch) {
  return parseDouble(
    batch['retail_discount_percent'] ??
        batch['retailDiscountPercent'] ??
        batch['discount_percent'] ??
        batch['discountPercent'],
  );
}

double purchaseDiscountFromBatch(Map<String, dynamic> batch) {
  return parseDouble(
    batch['discount_purchase'] ??
        batch['discountPurchase'] ??
        batch['discount_percent'] ??
        batch['discountPercent'],
  );
}

double gstPercentFromBatch(Map<String, dynamic> batch, {bool purchase = false}) {
  if (purchase) {
    return parseDouble(
      batch['purchase_gst'] ?? batch['purchaseGst'] ?? batch['sales_gst'] ?? batch['salesGst'],
    );
  }
  return parseDouble(batch['sales_gst'] ?? batch['salesGst']);
}

/// Line is ready to send to sales invoice create/update API.
bool isCompleteSalesLine({
  required String productId,
  required String batchId,
  required int qty,
}) =>
    productId.isNotEmpty && batchId.isNotEmpty && qty > 0;

/// Line is ready to send to purchase invoice create/update API (matches web validation).
bool isCompletePurchaseLine({
  required String productId,
  required String batchNo,
  required String expiryDate,
  required int qty,
  required double mrp,
  required double purchaseRate,
}) =>
    productId.isNotEmpty &&
    batchNo.isNotEmpty &&
    expiryDate.isNotEmpty &&
    qty > 0 &&
    mrp > 0 &&
    purchaseRate >= 0;

/// Due date from customer credit days + invoice date.
String? dueDateFromCreditDays({
  required String invoiceDate,
  required int creditDays,
}) {
  if (creditDays <= 0) return null;
  final base = DateTime.tryParse(invoiceDate.length >= 10 ? invoiceDate.substring(0, 10) : invoiceDate);
  if (base == null) return null;
  return todayYmdLocal(base.add(Duration(days: creditDays)));
}

String partyLabelFromList(
  List<Map<String, dynamic>> rows,
  String? id, {
  List<String> keys = const ['name', 'firm_name', 'firmName', 'short_name', 'shortName', 'code'],
}) {
  if (id == null || id.isEmpty) return '';
  for (final r in rows) {
    if (recordIdStr(r['id']) == id) {
      for (final k in keys) {
        final v = r[k];
        if (v != null && v.toString().trim().isNotEmpty) return v.toString();
      }
    }
  }
  return '';
}

/// Compact chip showing an auto-filled header field.
class InvoiceAutoChip extends StatelessWidget {
  const InvoiceAutoChip({super.key, required this.label, this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.primary.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: AppColors.primaryDark),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              label,
              style: AppTypography.caption.copyWith(
                color: AppColors.primaryDark,
                fontWeight: FontWeight.w600,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

/// Dense qty / rate row for invoice line editors.
/// Uses two rows (Qty + Free on row 1, Rate + Disc% on row 2) so labels
/// are never truncated on narrow screens.
class InvoiceLineMetricsRow extends StatelessWidget {
  const InvoiceLineMetricsRow({
    super.key,
    required this.lineKey,
    required this.qty,
    required this.freeQty,
    required this.rate,
    required this.discountPercent,
    required this.rateLabel,
    required this.onQtyChanged,
    required this.onFreeQtyChanged,
    required this.onRateChanged,
    required this.onDiscountChanged,
  });

  final String lineKey;
  final int qty;
  final int freeQty;
  final double rate;
  final double discountPercent;
  final String rateLabel;
  final ValueChanged<int> onQtyChanged;
  final ValueChanged<int> onFreeQtyChanged;
  final ValueChanged<double> onRateChanged;
  final ValueChanged<double> onDiscountChanged;

  InputDecoration _dec(String label, {String? hint}) => InputDecoration(
        labelText: label,
        hintText: hint,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      );

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Row 1: Qty | Free qty
        Row(
          children: [
            Expanded(
              child: TextFormField(
                key: ValueKey('$lineKey-qty-$qty'),
                initialValue: '$qty',
                decoration: _dec('Qty', hint: '1'),
                keyboardType: TextInputType.number,
                onChanged: (v) => onQtyChanged(int.tryParse(v) ?? 1),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextFormField(
                key: ValueKey('$lineKey-free-$freeQty'),
                initialValue: '$freeQty',
                decoration: _dec('Free'),
                keyboardType: TextInputType.number,
                onChanged: (v) => onFreeQtyChanged(int.tryParse(v) ?? 0),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        // Row 2: Rate | Disc %
        Row(
          children: [
            Expanded(
              child: TextFormField(
                key: ValueKey('$lineKey-rate-$rate'),
                initialValue: rate > 0 ? '$rate' : '',
                decoration: _dec(rateLabel),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                onChanged: (v) => onRateChanged(double.tryParse(v) ?? 0),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextFormField(
                key: ValueKey('$lineKey-disc-$discountPercent'),
                initialValue: discountPercent > 0 ? '$discountPercent' : '',
                decoration: _dec('Disc %'),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                onChanged: (v) => onDiscountChanged(double.tryParse(v) ?? 0),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Compact invoice line card — scan-first, minimal chrome.
class InvoiceLineCard extends StatelessWidget {
  const InvoiceLineCard({
    super.key,
    required this.index,
    required this.summary,
    required this.lineTotal,
    required this.showPickers,
    required this.canDelete,
    required this.pickers,
    required this.metrics,
    this.onDelete,
    this.onChangeProduct,
  });

  final int index;
  final String summary;
  final double lineTotal;
  final bool showPickers;
  final bool canDelete;
  final Widget pickers;
  final Widget metrics;
  final VoidCallback? onDelete;
  final VoidCallback? onChangeProduct;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 8, 8, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '${index + 1}',
                    style: AppTypography.caption.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    summary.isNotEmpty ? summary : 'Pick a product below',
                    style: summary.isNotEmpty
                        ? AppTypography.labelSemibold
                        : AppTypography.secondary.copyWith(
                            color: AppColors.textMuted,
                            fontStyle: FontStyle.italic,
                          ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (lineTotal > 0)
                  Padding(
                    padding: const EdgeInsets.only(left: 6, top: 2),
                    child: Text(
                      fmtCurrency(lineTotal),
                      style: AppTypography.labelSemibold.copyWith(color: AppColors.primary),
                    ),
                  ),
                if (canDelete)
                  // Minimum 44×44 tap target for accessibility
                  SizedBox(
                    width: 44,
                    height: 44,
                    child: InkWell(
                      onTap: onDelete,
                      borderRadius: BorderRadius.circular(8),
                      child: const Center(
                        child: Icon(AppIcons.delete, size: 17, color: AppColors.danger),
                      ),
                    ),
                  ),
              ],
            ),
            if (showPickers) ...[
              const SizedBox(height: 8),
              pickers,
            ],
            const SizedBox(height: 8),
            metrics,
            if (!showPickers && summary.isNotEmpty && onChangeProduct != null) ...[
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 0),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  onPressed: onChangeProduct,
                  child: const Text('Change'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Tappable date row for invoice editors.
class InvoiceDateTile extends StatelessWidget {
  const InvoiceDateTile({
    super.key,
    required this.label,
    required this.value,
    required this.onTap,
    this.icon = AppIcons.date,
    this.isPlaceholder = false,
  });

  final String label;
  final String value;
  final VoidCallback onTap;
  final IconData icon;
  final bool isPlaceholder;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Icon(icon, size: 18, color: AppColors.textMuted),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: AppTypography.caption),
                    Text(
                      value,
                      style: AppTypography.body.copyWith(
                        color: isPlaceholder
                            ? AppColors.textPlaceholder
                            : AppColors.text,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded,
                  color: AppColors.textMuted, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
