const { clean } = require("../../shared/sales");

/**
 * Cancel one sales invoice inside an existing transaction (q).
 * @returns {Promise<{ ok: true }|{ ok: false, code: string, message: string }>}
 */
async function cancelSalesInvoiceTx(q, { accountId, actorId, invoiceId, cancelReason }) {
  const reason = clean(cancelReason || "Cancelled from UI");
  const invRs = await q(`SELECT * FROM sales_invoices WHERE id = $1 AND account_id = $2 LIMIT 1`, [invoiceId, accountId]);
  const invoice = invRs.rows?.[0] || null;
  if (!invoice) return { ok: false, code: "NOT_FOUND", message: "Invoice not found" };
  if (String(invoice.status) === "CANCELLED") return { ok: true, alreadyCancelled: true, affectedBatchIds: [] };
  if (Number(invoice.amount_paid || 0) > 0) {
    return {
      ok: false,
      code: "BUSINESS_RULE",
      message: `Cannot cancel invoice with payments received (₹${invoice.amount_paid} paid).`
    };
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
     SET status = 'CANCELLED'::sales_invoice_status, cancel_reason = $3, cancelled_at = now(), cancelled_by_user_id = $4, updated_at = now()
     WHERE id = $1 AND account_id = $2`,
    [invoiceId, accountId, reason, actorId]
  );
  return { ok: true, affectedBatchIds: [...new Set(affectedBatchIds)] };
}

module.exports = { cancelSalesInvoiceTx };
