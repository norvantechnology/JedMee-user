const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { getMfgCompany } = require("../../shared/mfgCompanyPolicy");
const { refreshLowStockNotifications } = require("../../shared/lowStockInstantNotify");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_RETURNS", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const id = String(event?.pathParameters?.id || "").trim();
  if (!id) return fail(400, "BAD_REQUEST", "id is required");

  try {
    const data = await withTransaction(async (q) => {
      const r = await q(`SELECT * FROM purchase_returns WHERE id = $1 AND account_id = $2 LIMIT 1`, [id, ctx.accountId]);
      const ret = r.rows?.[0];
      if (!ret) return { err: fail(404, "NOT_FOUND", "Purchase return not found.") };
      if (String(ret.status) === "CONFIRMED") return { item: ret, alreadyConfirmed: true };
      if (String(ret.status) !== "DRAFT") return { err: fail(400, "INVALID_STATE", "Only draft returns can be confirmed.") };

      const itemsR = await q(
        `
        SELECT pri.*,
               pii.qty          AS purchased_qty,
               pii.free_qty     AS purchased_free_qty,
               pii.mfg_company_id
        FROM purchase_return_items pri
        LEFT JOIN purchase_invoice_items pii ON pii.id = pri.purchase_invoice_item_id
        WHERE pri.purchase_return_id = $1 AND pri.account_id = $2
        `,
        [id, ctx.accountId]
      );
      const items = itemsR.rows || [];
      if (!items.length) return { err: fail(400, "VALIDATION_ERROR", "Return has no line items.") };

      const lowStockBatches = new Set();
      for (const it of items) {
        if (it.mfg_company_id) {
          const mfg = await getMfgCompany(ctx.accountId, it.mfg_company_id);
          if (mfg && Boolean(mfg.prevent_return_product)) {
            return { err: fail(400, "POLICY_BLOCK", `Return is blocked for manufacturer: ${mfg.name || "Unknown"}.`) };
          }
        }
        // Only validate qty limits when linked to an original purchase invoice item (not freehand)
        if (it.purchase_invoice_item_id) {
          const prevR = await q(
            `
            SELECT
              COALESCE(SUM(pri.return_qty), 0) AS q,
              COALESCE(SUM(pri.return_free_qty), 0) AS fq
            FROM purchase_return_items pri
            JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
            WHERE pri.account_id = $1
              AND pri.purchase_invoice_item_id = $2
              AND pr.status = 'CONFIRMED'
              AND pr.id <> $3
            `,
            [ctx.accountId, it.purchase_invoice_item_id, id]
          );
          const used = Number(prevR.rows?.[0]?.q || 0);
          const usedFree = Number(prevR.rows?.[0]?.fq || 0);
          if (used + Number(it.return_qty || 0) > Number(it.purchased_qty || 0)) {
            return { err: fail(400, "VALIDATION_ERROR", "Return qty exceeds original purchased qty.") };
          }
          if (usedFree + Number(it.return_free_qty || 0) > Number(it.purchased_free_qty || 0)) {
            return { err: fail(400, "VALIDATION_ERROR", "Return free qty exceeds original purchased free qty.") };
          }
        }
        // Only post inventory transaction when a batch is linked
        if (it.batch_id) {
          // Strip + free qty inventory deduction
          if (Number(it.return_qty || 0) > 0 || Number(it.return_free_qty || 0) > 0) {
            await q(
              `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, ref_type, ref_id, note, created_by_user_id)
               VALUES ($1,$2,'PURCHASE_RETURN',$3,$4,'PURCHASE_RETURN_ITEM',$5,$6,$7)`,
              [
                ctx.accountId, it.batch_id,
                -Number(it.return_qty || 0), -Number(it.return_free_qty || 0),
                it.id, `Purchase return ${ret.return_number}`, actorId
              ]
            );
          }

          // Restore loose stock on the batch
          const returnLooseQty = Number(it.return_loose_qty || 0);
          if (returnLooseQty > 0) {
            await q(
              `UPDATE product_batches
               SET loose_stock = loose_stock + $3, updated_at = now()
               WHERE id = $1 AND account_id = $2`,
              [it.batch_id, ctx.accountId, returnLooseQty]
            );
            // Traceability event for loose return
            await q(
              `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, ref_type, ref_id, note, created_by_user_id)
               VALUES ($1,$2,'PURCHASE_RETURN',0,0,'PURCHASE_RETURN_ITEM',$3,$4,$5)`,
              [
                ctx.accountId, it.batch_id, it.id,
                `Loose return: ${returnLooseQty} unit(s) — Purchase return ${ret.return_number}`, actorId
              ]
            );
          }

          lowStockBatches.add(String(it.batch_id));
        }
      }

      await q(
        `
        UPDATE purchase_returns
        SET status = 'CONFIRMED',
            confirmed_at = now(),
            confirmed_by_user_id = $3,
            updated_at = now()
        WHERE id = $1 AND account_id = $2
        `,
        [id, ctx.accountId, actorId]
      );

      // Refresh the original purchase invoice payment summary so balance_due reflects the return
      if (ret.purchase_invoice_id) {
        const { refreshInvoicePaymentSummary } = require("../../shared/purchase");
        await refreshInvoicePaymentSummary(q, ctx.accountId, ret.purchase_invoice_id);
      }

      const done = await q(`SELECT * FROM purchase_returns WHERE id = $1 AND account_id = $2 LIMIT 1`, [id, ctx.accountId]);
      return { item: done.rows?.[0] || null, affectedBatchIds: [...lowStockBatches] };
    });
    if (data?.err) return data.err;
    await refreshLowStockNotifications(ctx.accountId, data?.affectedBatchIds || []);
    return ok(data, { message: data?.alreadyConfirmed ? "Purchase return already confirmed." : "Purchase return confirmed." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
