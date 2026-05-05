const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { clean, n, refreshInvoicePaymentSummary } = require("../../shared/purchase");

async function handler(event) {
  const auth = await requirePermission(event, "VENDOR_PAYMENTS", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const vendorId = clean(body.vendorId);
  const purchaseInvoiceId = clean(body.purchaseInvoiceId || body.invoiceId);
  const allocationType = clean(body.allocationType || (purchaseInvoiceId ? "INVOICE" : "ON_ACCOUNT")).toUpperCase();
  const paymentDate = clean(body.paymentDate);
  const amount = n(body.amount);
  const paymentMode = clean(body.paymentMode || "OTHER").toUpperCase();
  const referenceNumber = clean(body.referenceNumber) || null;
  const notes = clean(body.notes) || null;

  if (!vendorId || !paymentDate || !(amount > 0)) {
    return fail(400, "VALIDATION_ERROR", "vendorId, paymentDate and amount are required.");
  }
  if (!["INVOICE", "ON_ACCOUNT"].includes(allocationType)) {
    return fail(400, "VALIDATION_ERROR", "Invalid allocation type.");
  }
  if (allocationType === "INVOICE" && !purchaseInvoiceId) {
    return fail(400, "VALIDATION_ERROR", "Invoice allocation requires purchaseInvoiceId.");
  }
  if (!["CASH", "CHEQUE", "NEFT", "UPI", "CARD", "IMPS", "OTHER"].includes(paymentMode)) {
    return fail(400, "VALIDATION_ERROR", "Invalid payment mode.");
  }

  try {
    const data = await withTransaction(async (q) => {
      if (allocationType === "ON_ACCOUNT") {
        const vendorRs = await q(
          `SELECT id FROM vendors WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
          [vendorId, ctx.accountId]
        );
        if (!vendorRs.rows?.[0]) return { err: fail(404, "NOT_FOUND", "Supplier not found.") };
        const ins = await q(
          `
          INSERT INTO vendor_payments (
            account_id, vendor_id, purchase_invoice_id, allocation_type, payment_date, amount, payment_mode,
            reference_number, notes, created_by_user_id
          )
          VALUES ($1,$2,NULL,'ON_ACCOUNT',$3,$4,$5,$6,$7,$8)
          RETURNING *
          `,
          [ctx.accountId, vendorId, paymentDate, amount, paymentMode, referenceNumber, notes, actorId]
        );
        return { item: ins.rows?.[0] || null, payment_summary: null };
      }

      const inv = await q(
        `SELECT id, vendor_id, division_id, total_amount, amount_paid, balance_due FROM purchase_invoices WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [purchaseInvoiceId, ctx.accountId]
      );
      const invoice = inv.rows?.[0];
      if (!invoice) return { err: fail(404, "NOT_FOUND", "Purchase invoice not found.") };

      if (invoice.division_id) {
        if (String(invoice.division_id) !== vendorId) {
          return { err: fail(400, "VALIDATION_ERROR", "Payment division must match invoice division (vendorId carries division id for legacy clients).") };
        }
        const div = await q(
          `SELECT mfg_company_id FROM divisions WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
          [invoice.division_id, ctx.accountId]
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
          [ctx.accountId, invoice.division_id, mfgId, purchaseInvoiceId, paymentDate, amount, paymentMode, referenceNumber, notes, actorId]
        );
        const summary = await refreshInvoicePaymentSummary(q, ctx.accountId, purchaseInvoiceId);
        return { item: ins.rows?.[0] || null, payment_summary: summary };
      }

      if (String(invoice.vendor_id) !== vendorId) return { err: fail(400, "VALIDATION_ERROR", "Payment vendor must match invoice vendor.") };

      const ins = await q(
        `
        INSERT INTO vendor_payments (
          account_id, vendor_id, purchase_invoice_id, allocation_type, payment_date, amount, payment_mode,
          reference_number, notes, created_by_user_id
        )
        VALUES ($1,$2,$3,'INVOICE',$4,$5,$6,$7,$8,$9)
        RETURNING *
        `,
        [ctx.accountId, vendorId, purchaseInvoiceId, paymentDate, amount, paymentMode, referenceNumber, notes, actorId]
      );

      const summary = await refreshInvoicePaymentSummary(q, ctx.accountId, purchaseInvoiceId);
      return { item: ins.rows?.[0] || null, payment_summary: summary };
    });
    if (data?.err) return data.err;
    return created(data, { message: "Vendor payment recorded." });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
