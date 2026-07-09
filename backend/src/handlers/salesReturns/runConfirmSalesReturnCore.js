const { fail } = require("../../shared/response");
const { refreshSalesInvoicePaymentTotals } = require("../../shared/sales");

async function runConfirmSalesReturnInTx(q, ctx, returnId) {
  const { accountId, actorId } = ctx;
  const rs = await q(`SELECT * FROM sales_returns WHERE id = $1 AND account_id = $2 LIMIT 1`, [returnId, accountId]);
  const ret = rs.rows?.[0] || null;
  if (!ret) return { err: fail(404, "NOT_FOUND", "Sales return not found") };
  if (String(ret.status) !== "DRAFT") return { err: fail(400, "BUSINESS_RULE", "Only DRAFT returns can be confirmed.") };
  const items = await q(`SELECT * FROM sales_return_items WHERE sales_return_id = $1 AND account_id = $2`, [returnId, accountId]);
  const lowStockBatches = new Set();

  for (const item of items.rows || []) {
    // ── Manufacturer policy check ──────────────────────────────────────────
    if (item.mfg_company_id) {
      const m = await q(`SELECT name, prevent_return_product FROM mfg_companies WHERE id = $1 AND account_id = $2 LIMIT 1`, [item.mfg_company_id, accountId]);
      if (Boolean(m.rows?.[0]?.prevent_return_product)) {
        return { err: fail(400, "BUSINESS_RULE", `Returns are not allowed for manufacturer "${m.rows?.[0]?.name || "Unknown"}" products.`) };
      }
    }

    // ── Validate strip qty against original invoice item ───────────────────
    if (item.sales_invoice_item_id) {
      const o = await q(
        `SELECT qty, loose_qty FROM sales_invoice_items WHERE id = $1 AND account_id = $2 LIMIT 1`,
        [item.sales_invoice_item_id, accountId]
      );
      const sold = Number(o.rows?.[0]?.qty || 0);
      const soldLoose = Number(o.rows?.[0]?.loose_qty || 0);

      // Already confirmed returns for this invoice item (excluding current return)
      const already = await q(
        `SELECT COALESCE(SUM(sri.return_qty),0)::numeric      AS total_qty,
                COALESCE(SUM(sri.return_loose_qty),0)::numeric AS total_loose
         FROM sales_return_items sri
         JOIN sales_returns sr ON sr.id = sri.sales_return_id
         WHERE sri.sales_invoice_item_id = $1 AND sri.account_id = $2
           AND sr.status = 'CONFIRMED'::sales_return_status`,
        [item.sales_invoice_item_id, accountId]
      );
      const returned = Number(already.rows?.[0]?.total_qty || 0);
      const returnedLoose = Number(already.rows?.[0]?.total_loose || 0);

      const maxStrip = sold - returned;
      const maxLoose = soldLoose - returnedLoose;

      if (Number(item.return_qty || 0) > maxStrip) {
        return { err: fail(400, "BUSINESS_RULE", `Return qty (${item.return_qty}) exceeds returnable qty (${maxStrip}) for batch "${item.batch_no}".`) };
      }
      if (Number(item.return_loose_qty || 0) > maxLoose) {
        return { err: fail(400, "BUSINESS_RULE", `Return loose qty (${item.return_loose_qty}) exceeds returnable loose qty (${maxLoose}) for batch "${item.batch_no}".`) };
      }
    }

    // ── Post strip inventory transaction (SALE_RETURN) ─────────────────────
    if (Number(item.return_qty || 0) > 0 || Number(item.return_free_qty || 0) > 0) {
      await q(
        `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, ref_type, ref_id, note, created_by_user_id, created_at)
         VALUES ($1,$2,$3::inventory_txn_type,$4::numeric,$5::numeric,$6,$7,$8,$9,now())`,
        [
          accountId, item.batch_id, "SALE_RETURN",
          Number(item.return_qty || 0), Number(item.return_free_qty || 0),
          "SALE_RETURN_ITEM", item.id,
          `Sales return ${ret.return_number}`, actorId
        ]
      );
    }

    // ── Restore loose stock on the batch ───────────────────────────────────
    const returnLooseQty = Number(item.return_loose_qty || 0);
    if (returnLooseQty > 0 && item.batch_id) {
      await q(
        `UPDATE product_batches
         SET loose_stock = loose_stock + $3, updated_at = now()
         WHERE id = $1 AND account_id = $2`,
        [item.batch_id, accountId, returnLooseQty]
      );
      // Record a loose-return inventory event for traceability
      await q(
        `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, ref_type, ref_id, note, created_by_user_id, created_at)
         VALUES ($1,$2,'SALE_RETURN'::inventory_txn_type,0,0,$3,$4,$5,$6,now())`,
        [
          accountId, item.batch_id,
          "SALE_RETURN_ITEM", item.id,
          `Loose return: ${returnLooseQty} unit(s) - Sales return ${ret.return_number}`, actorId
        ]
      );
    }

    if (item.batch_id) lowStockBatches.add(String(item.batch_id));
  }

  const total = (items.rows || []).reduce((s, x) => s + Number(x.return_amount || 0), 0);
  await q(
    `UPDATE sales_returns
     SET status = 'CONFIRMED'::sales_return_status, total_return_amount = $3, confirmed_by_user_id = $4, confirmed_at = now(), updated_at = now()
     WHERE id = $1 AND account_id = $2`,
    [returnId, accountId, total, actorId]
  );
  if (ret.sales_invoice_id) {
    await refreshSalesInvoicePaymentTotals(q, accountId, ret.sales_invoice_id);
  }
  return { id: returnId, affectedBatchIds: [...lowStockBatches] };
}

module.exports = { runConfirmSalesReturnInTx };
