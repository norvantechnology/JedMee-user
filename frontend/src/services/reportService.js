import { apiGet } from "./apiClient.js";

/**
 * Retailer reports  these endpoints power the read-only "Reports" sidebar
 * group (KMS analogue: Product-Supplier Detail / Mfg-Stockist).
 */

export async function getProductSupplierReport(params) {
  return await apiGet("/reports/product-supplier", { toast: "none", params });
}

export async function getMfgStockistReport(params) {
  return await apiGet("/reports/mfg-stockist", { toast: "none", params });
}

export async function getNonMovingReport(params) {
  return await apiGet("/reports/non-moving", { toast: "none", params });
}

export async function getDayBookReport(params) {
  return await apiGet("/reports/day-book", { toast: "none", params });
}
