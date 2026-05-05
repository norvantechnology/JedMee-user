const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { clean, n, refreshInvoicePaymentSummary } = require("../../shared/purchase");

function uniqueIds(values) {
  const out = [];
  const seen = new Set();
  for (const v of values || []) {
    const id = clean(v);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function handler(event) {
  const auth = await requirePermission(event, "VENDOR_PAYMENTS", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const invoiceIds = uniqueIds(body.invoiceIds || body.ids || []);
  const paymentDate = clean(body.paymentDate);
  const paymentMode = clean(body.paymentMode || "NEFT").toUpperCase();
  const referenceNumber = clean(body.referenceNumber) || null;
  const notes = clean(body.notes) || null;

  if (!invoiceIds.length) return fail(400, "VALIDATION_ERROR", "invoiceIds is required.");
  if (!paymentDate) return fail(400, "VALIDATION_ERROR", "paymentDate is required.");
  if (!["CASH", "CHEQUE", "NEFT", "UPI", "CARD", "IMPS", "OTHER"].includes(paymentMode)) {
    return fail(400, "VALIDATION_ERROR", "Invalid payment mode.");
  }

  try {
    const data = await withTransaction(async (q) => {
      const completed = [];
      const skipped = [];

      for (const invoiceId of invoiceIds) {
        const inv = await q(
          `SELECT id, invoice_number, vendor_id, division_id, status, payment_status, balance_due
           FROM purchase_invoices
           WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
           FOR UPDATE
           LIMIT 1`,
          [invoiceId, ctx.accountId]
        );
        const invoice = inv.rows?.[0] || null;
        if (!invoice) {
          skipped.push({ invoiceId, reason: "NOT_FOUND" });
          continue;
        }
        if (String(invoice.status) !== "CONFIRMED") {
          skipped.push({ invoiceId, invoiceNumber: invoice.invoice_number, reason: "NOT_CONFIRMED" });
          continue;
        }
        const due = n(invoice.balance_due);
        if (!(due > 0)) {
          skipped.push({ invoiceId, invoiceNumber: invoice.invoice_number, reason: "NO_DUE" });
          continue;
        }

        if (invoice.division_id) {
          const div = await q(
            `SELECT mfg_company_id FROM divisions WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
            [invoice.division_id, ctx.accountId]
          );
          const mfgId = div.rows?.[0]?.mfg_company_id || null;
          await q(
            `INSERT INTO division_payments (
               account_id, division_id, mfg_company_id, purchase_invoice_id, payment_date, amount, payment_mode,
               reference_number, notes, created_by_user_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [ctx.accountId, invoice.division_id, mfgId, invoice.id, paymentDate, due, paymentMode, referenceNumber, notes, actorId]
          );
        } else {
          await q(
            `INSERT INTO vendor_payments (
               account_id, vendor_id, purchase_invoice_id, payment_date, amount, payment_mode,
               reference_number, notes, created_by_user_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [ctx.accountId, invoice.vendor_id, invoice.id, paymentDate, due, paymentMode, referenceNumber, notes, actorId]
          );
        }
        const summary = await refreshInvoicePaymentSummary(q, ctx.accountId, invoice.id);
        completed.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amount: due,
          paymentStatus: summary.paymentStatus
        });
      }

      const totalAmount = completed.reduce((s, x) => s + n(x.amount), 0);
      return {
        completedCount: completed.length,
        skippedCount: skipped.length,
        totalAmount: Number(totalAmount.toFixed(2)),
        completed,
        skipped
      };
    });
    return ok(data, { message: data.completedCount ? "Bulk vendor payments recorded." : "No eligible invoices to settle." });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };

