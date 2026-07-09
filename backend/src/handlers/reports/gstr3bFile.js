'use strict';
const { ok, fail } = require('../../shared/response');
const { requirePermission } = require('../../shared/auth');
const { getPermissionsForUser } = require('../../shared/permissions');
const { query, withTransaction } = require('../../shared/db');
const { buildGstr3bData } = require('./gstr3b');
const { resolveClientTimeZone } = require('../../shared/dateFilters');
const { monthStartYmd, monthEndYmd } = require('../../shared/timezone');

/**
 * GSTR3B File/Lock handler - POST /reports/gstr3b/{year}/{month}/file
 *
 * Marks the month as FILED and freezes the snapshot_data.
 * Once filed, the GET handler returns the frozen data unchanged.
 *
 * Body (optional):
 *   { snapshot_data: <full report payload from GET> }
 *   If omitted, the handler re-runs the live calculation and freezes it.
 *
 * Path params: year, month
 */
async function handler(event) {
  const auth = await requirePermission(event, 'REPORTS', 'VIEW');
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || '');
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, 'BAD_REQUEST', 'account not found');

  const pp    = event.pathParameters || {};
  const year  = parseInt(pp.year  || '', 10);
  const month = parseInt(pp.month || '', 10);

  if (!year || !month || month < 1 || month > 12 || year < 2000 || year > 2100) {
    return fail(400, 'VALIDATION_ERROR', 'year (>=2000) and month (1-12) are required in path.');
  }

  // Parse optional body
  let bodySnapshotData = null;
  try {
    const raw = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    bodySnapshotData = raw.snapshot_data || null;
  } catch {
    // ignore parse errors - we'll re-calculate
  }

  const qs = event.queryStringParameters || {};
  const timeZone = resolveClientTimeZone(qs);

  // ── Date range ──────────────────────────────────────────────────────────────
  const fromDate = monthStartYmd(year, month, timeZone);
  const toDate = monthEndYmd(year, month, timeZone);
  const nextMonth = month === 12 ? 1  : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;
  const dueDate   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-20`;

  try {
    // ── Check if already filed ──────────────────────────────────────────────
    const existingR = await query(
      `SELECT id, status FROM gstr3b_snapshots
       WHERE account_id = $1 AND year = $2 AND month = $3 LIMIT 1`,
      [ctx.accountId, year, month]
    );
    const existing = existingR.rows[0] || null;

    if (existing?.status === 'FILED') {
      return fail(409, 'ALREADY_FILED', `GSTR3B for ${month}/${year} is already filed and locked.`);
    }

    // ── Build snapshot data ─────────────────────────────────────────────────
    // Use provided snapshot_data if available; otherwise re-run live calculation
    // using the shared buildGstr3bData function (same logic as GET handler).
    let snapshotData = bodySnapshotData;
    if (!snapshotData) {
      snapshotData = await buildGstr3bData(ctx.accountId, year, month, fromDate, toDate, dueDate);
    }

    // ── Extract carry-forward amounts ───────────────────────────────────────
    const cfCgst = r2(snapshotData?.tax_payable?.cgst?.carry_forward ?? 0);
    const cfSgst = r2(snapshotData?.tax_payable?.sgst?.carry_forward ?? 0);
    const cfIgst = r2(snapshotData?.tax_payable?.igst?.carry_forward ?? 0);

    const now = new Date().toISOString();

    // ── Upsert snapshot row ─────────────────────────────────────────────────
    await withTransaction(async (q) => {
      if (existing) {
        await q(
          `UPDATE gstr3b_snapshots
           SET status             = 'FILED',
               filed_at           = $1,
               filed_by_user_id   = $2,
               snapshot_data      = $3,
               carry_forward_cgst = $4,
               carry_forward_sgst = $5,
               carry_forward_igst = $6,
               due_date           = $7,
               updated_at         = now()
           WHERE account_id = $8 AND year = $9 AND month = $10`,
          [now, actorId, JSON.stringify(snapshotData), cfCgst, cfSgst, cfIgst, dueDate, ctx.accountId, year, month]
        );
      } else {
        await q(
          `INSERT INTO gstr3b_snapshots
             (account_id, year, month, status, filed_at, filed_by_user_id,
              snapshot_data, carry_forward_cgst, carry_forward_sgst, carry_forward_igst, due_date)
           VALUES ($1, $2, $3, 'FILED', $4, $5, $6, $7, $8, $9, $10)`,
          [ctx.accountId, year, month, now, actorId, JSON.stringify(snapshotData), cfCgst, cfSgst, cfIgst, dueDate]
        );
      }
    });

    return ok({
      filed:         true,
      year,
      month,
      filed_at:      now,
      carry_forward: { cgst: cfCgst, sgst: cfSgst, igst: cfIgst, total: r2(cfCgst + cfSgst + cfIgst) },
    });
  } catch (e) {
    console.error('[gstr3bFile] error:', e);
    return fail(500, 'INTERNAL_ERROR', 'Failed to file GSTR3B.', { subMessage: e.message });
  }
}

function r2(v) {
  return Math.round((parseFloat(v) || 0) * 100) / 100;
}

module.exports = { handler };