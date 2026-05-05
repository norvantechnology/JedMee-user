const { pdfToBuffer } = require("./pdfBuffer");
const { n, inr, safeFilePart } = require("./money");

const COLOR_PRIMARY = "#6b3fa0";
const COLOR_HEADING = "#4c2480";
const COLOR_TEXT = "#1a0c30";
const COLOR_MUTED = "#9870c8";
const COLOR_LINE = "#d0b8f0";

function ymd(v) {
  return String(v || "").slice(0, 10);
}

function safeStr(s, max) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return max ? t.slice(0, max) : t;
}

/**
 * pdfkit-native sales invoice. No puppeteer, no Chromium, no frontend coupling.
 * Trades the browser-print HTML fidelity for something that works in Lambda.
 *
 * @param {object} doc — shape from getSalesInvoicePrintDoc
 * @returns {Promise<{ buffer: Buffer; filename: string }>}
 */
async function buildSalesInvoicePdfAttachment(doc) {
  const inv = doc.invoice || {};
  const seller = doc.seller || {};
  const items = doc.items || [];
  const taxSummary = doc.tax_summary || [];
  const sellerName = safeStr(seller.firm_name || seller.full_name || "Sales Invoice", 120);

  const buffer = await pdfToBuffer((pdf) => {
    const left = pdf.page.margins.left;
    const usable = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;

    pdf.fontSize(16).fillColor(COLOR_PRIMARY).text(sellerName);
    pdf.fontSize(9).fillColor(COLOR_TEXT);
    if (seller.address) pdf.text(safeStr(seller.address, 200));
    const sellerLine2 = [
      seller.phone_number ? `Phone: ${safeStr(seller.phone_number, 40)}` : "",
      seller.email ? `Email: ${safeStr(seller.email, 80)}` : "",
      seller.gst_number ? `GSTIN: ${safeStr(seller.gst_number, 40)}` : ""
    ].filter(Boolean).join("   |   ");
    if (sellerLine2) pdf.text(sellerLine2);
    pdf.moveDown(0.5);

    pdf.fontSize(13).fillColor(COLOR_HEADING).text("Sales Invoice", { underline: true });
    pdf.moveDown(0.3);

    const meta = [
      ["Invoice No", safeStr(inv.invoice_number, 40)],
      ["Date", ymd(inv.invoice_date)],
      ["Status", safeStr(inv.payment_status_resolved || inv.status, 24)]
    ];
    pdf.fontSize(10).fillColor(COLOR_TEXT);
    for (const [k, v] of meta) {
      if (!v) continue;
      pdf.font("Helvetica-Bold").text(`${k}: `, { continued: true });
      pdf.font("Helvetica").text(v);
    }
    pdf.moveDown(0.4);

    pdf.fontSize(10).fillColor(COLOR_HEADING).font("Helvetica-Bold").text("Bill To");
    pdf.fontSize(10).fillColor(COLOR_TEXT).font("Helvetica");
    pdf.text(safeStr(inv.customer_name || "Cash Customer", 120));
    if (inv.customer_address || inv.customer_city || inv.customer_state || inv.customer_pincode) {
      pdf.text(safeStr(
        [inv.customer_address, inv.customer_city, inv.customer_state, inv.customer_pincode]
          .filter(Boolean).join(", "),
        200
      ));
    }
    if (inv.customer_phone) pdf.text(`Phone: ${safeStr(inv.customer_phone, 40)}`);
    if (inv.customer_gst_number) pdf.text(`GSTIN: ${safeStr(inv.customer_gst_number, 40)}`);
    pdf.moveDown(0.6);

    const cols = [
      { label: "#",       w: usable * 0.04, align: "right"  },
      { label: "Item",    w: usable * 0.30, align: "left"   },
      { label: "Batch",   w: usable * 0.10, align: "left"   },
      { label: "Exp",     w: usable * 0.08, align: "left"   },
      { label: "Qty",     w: usable * 0.06, align: "right"  },
      { label: "Free",    w: usable * 0.06, align: "right"  },
      { label: "MRP",     w: usable * 0.08, align: "right"  },
      { label: "Rate",    w: usable * 0.08, align: "right"  },
      { label: "GST%",    w: usable * 0.06, align: "right"  },
      { label: "Amount",  w: usable * 0.14, align: "right"  }
    ];
    const xs = []; let acc = left;
    for (const c of cols) { xs.push(acc); acc += c.w; }

    let y = pdf.y;
    const headerH = 14;
    pdf.rect(left, y, usable, headerH).fill(COLOR_PRIMARY);
    pdf.fontSize(8).fillColor("#ffffff").font("Helvetica-Bold");
    cols.forEach((c, i) => {
      pdf.text(c.label, xs[i] + 3, y + 3, { width: c.w - 6, align: c.align });
    });
    y += headerH;
    pdf.font("Helvetica").fillColor(COLOR_TEXT).fontSize(8);

    const rowH = 13;
    items.forEach((it, idx) => {
      if (y > pdf.page.height - pdf.page.margins.bottom - 110) {
        pdf.addPage();
        y = pdf.page.margins.top;
      }
      const cells = [
        String(idx + 1),
        safeStr(it.product_name || it.drug_name, 60),
        safeStr(it.batch_no, 16),
        ymd(it.expiry_date),
        n(it.qty).toString(),
        n(it.free_qty) ? n(it.free_qty).toString() : "",
        n(it.mrp) ? inr(it.mrp) : "",
        n(it.sales_rate) ? inr(it.sales_rate) : "",
        n(it.gst_percent) ? `${n(it.gst_percent)}%` : "",
        inr(it.line_total)
      ];
      cols.forEach((c, i) => {
        pdf.text(cells[i], xs[i] + 3, y + 2, { width: c.w - 6, align: c.align });
      });
      y += rowH;
      pdf.moveTo(left, y).lineTo(left + usable, y).strokeColor(COLOR_LINE).lineWidth(0.3).stroke();
    });

    pdf.y = y + 8;
    pdf.fontSize(9).fillColor(COLOR_HEADING).font("Helvetica-Bold").text("Totals", { underline: true });
    pdf.moveDown(0.2);
    pdf.font("Helvetica").fontSize(10).fillColor(COLOR_TEXT);
    const totals = [
      ["Subtotal", inv.subtotal_amount],
      ["Discount", inv.discount_amount],
      ["Taxable", inv.taxable_amount],
      ["GST", inv.gst_amount],
      ["Round Off", inv.round_off_amount],
      ["Total", inv.total_amount],
      ["Paid", inv.amount_paid_resolved],
      ["Balance Due", inv.balance_due_resolved]
    ];
    for (const [k, v] of totals) {
      if (v == null || v === "") continue;
      pdf.font("Helvetica-Bold").text(`${k}: `, { continued: true, indent: 0 });
      pdf.font("Helvetica").text(inr(v));
    }

    if (taxSummary.length) {
      pdf.moveDown(0.4);
      pdf.fontSize(9).fillColor(COLOR_HEADING).font("Helvetica-Bold").text("Tax Breakdown", { underline: true });
      pdf.moveDown(0.2);
      pdf.font("Helvetica").fontSize(8).fillColor(COLOR_TEXT);
      for (const r of taxSummary) {
        pdf.text(`GST ${n(r.gst_percent)}% — Taxable ${inr(r.taxable_amount)}, Tax ${inr(r.gst_amount)}`);
      }
    }

    pdf.moveDown(1);
    pdf.fontSize(8).fillColor(COLOR_MUTED)
      .text("This is an automated email. Please do not reply unless asked to.");
  });

  const filename = `Sales-Invoice-${safeFilePart(inv.invoice_number)}.pdf`;
  return { buffer, filename };
}

module.exports = { buildSalesInvoicePdfAttachment };
