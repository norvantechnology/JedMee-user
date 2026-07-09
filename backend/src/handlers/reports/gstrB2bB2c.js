'use strict';
const { ok, fail } = require('../../shared/response');
const { requirePermission } = require('../../shared/auth');
const { getPermissionsForUser } = require('../../shared/permissions');
const { query } = require('../../shared/db');
const { resolveClientTimeZone } = require('../../shared/dateFilters');
const { monthStartYmd, monthEndYmd } = require('../../shared/timezone');

const LARGE_B2C_THRESHOLD = 250000; // ₹2.5 lakh

/** Validate GSTIN format (same regex as frontend + create.js + customers/_common.js) */
function isValidGstin(g) {
  if (!g) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    String(g).toUpperCase().trim()
  );
}

/** Detect suspicious GSTIN (e.g. all same chars, sequential, obviously fake) */
function isSuspiciousGstin(g) {
  if (!g || !isValidGstin(g)) return false;
  const s = String(g).toUpperCase().trim();
  // All same character in PAN portion (chars 3-12)
  const pan = s.slice(2, 12);
  if (new Set(pan.split('')).size <= 2) return true;
  return false;
}

/**
 * GSTR-1 B2B vs B2C Segregation Report
 * Returns B2B invoice list, B2C summary by GST rate, Large B2C list,
 * GSTIN issues, and sales returns (credit notes) per group.
 */
