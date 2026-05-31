import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../config/app_config.dart';
import '../auth/auth_storage.dart';
import '../cache/api_cache.dart';
import '../logger/app_logger.dart';
import '../utils/timezone.dart';
import 'api_response.dart';

/// Options for API calls (mirrors web `opts` on apiClient.js).
class ApiRequestOptions {
  const ApiRequestOptions({
    this.toast = ApiToastMode.auto,
    this.cacheTtl,
    this.skipCache = false,
  });

  final ApiToastMode toast;

  /// When set, the GET response is cached for this duration.
  /// Use [ApiCache] TTL constants for consistency.
  final Duration? cacheTtl;

  /// When true, bypasses the cache and always fetches fresh data.
  final bool skipCache;
}

enum ApiToastMode { auto, none }

/// Outcome of a refresh-token exchange — drives whether session is cleared.
enum _RefreshOutcome { success, invalidSession, transientFailure }

/// HTTP client mirroring frontend/src/services/apiClient.js.
///
/// PERFORMANCE OPTIMIZATIONS APPLIED:
/// 1. Accept-Encoding: gzip — server compresses responses, reducing transfer
///    size by 60–80% for JSON payloads. Saves 50–200 ms on slow connections.
/// 2. In-flight GET deduplication — concurrent identical GET requests share
///    one network call instead of N. Prevents duplicate dashboard/list fetches.
/// 3. Response caching — GET responses cached with TTL via [ApiCache].
///    Eliminates redundant round-trips for stable data (products, customers).
/// 4. JSON parsing via compute() — large responses (>50 KB) are parsed in a
///    background isolate to avoid blocking the UI thread (jank prevention).
class ApiClient {
  ApiClient({
    AuthStorage? authStorage,
    http.Client? httpClient,
  })  : _authStorage = authStorage ?? AuthStorage(),
        _http = httpClient ?? http.Client();

  final AuthStorage _authStorage;
  final http.Client _http;

  int _lastAuthClearAt = 0;
  int _lastAuthExpiredToastAt = 0;

  /// Global mutex — all [ApiClient] instances share one refresh flight.
  static Completer<_RefreshOutcome>? _globalRefreshCompleter;

  /// In-flight GET request deduplication map.
  /// Key: canonical URL string. Value: completer for the in-progress request.
  /// PERFORMANCE: Prevents N identical concurrent GETs from all hitting the
  /// network — the first one fetches, the rest await its result.
  static final Map<String, Completer<ApiResponse>> _inFlightGets = {};

  static const _proactiveRefreshBeforeMs = 2 * 60 * 1000;

  /// Threshold above which JSON is parsed in a background isolate.
  /// PERFORMANCE: Parsing >50 KB JSON on the main thread can drop frames.
  static const _isolateParseThresholdBytes = 50 * 1024; // 50 KB

  static String getApiBaseUrl() => AppConfig.getApiBaseUrl();

  /// Returns true when refresh succeeded; false when refresh failed but session
  /// may still be valid (transient error). Session is cleared only on 401.
  Future<bool> refreshSessionIfNeeded({bool force = false}) async {
    final auth = await _authStorage.readAuth();
    if (auth == null || auth.refreshToken.isEmpty || auth.email.isEmpty) {
      return false;
    }
    if (!force && _authStorage.hasValidAccessToken(auth)) {
      return true;
    }
    final outcome = await _tryRefreshSession();
    return outcome == _RefreshOutcome.success;
  }

