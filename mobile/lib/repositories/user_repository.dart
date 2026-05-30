import 'package:jedmee_mobile/core/api/api_client.dart';
import 'package:jedmee_mobile/core/api/api_response.dart';

/// Account users, roles, and profile — mirrors [frontend/src/services/accessService.js]
/// and [frontend/src/services/userService.js].
class UserRepository {
  UserRepository(this._client);

  final ApiClient _client;

  // ── Profile (current user) ───────────────────────────────────────────────

  Future<ApiResponse> getMe() => _client.get('/me');

  Future<ApiResponse> getMyAccess() => _client.get('/access/me');

  Future<ApiResponse> listPermissionResources() =>
      _client.get('/access/permission-resources');

  Future<ApiResponse> updateMe([Map<String, dynamic>? payload]) =>
      _client.post('/me/update', payload ?? {});

  Future<ApiResponse> updateProfile([Map<String, dynamic>? payload]) =>
      updateMe(payload);

  // ── Account users ──────────────────────────────────────────────────────────

  Future<ApiResponse> listAccountUsers([Map<String, dynamic>? params]) =>
      _client.get('/access/users', params: params);

  Future<ApiResponse> createAccountUser([Map<String, dynamic>? payload]) =>
      _client.post('/access/users', payload ?? {});

  Future<ApiResponse> updateAccountUser(
    Object id, [
    Map<String, dynamic>? payload,
  ]) =>
      _client.post(
        '/access/users/${Uri.encodeComponent(id.toString())}/update',
        payload ?? {},
      );

  Future<ApiResponse> deleteAccountUser(Object id) => _client.post(
        '/access/users/${Uri.encodeComponent(id.toString())}/delete',
        {},
      );

  Future<ApiResponse> bulkDeleteAccountUsers(List<Object> ids) =>
      _client.post('/access/bulk-delete-users', {'ids': ids});

  Future<ApiResponse> assignAccountUserRole(Object userId, Object roleId) =>
      _client.post(
        '/access/users/${Uri.encodeComponent(userId.toString())}/role',
        {'roleId': roleId},
      );

  // ── Roles ──────────────────────────────────────────────────────────────────

  Future<ApiResponse> listUserRoles([Map<String, dynamic>? params]) =>
      _client.get('/access/roles', params: params);

  Future<ApiResponse> createUserRole({required String name}) =>
      _client.post('/access/roles', {'name': name});

  Future<ApiResponse> updateUserRole(
    Object roleId, [
    Map<String, dynamic>? payload,
  ]) =>
      _client.post(
        '/access/roles/${Uri.encodeComponent(roleId.toString())}/update',
        payload ?? {},
      );

  Future<ApiResponse> deleteUserRole(Object id) => _client.post(
        '/access/roles/${Uri.encodeComponent(id.toString())}',
        {},
      );

  Future<ApiResponse> bulkDeleteUserRoles(List<Object> ids) =>
      _client.post('/access/bulk-delete-roles', {'ids': ids});

  // ── Legacy aliases (do not use wrong /users or /roles paths) ───────────────

  @Deprecated('Use listAccountUsers')
  Future<ApiResponse> list([Map<String, dynamic>? params]) =>
      listAccountUsers(params);

  @Deprecated('Use listUserRoles')
  Future<ApiResponse> listRoles() => listUserRoles();

  @Deprecated('Use createAccountUser')
  Future<ApiResponse> create([Map<String, dynamic>? payload]) =>
      createAccountUser(payload);

  @Deprecated('Use updateAccountUser')
  Future<ApiResponse> update(Object id, [Map<String, dynamic>? payload]) =>
      updateAccountUser(id, payload);

  @Deprecated('Use deleteAccountUser')
  Future<ApiResponse> delete(Object id) => deleteAccountUser(id);
}
