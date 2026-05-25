const { clean, n, i, round4, isFutureDate, calculateLineItem, calculateInvoiceTotals } = require("../../shared/sales");

/**
 * Validate GSTIN format: 15-char alphanumeric per GST rules.
 * Pattern: 2-digit state + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
 */
function isValidGstin(g) {
  if (!g) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    String(g).toUpperCase().trim()
  );
}

async function validateCustomer(q, accountId, customerId) {
  const rs = await q(`SELECT * FROM customers WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [customerId, accountId]);
  const c = rs.rows?.[0] || null;
  if (!c) return { ok: false, message: "Customer not found." };
  if (!Boolean(c.is_active)) return { ok: false, message: "Customer is inactive." };
  return { ok: true, customer: c };
}

const SALES_LINE_BATCH_SELECT = `
       pb.id, pb.batch_no, pb.expiry_date, pb.product_id, pb.mrp, pb.sales_rate,
       pb.purchase_rate, pb.retail_rate, pb.special_rate_1, pb.special_rate_2,
       pb.loose_stock, pb.loose_unit_name,
       COALESCE(pb.packing_units, p.units_per_strip, 1) AS packing_units,
       COALESCE(p.sales_gst, pb.sales_gst) AS sales_gst,
       pb.current_stock, pb.current_free_stock, pb.is_hold, pb.hold_reason,
       COALESCE(p.is_control, pb.is_control) AS is_control,
       COALESCE(p.is_half_scheme, pb.is_half_scheme) AS is_half_scheme,
       pb.is_net, pb.net_discount_percent,
       COALESCE(p.scheme_qty_paid, pb.scheme_qty_paid) AS scheme_qty_paid,
       COALESCE(p.scheme_qty_free, pb.scheme_qty_free) AS scheme_qty_free,
       pb.is_non_editable_free_qty,
       COALESCE(p.is_discount_enabled, pb.is_discount_enabled) AS is_discount_enabled,
       p.code AS product_code, p.name AS product_name, p.drug_name, p.mfg_company_id, p.division_id,
       mc.name AS mfg_company_name, mc.sale_lock, mc.prevent_free_qty, mc.prevent_discount, mc.prevent_net_rate
`;

/**
 * Resolve a per-line selling rate from a batch row using the bill-level rate
 * type. Used by retailer "Rate Type" toggle (MRP / Pu.Rt / Sp.Rt / Sl-Sat / Sales).
 * Falls back gracefully when the requested column is null on the batch.
 */
function resolveBatchRate(batch, rateType) {
  if (!batch) return 0;
  const mrp = n(batch.mrp);
  const map = {
    MRP: mrp,
    PURCHASE_RATE: n(batch.purchase_rate) || mrp,
    SPECIAL_RATE_1: n(batch.special_rate_1) || n(batch.retail_rate) || mrp,
    SPECIAL_RATE_2: n(batch.special_rate_2) || n(batch.sales_rate) || mrp,
    SALES_RATE: n(batch.sales_rate) || mrp,
    RETAIL_RATE: n(batch.retail_rate) || n(batch.sales_rate) || mrp
  };
  const v = map[String(rateType || "").toUpperCase()];
  return Number.isFinite(v) && v > 0 ? v : (n(batch.sales_rate) || mrp);
}

const VALID_RATE_TYPES = ["MRP", "PURCHASE_RATE", "SPECIAL_RATE_1", "SPECIAL_RATE_2", "SALES_RATE", "RETAIL_RATE"];
const VALID_BILL_TYPES = ["CASH_MEMO", "TAX_INVOICE", "DEBIT", "CREDIT"];

async function validateAndEnrichSalesItems(q, accountId, rawItems, options = {}) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (!items.length) return { ok: false, message: "At least one line item is required." };
  const headerRateType = VALID_RATE_TYPES.includes(String(options.rateType || "").toUpperCase())
    ? String(options.rateType).toUpperCase()
    : null;
  const headerGlobalDiscount = (() => {
    const v = n(options.globalDiscountPercent);
    if (!Number.isFinite(v) || v < 0) return 0;
    if (v > 100) return 100;
    return v;
  })();
  const out = [];
  const warnings = [];
  const invoiceQtyByBatch = new Map();
  const invoiceFreeQtyByBatch = new Map();
  for (const it of items) {
    const productId = clean(it.productId || it.product_id);
    const batchId = clean(it.batchId || it.batch_id);
    const qty = i(it.qty);
    const looseQtyCheck = Number(it.looseQty ?? it.loose_qty ?? 0);
    if (!productId || !batchId || (qty <= 0 && looseQtyCheck <= 0)) {
      return { ok: false, message: "Each line must include product, batch, and qty > 0 (or loose qty > 0 for unit sales)." };
    }
  }
  const batchIdList = [...new Set(items.map((x) => clean(x.batchId || x.batch_id)).filter(Boolean))];
  if (!batchIdList.length) {
    return { ok: false, message: "Each line must include product, batch, and qty > 0." };
  }
  const load = await q(
    `
    SELECT
      ${SALES_LINE_BATCH_SELECT}
    FROM product_batches pb
    JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
    LEFT JOIN mfg_companies mc ON mc.id = p.mfg_company_id AND mc.account_id = p.account_id
    WHERE pb.account_id = $1 AND pb.deleted_at IS NULL AND pb.id = ANY($2::uuid[])
    `,
    [accountId, batchIdList]
  );
  const batchById = new Map((load.rows || []).map((r) => [String(r.id), r]));

  for (const it of items) {
    const productId = clean(it.productId || it.product_id);
    const batchId = clean(it.batchId || it.batch_id);
    const qty = i(it.qty);
    const freeQty = i(it.freeQty || it.free_qty || 0);
    const looseQtyCheck = Number(it.looseQty ?? it.loose_qty ?? 0);
    if (!productId || !batchId || (qty <= 0 && looseQtyCheck <= 0)) {
      return { ok: false, message: "Each line must include product, batch, and qty > 0 (or loose qty > 0 for unit sales)." };
    }

    let batch = batchById.get(batchId) || null;
    if (batch && String(batch.product_id) !== String(productId)) batch = null;
    if (!batch) return { ok: false, message: "Invalid product/batch combination." };
    if (batch.is_hold) return { ok: false, message: `Batch "${batch.batch_no}" is on hold and cannot be sold.` };
    if (Boolean(batch.sale_lock)) {
      return { ok: false, message: `Sales are locked for manufacturer "${batch.mfg_company_name || "policy"}" (batch "${batch.batch_no}").` };
    }

    // packing_units: units per strip — from batch snapshot, fallback to product, fallback to 10
    const packingUnits = Math.max(1, Number(batch.packing_units || 10));

    const originalFreeQty = freeQty;
    const originalDiscount = n(it.discountPercent ?? it.discount_percent ?? 0);
    const schemePaid = i(batch.scheme_qty_paid || 0);
    const schemeFree = i(batch.scheme_qty_free || 0);
    const autoSchemeFree = schemePaid > 0 && schemeFree > 0 ? Math.floor(qty / schemePaid) * schemeFree : 0;
    const lineFreeQty = batch.is_non_editable_free_qty ? autoSchemeFree : freeQty;
    // Resolve sales rate: explicit per-line value wins; else use the bill rate
    // type (retailer "Rate Type" toggle); else fall back to batch.sales_rate.
    const explicitRate = it.salesRate ?? it.sales_rate;
    const resolvedRate = explicitRate !== undefined && explicitRate !== null && explicitRate !== ""
      ? n(explicitRate)
      : (headerRateType ? resolveBatchRate(batch, headerRateType) : n(batch.sales_rate));
    // Pick discount: per-line override wins; else use bill-level global %.
    // Honor manufacturer policy (prevent_discount / prevent_net_rate).
    const effectiveDiscount = batch.prevent_discount || batch.prevent_net_rate ? 0 : (
      batch.is_net ? n(batch.net_discount_percent || 0) : (originalDiscount > 0 ? originalDiscount : headerGlobalDiscount)
    );
    const baseDiscount = batch.is_net
      ? n(batch.net_discount_percent || 0)
      : (originalDiscount > 0 ? originalDiscount : headerGlobalDiscount);
    const gstPct = n(it.gstPercent ?? it.gst_percent ?? batch.sales_gst ?? 0);
    const mrpVal = n(it.mrp ?? batch.mrp);

    // ── Loose-only line: qty=0, looseQty>0 ──────────────────────────────────
    // When selling only individual units (e.g. 1 tablet from a 10-tablet strip),
    // the frontend sends qty=0 and looseQty=N. Calculate line total from loose rate.
    if (qty === 0 && looseQtyCheck > 0) {
      const looseQtyRaw = it.looseQty ?? it.loose_qty;
      const lq = Number(looseQtyRaw);
      if (!Number.isFinite(lq) || lq < 0) {
        return { ok: false, message: `Loose qty must be a non-negative number for batch "${batch.batch_no}".` };
      }
      const looseQty = Math.round(lq * 1000) / 1000;
      // Validate loose qty against available stock (all strips are residual since qty=0)
      const looseStock = n(batch.loose_stock);
      const stockBillable = n(batch.current_stock);
      const batchKey = String(batchId);
      const usedBillable = invoiceQtyByBatch.get(batchKey) || 0;
      const residualStrips = Math.max(0, stockBillable - usedBillable);
      const maxLoose = looseStock + residualStrips * packingUnits;
      if (looseQty > maxLoose) {
        return {
          ok: false,
          message: `Loose qty ${looseQty} exceeds availability for "${batch.product_name}" batch "${batch.batch_no}". Loose available: ${looseStock} ${batch.loose_unit_name || "TAB"}; can additionally break ${residualStrips} pack(s) → ${residualStrips * packingUnits} loose. Reduce loose qty or pick another batch.`
        };
      }
      // Calculate line total: looseQty × (salesRate / packingUnits) with discount + GST
      const looseRate = resolvedRate / packingUnits;
      const gross = round4(looseQty * looseRate);
      const discountAmount = round4(gross * (effectiveDiscount / 100));
      const taxableAmount = round4(gross - discountAmount);
      const gstAmount = round4(taxableAmount * (gstPct / 100));
      const lineTotal = round4(taxableAmount + gstAmount);
      // invoiceQtyByBatch unchanged (qty=0 adds nothing to strip count)
      invoiceQtyByBatch.set(batchKey, usedBillable);
      out.push({
        productId, productCode: batch.product_code || "", productName: batch.product_name || "",
        drugName: batch.drug_name || "", batchId, batchNo: batch.batch_no || "",
        expiryDate: batch.expiry_date, mfgCompanyId: batch.mfg_company_id || null,
        mfgCompanyName: batch.mfg_company_name || "", isControl: Boolean(batch.is_control),
        prescriptionNo: clean(it.prescriptionNo || it.prescription_no),
        doctorName: clean(it.doctorName || it.doctor_name),
        patientName: clean(it.patientName || it.patient_name),
        availableStock: n(batch.current_stock), saleLock: Boolean(batch.sale_lock),
        preventFreeQty: Boolean(batch.prevent_free_qty), preventDiscount: Boolean(batch.prevent_discount),
        preventNetRate: Boolean(batch.prevent_net_rate), isHalfScheme: Boolean(batch.is_half_scheme),
        isNet: Boolean(batch.is_net), netDiscountPercent: n(batch.net_discount_percent),
        isNonEditableFreeQty: Boolean(batch.is_non_editable_free_qty),
        qty: 0, freeQty: 0, mrp: mrpVal, salesRate: resolvedRate,
        discountPercent: effectiveDiscount, discountAmount,
        netRate: round4(looseRate * (1 - effectiveDiscount / 100)),
        gstPercent: gstPct, gstAmount, schemeTaxableAdd: 0, taxableAmount, lineTotal,
        looseQty, looseUnitName: clean(it.looseUnitName || it.loose_unit_name) || (batch.loose_unit_name || null)
      });
      continue;
    }
    // ── Normal strip line ────────────────────────────────────────────────────

    const cal = calculateLineItem({
      qty,
      freeQty: batch.prevent_free_qty ? 0 : lineFreeQty,
      salesRate: resolvedRate,
      mrp: mrpVal,
      discountPercent: batch.prevent_discount || batch.prevent_net_rate ? 0 : baseDiscount,
      gstPercent: gstPct,
      halfScheme: Boolean(batch.is_half_scheme)
    });
    if (!cal.ok) return { ok: false, message: cal.message };
    const finalOut = { ...cal.out };
    if (batch.prevent_net_rate) {
      finalOut.discountPercent = 0;
      finalOut.discountAmount = 0;
      finalOut.netRate = finalOut.salesRate;
      finalOut.taxableAmount = Number((finalOut.qty * finalOut.netRate).toFixed(4));
      finalOut.gstAmount = Number((finalOut.taxableAmount * (finalOut.gstPercent / 100)).toFixed(4));
      finalOut.lineTotal = Number((finalOut.taxableAmount + finalOut.gstAmount).toFixed(4));
    }
    if (batch.prevent_free_qty && originalFreeQty > 0) {
      warnings.push(`Free quantity was set to 0 (restricted by ${batch.mfg_company_name || "manufacturer"} policy).`);
    }
    if (batch.prevent_discount && originalDiscount > 0) {
      warnings.push(`Discount was set to 0% (restricted by ${batch.mfg_company_name || "manufacturer"} policy).`);
    }
    if (batch.is_non_editable_free_qty && originalFreeQty !== autoSchemeFree) {
      warnings.push(`Free quantity was auto-set by scheme for batch "${batch.batch_no}" (locked free qty policy).`);
    }
    if (Boolean(batch.is_control)) {
      const prescriptionNo = clean(it.prescriptionNo || it.prescription_no);
      const doctorName = clean(it.doctorName || it.doctor_name);
      const patientName = clean(it.patientName || it.patient_name);
      if (!prescriptionNo || !doctorName || !patientName) {
        return { ok: false, message: `Prescription No, Doctor Name and Patient Name are required for controlled batch "${batch.batch_no}".` };
      }
    }

    const batchKey = String(batchId);
    const lineBillable = qty;
    const lineFree = finalOut.freeQty;
    const usedBillable = invoiceQtyByBatch.get(batchKey) || 0;
    const usedFree = invoiceFreeQtyByBatch.get(batchKey) || 0;
    const stockBillable = n(batch.current_stock);
    const stockFree = n(batch.current_free_stock);
    const needBillable = usedBillable + lineBillable;
    const needFree = usedFree + lineFree;
    // NOTE: Stock availability is NOT checked here at DRAFT time.
    // A DRAFT invoice does not deduct stock; the authoritative stock check
    // is enforced at CONFIRM time in runConfirmSalesInvoiceInTx().
    // Removing this check allows wholesalers to create DRAFT invoices for
    // back-orders (stock not yet received) without blocking the workflow.
    invoiceQtyByBatch.set(batchKey, needBillable);
    invoiceFreeQtyByBatch.set(batchKey, needFree);

    // Loose qty (individual tablets/units sold from broken pack). Validated as
    // non-negative; can never exceed the loose stock available on this batch
    // PLUS what could be obtained by breaking the remaining strips after the
    // line's billable qty is reserved. Bound:
    //   loose_qty <= loose_stock + (stockBillable - needBillable) × packingUnits
    // The actual break-pack inventory write happens in confirm.js.
    const looseQtyRaw = it.looseQty ?? it.loose_qty;
    let looseQty = 0;
    if (looseQtyRaw !== undefined && looseQtyRaw !== null && String(looseQtyRaw).trim() !== "") {
      const lq = Number(looseQtyRaw);
      if (!Number.isFinite(lq) || lq < 0) {
        return { ok: false, message: `Loose qty must be a non-negative number for batch "${batch.batch_no}".` };
      }
      looseQty = Math.round(lq * 1000) / 1000;
      if (looseQty > 0) {
        const looseStock = n(batch.loose_stock);
        const residualStrips = Math.max(0, stockBillable - needBillable);
        const maxLoose = looseStock + residualStrips * packingUnits;
        if (looseQty > maxLoose) {
          return {
            ok: false,
            message: `Loose qty ${looseQty} exceeds availability for "${batch.product_name}" batch "${batch.batch_no}". Loose available: ${looseStock} ${batch.loose_unit_name || "TAB"}; can additionally break ${residualStrips} pack(s) → ${residualStrips * packingUnits} loose. Reduce loose qty or pick another batch.`
          };
        }
      }
    }

    out.push({
      productId,
      productCode: batch.product_code || "",
      productName: batch.product_name || "",
      drugName: batch.drug_name || "",
      batchId,
      batchNo: batch.batch_no || "",
      expiryDate: batch.expiry_date,
      mfgCompanyId: batch.mfg_company_id || null,
      mfgCompanyName: batch.mfg_company_name || "",
      isControl: Boolean(batch.is_control),
      prescriptionNo: clean(it.prescriptionNo || it.prescription_no),
      doctorName: clean(it.doctorName || it.doctor_name),
      patientName: clean(it.patientName || it.patient_name),
      availableStock: n(batch.current_stock),
      saleLock: Boolean(batch.sale_lock),
      preventFreeQty: Boolean(batch.prevent_free_qty),
      preventDiscount: Boolean(batch.prevent_discount),
      preventNetRate: Boolean(batch.prevent_net_rate),
      isHalfScheme: Boolean(batch.is_half_scheme),
      isNet: Boolean(batch.is_net),
      netDiscountPercent: n(batch.net_discount_percent),
      isNonEditableFreeQty: Boolean(batch.is_non_editable_free_qty),
      looseQty,
      looseUnitName: clean(it.looseUnitName || it.loose_unit_name) || (batch.loose_unit_name || null),
      ...finalOut
    });
  }
  return { ok: true, items: out, totals: calculateInvoiceTotals(out), warnings };
}

async function enforceFinancialLimits(q, accountId, customer, mfgCompanyIds, invoiceItems) {
  if (Boolean(customer.is_cash_customer)) return { ok: true };

  // BE-11: Enforce customer-level credit_days and credit_limit
  const customerCreditDays = Number(customer.credit_days || 0);
  const customerCreditLimit = Number(customer.credit_limit || 0);
  if (customerCreditDays > 0 || customerCreditLimit > 0) {
    const custOutRs = await q(
      `SELECT id, invoice_date, total_amount, balance_due
       FROM sales_invoices
       WHERE account_id = $1 AND customer_id = $2
         AND status = 'CONFIRMED'::sales_invoice_status
         AND payment_status IN ('UNPAID'::sales_payment_status, 'PARTIAL'::sales_payment_status)
       ORDER BY invoice_date ASC`,
      [accountId, customer.id]
    );
    const unpaid = custOutRs.rows || [];
    const totalOutstanding = unpaid.reduce((s, r) => s + Number(r.balance_due || 0), 0);
    const invoiceTotal = (invoiceItems || []).reduce((s, it) => s + n(it.line_total ?? it.lineTotal ?? 0), 0);

    if (customerCreditDays > 0 && unpaid.length > 0) {
      const oldest = unpaid[0];
      const ageDays = Math.floor((Date.now() - new Date(oldest.invoice_date).getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays > customerCreditDays) {
        return {
          ok: false,
          message: `Overdue bills for ${customer.name}`,
          subMessage: `The oldest unpaid bill is ${ageDays} day(s) old. Credit terms allow ${customerCreditDays} day(s). Clear overdue amounts before confirming new sales.`
        };
      }
    }

    if (customerCreditLimit > 0) {
      const projected = totalOutstanding + invoiceTotal;
      if (projected > customerCreditLimit) {
        return {
          ok: false,
          message: `Credit limit exceeded for ${customer.name}`,
          subMessage: `This invoice (₹${invoiceTotal.toFixed(2)}) plus outstanding (₹${totalOutstanding.toFixed(2)}) = ₹${projected.toFixed(2)}, exceeding the ₹${customerCreditLimit.toFixed(2)} credit limit. Collect payments or raise the limit.`
        };
      }
    }
  }

  if (!mfgCompanyIds.length) return { ok: true };

  const invoiceTotalsByMfg = new Map();
  for (const item of invoiceItems || []) {
    const mfgId = clean(item.mfg_company_id || item.mfgCompanyId);
    if (!mfgId) continue;
    const lineTotal = n(item.line_total ?? item.lineTotal);
    invoiceTotalsByMfg.set(mfgId, n((invoiceTotalsByMfg.get(mfgId) || 0) + lineTotal));
  }

  const rs = await q(
    `SELECT id, name, out_bill_limit, out_day_limit, credit_limit
     FROM mfg_companies
     WHERE account_id = $1 AND id = ANY($2::uuid[])`,
    [accountId, mfgCompanyIds]
  );
  const mfgRows = rs.rows || [];
  const outRs = await q(
    `
    SELECT
      sii.mfg_company_id,
      COUNT(DISTINCT si.id)::int AS outstanding_bills,
      COALESCE(SUM(COALESCE(sii.line_total, 0)), 0)::numeric(14,2) AS outstanding_amount,
      MIN(si.invoice_date) AS oldest_invoice_date
    FROM sales_invoices si
    JOIN sales_invoice_items sii
      ON sii.sales_invoice_id = si.id
     AND sii.account_id = si.account_id
    WHERE si.account_id = $1
      AND si.customer_id = $2
      AND si.status = 'CONFIRMED'::sales_invoice_status
      AND si.payment_status IN ('UNPAID'::sales_payment_status, 'PARTIAL'::sales_payment_status)
      AND sii.mfg_company_id = ANY($3::uuid[])
    GROUP BY sii.mfg_company_id
    `,
    [accountId, customer.id, mfgCompanyIds]
  );
  const outstandingByMfg = new Map(
    (outRs.rows || []).map((r) => [
      String(r.mfg_company_id),
      {
        outstandingBills: Number(r.outstanding_bills || 0),
        outstandingAmount: Number(r.outstanding_amount || 0),
        oldestBillAgeDays: r.oldest_invoice_date
          ? Math.max(0, Math.floor((Date.now() - new Date(r.oldest_invoice_date).getTime()) / (1000 * 60 * 60 * 24)))
          : 0
      }
    ])
  );

  for (const m of mfgRows) {
    const key = String(m.id);
    const outstanding = outstandingByMfg.get(key) || { outstandingBills: 0, outstandingAmount: 0, oldestBillAgeDays: 0 };
    const newInvoiceTotal = Number(invoiceTotalsByMfg.get(key) || 0);
    const outBillLimit = Number(m.out_bill_limit || 0);
    const outDayLimit = Number(m.out_day_limit || 0);
    const creditLimit = Number(m.credit_limit || 0);
    if (outBillLimit > 0 && outstanding.outstandingBills >= outBillLimit) {
      return {
        ok: false,
        message: `Too many unpaid bills for ${m.name}`,
        subMessage: `This customer already has ${outstanding.outstandingBills} unpaid invoice(s). For ${m.name}, new sales are blocked after ${outBillLimit} open bill(s). Record payments or adjust older invoices before confirming this one.`
      };
    }
    if (outDayLimit > 0 && outstanding.oldestBillAgeDays > outDayLimit) {
      return {
        ok: false,
        message: `Bills are overdue past the limit for ${m.name}`,
        subMessage: `The oldest unpaid bill is ${outstanding.oldestBillAgeDays} day(s) old. ${m.name} allows at most ${outDayLimit} day(s) before blocking new sales. Clear overdue amounts or adjust terms before confirming.`
      };
    }
    if (creditLimit > 0) {
      const projected = outstanding.outstandingAmount + Number(newInvoiceTotal || 0);
      if (projected > creditLimit) {
        const inv = Number(newInvoiceTotal).toFixed(2);
        const outAmt = outstanding.outstandingAmount.toFixed(2);
        const lim = creditLimit.toFixed(2);
        const tot = projected.toFixed(2);
        return {
          ok: false,
          message: `Credit limit exceeded for ${m.name}`,
          subMessage: `This invoice is ₹${inv}. With other unpaid amounts (₹${outAmt}), the total would be ₹${tot}, above the ₹${lim} credit allowed for this manufacturer. Reduce this invoice, collect on open bills, or raise the limit under Manufacturing companies.`
        };
      }
    }
  }
  return { ok: true };
}

function validateInvoiceHeader(body) {
  const rawRateType = clean(body.rateType || body.rate_type).toUpperCase();
  const rawBillType = clean(body.billType || body.bill_type).toUpperCase();
  const rawGlobalDiscount = body.globalDiscountPercent ?? body.global_discount_percent;
  const header = {
    invoiceNumber: clean(body.invoiceNumber || body.invoice_number),
    customerId: clean(body.customerId || body.customer_id),
    invoiceDate: clean(body.invoiceDate || body.invoice_date),
    dueDate: clean(body.dueDate || body.due_date),
    notes: clean(body.notes),
    isWalkInSale: Boolean(body.isWalkInSale || body.is_walk_in_sale),
    walkInPatientName: clean(body.walkInPatientName || body.walk_in_patient_name),
    walkInPatientPhone: clean(body.walkInPatientPhone || body.walk_in_patient_phone),
    walkInDoctorName: clean(body.walkInDoctorName || body.walk_in_doctor_name),
    walkInPrescriptionNo: clean(body.walkInPrescriptionNo || body.walk_in_prescription_no),
    rateType: VALID_RATE_TYPES.includes(rawRateType) ? rawRateType : null,
    billType: VALID_BILL_TYPES.includes(rawBillType) ? rawBillType : null,
    globalDiscountPercent: (() => {
      if (rawGlobalDiscount === undefined || rawGlobalDiscount === null || rawGlobalDiscount === "") return 0;
      const v = Number(rawGlobalDiscount);
      if (!Number.isFinite(v)) return 0;
      if (v < 0) return 0;
      if (v > 100) return 100;
      return Math.round(v * 100) / 100;
    })()
  };
  if (!header.customerId) return { ok: false, message: "Customer is required." };
  if (!header.invoiceDate) return { ok: false, message: "Invoice date is required." };
  if (isFutureDate(header.invoiceDate, { clientTodayYmd: clean(body.clientToday) })) {
    return { ok: false, message: "Invoice date cannot be in future." };
  }
  return { ok: true, header };
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

/** Single round-trip insert for all sales line items. */
async function insertSalesLineItemsMany(q, accountId, salesInvoiceId, items) {
  if (!Array.isArray(items) || !items.length) return;
  const ph = buildMultiRowPlaceholders(items.length, 27);
  const flat = [];
  for (const it of items) {
    flat.push(
      accountId,
      salesInvoiceId,
      it.productId,
      it.productCode,
      it.productName,
      it.drugName || null,
      it.batchId,
      it.batchNo,
      it.expiryDate,
      it.mfgCompanyId,
      it.mfgCompanyName || null,
      it.qty,
      it.freeQty,
      it.mrp,
      it.salesRate,
      it.discountPercent,
      it.discountAmount,
      it.netRate,
      it.gstPercent,
      it.gstAmount,
      it.taxableAmount,
      it.lineTotal,
      it.prescriptionNo || null,
      it.doctorName || null,
      it.patientName || null,
      it.looseQty || 0,
      it.looseUnitName || null
    );
  }
  await q(
    `
    INSERT INTO sales_invoice_items (
      account_id, sales_invoice_id, product_id, product_code, product_name, drug_name, batch_id, batch_no, expiry_date,
      mfg_company_id, mfg_company_name, qty, free_qty, mrp, sales_rate, discount_percent, discount_amount, net_rate,
      gst_percent, gst_amount, taxable_amount, line_total, prescription_no, doctor_name, patient_name,
      loose_qty, loose_unit_name
    ) VALUES ${ph}
    `,
    flat
  );
}

module.exports = {
  validateCustomer,
  validateAndEnrichSalesItems,
  insertSalesLineItemsMany,
  enforceFinancialLimits,
  validateInvoiceHeader,
  resolveBatchRate,
  isValidGstin,
  VALID_RATE_TYPES,
  VALID_BILL_TYPES
};