async function handler(event) {
  const auth = await requirePermission(event, 'REPORTS', 'VIEW');
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || '');
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, 'BAD_REQUEST', 'account not found');

  const qs = event.queryStringParameters || {};
  const timeZone = resolveClientTimeZone(qs);

  // Support both month/year and custom date range
  let fromDate, toDate;
  if (qs.from_date && qs.to_date) {
    fromDate = String(qs.from_date).trim();
    toDate   = String(qs.to_date).trim();
  } else {
    const year  = parseInt(qs.year  || '', 10);
    const month = parseInt(qs.month || '', 10);
    if (!year || !month || month < 1 || month > 12 || year < 2000 || year > 2100) {
      return fail(400, 'VALIDATION_ERROR', 'Provide year+month (1-12) or from_date+to_date (YYYY-MM-DD).');
    }
    fromDate = monthStartYmd(year, month, timeZone);
    toDate = monthEndYmd(year, month, timeZone);
  }

  // Optional search (customer name, invoice number, GSTIN)
  const search = String(qs.search || '').trim();

  try {
    const [bizR, b2bR, b2cSummaryR, largeB2cR, summaryR, b2bReturnsR, b2cReturnsR] = await Promise.all([
      // Business info
      query(
        `SELECT firm_name, gst_number, state, city, address, state_code FROM app_users WHERE id=$1 LIMIT 1`,
        [ctx.accountId]
      ),

      // B2B invoices - one row per invoice, all columns for GSTR-1 table.
      // CGST/SGST/IGST: use stored split if available (post-migration), else derive
      // from total_gst + supply_type (handles pre-migration CASH_MEMO invoices).
      query(
        `SELECT
           si.id,
           si.invoice_number,
           si.invoice_date,
           si.customer_name,
           COALESCE(si.customer_gstin_snapshot, si.customer_gst, '') AS customer_gstin,
           si.place_of_supply,
           si.supply_type,
           ROUND(COALESCE(si.subtotal,0) - COALESCE(si.total_discount,0), 2) AS taxable_value,
           ROUND(CASE
             WHEN COALESCE((SELECT SUM(sii.cgst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id), 0) > 0
             THEN (SELECT SUM(sii.cgst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id)
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE' THEN 0
             ELSE COALESCE(si.total_gst, 0) / 2
           END, 2) AS cgst,
           ROUND(CASE
             WHEN COALESCE((SELECT SUM(sii.sgst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id), 0) > 0
             THEN (SELECT SUM(sii.sgst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id)
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE' THEN 0
             ELSE COALESCE(si.total_gst, 0) / 2
           END, 2) AS sgst,
           ROUND(CASE
             WHEN COALESCE((SELECT SUM(sii.igst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id), 0) > 0
             THEN (SELECT SUM(sii.igst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id)
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE' THEN COALESCE(si.total_gst, 0)
             ELSE 0
           END, 2) AS igst,
           0 AS cess,
           ROUND(si.total_amount, 2) AS total_value,
           si.gstin_re_tagged,
           si.re_tag_audit_log
         FROM sales_invoices si
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3
           AND si.b2b_b2c_tag = 'B2B'
           ${search ? `AND (
             si.invoice_number ILIKE $4
             OR si.customer_name ILIKE $4
             OR COALESCE(si.customer_gstin_snapshot, si.customer_gst, '') ILIKE $4
           )` : ''}
         ORDER BY si.invoice_date ASC, si.invoice_number ASC`,
        search
          ? [ctx.accountId, fromDate, toDate, `%${search}%`]
          : [ctx.accountId, fromDate, toDate]
      ),

      // B2C summary grouped by GST rate
      query(
        `SELECT
           sii.gst_percent                                                AS gst_rate,
           COUNT(DISTINCT si.id)                                          AS invoice_count,
           ROUND(SUM(sii.taxable_amount), 2)                             AS taxable_value,
           ROUND(SUM(COALESCE(sii.cgst_amount, 0)), 2)                   AS cgst,
           ROUND(SUM(COALESCE(sii.sgst_amount, 0)), 2)                   AS sgst,
           ROUND(SUM(COALESCE(sii.igst_amount, 0)), 2)                   AS igst,
           0                                                              AS cess,
           ROUND(SUM(sii.line_total), 2)                                 AS total_value
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON si.id = sii.sales_invoice_id
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3
           AND si.b2b_b2c_tag = 'B2C'
         GROUP BY sii.gst_percent
         ORDER BY sii.gst_percent ASC`,
        [ctx.accountId, fromDate, toDate]
      ),

      // Large B2C invoices (> ₹2.5 lakh) - reported individually in GSTR-1
      query(
        `SELECT
           si.id,
           si.invoice_number,
           si.invoice_date,
           si.customer_name,
           ROUND(COALESCE(si.subtotal,0) - COALESCE(si.total_discount,0), 2) AS taxable_value,
           ROUND(CASE
             WHEN COALESCE((SELECT SUM(sii.cgst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id), 0) > 0
             THEN (SELECT SUM(sii.cgst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id)
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE' THEN 0
             ELSE COALESCE(si.total_gst, 0) / 2
           END, 2) AS cgst,
           ROUND(CASE
             WHEN COALESCE((SELECT SUM(sii.sgst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id), 0) > 0
             THEN (SELECT SUM(sii.sgst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id)
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE' THEN 0
             ELSE COALESCE(si.total_gst, 0) / 2
           END, 2) AS sgst,
           ROUND(CASE
             WHEN COALESCE((SELECT SUM(sii.igst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id), 0) > 0
             THEN (SELECT SUM(sii.igst_amount) FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id)
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE' THEN COALESCE(si.total_gst, 0)
             ELSE 0
           END, 2) AS igst,
           0 AS cess,
           ROUND(si.total_amount, 2) AS total_value
         FROM sales_invoices si
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3
           AND si.b2b_b2c_tag = 'B2C'
           AND si.large_b2c_flag = TRUE
         ORDER BY si.total_amount DESC`,
        [ctx.accountId, fromDate, toDate]
      ),

      // Summary totals for both B2B and B2C
      query(
        `SELECT
           COUNT(CASE WHEN b2b_b2c_tag='B2B' THEN 1 END)::int          AS b2b_count,
           ROUND(SUM(CASE WHEN b2b_b2c_tag='B2B' THEN total_amount ELSE 0 END), 2) AS b2b_value,
           ROUND(SUM(CASE WHEN b2b_b2c_tag='B2B' THEN total_gst    ELSE 0 END), 2) AS b2b_gst,
           COUNT(CASE WHEN b2b_b2c_tag='B2C' THEN 1 END)::int          AS b2c_count,
           ROUND(SUM(CASE WHEN b2b_b2c_tag='B2C' THEN total_amount ELSE 0 END), 2) AS b2c_value,
           ROUND(SUM(CASE WHEN b2b_b2c_tag='B2C' THEN total_gst    ELSE 0 END), 2) AS b2c_gst,
           COUNT(CASE WHEN b2b_b2c_tag='B2C' AND large_b2c_flag=TRUE THEN 1 END)::int AS large_b2c_count
         FROM sales_invoices
         WHERE account_id = $1
           AND status = 'CONFIRMED'
           AND deleted_at IS NULL
           AND invoice_date BETWEEN $2 AND $3`,
        [ctx.accountId, fromDate, toDate]
      ),

      // B2B sales returns (credit notes for registered customers) - CDNR in GSTR-1
      query(
        `SELECT
           sr.id,
           sr.return_number,
           sr.return_date,
           sr.customer_name,
           COALESCE(sr.customer_gstin_snapshot, '') AS customer_gstin,
           sr.place_of_supply,
           sr.supply_type,
           ROUND(COALESCE(sr.total_return_amount, 0), 2) AS return_amount,
           si.invoice_number AS linked_invoice_number,
           si.invoice_date   AS linked_invoice_date
         FROM sales_returns sr
         LEFT JOIN sales_invoices si ON si.id = sr.sales_invoice_id AND si.account_id = sr.account_id
         WHERE sr.account_id = $1
           AND sr.status = 'CONFIRMED'
           AND sr.deleted_at IS NULL
           AND sr.return_date BETWEEN $2 AND $3
           AND sr.b2b_b2c_tag = 'B2B'
           ${search ? `AND (
             sr.return_number ILIKE $4
             OR sr.customer_name ILIKE $4
             OR COALESCE(sr.customer_gstin_snapshot, '') ILIKE $4
           )` : ''}
         ORDER BY sr.return_date ASC, sr.return_number ASC`,
        search
          ? [ctx.accountId, fromDate, toDate, `%${search}%`]
          : [ctx.accountId, fromDate, toDate]
      ),

      // B2C sales returns (credit notes for unregistered customers) - CDNUR in GSTR-1
      query(
        `SELECT
           sr.id,
           sr.return_number,
           sr.return_date,
           sr.customer_name,
           ROUND(COALESCE(sr.total_return_amount, 0), 2) AS return_amount,
           si.invoice_number AS linked_invoice_number,
           si.invoice_date   AS linked_invoice_date
         FROM sales_returns sr
         LEFT JOIN sales_invoices si ON si.id = sr.sales_invoice_id AND si.account_id = sr.account_id
         WHERE sr.account_id = $1
           AND sr.status = 'CONFIRMED'
           AND sr.deleted_at IS NULL
           AND sr.return_date BETWEEN $2 AND $3
           AND sr.b2b_b2c_tag = 'B2C'
         ORDER BY sr.return_date ASC, sr.return_number ASC`,
        [ctx.accountId, fromDate, toDate]
      ),
    ]);

    const biz = bizR.rows?.[0] || {};
    const summary = summaryR.rows?.[0] || {};

    // ── Flag GSTIN issues on B2B invoices ────────────────────────────────────
    const b2bInvoices = (b2bR.rows || []).map(row => {
      const gstin = String(row.customer_gstin || '').trim().toUpperCase();
      const gstinMissing    = !gstin;
      const gstinInvalid    = gstin && !isValidGstin(gstin);
      const gstinSuspicious = gstin && isValidGstin(gstin) && isSuspiciousGstin(gstin);
      return {
        ...row,
        gstin_issue: gstinMissing ? 'MISSING'
          : gstinInvalid ? 'INVALID_FORMAT'
          : gstinSuspicious ? 'SUSPICIOUS'
          : null
      };
    });

    const gstinIssues = b2bInvoices.filter(r => r.gstin_issue);

    // ── B2C summary: include all standard GST slabs, fill zeros for missing ──
    const GST_SLABS = [0, 5, 12, 18, 28];
    const b2cByRate = new Map((b2cSummaryR.rows || []).map(r => [Number(r.gst_rate), r]));
    const b2cSummary = GST_SLABS.map(rate => {
      const row = b2cByRate.get(rate);
      return {
        gst_rate:      rate,
        invoice_count: Number(row?.invoice_count || 0),
        taxable_value: Number(row?.taxable_value || 0),
        cgst:          Number(row?.cgst          || 0),
        sgst:          Number(row?.sgst          || 0),
        igst:          Number(row?.igst          || 0),
        cess:          0,
        total_value:   Number(row?.total_value   || 0),
      };
    });

    // B2C totals row
    const b2cTotal = b2cSummary.reduce((acc, r) => ({
      invoice_count: acc.invoice_count + r.invoice_count,
      taxable_value: acc.taxable_value + r.taxable_value,
      cgst:          acc.cgst          + r.cgst,
      sgst:          acc.sgst          + r.sgst,
      igst:          acc.igst          + r.igst,
      cess:          0,
      total_value:   acc.total_value   + r.total_value,
    }), { invoice_count: 0, taxable_value: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total_value: 0 });

    // ── Returns summary totals ────────────────────────────────────────────────
    const b2bReturnsList = b2bReturnsR.rows || [];
    const b2cReturnsList = b2cReturnsR.rows || [];
    const b2bReturnTotal = b2bReturnsList.reduce((s, r) => s + Number(r.return_amount || 0), 0);
    const b2cReturnTotal = b2cReturnsList.reduce((s, r) => s + Number(r.return_amount || 0), 0);

    return ok({
      period: { from_date: fromDate, to_date: toDate },
      business: {
        firm_name:   biz.firm_name  || '',
        gst_number:  biz.gst_number || '',
        state:       biz.state      || '',
        state_code:  biz.state_code || (biz.gst_number ? String(biz.gst_number).substring(0, 2) : ''),
        city:        biz.city       || '',
        address:     biz.address    || '',
        gstin_valid: isValidGstin(biz.gst_number || ''),
      },
      summary: {
        b2b_count:         Number(summary.b2b_count  || 0),
        b2b_value:         Number(summary.b2b_value  || 0),
        b2b_gst:           Number(summary.b2b_gst    || 0),
        b2c_count:         Number(summary.b2c_count  || 0),
        b2c_value:         Number(summary.b2c_value  || 0),
        b2c_gst:           Number(summary.b2c_gst    || 0),
        large_b2c_count:   Number(summary.large_b2c_count || 0),
        gstin_issue_count: gstinIssues.length,
        b2b_return_count:  b2bReturnsList.length,
        b2b_return_total:  Number(b2bReturnTotal.toFixed(2)),
        b2c_return_count:  b2cReturnsList.length,
        b2c_return_total:  Number(b2cReturnTotal.toFixed(2)),
      },
      b2b_invoices:       b2bInvoices,
      b2c_summary:        b2cSummary,
      b2c_total:          b2cTotal,
      large_b2c:          largeB2cR.rows || [],
      gstin_issues:       gstinIssues,
      large_b2c_threshold: LARGE_B2C_THRESHOLD,
      // Credit notes / returns - reflected in correct group per GSTR-1 CDNR/CDNUR
      b2b_returns:        b2bReturnsList,
      b2c_returns:        b2cReturnsList,
    });
  } catch (e) {
    console.error('[gstrB2bB2c] error:', e);
    return fail(500, 'INTERNAL_ERROR', 'Failed to generate B2B/B2C report.', { subMessage: e.message });
  }
}

module.exports = { handler };