'use strict';
const { ok, fail } = require('../../shared/response');
const { requirePermission } = require('../../shared/auth');
const { getPermissionsForUser } = require('../../shared/permissions');
const { query, withTransaction } = require('../../shared/db');
const { parseJsonBody } = require('../../shared/request');

/** Validate GSTIN format */
function isValidGstin(g) {
  if (!g) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    String(g).toUpperCase().trim()
  );
}

/**
 * Re-tag sales invoices for a customer after GSTIN is added/corrected.
 * Records a full audit log entry per invoice.
 *
 * Body: { customer_id, invoice_ids: string[], reason?: string }
 */
async function handler(event) {
  const auth = await requirePermission(event, 'REPORTS', 'VIEW');
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || '');
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, 'BAD_REQUEST', 'account not found');

  const body = parseJsonBody(event);
  const customerId  = String(body?.customer_id  || '').trim();
  const invoiceIds  = Array.isArray(body?.invoice_ids) ? body.invoice_ids.map(String) : [];
  const reason      = String(body?.reason || '').trim() || 'GSTIN updated — re-tagged by user';

  if (!customerId)       return fail(400, 'VALIDATION_ERROR', 'customer_id is required');
  if (!invoiceIds.length) return fail(400, 'VALIDATION_ERROR', 'invoice_ids must be a non-empty array');

  try {
    const result = await withTransaction(async (q) => {
      // Fetch customer to get current GSTIN
      const custRs = await q(
        `SELECT id, name, gst_number, state_code FROM customers
         WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [customerId, ctx.accountId]
      );
      const customer = custRs.rows?.[0] || null;
      if (!customer) return { err: fail(404, 'NOT_FOUND', 'Customer not found') };

      const newGstin = String(customer.gst_number || '').trim().toUpperCase();
      const gstinValid = isValidGstin(newGstin);
      const newTag = gstinValid ? 'B2B' : 'B2C';
      const newGstinSnapshot = gstinValid ? newGstin : null;
      const newPlaceOfSupply = newGstinSnapshot
        ? newGstinSnapshot.substring(0, 2)
        : (String(customer.state_code || '').trim() || null);

      const updated = [];
      const skipped = [];

      for (const invoiceId of invoiceIds) {
        const invRs = await q(
          `SELECT id, invoice_number, b2b_b2c_tag, customer_gstin_snapshot, re_tag_audit_log
           FROM sales_invoices
           WHERE id = $1 AND account_id = $2 AND customer_id = $3 AND deleted_at IS NULL
           LIMIT 1`,
          [invoiceId, ctx.accountId, customerId]
        );
        const inv = invRs.rows?.[0] || null;
        if (!inv) {
          skipped.push({ id: invoiceId, reason: 'not found or not for this customer' });
          continue;
        }

        const oldTag = String(inv.b2b_b2c_tag || 'B2C');
        const auditEntry = {
          at:          new Date().toISOString(),
          by_user_id:  actorId,
          old_tag:     oldTag,
          new_tag:     newTag,
          old_gstin:   inv.customer_gstin_snapshot || null,
          new_gstin:   newGstinSnapshot,
          reason,
        };

        const existingLog = Array.isArray(inv.re_tag_audit_log) ? inv.re_tag_audit_log : [];
        const newLog = [...existingLog, auditEntry];

        await q(
          `UPDATE sales_invoices
           SET b2b_b2c_tag            = $3,
               customer_gstin_snapshot = $4,
               place_of_supply        = COALESCE($5, place_of_supply),
               gstin_re_tagged        = TRUE,
               re_tag_audit_log       = $6::jsonb,
               large_b2c_flag         = CASE WHEN $3 = 'B2C' AND total_amount > 250000 THEN TRUE ELSE FALSE END,
               updated_at             = now()
           WHERE id = $1 AND account_id = $2`,
          [invoiceId, ctx.accountId, newTag, newGstinSnapshot, newPlaceOfSupply, JSON.stringify(newLog)]
        );

        updated.push({
          id:          invoiceId,
          invoice_number: inv.invoice_number,
          old_tag:     oldTag,
          new_tag:     newTag,
        });
      }

      return { updated, skipped, new_tag: newTag, customer_name: customer.name };
    });

    if (result?.err) return result.err;
    return ok(result, {
      message: `Re-tagged ${result.updated.length} invoice(s) as ${result.new_tag} for ${result.customer_name}.`
    });
  } catch (e) {
    console.error('[gstrB2bB2cRetag] error:', e);
    return fail(500, 'INTERNAL_ERROR', 'Failed to re-tag invoices.', { subMessage: e.message });
  }
}

module.exports = { handler };