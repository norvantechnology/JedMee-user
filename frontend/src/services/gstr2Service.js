import { apiGet } from "./apiClient.js";

/**
 * Fetch the GSTR-2 / ITC report for a given year and month.
 * @param {{ year: number, month: number }} params
 */
export async function getGstr2({ year, month }) {
  return await apiGet("/reports/gst-r2", {
    toast: "none",
    params: { year: String(year), month: String(month) },
  });
}