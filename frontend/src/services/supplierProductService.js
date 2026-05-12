import { apiGet, apiPost } from "./apiClient.js";

/**
 * List supplier-product mappings.
 * Supports filtering by vendorId, productId, divisionId, mfgCompanyId.
 */
export async function listSupplierProducts(params) {
  return await apiGet("/supplier-products", { toast: "none", params });
}

/**
 * Create or update a supplier-product mapping.
 * Payload: { vendorId, productId, divisionId?, mfgCompanyId?, typicalPurchaseRate?, notes?, isPreferred? }
 */
export async function upsertSupplierProduct(payload) {
  return await apiPost("/supplier-products", payload || {}, { toast: "none" });
}

/**
 * Delete a supplier-product mapping by its id.
 */
export async function deleteSupplierProduct(id) {
  return await apiPost(
    `/supplier-products/${encodeURIComponent(String(id))}/delete`,
    {},
    { toast: "none" }
  );
}