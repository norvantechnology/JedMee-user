const { clean } = require("../../shared/purchase");

/**
 * Cancel one purchase invoice inside an existing transaction (q).
 * @returns {Promise<{ ok: true, alreadyCancelled?: boolean }|{ ok: false, code: string, message: string }>}
 */
async function cancelPurchaseInvoiceTx(q, { accountId, actorId, invoiceId, cancelReason }) {
  const reason = clean(cancelReason) || "Cancelled by user";
  const invR = await q(
    `SELECT * FROM purchase_invoices WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [invoiceId, accountId]
  );
  const invoice = invR.rows?.[0];
  if (!invoice) return { ok: false, code: "NOT_FOUND", message: "Purchase invoice not found." };
  if (String(invoice.status) === "CANCELLED") return { ok: true, alreadyCancelled: true, affectedBatchIds: [] };
  if (Number(invoice.amount_paid || 0) > 0 || ["PARTIAL", "PAID"].includes(String(invoice.payment_status || "").toUpperCase())) {
    return {
      ok: false,
      code: "BUSINESS_RULE",
      message: `Cannot cancel invoice with payments recorded (₹${Number(invoice.amount_paid || 0).toFixed(2)} paid).`
    };
  }

  const affectedBatchIds = [];
  if (String(invoice.status) === "CONFIRMED") {
    const txns = await q(
      `
      SELECT it.*
      FROM inventory_txns it
      JOIN purchase_invoice_items pii ON pii.id = it.ref_id
      WHERE it.account_id = $1
        AND it.ref_type = 'PURCHASE_INVOICE_ITEM'
        AND pii.purchase_invoice_id = $2
      `,
      [accountId, invoiceId]
    );
    for (const t of txns.rows || []) {
      if (t.batch_id) affectedBatchIds.push(String(t.batch_id));
      await q(
        `
        INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, ref_type, ref_id, note, created_by_user_id)
        VALUES ($1,$2,'PURCHASE_RETURN',$3,$4,'PURCHASE_INVOICE_ITEM',$5,$6,$7)
        `,
        [
          accountId,
          t.batch_id,
          -Number(t.qty || 0),
          -Number(t.free_qty || 0),
          t.ref_id,
          `Reversal for cancelled purchase invoice ${invoice.invoice_number}`,
          actorId
        ]
      );
    }
  }

  await q(
    `
    UPDATE purchase_invoices
    SET status = 'CANCELLED',
        cancelled_at = now(),
        cancel_reason = $3,
        updated_by_user_id = $4,
        updated_at = now()
    WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
    `,
    [invoiceId, accountId, reason, actorId]
  );
  return { ok: true, affectedBatchIds: [...new Set(affectedBatchIds)] };
}

module.exports = { cancelPurchaseInvoiceTx };
