'use strict';
const { ok, fail } = require('../../shared/response');
const { requirePermission } = require('../../shared/auth');
const { getPermissionsForUser } = require('../../shared/permissions');
const { query } = require('../../shared/db');
const { resolveClientTimeZone } = require('../../shared/dateFilters');
const { monthStartYmd, monthEndYmd } = require('../../shared/timezone');

/**
 * GSTR-2 / Purchase ITC Report
 *
 * Column map (verified against migrations):
 *   purchase_invoices      : id, account_id, invoice_number, vendor_id, invoice_date,
 *                            due_date, status, payment_status, amount_paid, balance_due,
 *                            total_gst, total_amount, deleted_at,
 *                            supply_type (066), itc_eligible (066),
 *                            reversal_required (066), reversal_date (066), rcm_applicable (066)
 *   purchase_invoice_items : id, purchase_invoice_id, account_id, product_name, hsn_code,
 *                            qty, taxable_amount, gst_percent, gst_amount,
 *                            cgst_amount (062), sgst_amount (062), igst_amount (062),
 *                            line_amount (020)
 *   vendors                : id, account_id, name, gst_number (062),
 *                            is_composition_dealer (066), state_code (066)
 *   purchase_returns       : id, account_id, purchase_invoice_id, return_date, status, deleted_at
 *   purchase_return_items  : id, purchase_return_id, purchase_invoice_item_id,
 *                            return_qty, return_amount
 *   itc_ledger             : (066) monthly carry-forward ledger
 */
async function handler(event) {
  const auth = await requirePermission(event, 'REPORTS', 'VIEW');
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || '');
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, 'BAD_REQUEST', 'account not found');

  const qs    = event.queryStringParameters || {};
  const year  = parseInt(qs.year  || '', 10);
  const month = parseInt(qs.month || '', 10);

  if (!year || !month || month < 1 || month > 12 || year < 2000 || year > 2100) {
    return fail(400, 'VALIDATION_ERROR', 'year (>=2000) and month (1-12) are required.');
  }

  const timeZone = resolveClientTimeZone(qs);
  const fromDate = monthStartYmd(year, month, timeZone);
  const toDate = monthEndYmd(year, month, timeZone);

  try {
    const data = await buildGstr2Data(ctx.accountId, year, month, fromDate, toDate);
    return ok(data);
  } catch (e) {
    console.error('[gstr2] error:', e);
    return fail(500, 'INTERNAL_ERROR', 'Failed to generate ITC report.', { subMessage: e.message });
  }
}

