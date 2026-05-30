import '../auth/auth_storage.dart';

/// Permission helpers — mirrors [frontend/src/utils/access.js].

/// Snapshot of user access for permission checks.
class AuthAccess {
  const AuthAccess({
    this.user,
    this.access,
  });

  final Map<String, dynamic>? user;
  final Map<String, dynamic>? access;

  bool get isOwner {
    if (access?['isAccountOwner'] == true) return true;
    final accountId = user?['account_id'] ?? user?['accountId'];
    final userId = user?['id'];
    if (accountId != null && userId != null) {
      return accountId.toString() == userId.toString();
    }
    return false;
  }

  Map<String, dynamic> get permissions {
    final p = access?['permissions'];
    if (p is Map) return Map<String, dynamic>.from(p);
    return {};
  }

  /// Alias used by navigation shell.
  Map<String, dynamic> get perms => permissions;
}

AuthAccess? resolveAuthAccess(dynamic auth) {
  if (auth == null) return null;
  if (auth is AuthAccess) return auth;
  if (auth is AuthData) {
    return AuthAccess(user: auth.user, access: auth.access);
  }
  return null;
}

bool can(dynamic auth, String resource, String action) {
  final a = resolveAuthAccess(auth);
  if (a == null) return false;
  if (a.isOwner) return true;
  final r = resource.toUpperCase();
  final act = action.toUpperCase();
  final block = a.permissions[r];
  if (block is Map) {
    final v = block[act];
    return v == true || v == 1;
  }
  return false;
}

String getRoleCode(dynamic auth) {
  final a = resolveAuthAccess(auth);
  final code = (a?.access?['roleCode'] ??
          a?.user?['role'] ??
          '')
      .toString()
      .toUpperCase();
  return code == 'RETAILER' ? 'RETAILER' : 'WHOLESALER';
}

bool isRetailer(dynamic auth) => getRoleCode(auth) == 'RETAILER';

bool isOwner(dynamic auth) => resolveAuthAccess(auth)?.isOwner ?? false;

/// Mirrors [frontend/src/utils/access.js] `getAccessSnapshot`.
AuthAccess getAccessSnapshot(dynamic auth) {
  return resolveAuthAccess(auth) ??
      const AuthAccess(user: null, access: null);
}
