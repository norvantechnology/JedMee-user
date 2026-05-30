import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';

/// Mirrors [frontend/src/services/mfgCompanyService.js].
class MfgRepository {
  MfgRepository(this._client);

  final ApiClient _client;

  Future<ApiResponse> list([Map<String, dynamic>? params]) =>
      _client.get('/mfg-companies', params: params);

  Future<ApiResponse> get(Object id) =>
      _client.get('/mfg-companies/${Uri.encodeComponent(id.toString())}');

  Future<ApiResponse> create([Map<String, dynamic>? payload]) =>
      _client.post('/mfg-companies', payload ?? {});

  Future<ApiResponse> update(Object id, [Map<String, dynamic>? payload]) =>
      _client.post(
        '/mfg-companies/${Uri.encodeComponent(id.toString())}/update',
        payload ?? {},
      );

  Future<ApiResponse> delete(Object id) => _client.post(
        '/mfg-companies/${Uri.encodeComponent(id.toString())}/delete',
        {},
      );

  Future<ApiResponse> bulkDelete(List<Object> ids) =>
      _client.post('/mfg-companies/bulk-delete', {'ids': ids});
}
