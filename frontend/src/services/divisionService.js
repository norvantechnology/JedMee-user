import { apiGet, apiPost } from "./apiClient.js";

export async function listDivisions(params) {
  return await apiGet("/divisions", { toast: "none", params });
}

export async function createDivision(payload, opts) {
  return await apiPost("/divisions", payload || {}, opts);
}

export async function updateDivision(id, payload) {
  return await apiPost(`/divisions/${encodeURIComponent(String(id))}/update`, payload || {});
}

export async function deleteDivision(id) {
  return await apiPost(`/divisions/${encodeURIComponent(String(id))}/delete`, {});
}

export async function getDivisionOutstanding(id) {
  return await apiGet(`/divisions/${encodeURIComponent(String(id))}/outstanding`, { toast: "none" });
}
