const { clean } = require("../../shared/sales");
const { MSG } = require("../../shared/apiMessages");

/**
 * Cancel one sales invoice inside an existing transaction (q).
 *
 * Handles two cases:
 *  1. Invoice has manual payments (amount_paid > 0 from non-auto records) → blocked.
 *  2. Invoice was auto-settled at confirm time (walk-in / retailer cash) → the
 *     auto-generated customer_payments record is deleted so the cancel can proceed.
 *
 * @returns {Promise<{ ok: true }|{ ok: false, code: string, message: string }>}
 */
async function cancelSalesInvoiceTx(q, { accountId, actorId, invoiceId, cancelReason }) {
  const reason = clean(cancelReason || "Cancelled from UI");
  const invRs = await q(`SELECT * FROM sales_invoices WHERE id = $1 AND account_id = $2 LIMIT 1`, [invoiceId, accountId]);
  const invoice = invRs.rows?.[0] || null;
  if (!invoice) return { ok: false, code: "NOT_FOUND", message: MSG.INVOICE_NOT_FOUND };
  if (String(invoice.status) === "CANCELLED") return { ok: true, alreadyCancelled: true, affectedBatchIds: [] };

  const amountPaid = Number(invoice.amount_paid || 0);
  if (amountPaid > 0) {
    // Check whether ALL payments are auto-settled system records (safe to reverse)
    const paymentsRs = await q(
      `SELECT id, notes FROM customer_payments
       WHERE account_id = $1 AND sales_invoice_id = $2`,
      [accountId, invoiceId]
    );
    const payments = paymentsRs.rows || [];
    const hasManualPayments = payments.some(
      (p) => !String(p.notes || "").startsWith("Auto-recorded") &&
             !String(p.notes || "").startsWith("Cash payment recorded on bill confirm")
    );
    if (hasManualPayments) {
      return {
        ok: false,
        code: "BUSINESS_RULE",
        message: MSG.CANNOT_CANCEL_WITH_PAYMENTS
      };
    }
    // All payments are auto-settled - delete them so the cancel can proceed
    await q(
      `DELETE FROM customer_payments WHERE account_id = $1 AND sales_invoice_id = $2`,
      [accountId, invoiceId]
    );
  }

  const affectedBatchIds = [];
  if (String(invoice.status) === "CONFIRMED") {
    const items = await q(`SELECT * FROM sales_invoice_items WHERE sales_invoice_id = $1 AND account_id = $2`, [invoiceId, accountId]);
    for (const item of items.rows || []) {
      if (item.batch_id) affectedBatchIds.push(String(item.batch_id));
      await q(
        `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, ref_type, ref_id, note, created_by_user_id, created_at)
         VALUES ($1,$2,$3::inventory_txn_type,$4::numeric,$5::numeric,$6,$7,$8,$9,now())`,
        [
          accountId,
          item.batch_id,
          "SALE_CANCELLATION",
          Math.abs(Number(item.qty || 0)),
          Math.abs(Number(item.free_qty || 0)),
          "SALE_INVOICE_ITEM",
          item.id,
          `Cancellation of Invoice ${invoice.invoice_number}. Reason: ${reason}`,
          actorId
        ]
      );
    }
  }
  await q(
    `UPDATE sales_invoices
     SET status = 'CANCELLED'::sales_invoice_status,
         cancel_reason = $3,
         cancelled_at = now(),
         cancelled_by_user_id = $4,
         amount_paid = 0,
         balance_due = 0,
         payment_status = 'UNPAID'::sales_payment_status,
         updated_at = now()
     WHERE id = $1 AND account_id = $2`,
    [invoiceId, accountId, reason, actorId]
  );
  return { ok: true, affectedBatchIds: [...new Set(affectedBatchIds)] };
}

module.exports = { cancelSalesInvoiceTx };
