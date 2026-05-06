/**
 * Shared PDFKit layout helpers for JedMee invoice PDFs.
 * Provides table, two-column box, header/footer drawing utilities.
 */

const P = {
  primary:    '#5B21B6',
  primaryDk:  '#3B0764',
  heading:    '#4C1D95',
  text:       '#111827',
  textMid:    '#374151',
  muted:      '#6B7280',
  light:      '#9CA3AF',
  border:     '#E5E7EB',
  borderMid:  '#D1D5DB',
  altRow:     '#F9FAFB',
  accentBg:   '#F5F3FF',
  white:      '#FFFFFF',
  danger:     '#DC2626',
  success:    '#059669',
  warning:    '#D97706',
};

function safeStr(s, max) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return max ? t.slice(0, max) : t;
}

function ymd(v) {
  return String(v || '').slice(0, 10);
}

function nowStr() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Draw a section box with a colored label bar and key-value rows.
 * Returns the y position after the box.
 */
function drawInfoBox(pdf, x, y, w, label, rows, opts = {}) {
  const {
    labelBg    = P.primary,
    labelColor = P.white,
    labelH     = 16,
    rowH       = 14,
    keyW       = 0.38,
    fontSize   = 8,
    borderColor = P.border,
  } = opts;

  const validRows = rows.filter(([, v]) => v != null && String(v).trim() !== '');
  const boxH = labelH + validRows.length * rowH + 8;

  // Box border
  pdf.rect(x, y, w, boxH).strokeColor(borderColor).lineWidth(0.5).stroke();

  // Label bar
  pdf.rect(x, y, w, labelH).fillColor(labelBg).fill();
  pdf.fontSize(7).fillColor(labelColor).font('Helvetica-Bold')
    .text(label.toUpperCase(), x + 6, y + 4, { width: w - 12, align: 'left' });

  // Key-value rows
  let ry = y + labelH + 4;
  for (const [k, v] of validRows) {
    pdf.fontSize(fontSize).fillColor(P.muted).font('Helvetica')
      .text(safeStr(k), x + 6, ry, { width: w * keyW - 6, lineBreak: false });
    pdf.fontSize(fontSize).fillColor(P.text).font('Helvetica-Bold')
      .text(safeStr(v, 80), x + w * keyW + 2, ry, { width: w * (1 - keyW) - 8, lineBreak: false });
    ry += rowH;
  }

  return y + boxH;
}

/**
 * Draw a full-width table with header row and data rows.
 * Returns the y position after the table.
 */
function drawTable(pdf, x, y, w, cols, rows, opts = {}) {
  const {
    headerBg    = P.primary,
    headerColor = P.white,
    headerH     = 16,
    rowH        = 14,
    fontSize    = 8,
    borderColor = P.border,
    altBg       = P.altRow,
    footerRows  = [],   // [{cells, bold}] drawn after data rows with top border
  } = opts;

  // Compute absolute x positions for each column
  const xs = [];
  let acc = x;
  for (const c of cols) {
    xs.push(acc);
    acc += c.w * w;
  }

  // Header
  pdf.rect(x, y, w, headerH).fillColor(headerBg).fill();
  pdf.fontSize(fontSize - 1).fillColor(headerColor).font('Helvetica-Bold');
  cols.forEach((c, i) => {
    pdf.text(c.label, xs[i] + 3, y + 4, { width: c.w * w - 6, align: c.align || 'left', lineBreak: false });
  });
  y += headerH;

  // Data rows
  pdf.font('Helvetica').fontSize(fontSize);
  rows.forEach((row, idx) => {
    const bg = idx % 2 === 0 ? P.white : altBg;
    pdf.rect(x, y, w, rowH).fillColor(bg).fill();
    row.forEach((cell, i) => {
      const color = cols[i].color || P.text;
      pdf.fillColor(color).text(safeStr(cell, 100), xs[i] + 3, y + 3, {
        width: cols[i].w * w - 6,
        align: cols[i].align || 'left',
        lineBreak: false,
      });
    });
    pdf.moveTo(x, y + rowH).lineTo(x + w, y + rowH).strokeColor(borderColor).lineWidth(0.3).stroke();
    y += rowH;
  });

  // Footer rows (totals etc.)
  if (footerRows.length) {
    pdf.moveTo(x, y).lineTo(x + w, y).strokeColor(P.borderMid).lineWidth(0.8).stroke();
    for (const fr of footerRows) {
      const bg = fr.bg || P.accentBg;
      pdf.rect(x, y, w, rowH).fillColor(bg).fill();
      fr.cells.forEach((cell, i) => {
        const fnt = fr.bold ? 'Helvetica-Bold' : 'Helvetica';
        const color = fr.color || P.text;
        pdf.font(fnt).fontSize(fontSize).fillColor(color)
          .text(safeStr(cell, 100), xs[i] + 3, y + 3, {
            width: cols[i].w * w - 6,
            align: cols[i].align || 'left',
            lineBreak: false,
          });
      });
      pdf.moveTo(x, y + rowH).lineTo(x + w, y + rowH).strokeColor(borderColor).lineWidth(0.3).stroke();
      y += rowH;
    }
  }

  // Outer border
  pdf.rect(x, y - (rows.length + footerRows.length) * rowH - headerH, w,
    headerH + (rows.length + footerRows.length) * rowH)
    .strokeColor(borderColor).lineWidth(0.5).stroke();

  return y;
}

