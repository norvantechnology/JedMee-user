import { apiGet, apiPost } from "./apiClient.js";

export async function listMfgCompanies(params) {
  return await apiGet("/mfg-companies", { toast: "none", params });
}

export async function createMfgCompany(payload, opts) {
  return await apiPost("/mfg-companies", payload || {}, { toast: "none", ...opts });
}

export async function updateMfgCompany(id, payload) {
  return await apiPost(`/mfg-companies/${encodeURIComponent(String(id))}/update`, payload || {}, { toast: "none" });
}

export async function deleteMfgCompany(id) {
  return await apiPost(`/mfg-companies/${encodeURIComponent(String(id))}/delete`, {}, { toast: "none" });
}

export async function bulkDeleteMfgCompanies(ids) {
  return await apiPost("/mfg-companies/bulk-delete", { ids: ids || [] }, { toast: "none" });
}

export async function checkMfgCompanyUnique(params) {
  return await apiGet("/mfg-companies/check-unique", { toast: "none", params: params || {} });
}

export async function getMfgCompanyPolicyImpact(id) {
  return await apiGet(`/mfg-companies/${encodeURIComponent(String(id))}/policy-impact`, { toast: "none" });
}

