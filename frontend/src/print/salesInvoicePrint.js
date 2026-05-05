import { openPrintDocument } from "./printDocument.js";
import medico from "../shared/print/medicoPrintDocuments.cjs";

export { esc } from "./printDocument.js";

export function buildSalesInvoiceHtml(data) {
  return medico.buildSalesInvoiceBodyHtml(data);
}

export function printSalesInvoiceDoc(data) {
  const inv = data?.invoice || {};
  return openPrintDocument({ title: `Invoice ${inv.invoice_number || ""}`, bodyHtml: buildSalesInvoiceHtml(data) });
}

export function printSalesInvoiceBulkDoc(documents = []) {
  const docs = Array.isArray(documents) ? documents : [];
  const bodyHtml = docs
    .map((d, idx) => {
      const pageBreak = idx < docs.length - 1 ? `<div style="break-after: page;"></div>` : "";
      return `${buildSalesInvoiceHtml(d)}${pageBreak}`;
    })
    .join("");
  return openPrintDocument({ title: `Sales Invoices (${docs.length})`, bodyHtml });
}