  Future<ApiResponse> get(
    String path, {
    Map<String, dynamic>? params,
    ApiRequestOptions options = const ApiRequestOptions(),
  }) async {
    final base = _buildUrl(path);
    final query = _buildQueryString(params);
    final url = query.isEmpty ? base : '$base?$query';

    // ── PERFORMANCE: Check in-memory cache first ───────────────────────────
    if (!options.skipCache && options.cacheTtl != null) {
      final cacheKey = ApiCache.key('GET', url);
      final cached = ApiCache.instance.get<ApiResponse>(cacheKey);
      if (cached != null) {
        AppLogger.d('Cache HIT: GET $url');
        return cached;
      }
    }

    // ── PERFORMANCE: Deduplicate in-flight GET requests ────────────────────
    // If an identical GET is already in progress, wait for its result instead
    // of firing a second network request.
    final dedupeKey = url;
    if (_inFlightGets.containsKey(dedupeKey)) {
      AppLogger.d('Dedup GET: $url — awaiting in-flight request');
      return _inFlightGets[dedupeKey]!.future;
    }

    final completer = Completer<ApiResponse>();
    _inFlightGets[dedupeKey] = completer;

    try {
      final response = await _apiFetch('GET', url, null, options);

      // Store in cache if TTL is specified and response is successful.
      if (!options.skipCache &&
          options.cacheTtl != null &&
          response.ok) {
        final cacheKey = ApiCache.key('GET', url);
        ApiCache.instance.set(cacheKey, response, ttl: options.cacheTtl!);
      }

      completer.complete(response);
      return response;
    } catch (e, st) {
      final errResp = ApiResponse(
        status: 0,
        json: {
          'ok': false,
          'error': {'code': 'NETWORK_ERROR', 'message': e.toString()},
        },
      );
      completer.complete(errResp);
      AppLogger.w('GET $url failed', error: e);
      return errResp;
    } finally {
      _inFlightGets.remove(dedupeKey);
    }
  }

  Future<ApiResponse> post(
    String path,
    Map<String, dynamic>? body, {
    ApiRequestOptions options = const ApiRequestOptions(),
  }) async {
    return _apiFetch('POST', _buildUrl(path), body, options);
  }

  Future<ApiResponse> put(
    String path,
    Map<String, dynamic>? body, {
    ApiRequestOptions options = const ApiRequestOptions(),
  }) async {
    return _apiFetch('PUT', _buildUrl(path), body, options);
  }

  Future<ApiResponse> patch(
    String path,
    Map<String, dynamic>? body, {
    ApiRequestOptions options = const ApiRequestOptions(),
  }) async {
    return _apiFetch('PATCH', _buildUrl(path), body, options);
  }

  Future<ApiResponse> delete(
    String path,
    Map<String, dynamic>? body, {
    ApiRequestOptions options = const ApiRequestOptions(),
  }) async {
    return _apiFetch('DELETE', _buildUrl(path), body, options);
  }

