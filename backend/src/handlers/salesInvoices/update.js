const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { validateAndEnrichSalesItems, validateCustomer, validateInvoiceHeader, insertSalesLineItemsMany } = require("./_common");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const id = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!id) return fail(400, "VALIDATION_ERROR", "invoice id is required");
  const body = parseJsonBody(event);
  const h = validateInvoiceHeader(body);
  if (!h.ok) return fail(400, "VALIDATION_ERROR", h.message);

  try {
    const data = await withTransaction(async (q) => {
      const roleCode = await getRoleCodeForAccount(ctx.accountId);
      const isRetailer = roleCode === "RETAILER";
      const inv = await q(`SELECT * FROM sales_invoices WHERE id = $1 AND account_id = $2 LIMIT 1`, [id, ctx.accountId]);
      const invoice = inv.rows?.[0] || null;
      if (!invoice) return { err: fail(404, "NOT_FOUND", "Invoice not found") };
      if (String(invoice.status) !== "DRAFT") return { err: fail(400, "BUSINESS_RULE", "Only DRAFT invoices can be updated.") };
      const c = await validateCustomer(q, ctx.accountId, h.header.customerId);
      if (!c.ok) return { err: fail(400, "VALIDATION_ERROR", c.message) };
      const isWalkInSale = Boolean(h.header.isWalkInSale && c.customer.is_walk_in);
      let looseUnitFactor = 10;
      try {
        const sRs = await q(`SELECT loose_unit_factor FROM account_settings WHERE account_id = $1 LIMIT 1`, [ctx.accountId]);
        const f = Number(sRs.rows?.[0]?.loose_unit_factor);
        if (Number.isFinite(f) && f > 0) looseUnitFactor = Math.floor(f);
      } catch {
        // Use default
      }
      const i = await validateAndEnrichSalesItems(q, ctx.accountId, body.items, {
        rateType: h.header.rateType,
        globalDiscountPercent: h.header.globalDiscountPercent,
        looseUnitFactor
      });
      if (!i.ok) return { err: fail(400, "VALIDATION_ERROR", i.message) };
      const dueDate =
        (isRetailer && isWalkInSale
          ? h.header.invoiceDate
          : h.header.dueDate) ||
        (Number(c.customer.credit_days || 0) > 0
          ? new Date(Date.now() + Number(c.customer.credit_days || 0) * 86400000).toISOString().slice(0, 10)
          : null);
      await q(
        `UPDATE sales_invoices
         SET customer_id = $3, customer_name = $4, customer_gst = $5, customer_drug_license = $6,
            invoice_date = $7, due_date = $8, notes = $9, subtotal = $10, total_discount = $11, total_gst = $12, total_amount = $13, balance_due = $13, round_off = $14,
            is_walk_in_sale = $15, walk_in_patient_name = $16, walk_in_patient_phone = $17, walk_in_doctor_name = $18, walk_in_prescription_no = $19,
            rate_type = $20, bill_type = $21, global_discount_percent = $22,
             updated_at = now()
         WHERE id = $1 AND account_id = $2`,
        [
          id, ctx.accountId, c.customer.id, c.customer.name, c.customer.gst_number || null, c.customer.drug_license_number || null,
          h.header.invoiceDate, dueDate, h.header.notes || null, i.totals.subtotal, i.totals.totalDiscount, i.totals.totalGst, i.totals.totalAmount, i.totals.roundOff,
          isWalkInSale,
          h.header.walkInPatientName || null,
          h.header.walkInPatientPhone || null,
          h.header.walkInDoctorName || null,
          h.header.walkInPrescriptionNo || null,
          h.header.rateType || "RETAIL_RATE",
          h.header.billType || "CASH_MEMO",
          h.header.globalDiscountPercent || 0
        ]
      );
      await q(`DELETE FROM sales_invoice_items WHERE sales_invoice_id = $1 AND account_id = $2`, [id, ctx.accountId]);
      await insertSalesLineItemsMany(q, ctx.accountId, id, i.items);
      return { invoiceId: id, warnings: i.warnings || [] };
    });
    if (data?.err) return data.err;
    return ok(data, { message: "Sales invoice updated.", warnings: data.warnings || [] });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
