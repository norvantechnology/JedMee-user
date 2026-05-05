const { safeFilePart } = require("./money");
const { purchaseInvoiceDocToPdfBuffer } = require("./purchaseInvoiceHtmlPdf");

/**
 * Purchase invoice email attachment: same HTML/CSS as browser print, rendered to PDF via Puppeteer.
 * @param {object} doc — shape from getPurchaseInvoicePrintDoc
 * @returns {Promise<{ buffer: Buffer; filename: string }>}
 */
async function buildPurchaseInvoicePdfAttachment(doc) {
  const inv = doc.invoice || {};
  const buffer = await purchaseInvoiceDocToPdfBuffer(doc);
  const filename = `Purchase-Invoice-${safeFilePart(inv.invoice_number)}.pdf`;
  return { buffer, filename };
}

module.exports = { buildPurchaseInvoicePdfAttachment };