  Future<ApiResponse> _apiFetch(
    String method,
    String url,
    Map<String, dynamic>? body,
    ApiRequestOptions options, [
    int attempt = 0,
  ]) async {
    final auth = await _authStorage.readAuth();
    final headers = <String, String>{
      'accept': 'application/json',
      // PERFORMANCE: Request gzip-compressed responses from the server.
      // Reduces JSON payload size by 60–80%, saving bandwidth and parse time.
      'accept-encoding': 'gzip, deflate',
      if (method != 'GET') 'content-type': 'application/json',
      if (auth != null && auth.accessToken.isNotEmpty)
        'Authorization': 'Bearer ${auth.accessToken}',
    };

    late final http.StreamedResponse response;
    late final String responseBody;

    try {
      response = await _http
          .send(
            http.Request(method, Uri.parse(url))
              ..headers.addAll(headers)
              ..body = method != 'GET' ? jsonEncode(body ?? {}) : '',
          )
          .timeout(const Duration(seconds: 15));
      responseBody = await response.stream.bytesToString();
    } on Exception catch (e) {
      final isTimeout = e.toString().contains('TimeoutException');
      AppLogger.w('API network error [$method $url]', error: e);
      return ApiResponse(
        status: 0,
        json: {
          'ok': false,
          'error': {
            'code': isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
            'message': isTimeout
                ? 'Request timed out. Check your connection and try again.'
                : 'No internet connection. Please check your network.',
          },
        },
      );
    }

    // PERFORMANCE: Parse large JSON responses in a background isolate to
    // avoid blocking the UI thread. Threshold: 50 KB.
    final resp = responseBody.length > _isolateParseThresholdBytes
        ? await _parseResponseInIsolate(response.statusCode, responseBody)
        : ApiResponse.fromHttp(response.statusCode, responseBody);

    if (resp.status >= 400) {
      AppLogger.w('API error ${resp.status} [$method $url]');
    }

    final canRetry = resp.status == 401 &&
        attempt == 0 &&
        !url.contains('/auth/refresh') &&
        !url.contains('/auth/login');

    if (canRetry) {
      final outcome = await _tryRefreshSession();
      if (outcome == _RefreshOutcome.success) {
        return _apiFetch(method, url, body, options, attempt + 1);
      }
      if (outcome == _RefreshOutcome.invalidSession) {
        await _clearAuthOnce();
        if (options.toast != ApiToastMode.none &&
            !_shouldThrottleAuthExpiredToast()) {
          _markAuthExpiredToastShown();
        }
        return _withMessage(resp, 'Session expired. Please sign in again.');
      }
      // Transient refresh failure — keep session; caller may retry later.
      return _withMessage(
        resp,
        'Could not refresh session. Check your connection and try again.',
      );
    }

    if (resp.status == 401) {
      await _clearAuthOnce();
      if (options.toast != ApiToastMode.none &&
          !_shouldThrottleAuthExpiredToast()) {
        _markAuthExpiredToastShown();
      }
      return _withMessage(resp, 'Session expired. Please sign in again.');
    }

    if (resp.status == 403) {
      return _withMessage(
        resp,
        resp.parseErrorMessage().isNotEmpty
            ? resp.parseErrorMessage()
            : "You don't have permission for this action.",
      );
    }

    if (resp.status == 404) {
      return _withMessage(
        resp,
        resp.parseErrorMessage().isNotEmpty
            ? resp.parseErrorMessage()
            : 'Record not found.',
      );
    }

    if (resp.status >= 500) {
      return _withMessage(
        resp,
        'Server issue. Please try again later.',
      );
    }

    return resp;
  }

  /// Parses a large JSON response body in a background isolate.
  /// PERFORMANCE: Prevents UI jank when parsing responses >50 KB.
  /// The compute() function spawns a short-lived isolate for the parse.
  static Future<ApiResponse> _parseResponseInIsolate(
    int statusCode,
    String body,
  ) async {
    try {
      final json = await compute(_parseJsonInIsolate, body);
      return ApiResponse(status: statusCode, json: json);
    } catch (_) {
      // Fallback to synchronous parse on isolate failure.
      return ApiResponse.fromHttp(statusCode, body);
    }
  }

