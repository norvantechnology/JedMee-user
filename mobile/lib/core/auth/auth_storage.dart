import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../config/app_config.dart';

/// Persisted auth payload mirroring frontend authStorage.js shape.
class AuthData {

  factory AuthData.fromJson(Map<String, dynamic> json) {
    return AuthData(
      rememberMe: json['rememberMe'] == true,
      email: (json['email'] ?? '').toString(),
      accessToken: (json['accessToken'] ?? '').toString(),
      accessExpiresAt: (json['accessExpiresAt'] as num?)?.toInt() ?? 0,
      refreshToken: (json['refreshToken'] ?? '').toString(),
      user: _mapOrNull(json['user']),
      access: _mapOrNull(json['access']),
    );
  }
  const AuthData({
    required this.rememberMe,
    required this.email,
    required this.accessToken,
    required this.accessExpiresAt,
    required this.refreshToken,
    this.user,
    this.access,
  });

  final bool rememberMe;
  final String email;
  final String accessToken;
  final int accessExpiresAt;
  final String refreshToken;
  final Map<String, dynamic>? user;
  final Map<String, dynamic>? access;

  Map<String, dynamic> toJson() => {
        'rememberMe': rememberMe,
        'email': email,
        'accessToken': accessToken,
        'accessExpiresAt': accessExpiresAt,
        'refreshToken': refreshToken,
        'user': user,
        'access': access,
      };

  AuthData copyWith({
    bool? rememberMe,
    String? email,
    String? accessToken,
    int? accessExpiresAt,
    String? refreshToken,
    Map<String, dynamic>? user,
    Map<String, dynamic>? access,
  }) {
    return AuthData(
      rememberMe: rememberMe ?? this.rememberMe,
      email: email ?? this.email,
      accessToken: accessToken ?? this.accessToken,
      accessExpiresAt: accessExpiresAt ?? this.accessExpiresAt,
      refreshToken: refreshToken ?? this.refreshToken,
      user: user ?? this.user,
      access: access ?? this.access,
    );
  }

  static Map<String, dynamic>? _mapOrNull(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return null;
  }
}

/// Secure token storage using flutter_secure_storage.
/// Tokens (access + refresh) are stored encrypted — never in plain SharedPreferences.
/// On first run, migrates any legacy SharedPreferences data automatically.
class AuthStorage {
  AuthStorage();

  /// flutter_secure_storage with platform-specific hardening.
  static const _secure = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  final StreamController<void> _authChanged = StreamController<void>.broadcast();
  bool _initialized = false;

  static String get _storageKey => '${AppConfig.appStorageNs}_auth_v1';
  static String get _legacyStorageKey =>
      '${AppConfig.legacyStoragePrefix}_auth_v1';

  Stream<void> get onAuthChanged => _authChanged.stream;

  Future<void> ensureInitialized() async {
    if (_initialized) return;
    _initialized = true;
    await _migrateLegacyAuthIfPresent();
  }

  Future<AuthData?> readAuth() async {
    await ensureInitialized();

    try {
      final current = await _secure.read(key: _storageKey);
      final parsed = _safeJsonParse(current);
      if (parsed != null &&
          (parsed['refreshToken'] ?? '').toString().isNotEmpty) {
        return AuthData.fromJson(parsed);
      }
    } catch (_) {
      // Secure storage read failure — treat as unauthenticated.
    }

    return null;
  }

  Future<void> saveAuth({
    required bool rememberMe,
    required String email,
    required String accessToken,
    required int accessExpiresInSec,
    required String refreshToken,
    Map<String, dynamic>? user,
    Map<String, dynamic>? access,
  }) async {
    await ensureInitialized();

    final existing = await readAuth();
    final sameIdentity =
        existing?.email.isNotEmpty == true &&
        existing!.email == email.toString();

    final payload = AuthData(
      rememberMe: rememberMe,
      email: email.toString(),
      accessToken: accessToken.toString(),
      accessExpiresAt:
          DateTime.now().millisecondsSinceEpoch + accessExpiresInSec * 1000,
      refreshToken: refreshToken.toString(),
      user: user ?? (sameIdentity ? existing.user : null),
      access: access ?? (sameIdentity ? existing.access : null),
    );

    await _secure.write(
      key: _storageKey,
      value: jsonEncode(payload.toJson()),
    );
    _emitAuthChanged();
  }

  Future<void> saveAuthUser(Map<String, dynamic>? user) async {
    await ensureInitialized();
    final existing = await readAuth();
    if (existing == null || existing.refreshToken.isEmpty) return;

    final next = existing.copyWith(user: user);
    await _secure.write(
      key: _storageKey,
      value: jsonEncode(next.toJson()),
    );
    _emitAuthChanged();
  }

  Future<void> saveAuthAccess(Map<String, dynamic>? access) async {
    await ensureInitialized();
    final existing = await readAuth();
    if (existing == null || existing.refreshToken.isEmpty) return;

    final next = existing.copyWith(access: access);
    await _secure.write(
      key: _storageKey,
      value: jsonEncode(next.toJson()),
    );
    _emitAuthChanged();
  }

  Future<void> clearAuth() async {
    await ensureInitialized();
    await _secure.delete(key: _storageKey);
    await _secure.delete(key: _legacyStorageKey);
    // Also clear any residual SharedPreferences data.
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_storageKey);
      await prefs.remove(_legacyStorageKey);
    } catch (_) {}
    _emitAuthChanged();
  }

  bool hasValidAccessToken(AuthData? auth) {
    if (auth == null || auth.accessToken.isEmpty) return false;
    if (auth.accessExpiresAt <= 0) return false;
    return auth.accessExpiresAt > DateTime.now().millisecondsSinceEpoch + 10000;
  }

  /// Migrate legacy SharedPreferences auth data to flutter_secure_storage.
  /// Runs once on first launch after upgrade.
  Future<void> _migrateLegacyAuthIfPresent() async {
    try {
      // Already in secure storage — nothing to migrate.
      final existing = await _secure.read(key: _storageKey);
      if (existing != null) return;

      final prefs = await SharedPreferences.getInstance();

      // Try current key first, then legacy key.
      final raw = prefs.getString(_storageKey) ??
          prefs.getString(_legacyStorageKey);

      if (raw == null) return;

      final parsed = _safeJsonParse(raw);
      if (parsed == null ||
          (parsed['refreshToken'] ?? '').toString().isEmpty) {
        return;
      }

      // Write to secure storage.
      await _secure.write(key: _storageKey, value: raw);

      // Remove from SharedPreferences.
      await prefs.remove(_storageKey);
      await prefs.remove(_legacyStorageKey);
    } catch (_) {
      // Migration failure is non-fatal — user will need to log in again.
    }
  }

  Map<String, dynamic>? _safeJsonParse(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } catch (_) {
      // ignore
    }
    return null;
  }

  void _emitAuthChanged() {
    if (!_authChanged.isClosed) {
      _authChanged.add(null);
    }
  }

  void dispose() {
    _authChanged.close();
  }
}
