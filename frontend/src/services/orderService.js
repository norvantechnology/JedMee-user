import { apiDelete, apiGet, apiPatch, apiPost } from "./apiClient.js";

export async function getMyCatalog(params) {
  return await apiGet("/catalog/my-catalog", { params });
}
export async function addCatalogProduct(payload) {
  return await apiPost("/catalog/add-product", payload || {});
}
export async function updateCatalogProduct(id, payload) {
  return await apiPatch(`/catalog/${encodeURIComponent(String(id))}`, payload || {});
}
export async function deleteCatalogProduct(id) {
  return await apiDelete(`/catalog/${encodeURIComponent(String(id))}`, {});
}
export async function bulkCatalogVisibility(payload) {
  return await apiPost("/catalog/bulk-visibility", payload || {});
}
export async function browseWholesalers() {
  return await apiGet("/catalog/wholesalers");
}
export async function browseCatalog(params) {
  return await apiGet("/catalog/browse", { params });
}

export async function placeOrder(payload) {
  return await apiPost("/orders", payload || {}, { toast: "none" });
}
export async function listMyOrders(params) {
  return await apiGet("/orders/my-orders", { params });
}
export async function listIncomingOrders(params) {
  return await apiGet("/orders/incoming", { params });
}
export async function getOrderById(id) {
  return await apiGet(`/orders/${encodeURIComponent(String(id))}`);
}
export async function getWholesalerOrderView(id) {
  return await apiGet(`/orders/${encodeURIComponent(String(id))}/wholesaler-view`);
}
export async function acceptOrder(id, payload) {
  return await apiPost(`/orders/${encodeURIComponent(String(id))}/accept`, payload || {}, { toast: "none" });
}
export async function rejectOrder(id, payload) {
  return await apiPost(`/orders/${encodeURIComponent(String(id))}/reject`, payload || {}, { toast: "none" });
}
export async function dispatchOrder(id) {
  return await apiPost(`/orders/${encodeURIComponent(String(id))}/dispatch`, {}, { toast: "none" });
}
export async function cancelOrderRetailer(id, payload) {
  return await apiPost(`/orders/${encodeURIComponent(String(id))}/cancel`, payload || {}, { toast: "none" });
}
export async function cancelOrderWholesaler(id, payload) {
  return await apiPost(`/orders/${encodeURIComponent(String(id))}/cancel-by-wholesaler`, payload || {}, { toast: "none" });
}
export async function confirmDelivery(id) {
  return await apiPost(`/orders/${encodeURIComponent(String(id))}/confirm-delivery`, {}, { toast: "none" });
}
export async function createPurchaseFromOrder(id, payload) {
  return await apiPost(`/orders/${encodeURIComponent(String(id))}/create-purchase`, payload || {}, { toast: "none" });
}

export async function requestWholesalerLink(payload) {
  return await apiPost("/wholesaler-links/connect", payload || {});
}
export async function listMyWholesalerLinks() {
  return await apiGet("/wholesaler-links/my-connections");
}
export async function updateWholesalerLink(id, payload) {
  return await apiPatch(`/wholesaler-links/${encodeURIComponent(String(id))}`, payload || {});
}

