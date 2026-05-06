'use strict';
const { ok, fail } = require('../../shared/response');
const { requirePermission } = require('../../shared/auth');
const { getPermissionsForUser } = require('../../shared/permissions');
const { query } = require('../../shared/db');

/**
 * GSTR-1 Summary Report
 * Groups confirmed sales invoices by HSN code + GST rate for a given period.
 * Returns B2B (with GSTIN) and B2C (without GSTIN) breakdowns.
 */
async function handler(event) {
  const auth = await requirePermission(event, 'REPORTS', 'VIEW');
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || '');
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, 'BAD_REQUEST', 'account not found');

  const qs = event.queryStringParameters || {};
  const fromDate = (qs.from_date || '').trim();
  const toDate   = (qs.to_date   || '').trim();

  if (!fromDate || !toDate) {
    return fail(400, 'VALIDATION_ERROR', 'from_date and to_date are required (YYYY-MM-DD).');
  }

  try {
    // HSN-wise summary (B2B + B2C combined)
    const hsnR = await query(
      `SELECT
         COALESCE(sii.hsn_code, 'N/A')   AS hsn_code,
         sii.gst_percent                  AS gst_rate,
         COUNT(DISTINCT si.id)            AS invoice_count,
         SUM(sii.taxable_amount)          AS taxable_value,
         SUM(sii.cgst_amount)             AS cgst,
         SUM(sii.sgst_amount)             AS sgst,
         SUM(sii.igst_amount)             AS igst,
         SUM(sii.taxable_amount
             + COALESCE(sii.cgst_amount,0)
             + COALESCE(sii.sgst_amount,0)
             + COALESCE(sii.igst_amount,0)) AS total_value
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.sales_invoice_id
       WHERE si.account_id = $1
         AND si.status = 'CONFIRMED'
         AND si.deleted_at IS NULL
         AND si.invoice_date BETWEEN $2 AND $3
       GROUP BY sii.hsn_code, sii.gst_percent
       ORDER BY sii.gst_percent DESC, hsn_code`,
      [ctx.accountId, fromDate, toDate]
    );

    // B2B summary (customers with GSTIN)
    const b2bR = await query(
      `SELECT
         c.gstin,
         c.name AS customer_name,
         COUNT(si.id)                     AS invoice_count,
         SUM(si.grand_total)              AS total_value,
         SUM(si.total_tax)                AS total_tax
       FROM sales_invoices si
       JOIN customers c ON c.id = si.customer_id
       WHERE si.account_id = $1
         AND si.status = 'CONFIRMED'
         AND si.deleted_at IS NULL
         AND si.invoice_date BETWEEN $2 AND $3
         AND c.gstin IS NOT NULL AND c.gstin <> ''
       GROUP BY c.gstin, c.name
       ORDER BY total_value DESC
       LIMIT 100`,
      [ctx.accountId, fromDate, toDate]
    );

    // B2C summary (customers without GSTIN)
    const b2cR = await query(
      `SELECT
         COUNT(si.id)        AS invoice_count,
         SUM(si.grand_total) AS total_value,
         SUM(si.total_tax)   AS total_tax
       FROM sales_invoices si
       LEFT JOIN customers c ON c.id = si.customer_id
       WHERE si.account_id = $1
         AND si.status = 'CONFIRMED'
         AND si.deleted_at IS NULL
         AND si.invoice_date BETWEEN $2 AND $3
         AND (c.gstin IS NULL OR c.gstin = '')`,
      [ctx.accountId, fromDate, toDate]
    );

    // Totals
    const totalsR = await query(
      `SELECT
         COUNT(DISTINCT si.id)  AS total_invoices,
         SUM(si.grand_total)    AS total_value,
         SUM(si.total_tax)      AS total_tax,
         SUM(si.taxable_amount) AS total_taxable
       FROM sales_invoices si
       WHERE si.account_id = $1
         AND si.status = 'CONFIRMED'
         AND si.deleted_at IS NULL
         AND si.invoice_date BETWEEN $2 AND $3`,
      [ctx.accountId, fromDate, toDate]
    );

    return ok({
      period: { from_date: fromDate, to_date: toDate },
      summary: totalsR.rows?.[0] || {},
      hsn_summary: hsnR.rows || [],
      b2b: b2bR.rows || [],
      b2c: b2cR.rows?.[0] || {},
    });
  } catch (e) {
    return fail(500, 'INTERNAL_ERROR', 'Failed to generate GST report.', { subMessage: e.message });
  }
}

module.exports = { handler };