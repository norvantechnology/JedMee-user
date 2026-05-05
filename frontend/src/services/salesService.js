import { apiGet, apiPatch, apiPost, apiPut } from "./apiClient.js";

export async function listSalesInvoices(params) {
  return await apiGet("/sales-invoices", { toast: "none", params });
}

export async function getSalesInvoice(id) {
  return await apiGet(`/sales-invoices/${encodeURIComponent(String(id))}`, { toast: "none" });
}

export async function createSalesInvoice(payload) {
  return await apiPost("/sales-invoices", payload || {});
}

export async function updateSalesInvoice(id, payload) {
  return await apiPut(`/sales-invoices/${encodeURIComponent(String(id))}`, payload || {});
}

export async function changeSalesInvoiceRateType(id, rateType) {
  return await apiPatch(`/sales-invoices/${encodeURIComponent(String(id))}/rate-type`, { rateType }, { toast: "none" });
}

export async function applySalesInvoiceGlobalDiscount(id, globalDiscountPercent) {
  return await apiPatch(
    `/sales-invoices/${encodeURIComponent(String(id))}/global-discount`,
    { globalDiscountPercent },
    { toast: "none" }
  );
}

export async function overrideSalesInvoiceItemScheme(id, itemId, payload) {
  return await apiPost(`/sales-invoices/${encodeURIComponent(String(id))}/items/${encodeURIComponent(String(itemId))}/scheme`, payload || {}, { toast: "none" });
}

export async function recordSalesInvoiceLooseSale(id, payload) {
  return await apiPost(`/sales-invoices/${encodeURIComponent(String(id))}/loose-sale`, payload || {}, { toast: "none" });
}

export async function confirmSalesInvoice(id, payload) {
  return await apiPost(`/sales-invoices/${encodeURIComponent(String(id))}/confirm`, payload || {}, { toast: "none" });
}

export async function cancelSalesInvoice(id, payload) {
  return await apiPost(`/sales-invoices/${encodeURIComponent(String(id))}/cancel`, payload || {}, { toast: "none" });
}

export async function bulkCancelSalesInvoices(ids, payload) {
  return await apiPost("/sales-invoices/bulk-cancel", { ids: ids || [], ...(payload || {}) }, { toast: "none" });
}

export async function bulkConfirmSalesInvoices(payload) {
  return await apiPost("/sales-invoices/bulk-confirm", payload || {}, { toast: "none" });
}

export async function printSalesInvoice(id) {
  return await apiGet(`/sales-invoices/${encodeURIComponent(String(id))}/print`, { toast: "none" });
}

/** Email invoice PDF/summary to customers (per-invoice result in `data.results`). */
export async function sendSalesInvoicesByEmail(body) {
  return await apiPost("/sales-invoices/send-email", body || {}, { toast: "none" });
}

export async function bulkPrintSalesInvoices(ids) {
  return await apiPost("/sales-invoices/print-bulk", { ids: ids || [] }, { toast: "none" });
}

export async function findSalesBatchByBarcode(barcode) {
  return await apiGet("/sales-invoices/by-barcode", { toast: "none", params: { barcode } });
}

export async function listSalesReturns(params) {
  return await apiGet("/sales-returns", { toast: "none", params });
}

export async function getSalesReturn(id) {
  return await apiGet(`/sales-returns/${encodeURIComponent(String(id))}`, { toast: "none" });
}

export async function createSalesReturn(payload) {
  return await apiPost("/sales-returns", payload || {});
}

export async function confirmSalesReturn(id, payload) {
  return await apiPost(`/sales-returns/${encodeURIComponent(String(id))}/confirm`, payload || {});
}

export async function cancelSalesReturn(id, payload) {
  return await apiPost(`/sales-returns/${encodeURIComponent(String(id))}/cancel`, payload || {});
}

export async function listCustomerPayments(params) {
  return await apiGet("/customer-payments", { toast: "none", params });
}

export async function createCustomerPayment(payload) {
  return await apiPost("/customer-payments", payload || {});
}

export async function bulkCompleteCustomerPayments(payload) {
  return await apiPost("/customer-payments/bulk-settle", payload || {}, { toast: "none" });
}

export async function getCustomerLedger(id) {
  return await apiGet(`/customers/${encodeURIComponent(String(id))}/ledger/print`, { toast: "none" });
}
