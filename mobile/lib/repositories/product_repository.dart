import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';
import 'package:jedmee_mobile/core/cache/api_cache.dart';

class ProductRepository {
  ProductRepository(this._client);

  final ApiClient _client;

  /// PERFORMANCE: Product list cached for 5 minutes (master data TTL).
  /// Products change infrequently — caching eliminates repeated fetches when
  /// the user navigates between screens that show product lists.
  Future<ApiResponse> listProducts([Map<String, dynamic>? params, bool fresh = false]) {
    return _client.get(
      '/products',
      params: params,
      options: fresh
          ? const ApiRequestOptions(skipCache: true)
          : const ApiRequestOptions(cacheTtl: ApiCache.masterDataTtl),
    );
  }

  /// Retailer counter-billing rich search: products + FIFO batches + suppliers.
  /// PERFORMANCE: Short cache (30 s) — search results are query-specific and
  /// the user may type quickly. Deduplication in ApiClient handles burst typing.
  Future<ApiResponse> richSearch({
    String? q,
    bool includeBatches = true,
    bool includeSuppliers = true,
    bool stockOnly = true,
    int limit = 25,
  }) {
    return _client.get(
      '/products/rich-search',
      params: {
        'q': q ?? '',
        'include_batches': includeBatches ? 'true' : 'false',
        'include_suppliers': includeSuppliers ? 'true' : 'false',
        'stock_only': stockOnly ? 'true' : 'false',
        'limit': limit,
      },
      options: const ApiRequestOptions(
        // Short TTL for search — results depend on the query string.
        cacheTtl: Duration(seconds: 30),
      ),
    );
  }

  Future<ApiResponse> create([Map<String, dynamic>? payload]) {
    return _client.post('/products', payload ?? {});
  }

  Future<ApiResponse> update(Object id, [Map<String, dynamic>? payload]) {
    return _client.put(
      '/products/${Uri.encodeComponent(id.toString())}',
      payload ?? {},
    );
  }

  Future<ApiResponse> getById(Object id) {
    return _client.get(
      '/products/${Uri.encodeComponent(id.toString())}',
      options: const ApiRequestOptions(cacheTtl: ApiCache.masterDataTtl),
    );
  }

  Future<ApiResponse> delete(Object id) {
    return _client.delete(
      '/products/${Uri.encodeComponent(id.toString())}',
      {},
    );
  }

  Future<ApiResponse> bulkDelete(List<Object> ids) {
    return _client.post('/products/bulk-delete', {'ids': ids});
  }
}
