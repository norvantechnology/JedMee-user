'use strict';
const { ok, fail } = require('../../shared/response');
const { requirePermission } = require('../../shared/auth');
const { getPermissionsForUser } = require('../../shared/permissions');
const { query } = require('../../shared/db');

async function handler(event) {
  const auth = await requirePermission(event, 'PURCHASE_RETURNS', 'VIEW');
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || '');
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, 'BAD_REQUEST', 'account not found');

  const id = String(event?.pathParameters?.id || '').trim();
  if (!id) return fail(400, 'BAD_REQUEST', 'id is required');

  try {
    const [retR, itemsR] = await Promise.all([
      query(
        `SELECT pr.*,
                v.name AS vendor_name,
                pi2.invoice_number AS original_invoice_number,
                pi2.invoice_date AS original_invoice_date
         FROM purchase_returns pr
         LEFT JOIN vendors v ON v.id = pr.vendor_id
         LEFT JOIN purchase_invoices pi2 ON pi2.id = pr.purchase_invoice_id
         WHERE pr.id = $1 AND pr.account_id = $2 AND pr.deleted_at IS NULL
         LIMIT 1`,
        [id, ctx.accountId]
      ),
      query(
        `SELECT pri.*,
                pii.product_name,
                pii.batch_number,
                pii.expiry_date,
                pii.purchase_rate,
                pii.discount_percent,
                pii.gst_percent,
                pii.qty AS original_qty,
                pii.free_qty AS original_free_qty
         FROM purchase_return_items pri
         JOIN purchase_invoice_items pii ON pii.id = pri.purchase_invoice_item_id
         WHERE pri.purchase_return_id = $1 AND pri.account_id = $2
         ORDER BY pri.id`,
        [id, ctx.accountId]
      ),
    ]);

    const ret = retR.rows?.[0];
    if (!ret) return fail(404, 'NOT_FOUND', 'Purchase return not found.');

    return ok({ item: { ...ret, items: itemsR.rows || [] } });
  } catch (e) {
    return fail(500, 'INTERNAL_ERROR', 'Failed to get purchase return.', { subMessage: e.message });
  }
}

module.exports = { handler };