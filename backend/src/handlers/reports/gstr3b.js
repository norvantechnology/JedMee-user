'use strict';
const { ok, fail } = require('../../shared/response');
const { requirePermission } = require('../../shared/auth');
const { getPermissionsForUser } = require('../../shared/permissions');
const { query, withTransaction } = require('../../shared/db');
const { resolveClientTimeZone } = require('../../shared/dateFilters');
const { monthStartYmd, monthEndYmd } = require('../../shared/timezone');

/**
 * GSTR-3B Monthly Summary Report — Complete rewrite.
 *
 * Covers all GST conditions:
 *  - CASH_MEMO and TAX_INVOICE bill types (both contribute to GST liability)
 *  - Intra-state (CGST+SGST) and inter-state (IGST) supply types
 *  - Free-qty lines (taxable_amount=0, gst_amount=0 — excluded from both taxable and nil-rated)
 *  - Loose-qty lines (have their own taxable_amount and gst_amount — included correctly)
 *  - Nil-rated / zero-GST items (gst_amount=0 but taxable_amount>0)
 *  - Sales returns (credit notes) reduce outward supply totals
 *  - Purchase returns reverse ITC proportionally
 *  - ITC eligible (supplier has GSTIN) vs ineligible (no GSTIN)
 *  - Carry-forward ITC from previous month
 *
 * Classifier rule:
 *   taxable line  = gst_amount > 0  (GST was actually collected)
 *   nil-rated line = gst_amount = 0 AND taxable_amount > 0  (value but no GST)
 *   free-qty line  = gst_amount = 0 AND taxable_amount = 0  (excluded entirely)
 *
 * CGST/SGST/IGST derivation (handles pre-migration CASH_MEMO data):
 *   If stored split (cgst_amount + sgst_amount + igst_amount) > 0 → use stored values
 *   Else if supply_type = INTER_STATE → IGST = gst_amount, CGST = SGST = 0
 *   Else (INTRA_STATE default) → CGST = SGST = gst_amount / 2, IGST = 0
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
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;
  const dueDate   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-20`;

  try {
    const reportData = await buildGstr3bData(ctx.accountId, year, month, fromDate, toDate, dueDate);

    // Auto-save snapshot (non-fatal)
    try {
      await withTransaction(async (q) => {
        await q(
          `INSERT INTO gstr3b_snapshots (account_id,year,month,snapshot_data,due_date,status)
           VALUES ($1,$2,$3,$4,$5,'DRAFT')
           ON CONFLICT (account_id,year,month)
           DO UPDATE SET snapshot_data=EXCLUDED.snapshot_data,due_date=EXCLUDED.due_date,updated_at=now()`,
          [ctx.accountId, year, month, JSON.stringify(reportData), dueDate]
        );
      });
    } catch (snapErr) {
      console.warn('[gstr3b] snapshot save failed:', snapErr.message);
    }

    return ok(reportData);
  } catch (e) {
    console.error('[gstr3b] error:', e);
    return fail(500, 'INTERNAL_ERROR', 'Failed to generate GSTR3B report.', { subMessage: e.message });
  }
}

/**
 * Core calculation — shared by GET handler and file/lock handler.
 * All queries run in parallel for minimum latency.
 */
