/**
 * Sales invoice PDF — matches the browser print view layout.
 * Uses PDFKit (no Chromium/Puppeteer) for Lambda compatibility.
 */
const { pdfToBuffer } = require('./pdfBuffer');
const { n, inr, safeFilePart } = require('./money');
const {
  P, safeStr, ymd,
  drawInfoBox, drawTable, drawSectionLabel, drawHRule,
  drawPageHeader, drawPageFooter, drawSellerHeader, drawTotals,
} = require('./pdfLayout');

async function buildSalesInvoicePdfAttachment(doc) {
  const inv        = doc.invoice    || {};
  const seller     = doc.seller     || {};
  const items      = doc.items      || [];
  const taxSummary = doc.tax_summary || [];
  const payments   = doc.payments   || [];

  const invNumber  = safeStr(inv.invoice_number || 'Sales Invoice', 60);
  const status     = safeStr(inv.payment_status_resolved || inv.status || '', 30).toUpperCase();

  const buffer = await pdfToBuffer((pdf) => {
    const ML = 36, MR = 36, MT = 36, MB = 48;
    const PW = pdf.page.width;
    const PH = pdf.page.height;
    const W  = PW - ML - MR;   // usable width ≈ 523pt

    let y = MT;

    // ── Page header (date | invoice number) ──────────────────────────────────
    y = drawPageHeader(pdf, ML, y, W, invNumber, 'Sales Invoice');
    y += 4;

    // ── Seller block ─────────────────────────────────────────────────────────
    y = drawSellerHeader(pdf, ML, y, W, seller, 'Sales Invoice');
    y += 4;

    // ── Divider ──────────────────────────────────────────────────────────────
    drawHRule(pdf, ML, y, W, P.border);
    y += 10;

    // ── Two-column info boxes: INVOICE | CUSTOMER ─────────────────────────────
    const boxW = (W - 8) / 2;

    const invRows = [
      ['Invoice No',   inv.invoice_number],
      ['Invoice Date', ymd(inv.invoice_date)],
      ['Status',       safeStr(inv.status || '', 24)],
      ['Payment',      safeStr(inv.payment_status_resolved || inv.payment_status || '', 24)],
    ];
    const custRows = [
      ['Name',    inv.customer_name || 'Walk-in / Counter Sale'],
      ['Phone',   inv.customer_phone],
      ['GST',     inv.customer_gst_number],
      ['Address', [inv.customer_address, inv.customer_city, inv.customer_state, inv.customer_pincode].filter(Boolean).join(', ')],
    ];

    const leftBoxBottom  = drawInfoBox(pdf, ML,          y, boxW, 'Invoice',  invRows);
    const rightBoxBottom = drawInfoBox(pdf, ML + boxW + 8, y, boxW, 'Customer', custRows);
    y = Math.max(leftBoxBottom, rightBoxBottom) + 12;

    // ── Items table ───────────────────────────────────────────────────────────
    y = drawSectionLabel(pdf, ML, y, W, 'Invoice Items');
    y += 4;

    const itemCols = [
      { label: '#',       w: 0.04, align: 'right'  },
      { label: 'Product', w: 0.28, align: 'left'   },
      { label: 'Batch',   w: 0.09, align: 'left'   },
      { label: 'Exp',     w: 0.08, align: 'left'   },
      { label: 'Qty',     w: 0.05, align: 'right'  },
      { label: 'Free',    w: 0.05, align: 'right'  },
      { label: 'MRP',     w: 0.08, align: 'right'  },
      { label: 'Rate',    w: 0.08, align: 'right'  },
      { label: 'Disc',    w: 0.07, align: 'right'  },
      { label: 'GST%',    w: 0.06, align: 'right'  },
      { label: 'Amount',  w: 0.12, align: 'right'  },
    ];

    const itemRows = items.map((it, idx) => [
      String(idx + 1),
      safeStr(it.product_name || it.drug_name || '—', 50),
      safeStr(it.batch_no || '', 14),
      ymd(it.expiry_date),
      n(it.qty).toString(),
      n(it.free_qty) ? n(it.free_qty).toString() : '',
      n(it.mrp) ? inr(it.mrp) : '',
      n(it.sales_rate || it.rate) ? inr(it.sales_rate || it.rate) : '',
      n(it.discount_amount) ? inr(it.discount_amount) : '0.00',
      n(it.gst_percent) ? `${n(it.gst_percent)}%` : '',
      inr(it.line_total),
    ]);

    // Check if items fit on current page; add page if needed
    const itemTableH = 16 + itemRows.length * 14 + 20;
    if (y + itemTableH > PH - MB - 80) {
      pdf.addPage();
      y = MT;
    }

    y = drawTable(pdf, ML, y, W, itemCols, itemRows, { rowH: 14, fontSize: 8 });
    y += 14;

    // ── GST Summary + Totals (two columns) ────────────────────────────────────
    const gstW  = W * 0.42;
    const totW  = W * 0.55;
    const totX  = ML + W - totW;
    const gstX  = ML;

    // GST Summary table (left)
    if (taxSummary.length) {
      y = drawSectionLabel(pdf, gstX, y, gstW, 'GST Summary');
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
      const gstTableBottom = drawTable(pdf, gstX, y, gstW, gstCols, gstRows, { rowH: 13, fontSize: 8 });

      // Totals block (right, aligned to same y start)
      const totStartY = y - 4; // align with section label
      const totRows = [
        ['Subtotal',     inv.subtotal_amount != null ? inr(inv.subtotal_amount) : null, false],
        ['Discount',     n(inv.discount_amount) ? inr(inv.discount_amount) : null, false],
        ['GST',          inv.gst_amount != null ? inr(inv.gst_amount) : null, false],
        ['Round Off',    n(inv.round_off_amount) ? inr(inv.round_off_amount) : null, false],
        ['Total Amount', inv.total_amount != null ? inr(inv.total_amount) : null, true],
        ['Amount Paid',  inv.amount_paid_resolved != null ? inr(inv.amount_paid_resolved) : null, false, P.success],
        ['Balance Due',  inv.balance_due_resolved != null ? inr(inv.balance_due_resolved) : null, true,
          n(inv.balance_due_resolved) > 0 ? P.danger : P.success],
      ];
      drawTotals(pdf, totX, totStartY + 18, totW, totRows, { fontSize: 8.5, rowH: 13 });

      y = Math.max(gstTableBottom, totStartY + 18 + totRows.filter(([, v]) => v != null).length * 13) + 12;
    } else {
      // No GST summary — just totals full width
      y = drawSectionLabel(pdf, ML, y, W, 'Totals');
      y += 6;
      const totRows = [
        ['Subtotal',     inv.subtotal_amount != null ? inr(inv.subtotal_amount) : null, false],
        ['Discount',     n(inv.discount_amount) ? inr(inv.discount_amount) : null, false],
        ['GST',          inv.gst_amount != null ? inr(inv.gst_amount) : null, false],
        ['Round Off',    n(inv.round_off_amount) ? inr(inv.round_off_amount) : null, false],
        ['Total Amount', inv.total_amount != null ? inr(inv.total_amount) : null, true],
        ['Amount Paid',  inv.amount_paid_resolved != null ? inr(inv.amount_paid_resolved) : null, false, P.success],
        ['Balance Due',  inv.balance_due_resolved != null ? inr(inv.balance_due_resolved) : null, true,
          n(inv.balance_due_resolved) > 0 ? P.danger : P.success],
      ];
      drawTotals(pdf, ML, y, W, totRows, { fontSize: 8.5, rowH: 13 });
      y += totRows.filter(([, v]) => v != null).length * 13 + 12;
    }

    // ── Payments section ──────────────────────────────────────────────────────
    if (payments.length) {
      y = drawSectionLabel(pdf, ML, y, W, 'Payments');
      y += 4;
      const payCols = [
        { label: '#',         w: 0.05, align: 'right' },
        { label: 'Date',      w: 0.15, align: 'left'  },
        { label: 'Mode',      w: 0.15, align: 'left'  },
        { label: 'Reference', w: 0.45, align: 'left'  },
        { label: 'Amount',    w: 0.20, align: 'right' },
      ];
      const payRows = payments.map((p, idx) => [
        String(idx + 1),
        ymd(p.payment_date || p.date),
        safeStr(p.payment_mode || p.mode || '', 20),
        safeStr(p.reference || p.notes || '', 60),
        inr(p.amount),
      ]);
      y = drawTable(pdf, ML, y, W, payCols, payRows, { rowH: 13, fontSize: 8 });
      y += 10;
    } else {
      // Show empty payments table
      y = drawSectionLabel(pdf, ML, y, W, 'Payments');
      y += 4;
      const payCols = [
        { label: '#',         w: 0.05, align: 'right' },
        { label: 'Date',      w: 0.15, align: 'left'  },
        { label: 'Mode',      w: 0.15, align: 'left'  },
        { label: 'Reference', w: 0.45, align: 'left'  },
        { label: 'Amount',    w: 0.20, align: 'right' },
      ];
      y = drawTable(pdf, ML, y, W, payCols, [['', 'No payments linked', '', '', '']], {
        rowH: 13, fontSize: 8,
      });
      y += 10;
    }

    // ── Page footer ───────────────────────────────────────────────────────────
    drawPageFooter(pdf, ML, PH - MB + 4, W, invNumber, status);
  });

  const filename = `Sales-Invoice-${safeFilePart(inv.invoice_number || 'doc')}.pdf`;
  return { buffer, filename };
}

module.exports = { buildSalesInvoicePdfAttachment };
