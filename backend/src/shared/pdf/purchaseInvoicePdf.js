/**
 * Purchase invoice PDF — matches the browser print view layout.
 * Uses PDFKit (no Chromium/Puppeteer) for Lambda compatibility.
 */
const { pdfToBuffer } = require('./pdfBuffer');
const { n, inr, safeFilePart } = require('./money');
const {
  P, safeStr, ymd,
  drawInfoBox, drawTable, drawSectionLabel, drawHRule,
  drawPageHeader, drawPageFooter, drawSellerHeader, drawTotals,
} = require('./pdfLayout');

async function buildPurchaseInvoicePdfAttachment(doc) {
  const inv    = doc.invoice || {};
  const seller = doc.seller  || {};
  const items  = doc.items   || [];

  const invNumber = safeStr(inv.invoice_number || 'Purchase Invoice', 60);
  const status    = safeStr(inv.status || '', 30).toUpperCase();

  // Resolve vendor/division display name
  const vendorDisplay = (() => {
    if (inv.division_label || inv.division_name) {
      const base = inv.division_label || inv.division_name || '';
      return inv.division_mfg_name ? `${base} (${inv.division_mfg_name})` : base;
    }
    return inv.vendor_name || 'Supplier';
  })();

  const buffer = await pdfToBuffer((pdf) => {
    const ML = 36, MR = 36, MT = 36, MB = 48;
    const PW = pdf.page.width;
    const PH = pdf.page.height;
    const W  = PW - ML - MR;

    let y = MT;

    // ── Page header ───────────────────────────────────────────────────────────
    y = drawPageHeader(pdf, ML, y, W, invNumber, 'Purchase Invoice');
    y += 4;

    // ── Seller block ──────────────────────────────────────────────────────────
    y = drawSellerHeader(pdf, ML, y, W, seller, 'Purchase Invoice');
    y += 4;

    // ── Divider ───────────────────────────────────────────────────────────────
    drawHRule(pdf, ML, y, W, P.border);
    y += 10;

    // ── Two-column info boxes: INVOICE | SUPPLIER ─────────────────────────────
    const boxW = (W - 8) / 2;

    const invRows = [
      ['Invoice No',   inv.invoice_number],
      ['Invoice Date', ymd(inv.invoice_date)],
      ['Status',       safeStr(inv.status || '', 24)],
      ['Ref No',       safeStr(inv.vendor_invoice_number || inv.ref_number || '', 30)],
    ];

    const vendorPhone = [inv.vendor_phone_country_code, inv.vendor_phone_number]
      .filter(Boolean).join(' ');
    const supplierRows = [
      ['Name',     vendorDisplay],
      ['Phone',    vendorPhone],
      ['Email',    inv.vendor_email],
      ['Division', inv.division_label],
      ['GSTIN',    inv.vendor_gst_number],
    ];

    const leftBoxBottom  = drawInfoBox(pdf, ML,            y, boxW, 'Invoice',  invRows);
    const rightBoxBottom = drawInfoBox(pdf, ML + boxW + 8, y, boxW, 'Supplier', supplierRows);
    y = Math.max(leftBoxBottom, rightBoxBottom) + 12;

    // ── Items table ───────────────────────────────────────────────────────────
    y = drawSectionLabel(pdf, ML, y, W, 'Invoice Items');
    y += 4;

    const itemCols = [
      { label: '#',       w: 0.04, align: 'right' },
      { label: 'Product', w: 0.30, align: 'left'  },
      { label: 'Batch',   w: 0.09, align: 'left'  },
      { label: 'Exp',     w: 0.08, align: 'left'  },
      { label: 'Qty',     w: 0.06, align: 'right' },
      { label: 'Free',    w: 0.06, align: 'right' },
      { label: 'Rate',    w: 0.10, align: 'right' },
      { label: 'MRP',     w: 0.09, align: 'right' },
      { label: 'GST%',    w: 0.06, align: 'right' },
      { label: 'Amount',  w: 0.12, align: 'right' },
    ];

    const itemRows = items.map((it, idx) => [
      String(idx + 1),
      safeStr(it.product_name || it.drug_name || '—', 55),
      safeStr(it.batch_no || '', 14),
      ymd(it.expiry_date),
      n(it.qty).toString(),
      n(it.free_qty) ? n(it.free_qty).toString() : '',
      n(it.purchase_rate || it.rate) ? inr(it.purchase_rate || it.rate) : '',
      n(it.mrp) ? inr(it.mrp) : '',
      n(it.gst_percent) ? `${n(it.gst_percent)}%` : '',
      inr(it.line_total),
    ]);

    const itemTableH = 16 + itemRows.length * 14 + 20;
    if (y + itemTableH > PH - MB - 80) {
      pdf.addPage();
      y = MT;
    }

    y = drawTable(pdf, ML, y, W, itemCols, itemRows, { rowH: 14, fontSize: 8 });
    y += 14;

    // ── Totals ────────────────────────────────────────────────────────────────
    y = drawSectionLabel(pdf, ML, y, W, 'Totals');
    y += 6;

    const totRows = [
      ['Subtotal',     inv.subtotal_amount != null ? inr(inv.subtotal_amount) : null, false],
      ['Discount',     n(inv.discount_amount) ? inr(inv.discount_amount) : null, false],
      ['Taxable',      inv.taxable_amount != null ? inr(inv.taxable_amount) : null, false],
      ['GST',          inv.gst_amount != null ? inr(inv.gst_amount) : null, false],
      ['Round Off',    n(inv.round_off_amount) ? inr(inv.round_off_amount) : null, false],
      ['Total Amount', inv.total_amount != null ? inr(inv.total_amount) : null, true],
      ['Amount Paid',  inv.amount_paid != null ? inr(inv.amount_paid) : null, false, P.success],
      ['Balance Due',  inv.balance_due != null ? inr(inv.balance_due) : null, true,
        n(inv.balance_due) > 0 ? P.danger : P.success],
    ];

    drawTotals(pdf, ML, y, W, totRows, { fontSize: 8.5, rowH: 13 });
    y += totRows.filter(([, v]) => v != null).length * 13 + 14;

    // ── Tax breakdown (if available) ──────────────────────────────────────────
    const taxSummary = doc.tax_summary || [];
    if (taxSummary.length) {
      y = drawSectionLabel(pdf, ML, y, W * 0.5, 'GST Summary');
      y += 4;
      const gstCols = [
        { label: 'GST %',   w: 0.30, align: 'right' },
        { label: 'Taxable', w: 0.40, align: 'right' },
        { label: 'GST',     w: 0.30, align: 'right' },
      ];
      const gstRows = taxSummary.map(r => [
        `${n(r.gst_percent)}%`,
        inr(r.taxable_amount),
        inr(r.gst_amount),
      ]);
      y = drawTable(pdf, ML, y, W * 0.5, gstCols, gstRows, { rowH: 13, fontSize: 8 });
      y += 12;
    }

    // ── Page footer ───────────────────────────────────────────────────────────
    drawPageFooter(pdf, ML, PH - MB + 4, W, invNumber, status);
  });

  const filename = `Purchase-Invoice-${safeFilePart(inv.invoice_number || 'doc')}.pdf`;
  return { buffer, filename };
}

module.exports = { buildPurchaseInvoicePdfAttachment };
