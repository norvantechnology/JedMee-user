import { apiDelete, apiGet, apiPost, apiPut } from "./apiClient.js";

export async function listProducts(params) {
  return await apiGet("/products", { toast: "none", params });
}

export async function createProduct(payload, opts) {
  return await apiPost("/products", payload || {}, { toast: "none", ...opts });
}

export async function updateProduct(id, payload) {
  return await apiPut(`/products/${encodeURIComponent(String(id))}`, payload || {}, { toast: "none" });
}

export async function deleteProduct(id) {
  return await apiDelete(`/products/${encodeURIComponent(String(id))}`, {}, { toast: "none" });
}

export async function bulkDeleteProducts(ids) {
  return await apiPost("/products/bulk-delete", { ids: ids || [] }, { toast: "none" });
}

export async function checkProductCode(code, excludeId) {
  return await apiGet("/products/check-code", {
    toast: "none",
    params: { code, exclude_id: excludeId || "" }
  });
}

export async function checkProductName({ name, mfgCompanyId, divisionId, excludeId } = {}) {
  return await apiGet("/products/check-name", {
    toast: "none",
    params: {
      name: name || "",
      mfg_company_id: mfgCompanyId || "",
      division_id: divisionId || "",
      exclude_id: excludeId || ""
    }
  });
}

/**
 * Retailer counter-billing rich search: products + FIFO batches + suppliers
 * in one request (KMS Image 16). Used by the Sales Billing search popup.
 */
export async function searchProductsRich({
  q,
  includeBatches = true,
  includeSuppliers = true,
  stockOnly = true,
  limit = 25
} = {}) {
  return await apiGet("/products/rich-search", {
    toast: "none",
    params: {
      q: q || "",
      include_batches: includeBatches ? "true" : "false",
      include_suppliers: includeSuppliers ? "true" : "false",
      stock_only: stockOnly ? "true" : "false",
      limit
    }
  });
}
