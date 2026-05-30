import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';
import 'package:jedmee_mobile/core/cache/api_cache.dart';

class CustomerRepository {
  CustomerRepository(this._client);

  final ApiClient _client;

  /// PERFORMANCE: Customer list cached for 5 minutes (master data TTL).
  /// Customer data is stable within a session — caching prevents redundant
  /// fetches when navigating between screens.
  Future<ApiResponse> list([Map<String, dynamic>? params]) {
    return _client.get(
      '/customers',
      params: params,
      options: const ApiRequestOptions(cacheTtl: ApiCache.transactionTtl),
    );
  }

  Future<ApiResponse> get(Object id) {
    return _client.get(
      '/customers/${Uri.encodeComponent(id.toString())}',
      options: const ApiRequestOptions(cacheTtl: ApiCache.masterDataTtl),
    );
  }

  Future<ApiResponse> create([Map<String, dynamic>? payload]) {
    return _client.post('/customers', payload ?? {});
  }

  Future<ApiResponse> update(Object id, [Map<String, dynamic>? payload]) {
    return _client.put(
      '/customers/${Uri.encodeComponent(id.toString())}',
      payload ?? {},
    );
  }

  Future<ApiResponse> delete(Object id) {
    return _client.delete(
      '/customers/${Uri.encodeComponent(id.toString())}',
      {},
    );
  }

  Future<ApiResponse> bulkDelete(List<Object> ids) {
    return _client.post('/customers/bulk-delete', {'ids': ids});
  }

  Future<ApiResponse> outstanding(Object id) {
    return _client.get(
      '/customers/${Uri.encodeComponent(id.toString())}/outstanding',
      // Outstanding balance changes frequently — short TTL.
      options: const ApiRequestOptions(cacheTtl: ApiCache.transactionTtl),
    );
  }

  Future<ApiResponse> ledger(Object id) {
    return _client.get(
      '/customers/${Uri.encodeComponent(id.toString())}/ledger/print',
    );
  }

  Future<ApiResponse> sendLedgerEmail(Object id) {
    return _client.post(
      '/customers/${Uri.encodeComponent(id.toString())}/ledger/send-email',
      {},
    );
  }
}
