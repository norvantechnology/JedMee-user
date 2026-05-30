import 'dart:convert';

/// Normalized API result — mirrors web `{ ok, data, message, error }` JSON.
class ApiResponse {
  ApiResponse({
    required this.status,
    Map<String, dynamic>? json,
    bool? ok,
    dynamic data,
    String? message,
    String? code,
  })  : _json = json != null ? Map<String, dynamic>.from(json) : null,
        _explicitOk = ok,
        _explicitData = data,
        _explicitMessage = message,
        _explicitCode = code;

  final int status;
  final Map<String, dynamic>? _json;
  final bool? _explicitOk;
  final dynamic _explicitData;
  final String? _explicitMessage;
  final String? _explicitCode;

  /// Raw JSON body when available.
  Map<String, dynamic>? get json => _json;

  bool get ok {
    if (_explicitOk != null) return _explicitOk!;
    if (_json != null) {
      return _json!['ok'] == true && status >= 200 && status < 300;
    }
    return status >= 200 && status < 300;
  }

  dynamic get data {
    if (_explicitData != null) return _explicitData;
    return _json?['data'];
  }

  String? get message {
    if (_explicitMessage != null && _explicitMessage!.isNotEmpty) {
      return _explicitMessage;
    }
    final m = _json?['message'];
    if (m != null && m.toString().isNotEmpty) return m.toString();
    return error?['message']?.toString();
  }

  String? get code {
    if (_explicitCode != null && _explicitCode!.isNotEmpty) return _explicitCode;
    final err = error;
    return err?['code']?.toString();
  }

  Map<String, dynamic>? get error {
    final e = _json?['error'];
    if (e is Map) return Map<String, dynamic>.from(e);
    return null;
  }

  factory ApiResponse.fromHttp(int status, String body) {
    if (body.isEmpty) {
      return ApiResponse(
        status: status,
        json: {'ok': status >= 200 && status < 300},
      );
    }
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map) {
        return ApiResponse.fromJson(status, Map<String, dynamic>.from(decoded));
      }
    } catch (_) {}
    return ApiResponse(status: status, json: {'ok': false, 'data': body});
  }

  factory ApiResponse.fromJson(int status, Map<String, dynamic> map) {
    final err = map['error'];
    String? code;
    String? message = map['message']?.toString();
    if (err is Map) {
      code = err['code']?.toString();
      message ??= err['message']?.toString();
    }
    final ok = map['ok'] == true && status >= 200 && status < 300;
    return ApiResponse(
      status: status,
      json: map,
      ok: ok,
      data: map['data'],
      message: message,
      code: code,
    );
  }

  /// Human-readable error for snackbars and inline form errors.
  String parseErrorMessage([String fallback = 'Something went wrong']) {
    if (message != null && message!.trim().isNotEmpty) return message!.trim();
    if (code != null && code!.trim().isNotEmpty) {
      return code!.replaceAll('_', ' ').toLowerCase();
    }
    if (data is Map) {
      final d = data as Map;
      final err = d['error'];
      if (err is Map) {
        final m = err['message']?.toString();
        if (m != null && m.isNotEmpty) return m;
      }
      final m = d['message']?.toString();
      if (m != null && m.isNotEmpty) return m;
    }
    return fallback;
  }
}
