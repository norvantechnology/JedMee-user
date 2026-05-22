import { apiGet, apiPost } from "./apiClient.js";

/**
 * Fetch the GSTR3B report for a given year and month.
 * @param {{ year: number, month: number }} params
 */
export async function getGstr3b({ year, month }) {
  return await apiGet("/reports/gst-r3b", {
    toast: "none",
    params: { year: String(year), month: String(month) },
  });
}

/**
 * File (lock) the GSTR3B for a given year and month.
 * Optionally pass the pre-built snapshot_data to avoid a re-calculation.
 * @param {{ year: number, month: number, snapshot_data?: object }} params
 */
export async function fileGstr3b({ year, month, snapshot_data }) {
  return await apiPost(
    `/reports/gst-r3b/${encodeURIComponent(String(year))}/${encodeURIComponent(String(month))}/file`,
    snapshot_data ? { snapshot_data } : {}
  );
}