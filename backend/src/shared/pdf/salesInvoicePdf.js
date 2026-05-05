const { safeFilePart } = require("./money");
const { salesInvoiceDocToPdfBuffer } = require("./salesInvoiceHtmlPdf");

/**
 * Sales invoice email attachment: same HTML/CSS as browser print, rendered to PDF via Puppeteer.
 * @param {object} doc — shape from getSalesInvoicePrintDoc
 * @returns {Promise<{ buffer: Buffer; filename: string }>}
 */
async function buildSalesInvoicePdfAttachment(doc) {
  const inv = doc.invoice || {};
  const buffer = await salesInvoiceDocToPdfBuffer(doc);
  const filename = `Sales-Invoice-${safeFilePart(inv.invoice_number)}.pdf`;
  return { buffer, filename };
}

module.exports = { buildSalesInvoicePdfAttachment };
