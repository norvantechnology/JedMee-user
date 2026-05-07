const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");

function ymd(v) {
  return String(v || "").slice(0, 10);
}

function ledgerTs(isoDate, createdAt) {
  const t = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isNaN(t)) return t;
  const d = new Date(String(isoDate || "").slice(0, 10) || 0).getTime();
  return Number.isNaN(d) ? 0 : d;
}

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const vendorId = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!vendorId) return fail(400, "VALIDATION_ERROR", "vendor id is required");

  try {
    const vendorRs = await query(
      `SELECT id, code, name, phone_number, address, email
       FROM vendors
       WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [vendorId, ctx.accountId]
    );
    const vendor = vendorRs.rows?.[0] || null;
    if (!vendor) return fail(404, "NOT_FOUND", "Supplier not found");

    const [invoicesRs, paymentsRs, returnsRs] = await Promise.all([
      query(
        `SELECT id, invoice_number, invoice_date, total_amount, created_at
         FROM purchase_invoices
         WHERE account_id = $1
           AND vendor_id = $2
           AND deleted_at IS NULL
           AND status = 'CONFIRMED'
         ORDER BY invoice_date ASC, created_at ASC`,
        [ctx.accountId, vendorId]
      ),
      query(
        `SELECT vp.id, vp.payment_date, vp.amount, vp.reference_number, vp.notes, vp.allocation_type, vp.created_at,
                pi.invoice_number
         FROM vendor_payments vp
         LEFT JOIN purchase_invoices pi ON pi.id = vp.purchase_invoice_id AND pi.account_id = vp.account_id
         WHERE vp.account_id = $1 AND vp.vendor_id = $2
         ORDER BY vp.payment_date ASC, vp.created_at ASC`,
        [ctx.accountId, vendorId]
      ),
      query(
        `SELECT pr.id, pr.return_number, pr.return_date, pr.total_amount, pr.created_at
         FROM purchase_returns pr
         WHERE pr.account_id = $1
           AND pr.vendor_id = $2
           AND pr.status = 'CONFIRMED'
           AND pr.deleted_at IS NULL
         ORDER BY pr.return_date ASC, pr.created_at ASC`,
        [ctx.accountId, vendorId]
      )
    ]);

    const entries = [
      ...(invoicesRs.rows || []).map((x) => ({
        date: ymd(x.invoice_date),
        type: "PURCHASE",
        reference: x.invoice_number || "",
        debit: Number(x.total_amount || 0),
        credit: 0,
        sortTs: ledgerTs(x.invoice_date, x.created_at),
        sortId: x.id
      })),
      ...(paymentsRs.rows || []).map((x) => {
        const alloc = String(x.allocation_type || (x.invoice_number ? "INVOICE" : "ON_ACCOUNT")).toUpperCase();
        return {
          date: ymd(x.payment_date),
          type: alloc === "ON_ACCOUNT" ? "ADVANCE_PAYMENT" : "PAYMENT",
          reference: x.invoice_number || x.reference_number || "On Account",
          debit: 0,
          credit: Number(x.amount || 0),
          sortTs: ledgerTs(x.payment_date, x.created_at),
          sortId: x.id
        };
      }),
      ...(returnsRs.rows || []).map((x) => ({
        date: ymd(x.return_date),
        type: "PURCHASE_RETURN",
        reference: x.return_number || "",
        debit: 0,
        credit: Number(x.total_return_amount || 0),
        sortTs: ledgerTs(x.return_date, x.created_at),
        sortId: x.id
      }))
    ].sort((a, b) => {
      const da = new Date(a.date || 0).getTime();
      const db = new Date(b.date || 0).getTime();
      if (da !== db) return da - db;
      if (a.sortTs !== b.sortTs) return a.sortTs - b.sortTs;
      return String(a.sortId).localeCompare(String(b.sortId), undefined, { numeric: true });
    });

    let running = 0;
    const withBalance = entries.map((e) => {
      running += Number(e.debit || 0) - Number(e.credit || 0);
      return {
        date: e.date,
        type: e.type,
        reference: e.reference,
        debit: e.debit,
        credit: e.credit,
        balance: running
      };
    });

    return ok({
      vendor,
      entries: withBalance,
      summary: {
        net_balance: running,
        net_balance_type: running > 0 ? "DR" : running < 0 ? "CR" : "NIL"
      }
    });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
