import { apiGet } from "./apiClient.js";

/**
 * Compact alert payload for the billing-screen ticker:
 *   { nonMoving: [...], thresholdDays, visibility }
 *
 * Heavy report lives under `/reports/non-moving`;
 * this endpoint is rate-limit friendly and shaped for a horizontal ticker.
 */
export async function getDashboardAlerts() {
  return await apiGet("/dashboard/alerts", { toast: "none" });
}

/**
 * Dashboard summary payload (KPIs + widgets) in one call.
 * Query params:
 *  - dateFrom/dateTo (YYYY-MM-DD)
 *  - recent_limit
 *  - expiry_days
 */
export async function getDashboardSummary(params) {
  return await apiGet("/dashboard/summary", { toast: "none", params: params || {} });
}
