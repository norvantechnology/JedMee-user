import 'api_data.dart';

num productTotalQuantity(Map<String, dynamic> row) {
  return pickNum(
        row['total_quantity'] ??
            row['totalQuantity'] ??
            row['total_stock'] ??
            row['totalStock'],
      ) ??
      0;
}

num productLooseQuantity(Map<String, dynamic> row) {
  return pickNum(row['total_loose_quantity'] ?? row['totalLooseQuantity']) ?? 0;
}

int productActiveBatchCount(Map<String, dynamic> row) {
  return parseInt(row['active_batch_count'] ?? row['activeBatchCount']);
}

int productLowBatchCount(Map<String, dynamic> row) {
  return parseInt(row['low_batch_count'] ?? row['lowBatchCount']);
}

num batchBillableStock(Map<String, dynamic> row) {
  return pickNum(
        row['stock_billable_qty'] ??
            row['stockBillableQty'] ??
            row['current_stock'] ??
            row['currentStock'],
      ) ??
      0;
}

num batchFreeStock(Map<String, dynamic> row) {
  return pickNum(
        row['stock_free_qty'] ??
            row['stockFreeQty'] ??
            row['current_free_stock'] ??
            row['currentFreeStock'],
      ) ??
      0;
}

num batchTotalStock(Map<String, dynamic> row) {
  final direct = pickNum(row['total_stock'] ?? row['totalStock']);
  if (direct != null) return direct;
  return batchBillableStock(row) + batchFreeStock(row);
}

num batchLooseStock(Map<String, dynamic> row) {
  return pickNum(row['loose_stock'] ?? row['looseStock']) ?? 0;
}

/// Trim trailing zeros — mirrors web Quality Master stock display.
String formatStockQty(num value) {
  if (!value.isFinite) return '0';
  final rounded = (value * 1000).round() / 1000;
  if (rounded == rounded.roundToDouble()) return rounded.toInt().toString();
  var s = rounded.toStringAsFixed(3);
  if (s.contains('.')) {
    s = s.replaceAll(RegExp(r'0+$'), '');
    s = s.replaceAll(RegExp(r'\.$'), '');
  }
  return s;
}

bool isProductLowStock(Map<String, dynamic> row) =>
    row['product_low_stock'] == true || row['productLowStock'] == true;

bool isProductOutOfStock(Map<String, dynamic> row) => productTotalQuantity(row) <= 0;

bool isBatchLowStock(Map<String, dynamic> row) =>
    row['batch_low_stock'] == true || row['batchLowStock'] == true;

bool isBatchOutOfStock(Map<String, dynamic> row) => batchTotalStock(row) <= 0;

bool isBatchOnHold(Map<String, dynamic> row) =>
    row['is_hold'] == true || row['isHold'] == true;

/// Primary subtitle: code, generic name, mfg, division.
String productMasterMetaLine(Map<String, dynamic> row) {
  final parts = <String>[];
  final code = row['code'] ?? row['product_code'] ?? row['productCode'];
  if (code != null && code.toString().trim().isNotEmpty) {
    parts.add(code.toString().trim());
  }
  final drug = row['drug_name'] ?? row['drugName'];
  if (drug != null && drug.toString().trim().isNotEmpty) {
    parts.add(drug.toString().trim());
  }
  final mfg = row['mfg_company_name'] ?? row['mfgCompanyName'];
  if (mfg != null && mfg.toString().trim().isNotEmpty) {
    parts.add(mfg.toString().trim());
  }
  final div = row['division_name'] ?? row['divisionName'];
  if (div != null && div.toString().trim().isNotEmpty) {
    parts.add(div.toString().trim());
  }
  return parts.join(' · ');
}

/// Stock / batch summary line for product master rows.
/// NOTE: Stock qty is intentionally omitted here — it is shown in the
/// trailing column of [ProductMasterListTile] to avoid duplication.
String productStockMetaLine(Map<String, dynamic> row) {
  final batches = productActiveBatchCount(row);
  final loose = productLooseQuantity(row);
  final lowBatches = productLowBatchCount(row);
  final parts = <String>[
    if (batches == 0)
      'No batches yet'
    else
      '$batches live batch${batches == 1 ? '' : 'es'}',
    if (loose > 0) '${formatStockQty(loose)} loose',
    if (lowBatches > 0)
      '$lowBatches low batch${lowBatches == 1 ? '' : 'es'}',
  ];
  return parts.join(' · ');
}

String? productListStatusChip(Map<String, dynamic> row) {
  if (productActiveBatchCount(row) == 0) return 'NO BATCHES';
  if (isProductOutOfStock(row)) return 'OUT OF STOCK';
  if (isProductLowStock(row) || productLowBatchCount(row) > 0) {
    return 'LOW STOCK';
  }
  return null;
}

/// Subtitle for batch rows: batch no + expiry only.
/// Qty and MRP are shown in the trailing column — not repeated here.
String batchStockMetaLine(Map<String, dynamic> row) {
  final batch = row['batch_no'] ?? row['batchNo'];
  final exp = row['expiry_date'] ?? row['expiryDate'];
  final parts = <String>[
    if (batch != null && batch.toString().isNotEmpty) 'Batch ${batch.toString()}',
    if (exp != null && exp.toString().length >= 10)
      'Exp ${exp.toString().substring(0, 10)}',
  ];
  // Free / loose stock shown if non-zero (useful context not in trailing)
  final free = batchFreeStock(row);
  final loose = batchLooseStock(row);
  if (free > 0) parts.add('${formatStockQty(free)} free');
  if (loose > 0) parts.add('${formatStockQty(loose)} loose');
  return parts.join(' · ');
}

String? batchListStatusChip(Map<String, dynamic> row) {
  if (isBatchOnHold(row)) return 'ON HOLD';
  if (row['stockable'] == false || row['stockable'] == 'false') return 'NON-STOCK';
  if (isBatchOutOfStock(row)) return 'OUT OF STOCK';
  if (isBatchLowStock(row)) return 'LOW STOCK';
  return null;
}
