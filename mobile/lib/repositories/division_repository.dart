import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';
import 'package:jedmee_mobile/core/cache/api_cache.dart';

class DivisionRepository {
  DivisionRepository(this._client);

  final ApiClient _client;

  /// PERFORMANCE: Division list cached for 10 minutes (reference data TTL).
  /// Divisions are very stable — they rarely change within a session.
  Future<ApiResponse> list([Map<String, dynamic>? params]) {
    return _client.get(
      '/divisions',
      params: params,
      options: const ApiRequestOptions(cacheTtl: ApiCache.transactionTtl),
    );
  }

  Future<ApiResponse> get(Object id) {
    return _client.get(
      '/divisions/${Uri.encodeComponent(id.toString())}',
      options: const ApiRequestOptions(cacheTtl: ApiCache.referenceDataTtl),
    );
  }

  Future<ApiResponse> create([Map<String, dynamic>? payload]) {
    return _client.post('/divisions', payload ?? {});
  }

  Future<ApiResponse> update(Object id, [Map<String, dynamic>? payload]) {
    return _client.post(
      '/divisions/${Uri.encodeComponent(id.toString())}/update',
      payload ?? {},
    );
  }

  Future<ApiResponse> delete(Object id) {
    return _client.post(
      '/divisions/${Uri.encodeComponent(id.toString())}/delete',
      {},
    );
  }

  Future<ApiResponse> outstanding(Object id) {
    return _client.get(
      '/divisions/${Uri.encodeComponent(id.toString())}/outstanding',
      options: const ApiRequestOptions(cacheTtl: ApiCache.transactionTtl),
    );
  }
}
