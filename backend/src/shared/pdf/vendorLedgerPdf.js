const { pdfToBuffer } = require("./pdfBuffer");
const { n, inr, safeFilePart } = require("./money");

/**
 * @param {object} ledgerDoc - { vendor, entries, summary, seller }
 * @returns {Promise<{ buffer: Buffer; filename: string }>}
 */
async function buildVendorLedgerPdfAttachment(ledgerDoc) {
  const vendor = ledgerDoc.vendor || {};
  const summary = ledgerDoc.summary || {};
  const entries = ledgerDoc.entries || [];
  const seller = ledgerDoc.seller || {};
  const buffer = await pdfToBuffer((pdf) => {
    pdf.fontSize(16).fillColor("#6b3fa0").text(String(seller.firm_name || seller.full_name || "Statement").slice(0, 120));
    pdf.moveDown(0.5);
    pdf.fontSize(11).fillColor("#4c2480").text("Supplier Ledger", { underline: true });
    pdf.moveDown(0.3);
    pdf.fontSize(10).fillColor("#1a0c30");
    pdf.text(`Supplier: ${vendor.name || ""}`);
    if (vendor.code) pdf.text(`Code: ${vendor.code}`);
    if (vendor.address) pdf.text(`Address: ${vendor.address}`);
    pdf.moveDown(0.4);
    pdf.fontSize(9).fillColor("#4c2480").text(
      `Net balance: ${inr(summary.net_balance)}  |  Type: ${summary.net_balance_type || "NIL"}`
    );
    pdf.moveDown(0.6);

    const left = pdf.page.margins.left;
    const usable = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
    const c1 = usable * 0.14;
    const c2 = usable * 0.22;
    const c3 = usable * 0.26;
    const c4 = usable * 0.12;
    const c5 = usable * 0.12;
    const c6 = usable * 0.14;
    let y = pdf.y;
    const rowH = 13;
    pdf.fontSize(8).fillColor("#4c2480");
    pdf.text("Date", left, y, { width: c1 });
    pdf.text("Type", left + c1, y, { width: c2 });
    pdf.text("Reference", left + c1 + c2, y, { width: c3 });
    pdf.text("Dr", left + c1 + c2 + c3, y, { width: c4, align: "right" });
    pdf.text("Cr", left + c1 + c2 + c3 + c4, y, { width: c5, align: "right" });
    pdf.text("Bal", left + c1 + c2 + c3 + c4 + c5, y, { width: c6, align: "right" });
    y += rowH;
    pdf.moveTo(left, y).lineTo(left + usable, y).stroke("#d0b8f0");
    y += 4;
    pdf.fontSize(8).fillColor("#1a0c30");
    for (const e of entries) {
      pdf.text(String(e.date || "").slice(0, 10), left, y, { width: c1 });
      pdf.text(String(e.type || "").replace(/_/g, " ").slice(0, 28), left + c1, y, { width: c2 });
      pdf.text(String(e.reference || "").slice(0, 36), left + c1 + c2, y, { width: c3 });
      const dr = n(e.debit);
      const cr = n(e.credit);
      pdf.text(dr ? inr(dr) : "", left + c1 + c2 + c3, y, { width: c4, align: "right" });
      pdf.text(cr ? inr(cr) : "", left + c1 + c2 + c3 + c4, y, { width: c5, align: "right" });
      pdf.text(inr(e.balance), left + c1 + c2 + c3 + c4 + c5, y, { width: c6, align: "right" });
      y += rowH;
      if (y > pdf.page.height - pdf.page.margins.bottom - 60) {
        pdf.addPage();
        y = pdf.page.margins.top;
      }
    }
    pdf.moveDown(1);
    pdf.fontSize(8).fillColor("#9870c8").text("This is an automated message. Please do not reply unless you have been asked to.");
  });
  const filename = `Supplier-Ledger-${safeFilePart(vendor.code || vendor.name)}.pdf`;
  return { buffer, filename };
}

module.exports = { buildVendorLedgerPdfAttachment };