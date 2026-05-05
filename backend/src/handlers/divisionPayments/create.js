const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { clean, n, refreshInvoicePaymentSummary } = require("../../shared/purchase");

async function handler(event) {
  const auth = await requirePermission(event, "DIVISION_PAYMENTS", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const divisionId = clean(body.divisionId || body.division_id);
  const purchaseInvoiceId = clean(body.purchaseInvoiceId || body.invoiceId);
  const paymentDate = clean(body.paymentDate);
  const amount = n(body.amount);
  const paymentMode = clean(body.paymentMode || "OTHER").toUpperCase();
  const referenceNumber = clean(body.referenceNumber) || null;
  const notes = clean(body.notes) || null;

  if (!divisionId || !purchaseInvoiceId || !paymentDate || !(amount > 0)) {
    return fail(400, "VALIDATION_ERROR", "divisionId, invoiceId, paymentDate and amount are required.");
  }
  if (!["CASH", "CHEQUE", "NEFT", "UPI", "CARD", "IMPS", "OTHER"].includes(paymentMode)) {
    return fail(400, "VALIDATION_ERROR", "Invalid payment mode.");
  }

  try {
    const data = await withTransaction(async (q) => {
      const inv = await q(
        `SELECT id, division_id, total_amount, amount_paid, balance_due FROM purchase_invoices WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [purchaseInvoiceId, ctx.accountId]
      );
      const invoice = inv.rows?.[0];
      if (!invoice) return { err: fail(404, "NOT_FOUND", "Purchase invoice not found.") };
      if (String(invoice.division_id || "") !== divisionId) return { err: fail(400, "VALIDATION_ERROR", "Invoice does not belong to this division.") };
      const due = n(invoice.balance_due);
      if (amount > due + 0.009) {
        return { err: fail(400, "VALIDATION_ERROR", `Payment amount exceeds balance due (${due}).`) };
      }

      const div = await q(
        `SELECT mfg_company_id FROM divisions WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [divisionId, ctx.accountId]
      );
      const mfgId = div.rows?.[0]?.mfg_company_id || null;

      const ins = await q(
        `
        INSERT INTO division_payments (
          account_id, division_id, mfg_company_id, purchase_invoice_id, payment_date, amount, payment_mode,
          reference_number, notes, created_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
        `,
        [ctx.accountId, divisionId, mfgId, purchaseInvoiceId, paymentDate, amount, paymentMode, referenceNumber, notes, actorId]
      );

      const summary = await refreshInvoicePaymentSummary(q, ctx.accountId, purchaseInvoiceId);
      return { item: ins.rows?.[0] || null, payment_summary: summary };
    });
    if (data?.err) return data.err;
    return created(data, { message: "Division payment recorded." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
