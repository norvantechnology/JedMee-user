const PDFDocument = require("pdfkit");

function pdfToBuffer(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4", bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc);
    } catch (e) {
      reject(e);
      return;
    }
    doc.end();
  });
}

module.exports = { pdfToBuffer };
