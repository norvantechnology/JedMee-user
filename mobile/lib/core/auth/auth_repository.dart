import '../api/api_client.dart';
import '../api/api_response.dart';

/// Auth API endpoints — mirrors [frontend/src/services/authService.js].
class AuthRepository {
  AuthRepository(this._client);

  final ApiClient _client;

  Future<ApiResponse> login(Map<String, dynamic> payload) =>
      _client.post('/auth/login', payload);

  Future<ApiResponse> refresh(Map<String, dynamic> payload) =>
      _client.post('/auth/refresh', payload);

  Future<ApiResponse> logout([Map<String, dynamic>? payload]) =>
      _client.post('/auth/logout', payload ?? {});

  Future<ApiResponse> requestOtp(Map<String, dynamic> payload) =>
      _client.post('/auth/otp/request', payload);

  Future<ApiResponse> verifyOtp(Map<String, dynamic> payload) =>
      _client.post('/auth/otp/verify', payload);

  Future<ApiResponse> forgotPasswordRequest(Map<String, dynamic> payload) =>
      _client.post('/auth/password/forgot/request', payload);

  Future<ApiResponse> forgotPasswordReset(Map<String, dynamic> payload) =>
      _client.post('/auth/password/forgot/reset', payload);

  Future<ApiResponse> getMe() => _client.get('/me');

  Future<ApiResponse> getMyAccess() => _client.get('/access/me');

  Future<ApiResponse> signup(Map<String, dynamic> payload) =>
      _client.post('/registration', payload);
}
