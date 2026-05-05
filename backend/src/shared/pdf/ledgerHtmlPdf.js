const { getBrowser } = require("./puppeteerBrowser");
const { buildLedgerHtml } = require("./ledgerHtml");
const { safeFilePart } = require("./money");

/**
 * Render a ledger document to a PDF buffer using puppeteer (full CSS support).
 *
 * @param {object} p
 * @param {"Customer"|"Supplier"} p.partyType
 * @param {{ name:string, code?:string, address?:string }} p.party
 * @param {Array} p.entries
 * @param {object} p.summary
 * @param {object} [p.seller]
 * @param {{ from?:string, to?:string }} [p.dateRange]
 * @returns {Promise<{ buffer: Buffer; filename: string }>}
 */
async function ledgerDocToPdfAttachment({ partyType, party, entries, summary, seller, dateRange }) {
  const html = buildLedgerHtml({ partyType, party, entries, summary, seller, dateRange });
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "load", timeout: 45000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });
    const buffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    const label = partyType === "Supplier" ? "Supplier-Ledger" : "Customer-Ledger";
    const filename = `${label}-${safeFilePart(party.code || party.name)}.pdf`;
    return { buffer, filename };
  } finally {
    try { await page.close(); } catch { /* ignore */ }
  }
}

module.exports = { ledgerDocToPdfAttachment };