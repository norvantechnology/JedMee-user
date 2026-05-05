import { apiGet } from "./apiClient.js";

/**
 * Fetch active pricing plans from the public endpoint (no auth required).
 */
export async function getPublicPlans(opts) {
  return await apiGet("/public/plans", { ...opts, toast: opts?.toast ?? "none" });
}