/**
 * Draw a section label (e.g. "INVOICE ITEMS").
 */
function drawSectionLabel(pdf, x, y, w, label) {
  pdf.rect(x, y, w, 14).fillColor(P.accentBg).fill();
  pdf.rect(x, y, 3, 14).fillColor(P.primary).fill();
  pdf.fontSize(7.5).fillColor(P.primary).font('Helvetica-Bold')
    .text(label.toUpperCase(), x + 9, y + 3, { width: w - 12, lineBreak: false });
  return y + 14;
}

/**
 * Draw a horizontal rule.
 */
function drawHRule(pdf, x, y, w, color = P.border) {
  pdf.moveTo(x, y).lineTo(x + w, y).strokeColor(color).lineWidth(0.5).stroke();
  return y + 1;
}

/**
 * Draw the page header (date/time left, invoice number right).
 */
function drawPageHeader(pdf, x, y, w, invNumber, title) {
  const ts = nowStr();
  pdf.fontSize(7.5).fillColor(P.light).font('Helvetica')
    .text(ts, x, y, { width: w / 2, align: 'left', lineBreak: false });
  pdf.fontSize(7.5).fillColor(P.light).font('Helvetica')
    .text(safeStr(invNumber), x, y, { width: w, align: 'right', lineBreak: false });
  return y + 12;
}

/**
 * Draw the page footer (generated on left, invoice+status right).
 */
function drawPageFooter(pdf, x, y, w, invNumber, status) {
  drawHRule(pdf, x, y, w, P.border);
  y += 4;
  const ts = nowStr();
  pdf.fontSize(7).fillColor(P.light).font('Helvetica')
    .text(`Generated on ${ts}`, x, y, { width: w / 2, align: 'left', lineBreak: false });
  pdf.fontSize(7).fillColor(P.light).font('Helvetica')
    .text(`${safeStr(invNumber)}  |  ${safeStr(status)}`, x, y, { width: w, align: 'right', lineBreak: false });
}

/**
 * Draw the seller header block (name, GST, address, phone).
 */
function drawSellerHeader(pdf, x, y, w, seller, title) {
  // Title
  pdf.fontSize(18).fillColor(P.primary).font('Helvetica-Bold')
    .text(title, x, y, { width: w, lineBreak: false });
  y += 24;

  // Seller name + GST on same line
  const sellerName = safeStr(seller.firm_name || seller.full_name || '', 80);
  const gst = seller.gst_number ? `GST: ${safeStr(seller.gst_number, 20)}` : '';
  const nameLine = [sellerName, gst].filter(Boolean).join('   |   ');
  if (nameLine) {
    pdf.fontSize(9).fillColor(P.text).font('Helvetica-Bold')
      .text(nameLine, x, y, { width: w, lineBreak: false });
    y += 12;
  }

  // Address + phone
  const addr = safeStr(seller.address || '', 120);
  const phone = seller.phone_number ? safeStr(seller.phone_number, 30) : '';
  const addrLine = [addr, phone].filter(Boolean).join('   |   ');
  if (addrLine) {
    pdf.fontSize(8.5).fillColor(P.muted).font('Helvetica')
      .text(addrLine, x, y, { width: w, lineBreak: false });
    y += 12;
  }

  if (seller.email) {
    pdf.fontSize(8).fillColor(P.muted).font('Helvetica')
      .text(`Email: ${safeStr(seller.email, 80)}`, x, y, { width: w, lineBreak: false });
    y += 11;
  }

  return y;
}

/**
 * Draw a totals block (right-aligned key-value pairs).
 */
function drawTotals(pdf, x, y, w, rows, opts = {}) {
  const { fontSize = 8.5, rowH = 13 } = opts;
  const keyW = w * 0.55;
  const valW = w * 0.45;

  for (const [k, v, bold, color] of rows) {
    if (v == null || v === '') continue;
    const fnt = bold ? 'Helvetica-Bold' : 'Helvetica';
    pdf.fontSize(fontSize).fillColor(P.muted).font('Helvetica')
      .text(safeStr(k), x, y, { width: keyW, align: 'right', lineBreak: false });
    pdf.fontSize(fontSize).fillColor(color || P.text).font(fnt)
      .text(safeStr(v), x + keyW + 4, y, { width: valW - 4, align: 'right', lineBreak: false });
    y += rowH;
  }
  return y;
}

module.exports = { P, safeStr, ymd, nowStr, drawInfoBox, drawTable, drawSectionLabel, drawHRule, drawPageHeader, drawPageFooter, drawSellerHeader, drawTotals };