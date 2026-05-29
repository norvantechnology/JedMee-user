const { fail } = require("../../shared/response");
const { clean, refreshInvoicePaymentSummary } = require("../../shared/purchase");
const { normalizeVendorPaymentMode } = require("../../shared/paymentModes");
const { getMfgCompany, assertPurchaseAllowed } = require("../../shared/mfgCompanyPolicy");
const { computeDerived } = require("../../shared/productBatchCalc");
const { upsertSupplierProductsForPurchase } = require("../../shared/supplierProducts");

function toGstSlab(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const i = Math.round(n);
  return [0, 5, 12, 18, 28].includes(i) ? i : 0;
}

function num(v, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Post PURCHASE inventory txns and mark invoice CONFIRMED. Shared by HTTP confirm and CSV import.
 * @param {function} rawQ - transaction query fn(text, params)
 * @param {{ accountId: string, actorId: string }} ctx
 * @param {string} invoiceId
 * @param {string|null} confirmNote
 */
async function runConfirmPurchaseInvoiceInTx(rawQ, ctx, invoiceId, confirmNote) {
  const { accountId, actorId } = ctx;
  const q = async (label, text, params) => {
    try {
      return await rawQ(text, params);
    } catch (err) {
      err._queryLabel = label;
      throw err;
    }
  };

  const invRes = await q(
    "load-invoice",
    `SELECT * FROM purchase_invoices
     WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
     FOR UPDATE
     LIMIT 1`,
    [invoiceId, accountId]
  );
  const invoice = invRes.rows?.[0];
  if (!invoice) return { err: fail(404, "NOT_FOUND", "Purchase invoice not found.") };
  if (String(invoice.status) === "CONFIRMED") return { invoice, alreadyConfirmed: true, affectedBatchIds: [] };
  if (String(invoice.status) !== "DRAFT") return { err: fail(400, "INVALID_STATE", "Only draft invoices can be confirmed.") };

  const itemsRes = await q(
    "load-items",
    `SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = $1 AND account_id = $2 ORDER BY created_at ASC`,
    [invoiceId, accountId]
  );
  const items = itemsRes.rows || [];
  if (!items.length) return { err: fail(400, "VALIDATION_ERROR", "Invoice has no line items.") };

  if (invoice.division_id) {
    const divMfg = await q(
      "invoice-division-mfg",
      `SELECT mfg_company_id FROM divisions WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [invoice.division_id, accountId]
    );
    const mid = divMfg.rows?.[0]?.mfg_company_id;
    if (mid) {
      const mfg = await getMfgCompany(accountId, mid);
      const lockResp = assertPurchaseAllowed(mfg);
      if (lockResp) return { err: lockResp };
    }
  }

  // BE-13: Warn (non-blocking) if any line item has an already-expired batch
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const expiredWarnings = [];
  for (const it of items) {
    if (it.expiry_date && String(it.expiry_date).slice(0, 10) < todayYmd) {
      expiredWarnings.push(`Batch "${it.batch_no}" (${it.product_name}) has already expired (${String(it.expiry_date).slice(0, 10)}). Confirm only if this is intentional.`);
    }
  }

  const lowStockBatches = new Set();
  for (const it of items) {
    const gstSlab = toGstSlab(it.gst_percent);
    const lineMrp = num(it.mrp, 0);
    const lineRate = num(it.purchase_rate, 0);
    const lineSales = num(it.sales_rate, 0) || lineRate;
    const lineLanding = num(it.landing_cost, 0);
    const lineQty = num(it.qty, 0);
    const lineFreeQty = num(it.free_qty, 0);

    if (it.mfg_company_id) {
      const mfg = await getMfgCompany(accountId, it.mfg_company_id);
      const lockResp = assertPurchaseAllowed(mfg);
      if (lockResp) return { err: lockResp };
    }

    let batchId = String(it.batch_id || "");

    if (batchId) {
      const b = await q(
        "batch-lookup-by-id",
        `SELECT pb.*,
                COALESCE(p.sales_gst, pb.sales_gst) AS sales_gst,
                COALESCE(p.purchase_gst, pb.purchase_gst) AS purchase_gst,
                COALESCE(p.is_discount_enabled, pb.is_discount_enabled) AS is_discount_enabled,
                COALESCE(p.is_half_scheme, pb.is_half_scheme) AS is_half_scheme,
                COALESCE(p.scheme_qty_paid, pb.scheme_qty_paid) AS scheme_qty_paid,
                COALESCE(p.scheme_qty_free, pb.scheme_qty_free) AS scheme_qty_free
         FROM product_batches pb
         JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
         WHERE pb.id = $1 AND pb.account_id = $2 AND pb.product_id = $3 AND pb.deleted_at IS NULL
         LIMIT 1`,
        [batchId, accountId, it.product_id]
      );
      let batch = b.rows?.[0];

      if (!batch) {
        const byNo = await q(
          "batch-lookup-by-no",
          `SELECT pb.*,
                  COALESCE(p.sales_gst, pb.sales_gst) AS sales_gst,
                  COALESCE(p.purchase_gst, pb.purchase_gst) AS purchase_gst,
                  COALESCE(p.is_discount_enabled, pb.is_discount_enabled) AS is_discount_enabled,
                  COALESCE(p.is_half_scheme, pb.is_half_scheme) AS is_half_scheme,
                  COALESCE(p.scheme_qty_paid, pb.scheme_qty_paid) AS scheme_qty_paid,
                  COALESCE(p.scheme_qty_free, pb.scheme_qty_free) AS scheme_qty_free
           FROM product_batches pb
           JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
           WHERE pb.account_id = $1 AND pb.product_id = $2 AND lower(pb.batch_no) = lower($3) AND pb.deleted_at IS NULL
           LIMIT 1`,
          [accountId, it.product_id, it.batch_no]
        );
        batch = byNo.rows?.[0];
        if (batch?.id) {
          batchId = String(batch.id);
          await q(
            "item-link-found-batch",
            `UPDATE purchase_invoice_items
             SET batch_id = $3, confirmed_batch_id = $3, updated_at = now()
             WHERE id = $1 AND account_id = $2`,
            [it.id, accountId, batchId]
          );
        }
      }

      if (!batch) {
        batchId = "";
      }

      if (batchId && batch) {
        const batchMrp = num(batch.mrp, 0);
        const batchRate = num(batch.purchase_rate, 0);
        const batchSales = num(batch.sales_rate, 0);

        if (batchMrp !== lineMrp || batchRate !== lineRate || batchSales !== lineSales) {
          const derived = computeDerived({
            purchaseRate: lineRate,
            mrp: lineMrp,
            salesRate: lineSales,
            purchaseGST: num(batch.purchase_gst, gstSlab),
            salesGST: num(batch.sales_gst, gstSlab),
            discountPurchase: num(batch.discount_purchase, 0),
            retailDiscountPercent: num(batch.retail_discount_percent, 0),
            netDiscountPercent: num(batch.net_discount_percent, 0),
            isDiscountEnabled: Boolean(batch.is_discount_enabled),
            isNet: Boolean(batch.is_net),
            isHalfScheme: Boolean(batch.is_half_scheme),
            schemeQtyPaid: num(batch.scheme_qty_paid, 0),
            schemeQtyFree: num(batch.scheme_qty_free, 0),
            openingStock: num(batch.opening_stock, 0),
            openStockFreeQty: num(batch.open_stock_free_qty, 0)
          });
          await q(
            "insert-price-history",
            `INSERT INTO batch_price_history (
               account_id, batch_id, purchase_invoice_id, purchase_invoice_item_id,
               old_mrp, new_mrp, old_purchase_rate, new_purchase_rate, old_sales_rate, new_sales_rate,
               changed_by_user_id, change_note
             )
             VALUES ($1,$2,$3,$4,$5::numeric,$6::numeric,$7::numeric,$8::numeric,$9::numeric,$10::numeric,$11,$12)`,
            [
              accountId,
              batchId,
              invoiceId,
              it.id,
              batchMrp,
              lineMrp,
              batchRate,
              lineRate,
              batchSales,
              lineSales,
              actorId,
              "Price updated on purchase invoice confirm"
            ]
          );
          await q(
            "update-batch-pricing",
            `UPDATE product_batches
             SET mrp = $3::numeric, purchase_rate = $4::numeric, sales_rate = $5::numeric, retail_rate = $5::numeric,
                 landing_cost = $6::numeric, discount_sales = $7::numeric, net_rate = $8::numeric,
                 updated_by_user_id = $9, updated_at = now()
             WHERE id = $1 AND account_id = $2`,
            [batchId, accountId, lineMrp, lineRate, lineSales, derived.landingCost, derived.discountSales, derived.netRate, actorId]
          );
        }

        await q(
          "batch-stamp-division-vendor",
          `UPDATE product_batches
           SET division_id = $3, vendor_id = $4, updated_by_user_id = $5, updated_at = now()
           WHERE id = $1 AND account_id = $2`,
          [batchId, accountId, invoice.division_id || null, invoice.division_id ? null : invoice.vendor_id || null, actorId]
        );

        await q(
          "item-confirm-existing-batch",
          `UPDATE purchase_invoice_items
           SET confirmed_batch_id = $3, updated_at = now()
           WHERE id = $1 AND account_id = $2`,
          [it.id, accountId, batchId]
        );
      }
    }

    if (!batchId) {
      if (!clean(it.batch_no)) {
        return { err: fail(400, "VALIDATION_ERROR", `Batch number is required for product (${it.product_name}).`) };
      }
      const existing = await q(
        "find-existing-batch",
        `SELECT id FROM product_batches
         WHERE account_id = $1 AND product_id = $2 AND lower(batch_no) = lower($3) AND deleted_at IS NULL
         LIMIT 1`,
        [accountId, it.product_id, it.batch_no]
      );
      if (existing.rows?.[0]?.id) {
        batchId = String(existing.rows[0].id);
      } else {
        // Load product flags so the batch snapshot reflects the actual product settings
        const prodFlagsRes = await q(
          "load-product-flags",
          `SELECT is_control, is_otc, is_discount_enabled, is_half_scheme, stockable
           FROM products WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
          [it.product_id, accountId]
        );
        const prodFlags = prodFlagsRes.rows?.[0] || {};

        const ins = await q(
          "insert-new-batch",
          `INSERT INTO product_batches (
             account_id, product_id, vendor_id, division_id, product_code, product_name, drug_name,
             batch_no, expiry_date, mfg_date,
             mrp, purchase_rate, sales_rate, retail_rate, net_rate, landing_cost,
             discount_sales, sales_gst, purchase_gst,
             opening_stock, open_stock_free_qty, stockable,
             is_discount_enabled, is_hold, is_half_scheme, is_net, is_non_editable_free_qty, is_control, is_otc,
             created_by_user_id, updated_by_user_id
           )
           VALUES (
             $1,$2,$3,$4,$5,$6,$7,
             $8,$9,$10,
             $11::numeric,$12::numeric,$13::numeric,$13::numeric,$13::numeric,$14::numeric,
             0::numeric,$15::numeric,$15::numeric,
             0::numeric,0::numeric,$17,
             $18,false,$19,false,false,$20,$21,
             $16,$16
           )
           RETURNING id`,
          [
            accountId,
            it.product_id,
            invoice.division_id ? null : invoice.vendor_id || null,
            invoice.division_id || null,
            it.product_code,
            it.product_name,
            it.drug_name,
            it.batch_no,
            it.expiry_date,
            it.mfg_date,
            lineMrp,
            lineRate,
            lineSales,
            lineLanding,
            gstSlab,
            actorId,
            Boolean(prodFlags.stockable ?? true),
            Boolean(prodFlags.is_discount_enabled ?? true),
            Boolean(prodFlags.is_half_scheme ?? false),
            Boolean(prodFlags.is_control ?? false),
            prodFlags.is_otc !== undefined ? Boolean(prodFlags.is_otc) : true
          ]
        );
        batchId = String(ins.rows?.[0]?.id || "");
      }
      await q(
        "item-link-new-batch",
        `UPDATE purchase_invoice_items
         SET batch_id = $3, confirmed_batch_id = $3, updated_at = now()
         WHERE id = $1 AND account_id = $2`,
        [it.id, accountId, batchId]
      );
    }

    const note = `Purchase from vendor invoice ${invoice.invoice_number}`;
    await q(
      "insert-inventory-txn",
      `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, ref_type, ref_id, note, created_by_user_id)
       VALUES ($1,$2,'PURCHASE'::inventory_txn_type,$3::numeric,$4::numeric,'PURCHASE_INVOICE_ITEM',$5,$6,$7)`,
      [accountId, batchId, lineQty, lineFreeQty, it.id, note, actorId]
    );
    lowStockBatches.add(String(batchId));
  }

  await q(
    "mark-invoice-confirmed",
    `UPDATE purchase_invoices
     SET status = 'CONFIRMED',
         confirmed_by_user_id = $3,
         confirmed_at = now(),
         updated_by_user_id = $3,
         updated_at = now(),
         notes = COALESCE($4, notes)
     WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL`,
    [invoiceId, accountId, actorId, clean(confirmNote) || null]
  );

  if (invoice.vendor_id) {
    const dueNowRs = await q(
      "reload-due-after-confirm",
      `SELECT balance_due FROM purchase_invoices WHERE id = $1 AND account_id = $2 LIMIT 1`,
      [invoiceId, accountId]
    );
    let remainingDue = Number(dueNowRs.rows?.[0]?.balance_due || 0);
    if (remainingDue > 0) {
      const advRows = await q(
        "vendor-advance-rows",
        `SELECT id, amount
         FROM vendor_payments
         WHERE account_id = $1
           AND vendor_id = $2
           AND purchase_invoice_id IS NULL
           AND COALESCE(allocation_type, 'ON_ACCOUNT') = 'ON_ACCOUNT'
         ORDER BY payment_date ASC, created_at ASC, id ASC
         FOR UPDATE`,
        [accountId, invoice.vendor_id]
      );
      for (const row of advRows.rows || []) {
        if (remainingDue <= 0.0001) break;
        const avail = Number(row.amount || 0);
        if (!(avail > 0)) continue;
        const use = Math.min(avail, remainingDue);
        if (use <= 0) continue;
        if (use + 0.0001 < avail) {
          await q(
            "shrink-advance-row",
            `UPDATE vendor_payments
             SET amount = $3::numeric, updated_at = now()
             WHERE id = $1 AND account_id = $2`,
            [row.id, accountId, avail - use]
          );
          await q(
            "insert-applied-vendor-advance",
            `INSERT INTO vendor_payments (
               account_id, vendor_id, purchase_invoice_id, allocation_type, payment_date, amount, payment_mode, notes, created_by_user_id
             )
             VALUES ($1,$2,$3,'INVOICE',CURRENT_DATE,$4::numeric,'OTHER'::payment_mode_type,'Advance adjusted on purchase confirm',$5)`,
            [accountId, invoice.vendor_id, invoiceId, use, actorId]
          );
        } else {
          await q(
            "convert-advance-row-to-invoice",
            `UPDATE vendor_payments
             SET purchase_invoice_id = $3,
                 allocation_type = 'INVOICE',
                 notes = COALESCE(notes, 'Advance adjusted on purchase confirm'),
                 updated_at = now()
             WHERE id = $1 AND account_id = $2`,
            [row.id, accountId, invoiceId]
          );
        }
        remainingDue -= use;
      }
      await q("refresh-payment-summary-post-advance", `SELECT 1 FROM purchase_invoices WHERE id = $1`, [invoiceId]);
      await refreshInvoicePaymentSummary(rawQ, accountId, invoiceId);
    }
  }

  const markPaidFlag =
    confirmOptions && Object.prototype.hasOwnProperty.call(confirmOptions, "markPaidAtConfirm")
      ? confirmOptions.markPaidAtConfirm
      : undefined;
  let shouldMarkPaid = markPaidFlag === true;
  if (markPaidFlag === false) shouldMarkPaid = false;

  if (shouldMarkPaid) {
    await refreshInvoicePaymentSummary(rawQ, accountId, invoiceId);
    const dueRs = await q(
      "reload-balance-for-paid-confirm",
      `SELECT balance_due, division_id, vendor_id FROM purchase_invoices WHERE id = $1 AND account_id = $2 LIMIT 1`,
      [invoiceId, accountId]
    );
    const row = dueRs.rows?.[0];
    const balanceDue = Number(row?.balance_due || 0);
    if (balanceDue > 0.0001) {
      const payMode = normalizeVendorPaymentMode(confirmOptions.paymentMode, "CASH");
      const payNote = `Payment (${payMode}) recorded on purchase confirm.`;
      if (row?.division_id) {
        const div = await q(
          "division-mfg-for-payment",
          `SELECT mfg_company_id FROM divisions WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
          [row.division_id, accountId]
        );
        const mfgId = div.rows?.[0]?.mfg_company_id || null;
        await q(
          "insert-division-payment-on-confirm",
          `INSERT INTO division_payments (
             account_id, division_id, mfg_company_id, purchase_invoice_id, payment_date, amount, payment_mode, notes, created_by_user_id
           )
           VALUES ($1,$2,$3,$4,CURRENT_DATE,$5::numeric,$6::payment_mode_type,$7,$8)`,
          [accountId, row.division_id, mfgId, invoiceId, balanceDue, payMode, payNote, actorId]
        );
      } else if (row?.vendor_id) {
        await q(
          "insert-vendor-payment-on-confirm",
          `INSERT INTO vendor_payments (
             account_id, vendor_id, purchase_invoice_id, allocation_type, payment_date, amount, payment_mode, notes, created_by_user_id
           )
           VALUES ($1,$2,$3,'INVOICE',CURRENT_DATE,$4::numeric,$5::payment_mode_type,$6,$7)`,
          [accountId, row.vendor_id, invoiceId, balanceDue, payMode, payNote, actorId]
        );
      }
      await refreshInvoicePaymentSummary(rawQ, accountId, invoiceId);
    }
  } else {
    await q(
      "mark-purchase-credit-mode",
      `UPDATE purchase_invoices SET payment_mode = 'CREDIT', updated_at = now() WHERE id = $1 AND account_id = $2`,
      [invoiceId, accountId]
    );
  }

  await upsertSupplierProductsForPurchase({
    q: rawQ,
    accountId,
    vendorId: invoice.vendor_id,
    items,
    invoiceDate: invoice.invoice_date,
    actorId
  });

  const done = await q(
    "reload-invoice",
    `SELECT * FROM purchase_invoices WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [invoiceId, accountId]
  );
  return { invoice: done.rows?.[0] || null, affectedBatchIds: [...lowStockBatches], warnings: expiredWarnings };
}

module.exports = { runConfirmPurchaseInvoiceInTx };
