const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean, n, isFutureDate } = require("../../shared/sales");

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
  const auth = await requirePermission(event, "CUSTOMER_PAYMENTS", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const invoiceIds = uniqueIds(body.invoiceIds || body.ids || []);
  const paymentDate = clean(body.paymentDate) || localCalendarYmd();
  const paymentMode = clean(body.paymentMode || "CASH").toUpperCase();
  const referenceNumber = clean(body.referenceNumber) || null;
  const notes = clean(body.notes) || null;

  if (!invoiceIds.length) return fail(400, "VALIDATION_ERROR", "invoiceIds is required.");
  if (isFutureDate(paymentDate, { clientTodayYmd: clean(body.clientToday) })) {
    return fail(400, "VALIDATION_ERROR", "Payment date cannot be in future.");
  }
  if (!["CASH", "CHEQUE", "NEFT", "UPI", "CARD", "OTHER"].includes(paymentMode)) return fail(400, "VALIDATION_ERROR", "Invalid payment mode.");

  try {
    const data = await withTransaction(async (q) => {
      const completed = [];
      const skipped = [];

      for (const invoiceId of invoiceIds) {
        const inv = await q(
          `SELECT id, invoice_number, customer_id, status, payment_status, total_amount, balance_due
           FROM sales_invoices
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

        await q(
          `INSERT INTO customer_payments (
             account_id, customer_id, sales_invoice_id, allocation_type, payment_date, amount, payment_mode, reference_number, notes, created_by_user_id
           ) VALUES ($1,$2,$3,'INVOICE',$4,$5,$6::customer_payment_mode_type,$7,$8,$9)`,
          [ctx.accountId, invoice.customer_id, invoice.id, paymentDate, due, paymentMode, referenceNumber, notes, actorId]
        );

        const pay = await q(
          `SELECT COALESCE(SUM(amount),0)::numeric(12,4) AS paid
           FROM customer_payments
           WHERE account_id = $1 AND sales_invoice_id = $2`,
          [ctx.accountId, invoice.id]
        );
        const paid = n(pay.rows?.[0]?.paid);
        const total = n(invoice.total_amount);
        const balance = Math.max(0, Number((total - paid).toFixed(4)));
        const status = balance <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
        await q(
          `UPDATE sales_invoices
           SET amount_paid = $3, balance_due = $4, payment_status = $5::sales_payment_status, updated_at = now()
           WHERE id = $1 AND account_id = $2`,
          [invoice.id, ctx.accountId, paid, balance, status]
        );

        completed.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          amount: due,
          paymentStatus: status
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
    return ok(data, { message: data.completedCount ? "Bulk customer payments recorded." : "No eligible invoices to settle." });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };

