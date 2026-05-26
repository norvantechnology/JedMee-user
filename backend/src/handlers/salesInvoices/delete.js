'use strict';

/**
 * DELETE /sales-invoices/:id
 *
 * Permanently removes a DRAFT sales invoice (soft-delete).
 * Rules:
 *  - Only DRAFT invoices may be deleted. CONFIRMED invoices must be cancelled
 *    first; CANCELLED invoices are already inactive.
 *  - The invoice must have no payments recorded (amount_paid = 0).
 *  - No inventory reversal is needed for a DRAFT because stock is only
 *    deducted at confirm time.
 *  - The record is kept in the database (deleted_at is set) for audit purposes.
 */

const { ok, fail } = require('../../shared/response');
const { query } = require('../../shared/db');
const { requirePermission } = require('../../shared/auth');
const { getPermissionsForUser } = require('../../shared/permissions');

async function handler(event) {
  const auth = await requirePermission(event, 'SALES_INVOICES', 'DELETE');
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || '');
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, 'BAD_REQUEST', 'account not found');

  const id = String(event?.pathParameters?.id || '').trim();
  if (!id) return fail(400, 'BAD_REQUEST', 'id is required');

  try {
    // ── Fetch current state ──────────────────────────────────────────────────
    const cur = await query(
      `SELECT id, status, amount_paid
         FROM sales_invoices
        WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [id, ctx.accountId]
    );
    const row = cur.rows?.[0];
    if (!row) return fail(404, 'NOT_FOUND', 'Sales invoice not found.');

    const status = String(row.status || '');

    // ── Business rules ───────────────────────────────────────────────────────
    if (status !== 'DRAFT') {
      return fail(
        400,
        'BUSINESS_RULE',
        status === 'CONFIRMED'
          ? 'Only draft invoices can be deleted. Cancel the confirmed invoice first if you want to remove it.'
          : 'Only draft invoices can be deleted.'
      );
    }

    if (Number(row.amount_paid || 0) > 0) {
      return fail(
        400,
        'BUSINESS_RULE',
        'Cannot delete a draft that has payments recorded. Reverse the payments first.'
      );
    }

    // ── Soft-delete ──────────────────────────────────────────────────────────
    // Try to set deleted_by_user_id if the column exists (added by migration
    // 068_sales_invoices_delete_by_user.sql). Fall back gracefully if not.
    let upd;
    try {
      upd = await query(
        `UPDATE sales_invoices
            SET deleted_at          = now(),
                deleted_by_user_id  = $3,
                updated_at          = now()
          WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
          RETURNING id`,
        [id, ctx.accountId, actorId]
      );
    } catch (colErr) {
      // Column doesn't exist yet — fall back to deleted_at only
      if (/column.*deleted_by_user_id.*does not exist/i.test(String(colErr.message || ''))) {
        upd = await query(
          `UPDATE sales_invoices
              SET deleted_at = now(),
                  updated_at = now()
            WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
            RETURNING id`,
          [id, ctx.accountId]
        );
      } else {
        throw colErr;
      }
    }

    if (!upd.rows?.[0]) return fail(404, 'NOT_FOUND', 'Sales invoice not found.');

    return ok(
      { id },
      {
        message: 'Sales invoice deleted.',
        subMessage: 'The draft has been removed. No inventory was affected.',
      }
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[sales-invoices:delete]', e);
    return fail(500, 'INTERNAL_ERROR', 'Something went wrong.', {
      subMessage: String(e?.message || 'Please try again.'),
    });
  }
}

module.exports = { handler };