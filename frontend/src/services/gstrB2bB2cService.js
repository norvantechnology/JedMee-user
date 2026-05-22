import { apiGet, apiPost } from "./apiClient.js";

/**
 * Fetch the B2B/B2C segregation report.
 * Supports month+year OR custom from_date+to_date.
 * @param {{ year?: number, month?: number, from_date?: string, to_date?: string, search?: string }} params
 */
export async function getGstrB2bB2c(params) {
  return await apiGet("/reports/gst-b2b-b2c", {
    toast: "none",
    params: Object.fromEntries(
      Object.entries(params || {})
        .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
        .map(([k, v]) => [k, String(v)])
    ),
  });
}

/**
 * Re-tag invoices for a customer after GSTIN is added/corrected.
 * @param {{ customer_id: string, invoice_ids: string[], reason?: string }} payload
 */
export async function retagB2bB2c(payload) {
  return await apiPost("/reports/gst-b2b-b2c/retag", payload || {});
}