async function buildGstr2Data(accountId, year, month, fromDate, toDate) {
  const [
    bizR,
    summaryR,
    supplierSummaryR,
    invoiceDetailR,
    returnReversalR,
    blockedItcR,
    riskR,
    prevLedgerR,
    missingHsnR,
    missingGstinR,
  ] = await Promise.all([

    // 0. Business info
    query(
      `SELECT firm_name, gst_number, state, city, address FROM app_users WHERE id=$1 LIMIT 1`,
      [accountId]
    ),

    // 1. Overall ITC summary
    query(
      `SELECT
         ROUND(SUM(pi.total_amount)::numeric, 2) AS total_purchase_value,
         COUNT(DISTINCT pi.id) AS total_invoice_count,
         ROUND(SUM(pi.total_gst)::numeric, 2) AS total_gst_paid,
         ROUND(SUM(CASE WHEN COALESCE(v.gst_number,'') <> '' AND NOT COALESCE(v.is_composition_dealer,false)
                    THEN pi.total_gst ELSE 0 END)::numeric, 2) AS eligible_itc_total,
         COUNT(DISTINCT CASE WHEN COALESCE(v.gst_number,'') <> '' AND NOT COALESCE(v.is_composition_dealer,false)
                         THEN pi.id END) AS eligible_invoice_count,
         ROUND(SUM(CASE WHEN COALESCE(v.gst_number,'') = '' OR COALESCE(v.is_composition_dealer,false)
                    THEN pi.total_gst ELSE 0 END)::numeric, 2) AS ineligible_itc_total,
         COUNT(DISTINCT CASE WHEN COALESCE(v.gst_number,'') = '' OR COALESCE(v.is_composition_dealer,false)
                         THEN pi.id END) AS ineligible_invoice_count,
         -- Total CGST/SGST/IGST across ALL invoices (eligible + ineligible) for Section 1 totals
         ROUND(SUM(COALESCE(pii_agg.cgst_sum,0))::numeric, 2) AS total_cgst_paid,
         ROUND(SUM(COALESCE(pii_agg.sgst_sum,0))::numeric, 2) AS total_sgst_paid,
         ROUND(SUM(COALESCE(pii_agg.igst_sum,0))::numeric, 2) AS total_igst_paid
       FROM purchase_invoices pi
       JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id
       LEFT JOIN LATERAL (
         SELECT SUM(pii.cgst_amount) AS cgst_sum,
                SUM(pii.sgst_amount) AS sgst_sum,
                SUM(pii.igst_amount) AS igst_sum
         FROM purchase_invoice_items pii WHERE pii.purchase_invoice_id=pi.id
       ) pii_agg ON true
       WHERE pi.account_id=$1 AND pi.status='CONFIRMED' AND pi.deleted_at IS NULL
         AND pi.invoice_date BETWEEN $2 AND $3`,
      [accountId, fromDate, toDate]
    ),

    // 2. Supplier-wise ITC summary
    query(
      `SELECT
         v.id AS vendor_id,
         v.name AS vendor_name,
         COALESCE(v.gst_number,'') AS vendor_gstin,
         COALESCE(v.is_composition_dealer,false) AS is_composition_dealer,
         COUNT(DISTINCT pi.id) AS invoice_count,
         ROUND(SUM(pi.total_amount)::numeric,2) AS purchase_value,
         ROUND(SUM(COALESCE(pii_agg.cgst_sum,0))::numeric,2) AS cgst_itc,
         ROUND(SUM(COALESCE(pii_agg.sgst_sum,0))::numeric,2) AS sgst_itc,
         ROUND(SUM(COALESCE(pii_agg.igst_sum,0))::numeric,2) AS igst_itc,
         ROUND(SUM(pi.total_gst)::numeric,2) AS total_itc,
         CASE WHEN COALESCE(v.gst_number,'')='' OR COALESCE(v.is_composition_dealer,false)
              THEN 'INELIGIBLE' ELSE 'ELIGIBLE' END AS itc_status
       FROM purchase_invoices pi
       JOIN vendors v ON v.id=pi.vendor_id AND v.account_id=pi.account_id
       LEFT JOIN LATERAL (
         SELECT SUM(pii.cgst_amount) AS cgst_sum,
                SUM(pii.sgst_amount) AS sgst_sum,
                SUM(pii.igst_amount) AS igst_sum
         FROM purchase_invoice_items pii WHERE pii.purchase_invoice_id=pi.id
       ) pii_agg ON true
       WHERE pi.account_id=$1 AND pi.status='CONFIRMED' AND pi.deleted_at IS NULL
         AND pi.invoice_date BETWEEN $2 AND $3
       GROUP BY v.id, v.name, v.gst_number, v.is_composition_dealer
       ORDER BY SUM(pi.total_gst) DESC NULLS LAST`,
      [accountId, fromDate, toDate]
    ),

    // 3. Invoice-wise ITC detail with 180-day risk
    query(
      `SELECT
         pi.id AS invoice_id,
         pi.invoice_number,
         pi.invoice_date,
         pi.due_date,
         pi.payment_status,
         pi.amount_paid,
         pi.balance_due,
         pi.total_amount,
         pi.total_gst,
         pi.supply_type,
         pi.rcm_applicable,
         pi.reversal_required,
         pi.reversal_date,
         v.id AS vendor_id,
         v.name AS vendor_name,
         COALESCE(v.gst_number,'') AS vendor_gstin,
         COALESCE(v.is_composition_dealer,false) AS is_composition_dealer,
         COALESCE(pii_agg.cgst_sum,0) AS cgst_itc,
         COALESCE(pii_agg.sgst_sum,0) AS sgst_itc,
         COALESCE(pii_agg.igst_sum,0) AS igst_itc,
         COALESCE(pii_agg.taxable_sum,0) AS taxable_value,
         COALESCE(pii_agg.missing_hsn_count,0) AS missing_hsn_count,
         (CURRENT_DATE - pi.invoice_date::date) AS days_since_invoice,
         (pi.invoice_date::date + INTERVAL '180 days')::date AS reversal_due_date,
         ((pi.invoice_date::date + INTERVAL '180 days')::date - CURRENT_DATE) AS days_to_reversal,
         CASE
           WHEN COALESCE(v.gst_number,'')='' OR COALESCE(v.is_composition_dealer,false) THEN 'INELIGIBLE'
           WHEN pi.reversal_required=true THEN 'REVERSED_180DAY'
           WHEN pi.payment_status NOT IN ('PAID')
            AND (pi.invoice_date::date + INTERVAL '180 days')::date <= CURRENT_DATE THEN 'REVERSAL_REQUIRED'
           WHEN pi.payment_status NOT IN ('PAID')
            AND ((pi.invoice_date::date + INTERVAL '180 days')::date - CURRENT_DATE) <= 30 THEN 'AT_RISK'
           ELSE 'ELIGIBLE'
         END AS itc_status
       FROM purchase_invoices pi
       JOIN vendors v ON v.id=pi.vendor_id AND v.account_id=pi.account_id
       LEFT JOIN LATERAL (
         SELECT SUM(pii.cgst_amount) AS cgst_sum,
                SUM(pii.sgst_amount) AS sgst_sum,
                SUM(pii.igst_amount) AS igst_sum,
                SUM(pii.taxable_amount) AS taxable_sum,
                COUNT(CASE WHEN pii.hsn_code IS NULL OR TRIM(pii.hsn_code)='' THEN 1 END) AS missing_hsn_count
         FROM purchase_invoice_items pii WHERE pii.purchase_invoice_id=pi.id
       ) pii_agg ON true
       WHERE pi.account_id=$1 AND pi.status='CONFIRMED' AND pi.deleted_at IS NULL
         AND pi.invoice_date BETWEEN $2 AND $3
       ORDER BY pi.invoice_date DESC, pi.invoice_number`,
      [accountId, fromDate, toDate]
    ),

    // 4. ITC reversals from confirmed purchase returns
    query(
      `SELECT
         pr.id AS return_id,
         pr.return_number,
         pr.return_date,
         pr.purchase_invoice_id,
         pi.invoice_number AS original_invoice_number,
         v.name AS vendor_name,
         ROUND(SUM(COALESCE(pri.return_amount * pii.cgst_amount / NULLIF(pii.line_amount,0),0))::numeric,2) AS cgst_reversed,
         ROUND(SUM(COALESCE(pri.return_amount * pii.sgst_amount / NULLIF(pii.line_amount,0),0))::numeric,2) AS sgst_reversed,
         ROUND(SUM(COALESCE(pri.return_amount * pii.igst_amount / NULLIF(pii.line_amount,0),0))::numeric,2) AS igst_reversed,
         ROUND(SUM(pri.return_amount)::numeric,2) AS total_return_amount
       FROM purchase_returns pr
       JOIN purchase_invoices pi ON pi.id=pr.purchase_invoice_id
       JOIN vendors v ON v.id=pi.vendor_id AND v.account_id=pi.account_id
       JOIN purchase_return_items pri ON pri.purchase_return_id=pr.id
       JOIN purchase_invoice_items pii ON pii.id=pri.purchase_invoice_item_id
       WHERE pr.account_id=$1 AND pr.status='CONFIRMED' AND pr.deleted_at IS NULL
         AND pr.return_date BETWEEN $2 AND $3
       GROUP BY pr.id, pr.return_number, pr.return_date, pr.purchase_invoice_id,
                pi.invoice_number, v.name
       ORDER BY pr.return_date DESC`,
      [accountId, fromDate, toDate]
    ),

    // 5. Blocked / Ineligible ITC - includes CGST/SGST/IGST breakdown from line items
    // supply_type included so fallback can correctly split CGST/SGST vs IGST
    query(
      `SELECT
         pi.id AS invoice_id,
         pi.invoice_number,
         pi.invoice_date,
         pi.total_amount AS purchase_value,
         pi.total_gst AS gst_paid,
         pi.rcm_applicable,
         COALESCE(pi.supply_type,'INTRA_STATE') AS supply_type,
         v.id AS vendor_id,
         v.name AS vendor_name,
         COALESCE(v.gst_number,'') AS vendor_gstin,
         COALESCE(v.is_composition_dealer,false) AS is_composition_dealer,
         CASE
           WHEN COALESCE(v.is_composition_dealer,false) THEN 'Composition Dealer - cannot issue tax invoice'
           WHEN COALESCE(v.gst_number,'')='' THEN 'Unregistered Supplier - no GSTIN'
           ELSE 'Other'
         END AS reason_blocked,
         COALESCE(pii_agg.cgst_sum,0) AS cgst_paid,
         COALESCE(pii_agg.sgst_sum,0) AS sgst_paid,
         COALESCE(pii_agg.igst_sum,0) AS igst_paid
       FROM purchase_invoices pi
       JOIN vendors v ON v.id=pi.vendor_id AND v.account_id=pi.account_id
       LEFT JOIN LATERAL (
         SELECT
           ROUND(SUM(COALESCE(pii.cgst_amount,0))::numeric,2) AS cgst_sum,
           ROUND(SUM(COALESCE(pii.sgst_amount,0))::numeric,2) AS sgst_sum,
           ROUND(SUM(COALESCE(pii.igst_amount,0))::numeric,2) AS igst_sum
         FROM purchase_invoice_items pii
         WHERE pii.purchase_invoice_id = pi.id
       ) pii_agg ON true
       WHERE pi.account_id=$1 AND pi.status='CONFIRMED' AND pi.deleted_at IS NULL
         AND pi.invoice_date BETWEEN $2 AND $3
         AND (COALESCE(v.gst_number,'')='' OR COALESCE(v.is_composition_dealer,false))
       ORDER BY pi.invoice_date DESC`,
      [accountId, fromDate, toDate]
    ),

    // 6. 180-day payment risk invoices (all time, not just this period)
    query(
      `SELECT
         pi.id AS invoice_id,
         pi.invoice_number,
         pi.invoice_date,
         pi.payment_status,
         pi.amount_paid,
         pi.balance_due,
         pi.total_amount,
         pi.total_gst AS itc_at_risk,
         v.name AS vendor_name,
         (pi.invoice_date::date + INTERVAL '180 days')::date AS reversal_due_date,
         ((pi.invoice_date::date + INTERVAL '180 days')::date - CURRENT_DATE) AS days_remaining,
         COALESCE(pii_agg.taxable_sum,0) AS taxable_value
       FROM purchase_invoices pi
       JOIN vendors v ON v.id=pi.vendor_id AND v.account_id=pi.account_id
       LEFT JOIN LATERAL (
         SELECT SUM(pii.taxable_amount) AS taxable_sum
         FROM purchase_invoice_items pii WHERE pii.purchase_invoice_id=pi.id
       ) pii_agg ON true
       WHERE pi.account_id=$1 AND pi.status='CONFIRMED' AND pi.deleted_at IS NULL
         AND pi.payment_status IN ('UNPAID','PARTIAL')
         AND COALESCE(v.gst_number,'') <> ''
         AND NOT COALESCE(v.is_composition_dealer,false)
         AND (pi.invoice_date::date + INTERVAL '180 days')::date <= (CURRENT_DATE + INTERVAL '30 days')
       ORDER BY (pi.invoice_date::date + INTERVAL '180 days')::date ASC`,
      [accountId]
    ),

    // 7. Previous month ITC ledger carry-forward
    query(
      `SELECT net_cgst, net_sgst, net_igst, net_cess
       FROM itc_ledger
       WHERE account_id=$1 AND year=$2 AND month=$3 LIMIT 1`,
      [accountId, month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1]
    ),

    // 8. Missing HSN codes
    query(
      `SELECT COUNT(*) AS count
       FROM purchase_invoice_items pii
       JOIN purchase_invoices pi ON pi.id=pii.purchase_invoice_id
       WHERE pi.account_id=$1 AND pi.status='CONFIRMED' AND pi.deleted_at IS NULL
         AND pi.invoice_date BETWEEN $2 AND $3
         AND (pii.hsn_code IS NULL OR TRIM(pii.hsn_code)='')`,
      [accountId, fromDate, toDate]
    ),

    // 9. Missing supplier GSTIN count
    query(
      `SELECT COUNT(DISTINCT pi.id) AS count
       FROM purchase_invoices pi
       JOIN vendors v ON v.id=pi.vendor_id AND v.account_id=pi.account_id
       WHERE pi.account_id=$1 AND pi.status='CONFIRMED' AND pi.deleted_at IS NULL
         AND pi.invoice_date BETWEEN $2 AND $3
         AND COALESCE(v.gst_number,'')=''`,
      [accountId, fromDate, toDate]
    ),
  ]);

  // Business info
  const biz = bizR.rows?.[0] || {};
  const business = {
    firm_name:  biz.firm_name  || '',
    gst_number: biz.gst_number || '',
    state:      biz.state      || '',
    city:       biz.city       || '',
    address:    biz.address    || '',
  };

  // Summary
  const sumRow = summaryR.rows?.[0] || {};

  // Previous month carry-forward
  const prevLedger = prevLedgerR.rows?.[0] || null;
  const cfCgst  = n(prevLedger?.net_cgst ?? 0);
  const cfSgst  = n(prevLedger?.net_sgst ?? 0);
  const cfIgst  = n(prevLedger?.net_igst ?? 0);
  const cfCess  = n(prevLedger?.net_cess ?? 0);
  const cfTotal = n(cfCgst + cfSgst + cfIgst + cfCess);

  // ITC reversals from returns
  const returnReversals = returnReversalR.rows || [];
  const totalRevCgst  = n(returnReversals.reduce((s, r) => s + n(r.cgst_reversed), 0));
  const totalRevSgst  = n(returnReversals.reduce((s, r) => s + n(r.sgst_reversed), 0));
  const totalRevIgst  = n(returnReversals.reduce((s, r) => s + n(r.igst_reversed), 0));
  const totalRevTotal = n(totalRevCgst + totalRevSgst + totalRevIgst);

  // Eligible ITC breakdown from invoice detail
  const invoiceRows = invoiceDetailR.rows || [];
  const eligRows = invoiceRows.filter(r => r.itc_status === 'ELIGIBLE' || r.itc_status === 'AT_RISK');
  const eligCgst  = n(eligRows.reduce((s, r) => s + n(r.cgst_itc), 0));
  const eligSgst  = n(eligRows.reduce((s, r) => s + n(r.sgst_itc), 0));
  const eligIgst  = n(eligRows.reduce((s, r) => s + n(r.igst_itc), 0));
  const eligTotal = n(eligCgst + eligSgst + eligIgst);

  // Net ITC claimable
  const netCgst  = n(Math.max(0, eligCgst + cfCgst - totalRevCgst));
  const netSgst  = n(Math.max(0, eligSgst + cfSgst - totalRevSgst));
  const netIgst  = n(Math.max(0, eligIgst + cfIgst - totalRevIgst));
  const netTotal = n(netCgst + netSgst + netIgst);

  // 180-day risk
  const riskInvoices   = riskR.rows || [];
  const totalItcAtRisk = n(riskInvoices.reduce((s, r) => s + n(r.itc_at_risk), 0));

  // Blocked ITC
  const blockedInvoices = blockedItcR.rows || [];
  const totalBlockedGst = n(blockedInvoices.reduce((s, r) => s + n(r.gst_paid), 0));

  return {
    year,
    month,
    from_date:    fromDate,
    to_date:      toDate,
    generated_at: new Date().toISOString(),
    business,

    summary: {
      total_purchase_value:     n(sumRow.total_purchase_value),
      total_invoice_count:      int(sumRow.total_invoice_count),
      total_gst_paid:           n(sumRow.total_gst_paid),
      total_cgst_paid:          n(sumRow.total_cgst_paid),
      total_sgst_paid:          n(sumRow.total_sgst_paid),
      total_igst_paid:          n(sumRow.total_igst_paid),
      eligible_itc_total:       n(sumRow.eligible_itc_total),
      eligible_invoice_count:   int(sumRow.eligible_invoice_count),
      ineligible_itc_total:     n(sumRow.ineligible_itc_total),
      ineligible_invoice_count: int(sumRow.ineligible_invoice_count),
      reversal_total:           totalRevTotal,
      reversal_count:           returnReversals.length,
      net_itc_claimable:        netTotal,
      itc_at_risk:              totalItcAtRisk,
      risk_invoice_count:       riskInvoices.length,
      missing_hsn_count:        int(missingHsnR.rows?.[0]?.count),
      missing_gstin_count:      int(missingGstinR.rows?.[0]?.count),
    },

    itc_carry_forward: {
      opening:  { cgst: cfCgst,       sgst: cfSgst,       igst: cfIgst,       cess: cfCess,  total: cfTotal },
      earned:   { cgst: eligCgst,     sgst: eligSgst,     igst: eligIgst,     cess: 0,       total: eligTotal },
      reversed: { cgst: totalRevCgst, sgst: totalRevSgst, igst: totalRevIgst, cess: 0,       total: totalRevTotal },
      net:      { cgst: netCgst,      sgst: netSgst,      igst: netIgst,      cess: 0,       total: netTotal },
    },

    supplier_summary: (supplierSummaryR.rows || []).map(row => ({
      vendor_id:             row.vendor_id,
      vendor_name:           row.vendor_name,
      vendor_gstin:          row.vendor_gstin,
      is_composition_dealer: Boolean(row.is_composition_dealer),
      invoice_count:         int(row.invoice_count),
      purchase_value:        n(row.purchase_value),
      cgst_itc:              n(row.cgst_itc),
      sgst_itc:              n(row.sgst_itc),
      igst_itc:              n(row.igst_itc),
      cess_itc:              0,
      total_itc:             n(row.total_itc),
      itc_status:            row.itc_status,
    })),

    invoice_detail: invoiceRows.map(row => ({
      invoice_id:            row.invoice_id,
      invoice_number:        row.invoice_number,
      invoice_date:          row.invoice_date,
      due_date:              row.due_date,
      payment_status:        row.payment_status,
      amount_paid:           n(row.amount_paid),
      balance_due:           n(row.balance_due),
      total_amount:          n(row.total_amount),
      total_gst:             n(row.total_gst),
      supply_type:           row.supply_type || 'INTRA_STATE',
      rcm_applicable:        Boolean(row.rcm_applicable),
      reversal_required:     Boolean(row.reversal_required),
      reversal_date:         row.reversal_date,
      vendor_id:             row.vendor_id,
      vendor_name:           row.vendor_name,
      vendor_gstin:          row.vendor_gstin,
      is_composition_dealer: Boolean(row.is_composition_dealer),
      cgst_itc:              n(row.cgst_itc),
      sgst_itc:              n(row.sgst_itc),
      igst_itc:              n(row.igst_itc),
      cess_itc:              0,
      taxable_value:         n(row.taxable_value),
      missing_hsn_count:     int(row.missing_hsn_count),
      days_since_invoice:    int(row.days_since_invoice),
      reversal_due_date:     row.reversal_due_date,
      days_to_reversal:      int(row.days_to_reversal),
      itc_status:            row.itc_status,
    })),

    reversals: returnReversals.map(row => ({
      return_id:               row.return_id,
      return_number:           row.return_number,
      return_date:             row.return_date,
      original_invoice_id:     row.purchase_invoice_id,
      original_invoice_number: row.original_invoice_number,
      vendor_name:             row.vendor_name,
      reversal_type:           'PURCHASE_RETURN',
      cgst_reversed:           n(row.cgst_reversed),
      sgst_reversed:           n(row.sgst_reversed),
      igst_reversed:           n(row.igst_reversed),
      cess_reversed:           0,
      total_reversed:          n(n(row.cgst_reversed) + n(row.sgst_reversed) + n(row.igst_reversed)),
      total_return_amount:     n(row.total_return_amount),
      reason:                  'Purchase return - ITC reversed proportionally on returned items',
    })),

    blocked_itc: blockedInvoices.map(row => {
      // Derive CGST/SGST/IGST from line items if available; fall back to supply_type split
      const rawCgst  = n(row.cgst_paid);
      const rawSgst  = n(row.sgst_paid);
      const rawIgst  = n(row.igst_paid);
      const rawTotal = n(row.gst_paid);
      const isInter  = String(row.supply_type || '').toUpperCase() === 'INTER_STATE';
      // If line-item breakdown sums to zero but total is non-zero, derive from supply_type
      const hasBreakdown = (rawCgst + rawSgst + rawIgst) > 0;
      const cgstPaid = hasBreakdown ? rawCgst : (isInter ? 0 : Math.round(rawTotal / 2 * 100) / 100);
      const sgstPaid = hasBreakdown ? rawSgst : (isInter ? 0 : Math.round(rawTotal / 2 * 100) / 100);
      const igstPaid = hasBreakdown ? rawIgst : (isInter ? rawTotal : 0);
      return {
        invoice_id:            row.invoice_id,
        invoice_number:        row.invoice_number,
        invoice_date:          row.invoice_date,
        vendor_id:             row.vendor_id,
        vendor_name:           row.vendor_name,
        vendor_gstin:          row.vendor_gstin,
        is_composition_dealer: Boolean(row.is_composition_dealer),
        purchase_value:        n(row.purchase_value),
        gst_paid:              rawTotal,
        cgst_paid:             cgstPaid,
        sgst_paid:             sgstPaid,
        igst_paid:             igstPaid,
        cess_paid:             0,
        reason_blocked:        row.reason_blocked,
        rcm_applicable:        Boolean(row.rcm_applicable),
      };
    }),
    blocked_itc_total: totalBlockedGst,

    risk_invoices: riskInvoices.map(row => ({
      invoice_id:       row.invoice_id,
      invoice_number:   row.invoice_number,
      invoice_date:     row.invoice_date,
      vendor_name:      row.vendor_name,
      payment_status:   row.payment_status,
      amount_paid:      n(row.amount_paid),
      balance_due:      n(row.balance_due),
      total_amount:     n(row.total_amount),
      itc_at_risk:      n(row.itc_at_risk),
      taxable_value:    n(row.taxable_value),
      reversal_due_date: row.reversal_due_date,
      days_remaining:   int(row.days_remaining),
    })),
    risk_itc_total: totalItcAtRisk,

    notes: [
      'ITC can only be claimed from GST-registered suppliers with valid GSTIN.',
      'ITC must be reversed if supplier invoice is unpaid beyond 180 days.',
      'Purchase returns automatically reverse ITC on returned quantities.',
      'RCM purchases may allow ITC - consult your CA for specific goods.',
      'This report is system-generated. Cross-check with purchase register before sharing with CA.',
      'IGST ITC can be used to pay IGST, then CGST, then SGST in that order.',
    ],

    disclaimer: 'ITC claims in GSTR-3B are verified against supplier GSTR-1 filings. Mismatches may result in notices from the GST department. Please verify all figures with your CA before filing.',
  };
}

function n(v)   { return Math.round((parseFloat(v) || 0) * 100) / 100; }
function int(v) { return parseInt(v || 0, 10); }

module.exports = { handler, buildGstr2Data };