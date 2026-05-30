import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';
import 'package:jedmee_mobile/core/cache/api_cache.dart';

class VendorRepository {
  VendorRepository(this._client);

  final ApiClient _client;

  /// PERFORMANCE: Vendor list cached for 5 minutes (master data TTL).
  Future<ApiResponse> list([Map<String, dynamic>? params]) {
    return _client.get(
      '/vendors',
      params: params,
      options: const ApiRequestOptions(cacheTtl: ApiCache.transactionTtl),
    );
  }

  Future<ApiResponse> create([Map<String, dynamic>? payload]) {
    return _client.post('/vendors', payload ?? {});
  }

  Future<ApiResponse> update(Object id, [Map<String, dynamic>? payload]) {
    return _client.post(
      '/vendors/${Uri.encodeComponent(id.toString())}/update',
      payload ?? {},
    );
  }

  Future<ApiResponse> delete(Object id) {
    return _client.post(
      '/vendors/${Uri.encodeComponent(id.toString())}/delete',
      {},
    );
  }

  Future<ApiResponse> bulkDelete(List<Object> ids) {
    return _client.post('/vendors/bulk-delete', {'ids': ids});
  }

  Future<ApiResponse> outstanding(Object id) {
    return _client.get(
      '/vendors/${Uri.encodeComponent(id.toString())}/outstanding',
      options: const ApiRequestOptions(cacheTtl: ApiCache.transactionTtl),
    );
  }

  Future<ApiResponse> ledger(Object id) {
    return _client.get(
      '/vendors/${Uri.encodeComponent(id.toString())}/ledger',
    );
  }

  Future<ApiResponse> sendLedgerEmail(Object id) {
    return _client.post(
      '/vendors/${Uri.encodeComponent(id.toString())}/ledger/send-email',
      {},
    );
  }
}
