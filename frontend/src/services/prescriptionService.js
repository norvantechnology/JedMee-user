import { apiGet } from "./apiClient.js";

export async function listPrescriptions(params) {
  return await apiGet("/prescriptions", { toast: "none", params });
}

export async function getPrescription(id) {
  return await apiGet(`/prescriptions/${encodeURIComponent(String(id))}`, { toast: "none" });
}
