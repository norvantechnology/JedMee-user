import { apiGet, apiPost } from "./apiClient.js";

export async function getMe() {
  return await apiGet("/me", { toast: "none" });
}

export async function updateMe(payload) {
  return await apiPost("/me/update", payload || {});
}

