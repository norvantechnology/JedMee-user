import { apiGet, apiPost, apiPut } from "./apiClient.js";

export async function listPurchaseReturns(params) {
  return await apiGet("/purchase-returns", { toast: "none", params });
}

export async function listPurchaseInvoices(params) {
  return await apiGet("/purchase-invoices", { toast: "none", params });
}

export async function getPurchaseInvoice(id) {
  return await apiGet(`/purchase-invoices/${encodeURIComponent(String(id))}`, { toast: "none" });
}

export async function createPurchaseInvoice(payload) {
  return await apiPost("/purchase-invoices", payload || {});
}

export async function updatePurchaseInvoice(id, payload) {
  return await apiPut(`/purchase-invoices/${encodeURIComponent(String(id))}`, payload || {});
}

export async function confirmPurchaseInvoice(id, payload) {
  return await apiPost(`/purchase-invoices/${encodeURIComponent(String(id))}/confirm`, payload || {});
}

export async function cancelPurchaseInvoice(id, payload) {
  return await apiPost(`/purchase-invoices/${encodeURIComponent(String(id))}/cancel`, payload || {});
}

/** Soft-delete: hides draft or cancelled invoice from UI (requires DELETE permission). */
export async function deletePurchaseInvoice(id) {
  return await apiPost(`/purchase-invoices/${encodeURIComponent(String(id))}/delete`, {}, { toast: "none" });
}

export async function bulkCancelPurchaseInvoices(ids, payload) {
  return await apiPost("/purchase-invoices/bulk-cancel", { ids: ids || [], ...(payload || {}) }, { toast: "none" });
}

export async function bulkConfirmPurchaseInvoices(payload) {
  return await apiPost("/purchase-invoices/bulk-confirm", payload || {}, { toast: "none" });
}

export async function sendPurchaseInvoicesByEmail(body) {
  return await apiPost("/purchase-invoices/send-email", body || {}, { toast: "none" });
}

export async function createPurchaseReturn(payload) {
  return await apiPost("/purchase-returns", payload || {}, { toast: "none" });
}

export async function confirmPurchaseReturn(id, payload) {
  return await apiPost(`/purchase-returns/${encodeURIComponent(String(id))}/confirm`, payload || {});
}

export async function listVendorPayments(params) {
  return await apiGet("/vendor-payments", { toast: "none", params });
}

export async function createVendorPayment(payload) {
  return await apiPost("/vendor-payments", payload || {});
}

export async function bulkCompleteVendorPayments(payload) {
  return await apiPost("/vendor-payments/bulk-settle", payload || {}, { toast: "none" });
}

export async function listDivisionPayments(params) {
  return await apiGet("/division-payments", { toast: "none", params });
}

export async function createDivisionPayment(payload) {
  return await apiPost("/division-payments", payload || {});
}

export async function bulkCompleteDivisionPayments(payload) {
  return await apiPost("/division-payments/bulk-settle", payload || {}, { toast: "none" });
}

export async function getVendorLedger(id) {
  return await apiGet(`/vendors/${encodeURIComponent(String(id))}/ledger`, { toast: "none" });
}

export async function sendVendorLedgerEmail(id) {
  return await apiPost(`/vendors/${encodeURIComponent(String(id))}/ledger/send-email`, {}, { toast: "none" });
}
