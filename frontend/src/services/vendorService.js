import { apiGet, apiPost } from "./apiClient.js";

export async function listVendors(params) {
  return await apiGet("/vendors", { toast: "none", params });
}

export async function createVendor(payload, opts) {
  return await apiPost("/vendors", payload || {}, opts);
}

export async function updateVendor(id, payload) {
  return await apiPost(`/vendors/${encodeURIComponent(String(id))}/update`, payload || {});
}

export async function deleteVendor(id) {
  return await apiPost(`/vendors/${encodeURIComponent(String(id))}/delete`, {});
}

export async function bulkDeleteVendors(ids) {
  return await apiPost("/vendors/bulk-delete", { ids: ids || [] }, { toast: "none" });
}

