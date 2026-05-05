const path = require("path");
const { getBrowser } = require("./puppeteerBrowser");

const shared = require(path.join(__dirname, "../../../../frontend/src/shared/print/medicoPrintDocuments.cjs"));

/**
 * Produce PDF bytes identical in layout/CSS to browser print purchase invoice.
 *
 * @param {object} doc — shape from `getPurchaseInvoicePrintDoc`
 * @returns {Promise<Buffer>}
 */
async function purchaseInvoiceDocToPdfBuffer(doc) {
  const html = shared.buildPurchaseInvoiceCompleteHtmlDocument(doc, {
    title: `Purchase Invoice ${doc?.invoice?.invoice_number || ""}`.trim()
  });
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "load", timeout: 45000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true
    });
    return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  } finally {
    try {
      await page.close();
    } catch {
      /* ignore */
    }
  }
}

module.exports = { purchaseInvoiceDocToPdfBuffer };