import { apiDelete, apiGet, apiPost, apiPut } from "./apiClient.js";

export async function bulkDeleteCustomers(ids) {
  return await apiPost("/customers/bulk-delete", { ids: ids || [] }, { toast: "none" });
}

export async function listCustomers(params) {
  return await apiGet("/customers", { toast: "none", params });
}

export async function getCustomer(id) {
  return await apiGet(`/customers/${encodeURIComponent(String(id))}`, { toast: "none" });
}

export async function createCustomer(payload, opts) {
  return await apiPost("/customers", payload || {}, opts);
}

export async function updateCustomer(id, payload, opts) {
  return await apiPut(`/customers/${encodeURIComponent(String(id))}`, payload || {}, opts);
}

export async function deleteCustomer(id) {
  return await apiDelete(`/customers/${encodeURIComponent(String(id))}`);
}

export async function getCustomerOutstanding(id) {
  return await apiGet(`/customers/${encodeURIComponent(String(id))}/outstanding`, { toast: "none" });
}

export async function printCustomerLedger(id) {
  return await apiGet(`/customers/${encodeURIComponent(String(id))}/ledger/print`, { toast: "none" });
}

export async function sendCustomerLedgerEmail(id) {
  return await apiPost(`/customers/${encodeURIComponent(String(id))}/ledger/send-email`, {}, { toast: "none" });
}
