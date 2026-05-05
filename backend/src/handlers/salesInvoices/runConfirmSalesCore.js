const { fail } = require("../../shared/response");
const { calculateInvoiceTotals, calculateLineItem } = require("../../shared/sales");
const { enforceFinancialLimits } = require("./_common");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");

/**
 * Post SALE inventory txns and mark invoice CONFIRMED. Shared by HTTP confirm and CSV import.
 */
async function runConfirmSalesInvoiceInTx(q, ctx, invoiceId) {
  const { accountId, actorId, confirmOptions } = ctx;
  const roleCode = await getRoleCodeForAccount(accountId);
  const isRetailer = roleCode === "RETAILER";

  const invRs = await q(
    `SELECT * FROM sales_invoices
     WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
     FOR UPDATE
     LIMIT 1`,
    [invoiceId, accountId]
  );
  const invoice = invRs.rows?.[0] || null;
  if (!invoice) return { err: fail(404, "NOT_FOUND", "Invoice not found") };
  if (String(invoice.status) !== "DRAFT") return { err: fail(400, "BUSINESS_RULE", "Only DRAFT invoices can be confirmed.") };
  const custRs = await q(`SELECT * FROM customers WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [invoice.customer_id, accountId]);
  const customer = custRs.rows?.[0] || null;
  if (!customer) return { err: fail(400, "VALIDATION_ERROR", "Customer not found") };
  if (String(invoice.bill_type || "").toUpperCase() === "TAX_INVOICE" && !invoice.is_walk_in_sale && !String(customer.gst_number || "").trim()) {
    return {
      err: fail(
        400,
        "BUSINESS_RULE",
        "Tax Invoice requires customer GSTIN. Add customer GSTIN or switch bill type to Cash Memo."
      )
    };
  }
  const itemRs = await q(`SELECT * FROM sales_invoice_items WHERE sales_invoice_id = $1 AND account_id = $2 ORDER BY created_at ASC`, [invoiceId, accountId]);
  const items = itemRs.rows || [];
  if (!items.length) return { err: fail(400, "BUSINESS_RULE", "Cannot confirm empty invoice.") };
  const mfgIds = [...new Set(items.map((x) => String(x.mfg_company_id || "")).filter(Boolean))];

  let looseUnitFactor = 10;
  try {
    const settingsRs = await q(`SELECT loose_unit_factor, enable_loose_sale FROM account_settings WHERE account_id = $1 LIMIT 1`, [accountId]);
    const s = settingsRs.rows?.[0] || null;
    if (s) {
      const f = Number(s.loose_unit_factor);
      if (Number.isFinite(f) && f > 0) looseUnitFactor = Math.floor(f);
    }
  } catch {
    /* default */
  }
  if (!isRetailer) {
    const financial = await enforceFinancialLimits(q, accountId, customer, mfgIds, items);
    if (!financial.ok)
      return {
        err: fail(400, "BUSINESS_RULE", financial.message, financial.subMessage ? { subMessage: financial.subMessage } : undefined)
      };
  }

  const warnings = [];
  const lowStockBatches = new Set();
  const invoiceQtyByBatch = new Map();
  const invoiceFreeQtyByBatch = new Map();
  for (const item of items) {
    const bRs = await q(
      `SELECT pb.id, pb.batch_no, pb.current_stock, pb.current_free_stock, pb.is_hold, pb.hold_reason,
              pb.loose_stock, pb.loose_unit_name,
              COALESCE(p.is_control, pb.is_control) AS is_control, pb.account_id,
              COALESCE(p.is_half_scheme, pb.is_half_scheme) AS is_half_scheme,
              pb.is_net, pb.net_discount_percent,
              COALESCE(p.scheme_qty_paid, pb.scheme_qty_paid) AS scheme_qty_paid,
              COALESCE(p.scheme_qty_free, pb.scheme_qty_free) AS scheme_qty_free,
              pb.is_non_editable_free_qty,
              p.mfg_company_id
       FROM product_batches pb
       JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
       WHERE pb.id = $1 AND pb.account_id = $2
       FOR UPDATE OF pb`,
      [item.batch_id, accountId]
    );
    const row = bRs.rows?.[0] || null;
    let mfg_name = null;
    let sale_lock = false;
    let prevent_free_qty = false;
    let prevent_discount = false;
    let prevent_net_rate = false;
    if (row?.mfg_company_id) {
      const mcRs = await q(
        `SELECT name, sale_lock, prevent_free_qty, prevent_discount, prevent_net_rate
         FROM mfg_companies WHERE id = $1 AND account_id = $2 LIMIT 1`,
        [row.mfg_company_id, accountId]
      );
      const mc = mcRs.rows?.[0] || null;
      if (mc) {
        mfg_name = mc.name ?? null;
        sale_lock = Boolean(mc.sale_lock);
        prevent_free_qty = Boolean(mc.prevent_free_qty);
        prevent_discount = Boolean(mc.prevent_discount);
        prevent_net_rate = Boolean(mc.prevent_net_rate);
      }
    }
    const batch = row
      ? {
          ...row,
          mfg_name,
          sale_lock,
          prevent_free_qty,
          prevent_discount,
          prevent_net_rate
        }
      : null;
    if (!batch) return { err: fail(400, "BUSINESS_RULE", `Batch not found: ${item.batch_no}`) };
    if (batch.is_hold) return { err: fail(400, "BUSINESS_RULE", `Batch "${item.batch_no}" is on hold and cannot be sold. Reason: ${batch.hold_reason || "Not specified"}`) };
    if (batch.sale_lock) return { err: fail(400, "BUSINESS_RULE", `Sales are locked for manufacturer "${batch.mfg_name}".`) };
    if (batch.is_control) {
      if (!String(item.prescription_no || "").trim()) return { err: fail(400, "BUSINESS_RULE", `Prescription number is required for controlled batch "${item.batch_no}".`) };
      if (!String(item.doctor_name || "").trim()) return { err: fail(400, "BUSINESS_RULE", `Doctor name is required for controlled batch "${item.batch_no}".`) };
      if (!String(item.patient_name || "").trim()) return { err: fail(400, "BUSINESS_RULE", `Patient name is required for controlled batch "${item.batch_no}".`) };
    }

    const originalFreeQty = Number(item.free_qty || 0);
    const originalDiscount = Number(item.discount_percent || 0);
    const schemePaid = Number.parseInt(String(batch.scheme_qty_paid || 0), 10) || 0;
    const schemeFree = Number.parseInt(String(batch.scheme_qty_free || 0), 10) || 0;
    const lineQtyInt = Number.parseInt(String(item.qty || 0), 10) || 0;
    const autoSchemeFree = schemePaid > 0 && schemeFree > 0 ? Math.floor(lineQtyInt / schemePaid) * schemeFree : 0;
    const lineFreeQty = batch.is_non_editable_free_qty ? autoSchemeFree : item.free_qty;
    const baseDiscount = batch.is_net ? Number(batch.net_discount_percent || 0) : originalDiscount;
    const recalc = calculateLineItem({
      qty: item.qty,
      freeQty: batch.prevent_free_qty ? 0 : lineFreeQty,
      salesRate: item.sales_rate,
      mrp: item.mrp,
      discountPercent: batch.prevent_discount || batch.prevent_net_rate ? 0 : baseDiscount,
      gstPercent: item.gst_percent,
      halfScheme: Boolean(batch.is_half_scheme)
    });
    if (!recalc.ok) return { err: fail(400, "VALIDATION_ERROR", recalc.message) };

    const final = { ...recalc.out };
    if (batch.prevent_net_rate) {
      final.discountPercent = 0;
      final.discountAmount = 0;
      final.netRate = final.salesRate;
      final.taxableAmount = Number((final.qty * final.netRate).toFixed(4));
      final.gstAmount = Number((final.taxableAmount * (final.gstPercent / 100)).toFixed(4));
      final.lineTotal = Number((final.taxableAmount + final.gstAmount).toFixed(4));
    }
    if (batch.prevent_free_qty && originalFreeQty > 0) warnings.push(`Free quantity was set to 0 (restricted by ${batch.mfg_name || "manufacturer"} policy).`);
    if (batch.prevent_discount && originalDiscount > 0) warnings.push(`Discount was set to 0% (restricted by ${batch.mfg_name || "manufacturer"} policy).`);
    if (batch.is_non_editable_free_qty && originalFreeQty !== autoSchemeFree) warnings.push(`Free quantity was auto-set by scheme for batch "${item.batch_no}" (locked free qty policy).`);

    const batchIdKey = String(item.batch_id);
    const lineQty = Number(item.qty || 0);
    const lineFree = Number(final.freeQty || 0);
    const usedBillable = invoiceQtyByBatch.get(batchIdKey) || 0;
    const usedFree = invoiceFreeQtyByBatch.get(batchIdKey) || 0;
    const stockBillable = Number(batch.current_stock || 0);
    const stockFree = Number(batch.current_free_stock || 0);
    const needBillable = usedBillable + lineQty;
    const needFree = usedFree + lineFree;
    if (stockBillable < needBillable) {
      return {
        err: fail(
          400,
          "BUSINESS_RULE",
          `Insufficient billable (paid) stock for "${item.product_name}" batch "${item.batch_no}". Billable available: ${stockBillable}; free balance: ${stockFree} (sold separately  not mixed with paid qty). This invoice needs ${needBillable} billable (${usedBillable} on other lines + ${lineQty} here). Lower paid qty, or post/adjust stock so paid units sit in the billable bucket.`
        )
      };
    }
    if (stockFree < needFree) {
      return {
        err: fail(
          400,
          "BUSINESS_RULE",
          `Insufficient free stock for "${item.product_name}" batch "${item.batch_no}". Available free: ${stockFree}, this invoice needs ${needFree} (${usedFree} on other lines + ${lineFree} here). Reduce free qty or use another batch.`
        )
      };
    }
    invoiceQtyByBatch.set(batchIdKey, needBillable);
    invoiceFreeQtyByBatch.set(batchIdKey, needFree);

    const splitGst = Number(final.gstAmount || 0);
    const cgstAmount = String(invoice.bill_type || "").toUpperCase() === "TAX_INVOICE" ? Number((splitGst / 2).toFixed(4)) : 0;
    const sgstAmount = String(invoice.bill_type || "").toUpperCase() === "TAX_INVOICE" ? Number((splitGst / 2).toFixed(4)) : 0;
    const igstAmount = 0;
    await q(
      `UPDATE sales_invoice_items
       SET free_qty = $3::int, discount_percent = $4::numeric, discount_amount = $5::numeric, net_rate = $6::numeric,
           taxable_amount = $7::numeric, gst_amount = $8::numeric, line_total = $9::numeric,
           cgst_amount = $10::numeric, sgst_amount = $11::numeric, igst_amount = $12::numeric
       WHERE id = $1 AND account_id = $2`,
      [
        item.id,
        accountId,
        Math.round(Number(final.freeQty || 0)),
        final.discountPercent,
        final.discountAmount,
        final.netRate,
        final.taxableAmount,
        final.gstAmount,
        final.lineTotal,
        cgstAmount,
        sgstAmount,
        igstAmount
      ]
    );

    const controlledNote = batch.is_control
      ? ` | Controlled: Rx ${item.prescription_no || ""}, Doctor ${item.doctor_name || ""}, Patient ${item.patient_name || ""}`
      : "";
    await q(
      `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, ref_type, ref_id, note, created_by_user_id, created_at)
       VALUES ($1,$2,$3::inventory_txn_type,$4::numeric,$5::numeric,$6,$7,$8,$9,now())`,
      [accountId, item.batch_id, "SALE", -Math.abs(Number(item.qty || 0)), -Math.abs(Number(final.freeQty || 0)), "SALE_INVOICE_ITEM", item.id, `Sale to ${invoice.customer_name}, Invoice: ${invoice.invoice_number}${controlledNote}`, actorId]
    );

    const looseQtySold = Number(item.loose_qty || 0);
    if (isRetailer && looseQtySold > 0) {
      const looseAvailable = Number(batch.loose_stock || 0);
      let packsToBreak = 0;
      let extraLooseFromBreak = 0;
      if (looseQtySold > looseAvailable) {
        const shortfall = looseQtySold - looseAvailable;
        packsToBreak = Math.ceil(shortfall / looseUnitFactor);
        extraLooseFromBreak = packsToBreak * looseUnitFactor;
      }

      if (packsToBreak > 0) {
        const residualBillable = stockBillable - needBillable;
        if (residualBillable < packsToBreak) {
          return {
            err: fail(
              400,
              "BUSINESS_RULE",
              `Cannot break ${packsToBreak} pack(s) for loose sale of "${item.product_name}" batch "${item.batch_no}". Need ${packsToBreak} more strip(s) but only ${residualBillable} remain after this line. Reduce loose qty or pick another batch.`
            )
          };
        }
        await q(
          `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, ref_type, ref_id, note, created_by_user_id, created_at)
           VALUES ($1,$2,$3::inventory_txn_type,$4::numeric,0,$5,$6,$7,$8,now())`,
          [accountId, item.batch_id, "BREAK_PACK", -packsToBreak, "SALE_INVOICE_ITEM", item.id, `Break ${packsToBreak} pack(s) → +${extraLooseFromBreak} loose ${batch.loose_unit_name || "TAB"} (Invoice ${invoice.invoice_number})`, actorId]
        );
        await q(`UPDATE product_batches SET loose_stock = loose_stock + $3, updated_at = now() WHERE id = $1 AND account_id = $2`, [item.batch_id, accountId, extraLooseFromBreak]);
      }

      await q(
        `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, ref_type, ref_id, note, created_by_user_id, created_at)
         VALUES ($1,$2,$3::inventory_txn_type,0,0,$4,$5,$6,$7,now())`,
        [accountId, item.batch_id, "LOOSE_SALE", "SALE_INVOICE_ITEM", item.id, `Loose sale: ${looseQtySold} ${batch.loose_unit_name || "TAB"} to ${invoice.customer_name} (Invoice ${invoice.invoice_number})`, actorId]
      );
      await q(`UPDATE product_batches SET loose_stock = GREATEST(0, loose_stock - $3), updated_at = now() WHERE id = $1 AND account_id = $2`, [item.batch_id, accountId, looseQtySold]);
    }

    lowStockBatches.add(String(item.batch_id));
  }

  const refreshed = await q(`SELECT qty, sales_rate, discount_amount, gst_amount FROM sales_invoice_items WHERE sales_invoice_id = $1 AND account_id = $2`, [invoiceId, accountId]);
  const t = calculateInvoiceTotals((refreshed.rows || []).map((r) => ({ qty: Number(r.qty || 0), salesRate: Number(r.sales_rate || 0), discountAmount: Number(r.discount_amount || 0), gstAmount: Number(r.gst_amount || 0) })));
  const autoCashFromProfile = isRetailer && (Boolean(invoice.is_walk_in_sale) || Boolean(customer.is_cash_customer));
  const markPaidFlag = confirmOptions && Object.prototype.hasOwnProperty.call(confirmOptions, "markPaidAtConfirm") ? confirmOptions.markPaidAtConfirm : undefined;
  let shouldAutoCashSettle;
  if (markPaidFlag === true) shouldAutoCashSettle = true;
  else if (markPaidFlag === false) shouldAutoCashSettle = false;
  else shouldAutoCashSettle = autoCashFromProfile;
  const totalAmt = Number(t.totalAmount);
  const balanceDueAfter = shouldAutoCashSettle ? 0 : totalAmt;
  const amountPaidAfter = shouldAutoCashSettle ? totalAmt : 0;
  const paymentNote =
    markPaidFlag === true
      ? "Cash payment recorded on bill confirm."
      : "Auto-recorded on retailer walk-in/instant cash confirm";
  await q(
    `UPDATE sales_invoices
     SET status = 'CONFIRMED'::sales_invoice_status,
         payment_status = CASE WHEN $11::boolean THEN 'PAID'::sales_payment_status ELSE 'UNPAID'::sales_payment_status END,
         subtotal = $3::numeric, total_discount = $4::numeric, total_gst = $5::numeric, total_amount = $6::numeric, round_off = $7::numeric,
         balance_due = $9::numeric, amount_paid = $10::numeric,
         confirmed_by_user_id = $8, confirmed_at = now(), updated_at = now()
     WHERE id = $1 AND account_id = $2`,
    [
      invoiceId,
      accountId,
      t.subtotal,
      t.totalDiscount,
      t.totalGst,
      totalAmt,
      t.roundOff,
      actorId,
      balanceDueAfter,
      amountPaidAfter,
      shouldAutoCashSettle
    ]
  );
  if (shouldAutoCashSettle && totalAmt > 0.0001) {
    await q(
      `INSERT INTO customer_payments (
         account_id, customer_id, sales_invoice_id, allocation_type, payment_date, amount, payment_mode, notes, created_by_user_id
       )
       VALUES ($1,$2,$3,'INVOICE',CURRENT_DATE,$4::numeric,'CASH'::customer_payment_mode_type,$5,$6)`,
      [accountId, invoice.customer_id, invoiceId, totalAmt, paymentNote, actorId]
    );
  }
  if (isRetailer) {
    for (const item of items) {
      if (!String(item.prescription_no || "").trim()) continue;
      await q(
        `INSERT INTO prescriptions (
           account_id, sales_invoice_id, prescription_no, doctor_name, patient_name, patient_phone, prescription_date, created_by_user_id
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          accountId,
          invoiceId,
          String(item.prescription_no || "").trim(),
          String(item.doctor_name || "").trim() || null,
          String(item.patient_name || invoice.walk_in_patient_name || customer.name || "").trim(),
          String(invoice.walk_in_patient_phone || "").trim() || null,
          invoice.invoice_date || null,
          actorId
        ]
      );
    }
  }
  return { ok: true, warnings, affectedBatchIds: [...lowStockBatches] };
}

module.exports = { runConfirmSalesInvoiceInTx };
