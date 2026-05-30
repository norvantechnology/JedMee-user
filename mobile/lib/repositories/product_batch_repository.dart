import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';

class ProductBatchRepository {
  ProductBatchRepository(this._client);

  final ApiClient _client;

  Future<ApiResponse> list([Map<String, dynamic>? params]) {
    return _client.get('/api/product-batches', params: params);
  }

  Future<ApiResponse> get(Object id) {
    return _client.get('/api/product-batches/${Uri.encodeComponent(id.toString())}');
  }

  Future<ApiResponse> create([Map<String, dynamic>? payload]) {
    return _client.post('/api/product-batches', payload ?? {});
  }

  Future<ApiResponse> update(Object id, [Map<String, dynamic>? payload]) {
    return _client.put(
      '/api/product-batches/${Uri.encodeComponent(id.toString())}',
      payload ?? {},
    );
  }

  Future<ApiResponse> delete(Object id) {
    return _client.delete(
      '/api/product-batches/${Uri.encodeComponent(id.toString())}',
      {},
    );
  }

  Future<ApiResponse> bulkDelete(List<Object> ids) {
    return _client.post('/api/product-batches/bulk-delete', {'ids': ids});
  }

  Future<ApiResponse> findByBarcode(String barcode) {
    return _client.get(
      '/api/product-batches/by-barcode',
      params: {'barcode': barcode.trim()},
    );
  }

  Future<ApiResponse> check({
    Object? productId,
    String? productCode,
    String? batchNo,
    Object? excludeId,
  }) {
    return _client.get('/api/product-batches/check', params: {
      'product_id': productId?.toString() ?? '',
      'product_code': productCode ?? '',
      'batch_no': batchNo ?? '',
      'exclude_id': excludeId?.toString() ?? '',
    });
  }
}
