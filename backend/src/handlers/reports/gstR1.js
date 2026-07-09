'use strict';
const { ok, fail } = require('../../shared/response');
const { requirePermission } = require('../../shared/auth');
const { getPermissionsForUser } = require('../../shared/permissions');
const { query } = require('../../shared/db');
const { resolveClientTimeZone } = require('../../shared/dateFilters');
const { monthStartYmd, monthEndYmd } = require('../../shared/timezone');

const LARGE_B2C_THRESHOLD = 250000; // ₹2.5 lakh

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
function isValidGstin(g) {
  if (!g) return false;
  return GSTIN_REGEX.test(String(g).toUpperCase().trim());
}

/**
 * GSTR-1 Summary Report
 * Supports both month/year and custom date range.
 * Returns business details, HSN summary, B2B invoices (individual),
 * B2C summary by GST rate, large B2C, and overall totals.
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
  let fromDate, toDate, year, month;
  if (qs.year && qs.month) {
    year  = parseInt(qs.year,  10);
    month = parseInt(qs.month, 10);
    if (!year || !month || month < 1 || month > 12 || year < 2000 || year > 2100) {
      return fail(400, 'VALIDATION_ERROR', 'year (>=2000) and month (1-12) are required.');
    }
    fromDate = monthStartYmd(year, month, timeZone);
    toDate = monthEndYmd(year, month, timeZone);
  } else {
    fromDate = (qs.from_date || '').trim();
    toDate   = (qs.to_date   || '').trim();
    if (!fromDate || !toDate) {
      return fail(400, 'VALIDATION_ERROR', 'Provide year+month or from_date+to_date (YYYY-MM-DD).');
    }
  }

  try {
    const [bizR, hsnR, b2bInvR, b2cSummaryR, largeB2cR, totalsR, missingHsnR] = await Promise.all([

      // Business info
      query(
        `SELECT firm_name, gst_number, state, city, address FROM app_users WHERE id=$1 LIMIT 1`,
        [ctx.accountId]
      ),

      // HSN-wise summary (B2B + B2C combined) - uses line-item taxable_amount for accuracy
      query(
        `SELECT
           COALESCE(sii.hsn_code, 'N/A')                          AS hsn_code,
           sii.gst_percent                                         AS gst_rate,
           COUNT(DISTINCT si.id)                                   AS invoice_count,
           ROUND(SUM(sii.taxable_amount)::numeric, 2)              AS taxable_value,
           ROUND(SUM(CASE
             WHEN COALESCE(sii.cgst_amount,0) > 0 THEN sii.cgst_amount
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE' THEN 0
             ELSE COALESCE(sii.gst_amount, sii.taxable_amount * sii.gst_percent / 100, 0) / 2
           END)::numeric, 2) AS cgst,
           ROUND(SUM(CASE
             WHEN COALESCE(sii.sgst_amount,0) > 0 THEN sii.sgst_amount
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE' THEN 0
             ELSE COALESCE(sii.gst_amount, sii.taxable_amount * sii.gst_percent / 100, 0) / 2
           END)::numeric, 2) AS sgst,
           ROUND(SUM(CASE
             WHEN COALESCE(sii.igst_amount,0) > 0 THEN sii.igst_amount
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE'
             THEN COALESCE(sii.gst_amount, sii.taxable_amount * sii.gst_percent / 100, 0)
             ELSE 0
           END)::numeric, 2) AS igst,
           0 AS cess,
           ROUND(SUM(sii.taxable_amount + COALESCE(sii.gst_amount, sii.taxable_amount * sii.gst_percent / 100, 0))::numeric, 2) AS total_value
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

      // B2B invoices - individual rows with all columns for GSTR-1 Table 4
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
           COALESCE(si.total_gst, 0) AS total_tax
         FROM sales_invoices si
         LEFT JOIN customers c ON c.id = si.customer_id
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3
           AND (
             COALESCE(si.customer_gstin_snapshot, si.customer_gst, '') <> ''
             OR (c.gst_number IS NOT NULL AND c.gst_number <> '')
           )
         ORDER BY si.invoice_date ASC, si.invoice_number ASC`,
        [ctx.accountId, fromDate, toDate]
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
         LEFT JOIN customers c ON c.id = si.customer_id
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3
           AND COALESCE(si.customer_gstin_snapshot, si.customer_gst, COALESCE(c.gst_number,''), '') = ''
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
           ROUND(COALESCE(si.total_gst, 0) / 2, 2) AS cgst,
           ROUND(COALESCE(si.total_gst, 0) / 2, 2) AS sgst,
           0 AS igst,
           0 AS cess,
           ROUND(si.total_amount, 2) AS total_value
         FROM sales_invoices si
         LEFT JOIN customers c ON c.id = si.customer_id
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3
           AND COALESCE(si.customer_gstin_snapshot, si.customer_gst, COALESCE(c.gst_number,''), '') = ''
           AND si.total_amount > $4
         ORDER BY si.total_amount DESC`,
        [ctx.accountId, fromDate, toDate, LARGE_B2C_THRESHOLD]
      ),

      // Overall totals - use line-item taxable_amount for accuracy (fixes taxable value mismatch)
      query(
        `SELECT
           COUNT(DISTINCT si.id)                                AS total_invoices,
           ROUND(SUM(si.total_amount)::numeric, 2)             AS total_value,
           ROUND(SUM(COALESCE(si.total_gst, 0))::numeric, 2)   AS total_tax,
           ROUND(SUM(sii_agg.taxable_sum)::numeric, 2)         AS total_taxable
         FROM sales_invoices si
         LEFT JOIN LATERAL (
           SELECT SUM(sii.taxable_amount) AS taxable_sum
           FROM sales_invoice_items sii WHERE sii.sales_invoice_id = si.id
         ) sii_agg ON true
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3`,
        [ctx.accountId, fromDate, toDate]
      ),

      // Missing HSN codes count
      query(
        `SELECT COUNT(*) AS count
         FROM sales_invoice_items sii
         JOIN sales_invoices si ON si.id = sii.sales_invoice_id
         WHERE si.account_id = $1
           AND si.status = 'CONFIRMED'
           AND si.deleted_at IS NULL
           AND si.invoice_date BETWEEN $2 AND $3
           AND (sii.hsn_code IS NULL OR TRIM(sii.hsn_code) = '')`,
        [ctx.accountId, fromDate, toDate]
      ),
    ]);

    const biz = bizR.rows?.[0] || {};
    const totals = totalsR.rows?.[0] || {};

    // Flag GSTIN issues on B2B invoices
    const b2bInvoices = (b2bInvR.rows || []).map(row => {
      const gstin = String(row.customer_gstin || '').trim().toUpperCase();
      const gstinMissing    = !gstin;
      const gstinInvalid    = gstin && !isValidGstin(gstin);
      return {
        ...row,
        customer_gstin: gstin,
        gstin_issue: gstinMissing ? 'MISSING'
          : gstinInvalid ? 'INVALID_FORMAT'
          : null,
      };
    });

    const gstinIssues = b2bInvoices.filter(r => r.gstin_issue);

    // B2B customer-level summary (for backward compat)
    const b2bByCustomer = {};
    b2bInvoices.forEach(inv => {
      const key = inv.customer_gstin || inv.customer_name;
      if (!b2bByCustomer[key]) {
        b2bByCustomer[key] = {
          gstin: inv.customer_gstin,
          customer_name: inv.customer_name,
          invoice_count: 0,
          total_tax: 0,
          total_value: 0,
          gstin_issue: inv.gstin_issue,
        };
      }
      b2bByCustomer[key].invoice_count++;
      b2bByCustomer[key].total_tax   += Number(inv.total_tax   || 0);
      b2bByCustomer[key].total_value += Number(inv.total_value || 0);
    });
    const b2bSummary = Object.values(b2bByCustomer).map(r => ({
      ...r,
      total_tax:   Math.round(r.total_tax   * 100) / 100,
      total_value: Math.round(r.total_value * 100) / 100,
    }));

    // B2C summary: include all standard GST slabs
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

    const b2cTotal = b2cSummary.reduce((acc, r) => ({
      invoice_count: acc.invoice_count + r.invoice_count,
      taxable_value: acc.taxable_value + r.taxable_value,
      cgst:          acc.cgst          + r.cgst,
      sgst:          acc.sgst          + r.sgst,
      igst:          acc.igst          + r.igst,
      cess:          0,
      total_value:   acc.total_value   + r.total_value,
    }), { invoice_count: 0, taxable_value: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total_value: 0 });

    const missingHsnCount = parseInt(missingHsnR.rows?.[0]?.count || 0, 10);

    // FY calculation
    const fyYear = year || parseInt(fromDate.substring(0, 4), 10);
    const fyMonth = month || parseInt(fromDate.substring(5, 7), 10);
    const fyEnd = fyMonth >= 4 ? fyYear + 1 : fyYear;
    const fyStart = fyMonth >= 4 ? fyYear : fyYear - 1;
    const financialYear = `${fyStart}-${String(fyEnd).slice(2)}`;

    return ok({
      period: { from_date: fromDate, to_date: toDate, year: year || null, month: month || null },
      financial_year: financialYear,
      business: {
        firm_name:   biz.firm_name  || '',
        gst_number:  biz.gst_number || '',
        state:       biz.state      || '',
        city:        biz.city       || '',
        address:     biz.address    || '',
        gstin_valid: isValidGstin(biz.gst_number || ''),
      },
      summary: {
        total_invoices: parseInt(totals.total_invoices || 0, 10),
        total_value:    Number(totals.total_value    || 0),
        total_tax:      Number(totals.total_tax      || 0),
        total_taxable:  Number(totals.total_taxable  || 0),
        b2b_count:      b2bInvoices.length,
        b2c_count:      b2cTotal.invoice_count,
        large_b2c_count: (largeB2cR.rows || []).length,
        gstin_issue_count: gstinIssues.length,
        missing_hsn_count: missingHsnCount,
      },
      hsn_summary:   hsnR.rows || [],
      b2b_invoices:  b2bInvoices,
      b2b:           b2bSummary,
      b2c_summary:   b2cSummary,
      b2c_total:     b2cTotal,
      b2c:           { invoice_count: b2cTotal.invoice_count, total_tax: b2cTotal.cgst + b2cTotal.sgst + b2cTotal.igst, total_value: b2cTotal.total_value },
      large_b2c:     largeB2cR.rows || [],
      gstin_issues:  gstinIssues,
      large_b2c_threshold: LARGE_B2C_THRESHOLD,
    });
  } catch (e) {
    console.error('[gstR1] error:', e);
    return fail(500, 'INTERNAL_ERROR', 'Failed to generate GST report.', { subMessage: e.message });
  }
}

module.exports = { handler };