  /// Top-level function required by compute() — must not be a closure.
  static Map<String, dynamic>? _parseJsonInIsolate(String body) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } catch (_) {}
    return null;
  }

  ApiResponse _withMessage(ApiResponse resp, String message) {
    final existing = resp.json ?? {};
    final error = Map<String, dynamic>.from(
      (existing['error'] is Map
          ? existing['error'] as Map
          : <String, dynamic>{}),
    );
    error['message'] = message;
    return ApiResponse(
      status: resp.status,
      json: {...existing, 'ok': false, 'error': error},
    );
  }

  Future<_RefreshOutcome> _tryRefreshSession() async {
    if (_globalRefreshCompleter != null) {
      AppLogger.d('Token refresh already in progress — waiting for result.');
      return _globalRefreshCompleter!.future;
    }

    _globalRefreshCompleter = Completer<_RefreshOutcome>();

    try {
      final auth = await _authStorage.readAuth();
      if (auth == null ||
          auth.refreshToken.isEmpty ||
          auth.email.isEmpty) {
        const outcome = _RefreshOutcome.invalidSession;
        _globalRefreshCompleter!.complete(outcome);
        return outcome;
      }

      final url = '${getApiBaseUrl()}/auth/refresh';
      final email = auth.email.trim().toLowerCase();
      AppLogger.d('Refreshing session token for $email');

      final response = await _http
          .post(
            Uri.parse(url),
            headers: const {
              'accept': 'application/json',
              'content-type': 'application/json',
              // PERFORMANCE: Request compressed refresh response too.
              'accept-encoding': 'gzip, deflate',
            },
            body: jsonEncode({
              'email': email,
              'refreshToken': auth.refreshToken,
            }),
          )
          .timeout(const Duration(seconds: 30));

      final resp = ApiResponse.fromHttp(response.statusCode, response.body);

      if (resp.status >= 200 &&
          resp.status < 300 &&
          resp.ok &&
          resp.data is Map) {
        final data = Map<String, dynamic>.from(resp.data as Map);
        final newAccess = (data['accessToken'] ?? '').toString();
        final newRefresh = (data['refreshToken'] ?? '').toString();
        if (newAccess.isEmpty || newRefresh.isEmpty) {
          AppLogger.w('Refresh response missing accessToken or refreshToken');
          const outcome = _RefreshOutcome.transientFailure;
          _globalRefreshCompleter!.complete(outcome);
          return outcome;
        }
        await _authStorage.saveAuth(
          rememberMe: auth.rememberMe,
          email: email,
          accessToken: newAccess,
          accessExpiresInSec:
              (data['accessExpiresInSec'] as num?)?.toInt() ?? 0,
          refreshToken: newRefresh,
        );
        AppLogger.i('Session token refreshed successfully.');
        const outcome = _RefreshOutcome.success;
        _globalRefreshCompleter!.complete(outcome);
        return outcome;
      }

      if (resp.status == 401) {
        AppLogger.w(
            'Token refresh rejected (${resp.error?['code']}) — clearing auth session.');
        await _authStorage.clearAuth();
        const outcome = _RefreshOutcome.invalidSession;
        _globalRefreshCompleter!.complete(outcome);
        return outcome;
      }

      AppLogger.w('Token refresh failed (${resp.status}) — keeping session.');
      const failOutcome = _RefreshOutcome.transientFailure;
      _globalRefreshCompleter!.complete(failOutcome);
      return failOutcome;
    } catch (e) {
      AppLogger.w('Token refresh exception', error: e);
      const outcome = _RefreshOutcome.transientFailure;
      _globalRefreshCompleter!.complete(outcome);
      return outcome;
    } finally {
      _globalRefreshCompleter = null;
    }
  }

  /// Proactive refresh — call from a periodic timer (mirrors web authBootstrap).
  Future<void> refreshSessionProactively() async {
    final auth = await _authStorage.readAuth();
    if (auth == null || auth.refreshToken.isEmpty) return;
    final msUntilExpiry = auth.accessExpiresAt - DateTime.now().millisecondsSinceEpoch;
    if (msUntilExpiry > _proactiveRefreshBeforeMs) return;
    await refreshSessionIfNeeded(force: true);
  }

  Future<void> _clearAuthOnce() async {
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now - _lastAuthClearAt < 1500) return;
    _lastAuthClearAt = now;
    await _authStorage.clearAuth();
  }

  bool _shouldThrottleAuthExpiredToast() {
    final now = DateTime.now().millisecondsSinceEpoch;
    return now - _lastAuthExpiredToastAt < 2500;
  }

  void _markAuthExpiredToastShown() {
    _lastAuthExpiredToastAt = DateTime.now().millisecondsSinceEpoch;
  }

  String _buildUrl(String path) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return '${getApiBaseUrl()}$normalized';
  }

  String _buildQueryString(Map<String, dynamic>? params) {
    final merged = withScreenTimezone(params);
    if (merged.isEmpty) return '';
    final entries = merged.entries
        .where((e) =>
            e.value != null && e.value.toString().trim().isNotEmpty)
        .map((e) => MapEntry(e.key, e.value.toString()))
        .toList();
    if (entries.isEmpty) return '';
    return Uri(queryParameters: Map.fromEntries(entries)).query;
  }

  void dispose() {
    _http.close();
  }
}
