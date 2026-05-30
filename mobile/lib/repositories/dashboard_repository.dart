import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';
import 'package:jedmee_mobile/core/cache/api_cache.dart';

class DashboardRepository {
  DashboardRepository(this._client);

  final ApiClient _client;

  /// Dashboard summary payload (KPIs + widgets) in one call.
  /// Query params: dateFrom/dateTo (YYYY-MM-DD), recent_limit, expiry_days.
  ///
  /// PERFORMANCE: Cached for 2 minutes. Dashboard data changes infrequently
  /// within a session — caching eliminates redundant API calls when the user
  /// navigates away and back to the dashboard (common pattern).
  Future<ApiResponse> getDashboardSummary([Map<String, dynamic>? params]) {
    return _client.get(
      '/dashboard/summary',
      params: params,
      options: const ApiRequestOptions(cacheTtl: ApiCache.dashboardTtl),
    );
  }

  /// Compact alert payload for the billing-screen ticker.
  /// PERFORMANCE: Cached for 1 minute — alerts are time-sensitive but
  /// don't need to refresh on every navigation event.
  Future<ApiResponse> getDashboardAlerts() {
    return _client.get(
      '/dashboard/alerts',
      options: const ApiRequestOptions(cacheTtl: ApiCache.transactionTtl),
    );
  }

  /// Force-refresh the dashboard summary, bypassing the cache.
  /// Call this when the user explicitly pulls to refresh.
  Future<ApiResponse> refreshDashboardSummary([Map<String, dynamic>? params]) {
    return _client.get(
      '/dashboard/summary',
      params: params,
      options: const ApiRequestOptions(skipCache: true),
    );
  }
}
