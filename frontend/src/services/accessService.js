import { apiGet, apiPost } from "./apiClient.js";

export async function getMyAccess() {
  return await apiGet("/access/me", { toast: "none" });
}

export async function listPermissionResources() {
  return await apiGet("/access/permission-resources", { toast: "none" });
}

export async function listUserRoles(params) {
  return await apiGet("/access/roles", { params });
}

export async function createUserRole({ name }) {
  return await apiPost("/access/roles", { name });
}

export async function deleteUserRole(id) {
  return await apiPost(`/access/roles/${encodeURIComponent(String(id))}`, {});
}

export async function bulkDeleteUserRoles(ids) {
  return await apiPost("/access/bulk-delete-roles", { ids: ids || [] }, { toast: "none" });
}

export async function updateUserRole(roleId, payload) {
  return await apiPost(`/access/roles/${encodeURIComponent(String(roleId))}/update`, payload || {});
}

export async function listAccountUsers(params) {
  return await apiGet("/access/users", { params });
}

export async function createAccountUser(payload, opts) {
  return await apiPost("/access/users", payload || {}, opts);
}

export async function assignAccountUserRole(userId, roleId) {
  return await apiPost(`/access/users/${encodeURIComponent(String(userId))}/role`, { roleId });
}

export async function updateAccountUser(userId, payload) {
  return await apiPost(`/access/users/${encodeURIComponent(String(userId))}/update`, payload || {});
}

export async function deleteAccountUser(userId) {
  return await apiPost(`/access/users/${encodeURIComponent(String(userId))}/delete`, {});
}

export async function bulkDeleteAccountUsers(ids) {
  return await apiPost("/access/bulk-delete-users", { ids: ids || [] }, { toast: "none" });
}

export async function changeMyPassword(payload) {
  return await apiPost("/auth/password/change", payload || {});
}

