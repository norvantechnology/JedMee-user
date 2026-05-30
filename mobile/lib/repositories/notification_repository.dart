import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';

class NotificationRepository {
  NotificationRepository(this._client);

  final ApiClient _client;

  Future<ApiResponse> list([Map<String, dynamic>? params]) {
    return _client.get('/notifications', params: params);
  }

  Future<ApiResponse> getUnreadCount() {
    return _client.get('/notifications/unread-count');
  }

  Future<ApiResponse> markRead([Map<String, dynamic>? payload]) {
    return _client.post('/notifications/mark-read', payload ?? {});
  }

  /// Save or update the FCM device token for the current user.
  /// [deviceType] should be 'android' or 'ios'.
  Future<ApiResponse> saveFcmToken(String token, {String deviceType = 'android'}) {
    return _client.post('/notifications/fcm-token', {
      'token': token,
      'deviceType': deviceType,
    });
  }
}