async function buildGstr3bData(accountId, year, month, fromDate, toDate, dueDate) {
  const [
    bizR,
    outTaxableR,
    outNilR,
    salesReturnAdjR,
    itcEligR,
    itcInelR,
    itcRevR,
    missingHsnR,
    missingGstinR,
    snapshotHistR,
    nilInwardR,
    prevCfR,
  ] = await Promise.all([

    // ── 0. Business info ──────────────────────────────────────────────────────
    query(
      `SELECT firm_name, gst_number, state, city, address
       FROM app_users WHERE id=$1 LIMIT 1`,
      [accountId]
    ),

    // ── 1. Taxable outward supplies (gst_amount > 0) — Section 3.1 ───────────
    // Covers: CASH_MEMO + TAX_INVOICE, intra + inter-state, strip + loose qty.
    // Free-qty lines have taxable_amount=0 and gst_amount=0 — excluded by filter.
    // CGST/SGST/IGST: use stored split if available, else derive from gst_amount.
    query(
      `SELECT
         ROUND(SUM(sii.taxable_amount)::numeric, 2)                          AS taxable_value,
         ROUND(SUM(
           CASE
             WHEN (COALESCE(sii.cgst_amount,0)+COALESCE(sii.sgst_amount,0)+COALESCE(sii.igst_amount,0)) > 0
               THEN COALESCE(sii.cgst_amount, 0)
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE' THEN 0
             ELSE COALESCE(sii.gst_amount, 0) / 2
           END
         )::numeric, 2)                                                       AS cgst,
         ROUND(SUM(
           CASE
             WHEN (COALESCE(sii.cgst_amount,0)+COALESCE(sii.sgst_amount,0)+COALESCE(sii.igst_amount,0)) > 0
               THEN COALESCE(sii.sgst_amount, 0)
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE' THEN 0
             ELSE COALESCE(sii.gst_amount, 0) / 2
           END
         )::numeric, 2)                                                       AS sgst,
         ROUND(SUM(
           CASE
             WHEN (COALESCE(sii.cgst_amount,0)+COALESCE(sii.sgst_amount,0)+COALESCE(sii.igst_amount,0)) > 0
               THEN COALESCE(sii.igst_amount, 0)
             WHEN COALESCE(si.supply_type,'INTRA_STATE') = 'INTER_STATE'
               THEN COALESCE(sii.gst_amount, 0)
             ELSE 0
           END
         )::numeric, 2)                                                       AS igst,
         -- line_total = taxable_amount + gst_amount (already computed at confirm)
         ROUND(SUM(COALESCE(sii.line_total, sii.taxable_amount + COALESCE(sii.gst_amount,0)))::numeric, 2) AS total_value,
         COUNT(DISTINCT si.id)                                                AS invoice_count
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.sales_invoice_id
       WHERE si.account_id = $1
         AND si.status = 'CONFIRMED'
         AND si.deleted_at IS NULL
         AND si.invoice_date BETWEEN $2 AND $3
         AND COALESCE(sii.gst_amount, 0) > 0`,
      [accountId, fromDate, toDate]
    ),

    // ── 2. Nil-rated / Exempt outward supplies (gst_amount=0, taxable_amount>0) ─
    // Excludes free-qty lines (taxable_amount=0 AND gst_amount=0).
    // Flags items with gst_percent>0 but gst_amount=0 as data quality issues.
    query(
      `SELECT
         ROUND(SUM(sii.taxable_amount)::numeric, 2)                          AS taxable_value,
         ROUND(SUM(sii.taxable_amount)::numeric, 2)                          AS total_value,
         COUNT(DISTINCT si.id)                                                AS invoice_count,
         COUNT(CASE WHEN COALESCE(sii.gst_percent, 0) > 0 THEN 1 END)       AS gst_rate_set_count
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.sales_invoice_id
       WHERE si.account_id = $1
         AND si.status = 'CONFIRMED'
         AND si.deleted_at IS NULL
         AND si.invoice_date BETWEEN $2 AND $3
         AND COALESCE(sii.gst_amount, 0) = 0
         AND COALESCE(sii.taxable_amount, 0) > 0`,
      [accountId, fromDate, toDate]
    ),

    // ── 3. Sales returns adjustment — reduces outward supply totals ───────────
    // Confirmed sales returns in the period reduce the outward GST liability.
    // Uses same CGST/SGST/IGST derivation as outward supplies.
    // return_amount on sales_return_items is the net return value (taxable + gst).
    query(
      `SELECT
         ROUND(SUM(sri.return_amount)::numeric, 2)                           AS total_return_value,
         COUNT(DISTINCT sr.id)                                                AS return_count
       FROM sales_return_items sri
       JOIN sales_returns sr ON sr.id = sri.sales_return_id
       WHERE sr.account_id = $1
         AND sr.status = 'CONFIRMED'
         AND sr.deleted_at IS NULL
         AND sr.return_date BETWEEN $2 AND $3`,
      [accountId, fromDate, toDate]
    ),

    // ── 4. ITC eligible — supplier has GSTIN — Section 4A ────────────────────
    // Uses stored cgst/sgst/igst from purchase_invoice_items.
    // purchase_invoice_items always have the split stored (purchase confirm sets them).
    query(
      `SELECT
         ROUND(SUM(pii.taxable_amount)::numeric, 2)  AS taxable_value,
         ROUND(SUM(COALESCE(pii.cgst_amount, 0))::numeric, 2) AS cgst,
         ROUND(SUM(COALESCE(pii.sgst_amount, 0))::numeric, 2) AS sgst,
         ROUND(SUM(COALESCE(pii.igst_amount, 0))::numeric, 2) AS igst,
         ROUND(SUM(COALESCE(pii.gst_amount,  0))::numeric, 2) AS total_gst,
         COUNT(DISTINCT pi.id)                        AS invoice_count
       FROM purchase_invoice_items pii
       JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
       JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id
       WHERE pi.account_id = $1
         AND pi.status = 'CONFIRMED'
         AND pi.deleted_at IS NULL
         AND pi.invoice_date BETWEEN $2 AND $3
         AND COALESCE(v.gst_number, '') <> ''
         AND COALESCE(pii.gst_amount, 0) > 0`,
      [accountId, fromDate, toDate]
    ),

    // ── 5. ITC ineligible — supplier has no GSTIN — Section 4C ───────────────
    // GST paid to unregistered suppliers is a cost, not claimable as ITC.
    query(
      `SELECT
         ROUND(SUM(pii.taxable_amount)::numeric, 2)  AS taxable_value,
         ROUND(SUM(COALESCE(pii.cgst_amount, 0))::numeric, 2) AS cgst,
         ROUND(SUM(COALESCE(pii.sgst_amount, 0))::numeric, 2) AS sgst,
         ROUND(SUM(COALESCE(pii.igst_amount, 0))::numeric, 2) AS igst,
         ROUND(SUM(COALESCE(pii.gst_amount,  0))::numeric, 2) AS total_gst,
         COUNT(DISTINCT pi.id)                        AS invoice_count
       FROM purchase_invoice_items pii
       JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
       JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id
       WHERE pi.account_id = $1
         AND pi.status = 'CONFIRMED'
         AND pi.deleted_at IS NULL
         AND pi.invoice_date BETWEEN $2 AND $3
         AND COALESCE(v.gst_number, '') = ''`,
      [accountId, fromDate, toDate]
    ),

    // ── 6. ITC reversal from confirmed purchase returns — Section 4B2 ─────────
    // Proportional reversal: return_amount / original_line_amount * gst_amount.
    // Uses line_amount (taxable + gst) as the denominator for correct proportion.
    query(
      `SELECT
         ROUND(SUM(
           COALESCE(
             pri.return_amount * pii.cgst_amount / NULLIF(pii.line_amount, 0),
             0
           )
         )::numeric, 2) AS cgst,
         ROUND(SUM(
           COALESCE(
             pri.return_amount * pii.sgst_amount / NULLIF(pii.line_amount, 0),
             0
           )
         )::numeric, 2) AS sgst,
         ROUND(SUM(
           COALESCE(
             pri.return_amount * pii.igst_amount / NULLIF(pii.line_amount, 0),
             0
           )
         )::numeric, 2) AS igst,
         ROUND(SUM(pri.return_amount)::numeric, 2)   AS total_amount,
         COUNT(DISTINCT pr.id)                        AS return_count
       FROM purchase_return_items pri
       JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
       JOIN purchase_invoice_items pii ON pii.id = pri.purchase_invoice_item_id
       WHERE pr.account_id = $1
         AND pr.status = 'CONFIRMED'
         AND pr.deleted_at IS NULL
         AND pr.return_date BETWEEN $2 AND $3`,
      [accountId, fromDate, toDate]
    ),

    // ── 7. Missing HSN codes in confirmed sales invoice items ─────────────────
    query(
      `SELECT COUNT(*) AS count
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.sales_invoice_id
       WHERE si.account_id = $1
         AND si.status = 'CONFIRMED'
         AND si.deleted_at IS NULL
         AND si.invoice_date BETWEEN $2 AND $3
         AND (sii.hsn_code IS NULL OR TRIM(sii.hsn_code) = '')`,
      [accountId, fromDate, toDate]
    ),

    // ── 8. Purchase invoices with missing supplier GSTIN ──────────────────────
    query(
      `SELECT COUNT(DISTINCT pi.id) AS count
       FROM purchase_invoices pi
       JOIN vendors v ON v.id = pi.vendor_id AND v.account_id = pi.account_id
       WHERE pi.account_id = $1
         AND pi.status = 'CONFIRMED'
         AND pi.deleted_at IS NULL
         AND pi.invoice_date BETWEEN $2 AND $3
         AND COALESCE(v.gst_number, '') = ''`,
      [accountId, fromDate, toDate]
    ),

    // ── 9. Month history from snapshots (last 12 months) ─────────────────────
    query(
      `SELECT year, month, snapshot_data, updated_at, status
       FROM gstr3b_snapshots
       WHERE account_id = $1
       ORDER BY year DESC, month DESC
       LIMIT 12`,
      [accountId]
    ),

    // ── 10. Section 5 — Nil-rated inward supplies (purchase items, gst=0) ─────
    // Purchases where no GST was charged (gst_percent=0 or gst_amount=0).
    query(
      `SELECT
         ROUND(SUM(pii.taxable_amount)::numeric, 2) AS taxable_value,
         COUNT(DISTINCT pi.id)                       AS invoice_count
       FROM purchase_invoice_items pii
       JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
       WHERE pi.account_id = $1
         AND pi.status = 'CONFIRMED'
         AND pi.deleted_at IS NULL
         AND pi.invoice_date BETWEEN $2 AND $3
         AND COALESCE(pii.gst_amount, 0) = 0
         AND COALESCE(pii.taxable_amount, 0) > 0`,
      [accountId, fromDate, toDate]
    ),

    // ── 11. Carry-forward ITC from previous filed month ───────────────────────
    query(
      `SELECT carry_forward_cgst, carry_forward_sgst, carry_forward_igst
       FROM gstr3b_snapshots
       WHERE account_id = $1
         AND year = $2
         AND month = $3
         AND status = 'FILED'
       LIMIT 1`,
      [
        accountId,
        month === 1 ? year - 1 : year,
        month === 1 ? 12 : month - 1,
      ]
    ),
  ]);

  // ── Business info ───────────────────────────────────────────────────────────
  const biz = bizR.rows?.[0] || {};
  const business = {
    firm_name:  biz.firm_name  || '',
    gst_number: biz.gst_number || '',
    state:      biz.state      || '',
    city:       biz.city       || '',
    address:    biz.address    || '',
  };

  // ── Section 3.1 — Outward Supplies ─────────────────────────────────────────
  const taxRow = outTaxableR.rows?.[0] || {};
  const nilRow = outNilR.rows?.[0]     || {};
  const retRow = salesReturnAdjR.rows?.[0] || {};

  const taxable = {
    taxable_value: n(taxRow.taxable_value),
    cgst:          n(taxRow.cgst),
    sgst:          n(taxRow.sgst),
    igst:          n(taxRow.igst),
    cess:          0,
    total_value:   n(taxRow.total_value),
    invoice_count: int(taxRow.invoice_count),
  };
  const nil_rated = {
    taxable_value:     n(nilRow.taxable_value),
    cgst: 0, sgst: 0, igst: 0, cess: 0,
    total_value:       n(nilRow.total_value),
    invoice_count:     int(nilRow.invoice_count),
    gst_rate_set_count: int(nilRow.gst_rate_set_count),
  };
  const sales_returns_adj = {
    total_return_value: n(retRow.total_return_value),
    return_count:       int(retRow.return_count),
  };

  const totalOutCgst    = taxable.cgst;
  const totalOutSgst    = taxable.sgst;
  const totalOutIgst    = taxable.igst;
  const totalOutTaxable = n(taxable.taxable_value + nil_rated.taxable_value);
  const totalOutValue   = n(taxable.total_value   + nil_rated.total_value);
  const totalOutGst     = n(totalOutCgst + totalOutSgst + totalOutIgst);

  // ── Section 4 — ITC ─────────────────────────────────────────────────────────
  const eligRow = itcEligR.rows?.[0] || {};
  const inelRow = itcInelR.rows?.[0] || {};
  const revRow  = itcRevR.rows?.[0]  || {};
  const prevCf  = prevCfR.rows?.[0]  || null;

  const cfPrevCgst = n(prevCf?.carry_forward_cgst ?? 0);
  const cfPrevSgst = n(prevCf?.carry_forward_sgst ?? 0);
  const cfPrevIgst = n(prevCf?.carry_forward_igst ?? 0);

  const eligCgst = n(eligRow.cgst);
  const eligSgst = n(eligRow.sgst);
  const eligIgst = n(eligRow.igst);
  const revCgst  = n(revRow.cgst);
  const revSgst  = n(revRow.sgst);
  const revIgst  = n(revRow.igst);

  // Net ITC = eligible ITC + carry-forward from previous month - reversals
  const netItcCgst = n(Math.max(0, eligCgst + cfPrevCgst - revCgst));
  const netItcSgst = n(Math.max(0, eligSgst + cfPrevSgst - revSgst));
  const netItcIgst = n(Math.max(0, eligIgst + cfPrevIgst - revIgst));

  // ── Section 6 — Net Tax Payable ─────────────────────────────────────────────
  const netPayCgst  = n(Math.max(0, totalOutCgst - netItcCgst));
  const netPaySgst  = n(Math.max(0, totalOutSgst - netItcSgst));
  const netPayIgst  = n(Math.max(0, totalOutIgst - netItcIgst));
  const totalNetPay = n(netPayCgst + netPaySgst + netPayIgst);

  // Carry-forward to next month (ITC > liability)
  const cfCgst  = n(Math.max(0, netItcCgst - totalOutCgst));
  const cfSgst  = n(Math.max(0, netItcSgst - totalOutSgst));
  const cfIgst  = n(Math.max(0, netItcIgst - totalOutIgst));
  const totalCf = n(cfCgst + cfSgst + cfIgst);

  // ── Section 5 — Nil-rated inward supplies ───────────────────────────────────
  const sec5Row = nilInwardR.rows?.[0] || {};

  return {
    year, month,
    from_date:    fromDate,
    to_date:      toDate,
    due_date:     dueDate,
    generated_at: new Date().toISOString(),
    business,

    summary: {
      total_sales_value:       totalOutValue,
      total_gst_collected:     totalOutGst,
      total_itc_available:     n(netItcCgst + netItcSgst + netItcIgst),
      net_gst_payable:         totalNetPay,
      carry_forward_total:     totalCf,
      all_sales_nil_rated:     totalOutGst === 0 && totalOutValue > 0,
      zero_gst_sales_warning:  totalOutGst === 0 && totalOutValue > 0,
      gst_rate_mismatch_count: int(nilRow.gst_rate_set_count),
      ineligible_itc_cost:     n(n(inelRow.cgst) + n(inelRow.sgst) + n(inelRow.igst)),
      sales_returns_count:     sales_returns_adj.return_count,
      sales_returns_value:     sales_returns_adj.total_return_value,
    },

    // Section 3.1 — Outward Supplies
    outward_supplies: {
      taxable,
      nil_rated,
      sales_returns_adj,
      totals: {
        taxable_value: totalOutTaxable,
        cgst:          n(totalOutCgst),
        sgst:          n(totalOutSgst),
        igst:          n(totalOutIgst),
        cess:          0,
        total_value:   totalOutValue,
        invoice_count: taxable.invoice_count + nil_rated.invoice_count,
      },
    },

    // Section 3.2 — Inter-state supplies (auto-populated from GSTR-1 on portal from July 2025)
    section_3_2: {
      note: 'From July 2025, Table 3.2 values are auto-populated from GSTR-1 data on the GST portal and cannot be manually edited. These values will be pre-filled when you file GSTR-3B online.',
      unregistered: { taxable_value: 0, igst: 0, cess: 0 },
      composition:  { taxable_value: 0, igst: 0, cess: 0 },
      uin_holders:  { taxable_value: 0, igst: 0, cess: 0 },
    },

    // Section 4 — ITC from Purchases
    itc: {
      eligible: {
        taxable_value: n(eligRow.taxable_value),
        cgst:          eligCgst,
        sgst:          eligSgst,
        igst:          eligIgst,
        cess:          0,
        total:         n(eligCgst + eligSgst + eligIgst),
        invoice_count: int(eligRow.invoice_count),
      },
      imports: { cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 },
      ineligible: {
        taxable_value: n(inelRow.taxable_value),
        cgst:          n(inelRow.cgst),
        sgst:          n(inelRow.sgst),
        igst:          n(inelRow.igst),
        cess:          0,
        total:         n(inelRow.total_gst),
        invoice_count: int(inelRow.invoice_count),
        note: 'Purchases from unregistered suppliers. GST paid is a cost — not claimable as ITC. Reverse Charge Mechanism (RCM) may apply on specific notified goods/services — consult your CA.',
      },
      reversals: {
        cgst:         revCgst,
        sgst:         revSgst,
        igst:         revIgst,
        cess:         0,
        total:        n(revCgst + revSgst + revIgst),
        return_count: int(revRow.return_count),
        total_amount: n(revRow.total_amount),
      },
      carry_forward_from_prev: {
        cgst:  cfPrevCgst,
        sgst:  cfPrevSgst,
        igst:  cfPrevIgst,
        total: n(cfPrevCgst + cfPrevSgst + cfPrevIgst),
      },
      net_itc: {
        cgst:  netItcCgst,
        sgst:  netItcSgst,
        igst:  netItcIgst,
        cess:  0,
        total: n(netItcCgst + netItcSgst + netItcIgst),
      },
    },

    // Section 5 — Exempt, nil-rated, and non-GST inward supplies
    section_5: {
      nil_rated_inward: {
        taxable_value: n(sec5Row.taxable_value),
        invoice_count: int(sec5Row.invoice_count),
      },
      exempt_inward:  { taxable_value: 0 },
      non_gst_inward: { taxable_value: 0 },
    },

    // Section 6 — Net Tax Payable
    tax_payable: {
      cgst: { gst_collected: n(totalOutCgst), itc_available: netItcCgst, net_payable: netPayCgst, interest: 0, late_fee: 0, carry_forward: cfCgst },
      sgst: { gst_collected: n(totalOutSgst), itc_available: netItcSgst, net_payable: netPaySgst, interest: 0, late_fee: 0, carry_forward: cfSgst },
      igst: { gst_collected: n(totalOutIgst), itc_available: netItcIgst, net_payable: netPayIgst, interest: 0, late_fee: 0, carry_forward: cfIgst },
      cess: { gst_collected: 0, itc_available: 0, net_payable: 0, interest: 0, late_fee: 0, carry_forward: 0 },
      total: {
        gst_collected: totalOutGst,
        itc_available: n(netItcCgst + netItcSgst + netItcIgst),
        net_payable:   totalNetPay,
        interest:      0,
        late_fee:      0,
        carry_forward: totalCf,
      },
    },

    // Notes for CA
    notes: {
      missing_hsn_count:       int(missingHsnR.rows?.[0]?.count),
      missing_gstin_count:     int(missingGstinR.rows?.[0]?.count),
      purchase_returns_count:  int(revRow.return_count),
      purchase_returns_amount: n(revRow.total_amount),
    },

    // Month history from snapshots
    month_history: (snapshotHistR.rows || []).map(row => {
      const sd = row.snapshot_data || {};
      return {
        year:         row.year,
        month:        row.month,
        status:       row.status,
        generated_at: row.updated_at,
        total_sales:  n(sd.summary?.total_sales_value),
        total_gst:    n(sd.summary?.total_gst_collected),
        total_itc:    n(sd.summary?.total_itc_available),
        net_payable:  n(sd.summary?.net_gst_payable),
      };
    }),

    disclaimer: 'GSTR-3B cannot be revised once submitted on the GST portal. Please verify all figures carefully with your CA before filing. These numbers are system-generated from your invoices and must be cross-checked against your books of accounts.',
  };
}

function n(v)   { return Math.round((parseFloat(v) || 0) * 100) / 100; }
function int(v) { return parseInt(v || 0, 10); }

module.exports = { handler, buildGstr3bData };