import { apiGet, apiPost } from "./apiClient.js";

export async function listNotifications(params) {
  return await apiGet("/notifications", { toast: "none", params: params || {} });
}

export async function getUnreadNotificationCount() {
  return await apiGet("/notifications/unread-count", { toast: "none" });
}

export async function markNotificationsRead(payload) {
  return await apiPost("/notifications/mark-read", payload || {}, { toast: "none" });
}

export async function broadcastNotifications(payload) {
  return await apiPost("/notifications/broadcast", payload || {}, { toast: "auto" });
}
