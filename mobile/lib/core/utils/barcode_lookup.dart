import '../api/api_client.dart';
import '../api/api_response.dart';
import 'api_helpers.dart';

/// Resolve a barcode to a product batch via sales API.
Future<ApiResponse> lookupBarcode(ApiClient client, String barcode) {
  final trimmed = barcode.trim();
  return client.get('/sales-invoices/by-barcode', params: {'barcode': trimmed});
}

/// Extract batch map from barcode lookup API response.
Map<String, dynamic>? batchFromBarcodeResponse(ApiResponse resp) {
  if (!resp.ok) return null;
  final data = extractDataMap(resp);
  if (data == null) return null;
  final batch = data['batch'] ??
      data['productBatch'] ??
      data['product_batch'] ??
      data['item'];
  if (batch is Map) return Map<String, dynamic>.from(batch);
  if (data.containsKey('product_id') ||
      data.containsKey('productId') ||
      data.containsKey('batch_no') ||
      data.containsKey('batchNo')) {
    return Map<String, dynamic>.from(data);
  }
  return null;
}

/// Normalize batch fields for invoice line prefill.
Map<String, dynamic> normalizeBarcodeBatch(Map<String, dynamic> batch) {
  return {
    ...batch,
    'product_id': batch['product_id'] ?? batch['productId'],
    'productId': batch['productId'] ?? batch['product_id'],
    'batch_id': batch['batch_id'] ?? batch['batchId'] ?? batch['id'],
    'batchId': batch['batchId'] ?? batch['batch_id'] ?? batch['id'],
    'batch_no': batch['batch_no'] ?? batch['batchNo'],
    'batchNo': batch['batchNo'] ?? batch['batch_no'],
    'product_name': batch['product_name'] ?? batch['productName'] ?? batch['drug_name'],
    'productName': batch['productName'] ?? batch['product_name'] ?? batch['drugName'],
  };
}
