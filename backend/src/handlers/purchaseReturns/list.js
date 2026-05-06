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

  const qs = event.queryStringParameters || {};
  const page   = Math.max(1, parseInt(qs.page  || '1', 10));
  const limit  = Math.min(100, Math.max(1, parseInt(qs.limit || '20', 10)));
  const offset = (page - 1) * limit;
  const status = (qs.status || '').toUpperCase() || null;
  const search = (qs.search || '').trim();

  const conditions = ['pr.account_id = $1', 'pr.deleted_at IS NULL'];
  const params = [ctx.accountId];
  let pi = 2;

  if (status) { conditions.push(`pr.status = $${pi++}`); params.push(status); }
  if (search) {
    conditions.push(`(pr.return_number ILIKE $${pi} OR pr.credit_note_number ILIKE $${pi})`);
    params.push(`%${search}%`); pi++;
  }

  const where = conditions.join(' AND ');

  try {
    const [countR, rowsR] = await Promise.all([
      query(`SELECT COUNT(*) FROM purchase_returns pr WHERE ${where}`, params),
      query(
        `SELECT pr.*,
                v.name AS vendor_name,
                pi2.invoice_number AS original_invoice_number
         FROM purchase_returns pr
         LEFT JOIN vendors v ON v.id = pr.vendor_id
         LEFT JOIN purchase_invoices pi2 ON pi2.id = pr.purchase_invoice_id
         WHERE ${where}
         ORDER BY pr.created_at DESC
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, limit, offset]
      ),
    ]);

    const total = parseInt(countR.rows[0]?.count || '0', 10);
    return ok({
      items: rowsR.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (e) {
    return fail(500, 'INTERNAL_ERROR', 'Failed to list purchase returns.', { subMessage: e.message });
  }
}

module.exports = { handler };