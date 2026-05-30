import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../../config/app_config.dart';

// ─── Action ID constants ──────────────────────────────────────────────────────

/// Action ID for the "Accept Order" notification button.
const kActionAcceptOrder = 'ACCEPT_ORDER';

/// Action ID for the "Cancel Order" notification button.
const kActionCancelOrder = 'CANCEL_ORDER';

// ─── Storage key (must match AuthStorage._storageKey) ────────────────────────

const _kStorageKey = 'jedmee_auth_v1';

/// Secure storage instance — same options as [AuthStorage] so the same
/// encrypted entry is readable from both the main isolate and background isolates.
const _kSecure = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
  iOptions: IOSOptions(
    accessibility: KeychainAccessibility.first_unlock_this_device,
  ),
);

// ─── Public API ───────────────────────────────────────────────────────────────

/// Handle a notification action button tap.
///
/// Safe to call from both the main isolate (foreground) and background isolates
/// (app in background / terminated). Uses [http] and [flutter_secure_storage]
/// directly — no Riverpod or BuildContext required.
///
/// [actionId] — one of [kActionAcceptOrder] or [kActionCancelOrder].
/// [payload]  — JSON string stored in the local notification payload, containing
///              at minimum `{ "orderId": "...", "orderNumber": "..." }`.
Future<void> handleNotificationAction(String actionId, String payload) async {
  try {
    final data = _parsePayload(payload);
    final orderId = (data['orderId'] ?? '').toString().trim();
    if (orderId.isEmpty) return;

    final orderStatus = (data['orderStatus'] ??
            data['order_status'] ??
            data['status'] ??
            '')
        .toString()
        .toUpperCase();
    if (orderStatus.isNotEmpty && orderStatus != 'PENDING') return;

    final token = await _readAccessToken();
    if (token == null || token.isEmpty) return;

    final baseUrl = AppConfig.getApiBaseUrl();

    switch (actionId) {
      case kActionAcceptOrder:
        await _post(
          url: '$baseUrl/orders/${Uri.encodeComponent(orderId)}/accept',
          token: token,
        );
        break;

      case kActionCancelOrder:
        await _post(
          url: '$baseUrl/orders/${Uri.encodeComponent(orderId)}/cancel-by-wholesaler',
          token: token,
          body: {'reason': 'Cancelled from notification'},
        );
        break;
    }
  } catch (_) {
    // Swallow — background isolate cannot show UI; failure is non-fatal.
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

Map<String, dynamic> _parsePayload(String payload) {
  if (payload.isEmpty) return {};
  try {
    final decoded = jsonDecode(payload);
    if (decoded is Map<String, dynamic>) return decoded;
    if (decoded is Map) return Map<String, dynamic>.from(decoded);
  } catch (_) {}
  return {};
}

Future<String?> _readAccessToken() async {
  try {
    final raw = await _kSecure.read(key: _kStorageKey);
    if (raw == null || raw.isEmpty) return null;
    final decoded = jsonDecode(raw);
    if (decoded is Map) return (decoded['accessToken'] ?? '').toString();
  } catch (_) {}
  return null;
}

Future<void> _post({
  required String url,
  required String token,
  Map<String, dynamic>? body,
}) async {
  final client = http.Client();
  try {
    final request = http.Request('POST', Uri.parse(url))
      ..headers.addAll({
        'accept': 'application/json',
        'content-type': 'application/json',
        'Authorization': 'Bearer $token',
      })
      ..body = jsonEncode(body ?? {});
    await client.send(request).timeout(const Duration(seconds: 15));
  } finally {
    client.close();
  }
}