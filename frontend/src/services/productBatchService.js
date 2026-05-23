import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./apiClient.js";

export async function listProductBatches(params) {
  return await apiGet("/api/product-batches", { toast: "none", params });
}

export async function findProductBatchByBarcode(barcode) {
  return await apiGet("/api/product-batches/by-barcode", {
    toast: "none",
    params: { barcode: String(barcode || "").trim() },
  });
}

export async function getProductBatch(id) {
  return await apiGet(`/api/product-batches/${encodeURIComponent(String(id))}`, { toast: "none" });
}

export async function createProductBatch(payload) {
  return await apiPost("/api/product-batches", payload || {}, { toast: "none" });
}

export async function updateProductBatch(id, payload) {
  return await apiPut(`/api/product-batches/${encodeURIComponent(String(id))}`, payload || {}, { toast: "none" });
}

export async function deleteProductBatch(id) {
  return await apiDelete(`/api/product-batches/${encodeURIComponent(String(id))}`, {}, { toast: "none" });
}

export async function bulkDeleteProductBatches(ids) {
  return await apiPost("/api/product-batches/bulk-delete", { ids: ids || [] }, { toast: "none" });
}

export async function checkProductBatch(productId, batchNo, excludeId, productCode) {
  return await apiGet("/api/product-batches/check", {
    toast: "none",
    params: {
      product_id: productId || "",
      product_code: productCode || "",
      batch_no: batchNo || "",
      exclude_id: excludeId || ""
    }
  });
}

export async function updateBatchLooseStock(id, payload) {
  return await apiPatch(`/product-batches/${encodeURIComponent(String(id))}/loose-stock`, payload || {}, { toast: "none" });
}

