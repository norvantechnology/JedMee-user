import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';
import '../core/api/api_response.dart';
import '../core/auth/auth_storage.dart';
import '../core/cache/api_cache.dart';
import '../core/logger/app_logger.dart';
import '../core/notifications/fcm_service.dart';
import 'app_providers.dart';

enum AuthStatus {
  initial,
  loading,
  authenticated,
  unauthenticated,
}

class AuthState {
  const AuthState({
    this.status = AuthStatus.initial,
    this.auth,
    this.error,
  });

  final AuthStatus status;
  final AuthData? auth;
  final String? error;

  bool get isAuthed =>
      status == AuthStatus.authenticated &&
      auth != null &&
      auth!.refreshToken.isNotEmpty;

  bool get mustChangePassword =>
      auth?.user?['must_change_password'] == true;

  bool get approvalGate {
    if (!isAuthed) return false;
    final user = auth?.user;
    if (user == null) return false;
    final status = (user['status'] ?? '').toString().toUpperCase();
    final blocked = user['is_blocked'] == true;
    return blocked || status == 'PENDING' || status == 'REJECTED';
  }

  AuthState copyWith({
    AuthStatus? status,
    AuthData? auth,
    String? error,
    bool clearError = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      auth: auth ?? this.auth,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState>
    with WidgetsBindingObserver {
  AuthNotifier(this._ref) : super(const AuthState()) {
    WidgetsBinding.instance.addObserver(this);
    _init();
  }

  final Ref _ref;
  StreamSubscription<void>? _authSub;
  Timer? _refreshTimer;
  String? _bootstrappedToken;
  bool _bootstrapping = false;

  AuthStorage get _storage => _ref.read(authStorageProvider);
  ApiClient get _api => _ref.read(apiClientProvider);

  void _startRefreshTimer() {
    _refreshTimer?.cancel();
    // Refresh immediately on timer start, then every minute.
    if (state.isAuthed) {
      _api.refreshSessionProactively();
    }
    _refreshTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (!state.isAuthed) return;
      _api.refreshSessionProactively();
    });
  }

  void _stopRefreshTimer() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
  }

