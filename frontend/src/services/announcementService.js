import { apiGet } from "./apiClient.js";

export async function getAnnouncement(opts) {
  return await apiGet("/api/announcement", { ...opts, toast: opts?.toast ?? "none" });
}
