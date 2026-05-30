const { clean, computeInvoiceTotals, computeLineAmounts, ensureDateNotFuture, n, addCalendarDaysYmd } = require("../../shared/purchase");
const { MSG } = require("../../shared/apiMessages");
const { validateDivision, resolveDueDateFromDivision } = require("../../shared/divisionsCore");

function isValidDateYmd(v) {
  const s = clean(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(`${s}T00:00:00.000Z`).getTime();
  return Number.isFinite(t);
}

async function validateVendor(q, accountId, vendorId) {
  const id = clean(vendorId);
  if (!id) return { ok: false, message: "Vendor is required." };
  const r = await q(
    `SELECT
       v.id,
       v.name,
       v.is_active,
       COALESCE((to_jsonb(v) ->> 'credit_days')::int, 0) AS credit_days
     FROM vendors v
     WHERE v.id = $1 AND v.account_id = $2 AND v.deleted_at IS NULL
     LIMIT 1`,
    [id, accountId]
  );
  const row = r.rows?.[0];
  if (!row) return { ok: false, message: MSG.VENDOR_NOT_FOUND };
  if (!Boolean(row.is_active)) return { ok: false, message: MSG.VENDOR_INACTIVE };
  return { ok: true, vendor: row };
}

function resolveDueDate(invoiceDate, dueDate, vendor) {
  const explicit = clean(dueDate);
  if (explicit) return explicit;
  const days = Number(vendor?.credit_days || 0);
  if (!invoiceDate) return null;
  if (!(days > 0)) return null;
  return addCalendarDaysYmd(invoiceDate, days);
}

async function enrichAndValidateItems(q, accountId, party, itemsInput) {
  const vendorId = party?.vendorId != null ? clean(party.vendorId) : "";
  const divisionId = party?.divisionId != null ? clean(party.divisionId) : "";
  const divisionMfgCompanyId = party?.divisionMfgCompanyId != null ? clean(party.divisionMfgCompanyId) : "";
  const items = Array.isArray(itemsInput) ? itemsInput : [];
  if (!items.length) return { ok: false, message: MSG.LINE_ITEM_REQUIRED };

  const out = [];
  const errs = [];
  const lineMetas = [];

  for (let i = 0; i < items.length; i++) {
    const raw = items[i] || {};
    const productId = clean(raw.productId || raw.product_id);
    const batchId = clean(raw.batchId || raw.batch_id);
    const batchNo = clean(raw.batchNo || raw.batch_no);
    const expiryDate = clean(raw.expiryDate || raw.expiry_date);
    const mfgDate = clean(raw.mfgDate || raw.mfg_date);
    const pack = clean(raw.pack);
    const hsnCode = clean(raw.hsnCode || raw.hsn_code);
    const isNewBatch = Boolean(raw.isNewBatch || raw.is_new_batch || !batchId);

    if (!productId) {
      errs.push(`Line ${i + 1}: product is required.`);
      continue;
    }
    if (!batchNo) {
      errs.push(`Line ${i + 1}: batch number is required.`);
      continue;
    }
    if (!expiryDate) {
      errs.push(`Line ${i + 1}: expiry date is required.`);
      continue;
    }
    if (!isValidDateYmd(expiryDate)) {
      errs.push(`Line ${i + 1}: expiry date is invalid.`);
      continue;
    }
    lineMetas.push({ i, raw, productId, batchId, batchNo, expiryDate, mfgDate, pack, hsnCode, isNewBatch });
  }

  if (errs.length) return { ok: false, message: errs[0], details: errs };
  if (!lineMetas.length) return { ok: false, message: MSG.LINE_ITEM_REQUIRED };

  const productIds = [...new Set(lineMetas.map((m) => m.productId))];
  const pr = await q(
    `
    SELECT p.id, p.code, p.name, p.drug_name, p.mfg_company_id
    FROM products p
    WHERE p.account_id = $1 AND p.deleted_at IS NULL AND p.id = ANY($2::uuid[])
    `,
    [accountId, productIds]
  );
  const prodById = new Map((pr.rows || []).map((row) => [String(row.id), row]));

  const batchIdPairs = lineMetas.filter((m) => m.batchId);
  const uniqueBatchIds = [...new Set(batchIdPairs.map((m) => m.batchId))];
  let batchProductById = new Map();
  if (uniqueBatchIds.length) {
    const br = await q(
      `
      SELECT id, product_id
      FROM product_batches
      WHERE account_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])
      `,
      [accountId, uniqueBatchIds]
    );
    batchProductById = new Map((br.rows || []).map((row) => [String(row.id), String(row.product_id)]));
  }

  for (const m of lineMetas) {
    const { i, raw, productId, batchId, batchNo, expiryDate, mfgDate, pack, hsnCode, isNewBatch } = m;
    const prod = prodById.get(productId);
    if (!prod) {
      errs.push(`Line ${i + 1}: invalid product.`);
      continue;
    }

    if (divisionMfgCompanyId && prod.mfg_company_id && String(prod.mfg_company_id) !== String(divisionMfgCompanyId)) {
      errs.push(`Line ${i + 1}: product does not belong to this division's manufacturer.`);
      continue;
    }

    let safeBatchId = batchId || null;
    if (safeBatchId) {
      const pid = batchProductById.get(safeBatchId);
      if (!pid || String(pid) !== String(productId)) safeBatchId = null;
    }

    const { errs: lineErrs, out: calc } = computeLineAmounts(raw);
    if (lineErrs.length) {
      errs.push(`Line ${i + 1}: ${lineErrs[0]}`);
      continue;
    }

    out.push({
      productId,
      productCode: prod.code,
      productName: prod.name,
      drugName: prod.drug_name || null,
      mfgCompanyId: prod.mfg_company_id || null,
      batchId: safeBatchId,
      batchNo,
      expiryDate,
      mfgDate: mfgDate || null,
      vendorId: vendorId || null,
      divisionId: divisionId || null,
      pack: pack || null,
      hsnCode: hsnCode || null,
      isNewBatch: isNewBatch || !safeBatchId,
      ...calc
    });
  }

  if (errs.length) return { ok: false, message: errs[0], details: errs };
  const totals = computeInvoiceTotals(out);
  return { ok: true, items: out, totals };
}

async function validateInvoiceHeader(body) {
  const invoiceDate = clean(body.invoiceDate);
  const dueDate = clean(body.dueDate);
  const invErr = ensureDateNotFuture(invoiceDate, "Invoice date", { clientTodayYmd: clean(body.clientToday) });
  if (invErr) return { ok: false, message: invErr };
  if (dueDate) {
    const d = new Date(`${dueDate}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return { ok: false, message: MSG.DUE_DATE_INVALID };
  }
  return {
    ok: true,
    header: {
      invoiceNumber: clean(body.invoiceNumber),
      vendorInvoiceNumber: clean(body.vendorInvoiceNumber) || null,
      vendorId: clean(body.vendorId || body.vendor_id),
      divisionId: clean(body.divisionId || body.division_id),
      invoiceDate,
      dueDate: dueDate || null,
      notes: clean(body.notes) || null
    }
  };
}

async function resolvePurchaseParty(q, accountId, header) {
  const divisionId = clean(header.divisionId);
  const vendorId = clean(header.vendorId);
  if (divisionId) {
    const d = await validateDivision(q, accountId, divisionId);
    if (!d.ok) return d;
    return {
      ok: true,
      mode: "division",
      divisionId,
      vendorId: null,
      divisionName: d.division.name,
      divisionMfgCompanyId: d.division.mfg_company_id,
      creditSource: d.division
    };
  }
  if (vendorId) {
    const v = await validateVendor(q, accountId, vendorId);
    if (!v.ok) return v;
    return {
      ok: true,
      mode: "vendor",
      divisionId: null,
      vendorId,
      divisionName: null,
      divisionMfgCompanyId: null,
      creditSource: v.vendor
    };
  }
  return { ok: false, message: MSG.DIVISION_OR_VENDOR_REQUIRED };
}

function mapInvoiceRow(row) {
  if (!row) return null;
  const totalAmount = n(row.total_amount);
  const amountPaid = n(row.amount_paid);
  return {
    ...row,
    total_amount: totalAmount,
    amount_paid: amountPaid,
    balance_due: n(row.balance_due ?? totalAmount - amountPaid)
  };
}

function buildMultiRowPlaceholders(numRows, colsPerRow) {
  let p = 1;
  const rows = [];
  for (let r = 0; r < numRows; r += 1) {
    const cells = Array.from({ length: colsPerRow }, () => `$${p++}`);
    rows.push(`(${cells.join(",")})`);
  }
  return rows.join(",\n");
}

/** Single round-trip insert for all purchase line items. */
async function insertPurchaseLineItemsMany(q, accountId, purchaseInvoiceId, items) {
  if (!Array.isArray(items) || !items.length) return;
  const ph = buildMultiRowPlaceholders(items.length, 29);
  const flat = [];
  for (const it of items) {
    flat.push(
      accountId,
      purchaseInvoiceId,
      it.productId,
      it.productCode,
      it.productName,
      it.drugName,
      it.batchId,
      it.batchNo,
      it.expiryDate,
      it.mfgDate,
      it.vendorId,
      it.divisionId,
      it.mfgCompanyId,
      it.pack,
      it.qty,
      it.freeQty,
      it.purchaseRate,
      it.mrp,
      it.discountPercent,
      it.discountAmount,
      it.gstPercent,
      it.gstAmount,
      it.netAmount,
      it.taxableAmount,
      it.lineAmount,
      it.salesRate,
      it.landingCost,
      it.hsnCode,
      it.isNewBatch
    );
  }
  await q(
    `
    INSERT INTO purchase_invoice_items (
      account_id, purchase_invoice_id, product_id, product_code, product_name, drug_name,
      batch_id, batch_no, expiry_date, mfg_date, vendor_id, division_id, mfg_company_id, pack,
      qty, free_qty, purchase_rate, mrp, discount_percent, discount_amount, gst_percent, gst_amount,
      net_amount, taxable_amount, line_amount, sales_rate, landing_cost, hsn_code, is_new_batch
    )
    VALUES ${ph}
    `,
    flat
  );
}

module.exports = {
  validateVendor,
  resolveDueDate,
  resolveDueDateFromDivision,
  enrichAndValidateItems,
  validateInvoiceHeader,
  resolvePurchaseParty,
  mapInvoiceRow,
  insertPurchaseLineItemsMany
};
