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
    // All 4 queries are independent — run in parallel for minimum latency.
    const [hsnR, b2bR, b2cR, totalsR] = await Promise.all([
      // HSN-wise summary (B2B + B2C combined)
      query(
        `SELECT
           COALESCE(sii.hsn_code, 'N/A')                          AS hsn_code,
           sii.gst_percent                                         AS gst_rate,
           COUNT(DISTINCT si.id)                                   AS invoice_count,
           ROUND(SUM(sii.taxable_amount)::numeric, 4)              AS taxable_value,
           ROUND((SUM(sii.taxable_amount) * sii.gst_percent / 200)::numeric, 4) AS cgst,
           ROUND((SUM(sii.taxable_amount) * sii.gst_percent / 200)::numeric, 4) AS sgst,
           0                                                        AS igst,
           ROUND((SUM(sii.taxable_amount) * (1 + sii.gst_percent / 100))::numeric, 4) AS total_value
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON si.id = sii.sales_invoice_id
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3
         GROUP BY sii.hsn_code, sii.gst_percent
         ORDER BY sii.gst_percent DESC, hsn_code`,
        [ctx.accountId, fromDate, toDate]
      ),
      // B2B summary (customers with GST number)
      query(
        `SELECT
           c.gst_number                     AS gstin,
           c.name                           AS customer_name,
           COUNT(si.id)                     AS invoice_count,
           SUM(si.total_amount)             AS total_value,
           SUM(COALESCE(si.total_gst, 0))   AS total_tax
         FROM sales_invoices si
         JOIN customers c ON c.id = si.customer_id
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3
           AND c.gst_number IS NOT NULL AND c.gst_number <> ''
         GROUP BY c.gst_number, c.name
         ORDER BY total_value DESC
         LIMIT 100`,
        [ctx.accountId, fromDate, toDate]
      ),
      // B2C summary (customers without GST number)
      query(
        `SELECT
           COUNT(si.id)                    AS invoice_count,
           SUM(si.total_amount)            AS total_value,
           SUM(COALESCE(si.total_gst, 0))  AS total_tax
         FROM sales_invoices si
         LEFT JOIN customers c ON c.id = si.customer_id
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3
           AND (c.gst_number IS NULL OR c.gst_number = '')`,
        [ctx.accountId, fromDate, toDate]
      ),
      // Totals
      query(
        `SELECT
           COUNT(DISTINCT si.id)                                AS total_invoices,
           SUM(si.total_amount)                                 AS total_value,
           SUM(COALESCE(si.total_gst, 0))                       AS total_tax,
           SUM(COALESCE(si.subtotal, 0) - COALESCE(si.total_discount, 0)) AS total_taxable
         FROM sales_invoices si
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3`,
        [ctx.accountId, fromDate, toDate]
      ),
    ]);

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