  Future<void> _init() async {
    if (!mounted) return;
    await _storage.ensureInitialized();
    if (!mounted) return;
    _authSub = _storage.onAuthChanged.listen((_) => _syncFromStorage());
    if (!mounted) return;
    await bootstrap();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && this.state.isAuthed) {
      _api.refreshSessionIfNeeded(force: true);
    }
  }

  Future<void> _syncFromStorage() async {
    if (!mounted) return;
    final auth = await _storage.readAuth();
    if (auth != null && auth.refreshToken.isNotEmpty) {
      state = state.copyWith(
        status: AuthStatus.authenticated,
        auth: auth,
        clearError: true,
      );
      _startRefreshTimer();
    } else {
      _stopRefreshTimer();
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        clearError: true,
      );
    }
  }

  Future<void> bootstrap() async {
    try {
      if (!mounted) return;
      await _storage.ensureInitialized();
      if (!mounted) return;
      var auth = await _storage.readAuth();
      if (!mounted) return;

      if (auth == null || auth.refreshToken.isEmpty) {
        _stopRefreshTimer();
        state = const AuthState(status: AuthStatus.unauthenticated);
        return;
      }

      state = AuthState(status: AuthStatus.authenticated, auth: auth);
      _startRefreshTimer();

      if (!_storage.hasValidAccessToken(auth)) {
        final refreshed = await _api.refreshSessionIfNeeded(force: true);
        if (!refreshed) {
          // Only log out if refresh token was rejected — keep session on network errors.
          final still = await _storage.readAuth();
          if (still == null || still.refreshToken.isEmpty) {
            _stopRefreshTimer();
            state = const AuthState(status: AuthStatus.unauthenticated);
            return;
          }
          // Transient failure — stay authenticated; timer/resume will retry refresh.
        } else {
          auth = await _storage.readAuth();
          if (auth == null || auth.refreshToken.isEmpty) {
            _stopRefreshTimer();
            state = const AuthState(status: AuthStatus.unauthenticated);
            return;
          }
          state = AuthState(status: AuthStatus.authenticated, auth: auth);
        }
      }

      final hasProfile = auth.user != null && auth.access != null;
      if (_bootstrappedToken == auth.refreshToken && hasProfile) {
        unawaited(_saveFcmToken());
        return;
      }
      if (_bootstrapping) return;

      _bootstrapping = true;
      _bootstrappedToken = auth.refreshToken;

      if (!mounted) return;
      final userRepo = _ref.read(userRepositoryProvider);

      // ── PERFORMANCE: Fetch user profile + access permissions in parallel ──
      // Previously these were sequential (getMe → getMyAccess), adding ~200–
      // 400 ms to every cold-start bootstrap. Running them concurrently halves
      // the bootstrap time on typical connections.
      final results = await Future.wait<ApiResponse>([
        userRepo.getMe(),
        userRepo.getMyAccess(),
      ]);
      if (!mounted) return;

      var meResp = results[0];
      var accessResp = results[1];

      // Handle 401 on getMe — refresh token and retry both calls together.
      if (meResp.status == 401 || accessResp.status == 401) {
        final refreshed = await _api.refreshSessionIfNeeded(force: true);
        if (!refreshed) {
          final still = await _storage.readAuth();
          if (still == null || still.refreshToken.isEmpty) {
            await _storage.clearAuth();
            _stopRefreshTimer();
            state = const AuthState(status: AuthStatus.unauthenticated);
            return;
          }
        } else {
          // Retry both in parallel after successful token refresh.
          final retried = await Future.wait<ApiResponse>([
            userRepo.getMe(),
            userRepo.getMyAccess(),
          ]);
          if (!mounted) return;
          meResp = retried[0];
          accessResp = retried[1];
        }
      }

      // Process getMe response.
      if (meResp.ok) {
        final data = meResp.data;
        Map<String, dynamic>? user;
        if (data is Map) {
          user = data['user'] is Map
              ? Map<String, dynamic>.from(data['user'] as Map)
              : Map<String, dynamic>.from(data);
        }
        if (!mounted) return;
        if (user != null) {
          await _storage.saveAuthUser(user);
          if (!mounted) return;
        }
      }

      // Process getMyAccess response.
      if (accessResp.ok) {
        final data = accessResp.data;
        if (!mounted) return;
        if (data is Map && data['access'] is Map) {
          await _storage.saveAuthAccess(
            Map<String, dynamic>.from(data['access'] as Map),
          );
        } else if (data is Map) {
          await _storage.saveAuthAccess(Map<String, dynamic>.from(data));
        }
        if (!mounted) return;
      }

      final refreshed = await _storage.readAuth();
      if (!mounted) return;
      state = AuthState(status: AuthStatus.authenticated, auth: refreshed);
      unawaited(_saveFcmToken());
    } catch (_) {
      if (!mounted) return;
      final auth = await _storage.readAuth();
      if (!mounted) return;
      if (auth != null && auth.refreshToken.isNotEmpty) {
        state = AuthState(status: AuthStatus.authenticated, auth: auth);
      } else {
        state = const AuthState(status: AuthStatus.unauthenticated);
      }
    } finally {
      _bootstrapping = false;
    }
  }

  Future<String?> login({
    required String email,
    required String password,
    String role = 'WHOLESALER',
    bool rememberMe = true,
  }) async {
    final authRepo = _ref.read(authRepositoryProvider);

    final resp = await authRepo.login({
      'email': email.trim().toLowerCase(),
      'password': password,
      'role': role.toUpperCase(),
      'rememberMe': rememberMe,
    });

    if (resp.status == 0) {
      return resp.parseErrorMessage();
    }

    if (!resp.ok) {
      final code = resp.error?['code']?.toString();
      if (resp.status == 403 && code == 'EMAIL_NOT_VERIFIED') {
        state = state.copyWith(status: AuthStatus.unauthenticated);
        return 'EMAIL_NOT_VERIFIED';
      }
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: resp.parseErrorMessage(),
      );
      return resp.parseErrorMessage();
    }

    final data = resp.data;
    if (data is! Map) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: 'Invalid login response',
      );
      return 'Invalid login response';
    }

    final tokens = data['tokens'];
    if (tokens is! Map) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: 'Missing tokens',
      );
      return 'Missing tokens';
    }

    await _storage.saveAuth(
      rememberMe: tokens['rememberMe'] == true || rememberMe,
      email: email.trim().toLowerCase(),
      accessToken: (tokens['accessToken'] ?? '').toString(),
      accessExpiresInSec: (tokens['accessExpiresInSec'] as num?)?.toInt() ?? 0,
      refreshToken: (tokens['refreshToken'] ?? '').toString(),
    );

    final user = data['user'];
    if (user is Map) {
      await _storage.saveAuthUser(Map<String, dynamic>.from(user));
    }

    _bootstrappedToken = null;
    await bootstrap();

    // Save FCM token to backend after successful login.
    await _saveFcmToken();

    return null;
  }

  /// Get the current FCM token and save it to the backend.
  Future<void> _saveFcmToken() async {
    // Firebase / FCM is not initialised on web — skip silently.
    if (kIsWeb) return;
    try {
      final token = await FcmService.instance.getToken();
      if (token == null || token.isEmpty) return;

      final deviceType = kIsWeb ? 'web' : (Platform.isIOS ? 'ios' : 'android');
      final notifRepo = _ref.read(notificationRepositoryProvider);
      final resp = await notifRepo.saveFcmToken(token, deviceType: deviceType);
      if (resp.ok) {
        AppLogger.i('[AuthController] FCM token saved.');
      } else {
        AppLogger.w('[AuthController] FCM token save failed: ${resp.error}');
      }

      // Listen for token refresh and re-save.
      FcmService.instance.onTokenRefresh((newToken) async {
        if (!mounted) return;
        final r = await _ref
            .read(notificationRepositoryProvider)
            .saveFcmToken(newToken, deviceType: deviceType);
        if (r.ok) AppLogger.i('[AuthController] FCM token refreshed and saved.');
      });
    } catch (e) {
      AppLogger.e('[AuthController] Failed to save FCM token', error: e);
    }
  }

  Future<String?> register({
    required String role,
    required String firmName,
    required String email,
    required String phone,
    required String password,
  }) async {
    state = state.copyWith(clearError: true);
    final authRepo = _ref.read(authRepositoryProvider);
    final payload = {
      'role': role.toUpperCase(),
      'firmName': firmName.trim(),
      'fullName': firmName.trim(),
      'email': email.trim(),
      'phoneNumber': phone.trim(),
      'password': password,
    };

    var resp = await authRepo.signup(payload);
    if (!resp.ok) {
      resp = await _ref.read(apiClientProvider).post('/registration', payload);
    }

    if (!resp.ok) {
      return resp.parseErrorMessage();
    }

    final otpResp = await authRepo.requestOtp({
      'email': email.trim(),
      'role': role.toUpperCase(),
    });
    if (!otpResp.ok) {
      return otpResp.parseErrorMessage();
    }

    return null;
  }

  Future<String?> verifyOtp({
    required String email,
    required String otp,
    String role = 'WHOLESALER',
    bool rememberMe = true,
  }) async {
    final authRepo = _ref.read(authRepositoryProvider);
    final resp = await authRepo.verifyOtp({
      'email': email.trim().toLowerCase(),
      'otp': otp.trim(),
      'role': role.toUpperCase(),
      'rememberMe': rememberMe,
    });

    if (!resp.ok) return resp.parseErrorMessage();

    final data = resp.data;
    if (data is Map && data['tokens'] is Map) {
      final tokens = Map<String, dynamic>.from(data['tokens'] as Map);
      await _storage.saveAuth(
        rememberMe: rememberMe,
        email: email.trim().toLowerCase(),
        accessToken: (tokens['accessToken'] ?? '').toString(),
        accessExpiresInSec: (tokens['accessExpiresInSec'] as num?)?.toInt() ?? 0,
        refreshToken: (tokens['refreshToken'] ?? '').toString(),
      );
      if (data['user'] is Map) {
        await _storage.saveAuthUser(
          Map<String, dynamic>.from(data['user'] as Map),
        );
      }
      _bootstrappedToken = null;
      await bootstrap();
    }
    return null;
  }

  Future<void> logout() async {
    _stopRefreshTimer();
    final auth = await _storage.readAuth();
    if (auth != null && auth.refreshToken.isNotEmpty) {
      await _ref.read(authRepositoryProvider).logout({
        'email': auth.email,
        'refreshToken': auth.refreshToken,
      });
    }
    await _storage.clearAuth();
    _bootstrappedToken = null;
    // PERFORMANCE: Clear the API response cache on logout so stale data from
    // the previous session is never shown to the next user on the same device.
    ApiCache.instance.clear();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  Future<void> refreshProfile() async {
    _bootstrappedToken = null;
    await bootstrap();
  }

  @override
  void dispose() {
    _stopRefreshTimer();
    WidgetsBinding.instance.removeObserver(this);
    _authSub?.cancel();
    super.dispose();
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref);
});

final authDataProvider = Provider<AuthData?>((ref) {
  return ref.watch(authControllerProvider).auth;
});
