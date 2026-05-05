const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/sales");
const {
  validateAndEnrichSalesItems,
  insertSalesLineItemsMany,
  VALID_RATE_TYPES
} = require("./_common");

function mapInvoiceItemsToDraftPayload(items) {
  return (items || []).map((it) => ({
    productId: it.product_id,
    batchId: it.batch_id,
    qty: Number(it.qty || 0),
    freeQty: Number(it.free_qty || 0),
    discountPercent: Number(it.discount_percent || 0),
    gstPercent: Number(it.gst_percent || 0),
    looseQty: Number(it.loose_qty || 0),
    looseUnitName: it.loose_unit_name || null,
    prescriptionNo: clean(it.prescription_no),
    doctorName: clean(it.doctor_name),
    patientName: clean(it.patient_name)
  }));
}

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const invoiceId = String(event?.pathParameters?.id || "");
  if (!invoiceId) return fail(400, "VALIDATION_ERROR", "invoice id is required");
  const body = parseJsonBody(event);
  const rateType = String(body.rateType || body.rate_type || "").toUpperCase();
  if (!VALID_RATE_TYPES.includes(rateType)) {
    return fail(400, "VALIDATION_ERROR", "Invalid rate type.");
  }
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  try {
    const data = await withTransaction(async (q) => {
      const invRes = await q(`SELECT * FROM sales_invoices WHERE id = $1 AND account_id = $2 LIMIT 1`, [invoiceId, ctx.accountId]);
      const inv = invRes.rows?.[0] || null;
      if (!inv) return { err: fail(404, "NOT_FOUND", "Invoice not found.") };
      if (String(inv.status) !== "DRAFT") {
        return { err: fail(400, "BUSINESS_RULE", "Only DRAFT invoices can be modified.") };
      }
      const itemRes = await q(
        `SELECT * FROM sales_invoice_items WHERE sales_invoice_id = $1 AND account_id = $2 ORDER BY created_at ASC, id ASC`,
        [invoiceId, ctx.accountId]
      );
      const draftItems = mapInvoiceItemsToDraftPayload(itemRes.rows || []);
      if (!draftItems.length) return { err: fail(400, "VALIDATION_ERROR", "Invoice has no line items.") };
      const looseUnitFactorRes = await q(
        `SELECT loose_unit_factor FROM account_settings WHERE account_id = $1 LIMIT 1`,
        [ctx.accountId]
      );
      const looseUnitFactor = Math.max(1, Number(looseUnitFactorRes.rows?.[0]?.loose_unit_factor || 10));
      const validated = await validateAndEnrichSalesItems(q, ctx.accountId, draftItems, {
        rateType,
        globalDiscountPercent: Number(inv.global_discount_percent || 0),
        looseUnitFactor
      });
      if (!validated.ok) return { err: fail(400, "VALIDATION_ERROR", validated.message) };

      await q(`DELETE FROM sales_invoice_items WHERE sales_invoice_id = $1 AND account_id = $2`, [invoiceId, ctx.accountId]);
      await insertSalesLineItemsMany(q, ctx.accountId, invoiceId, validated.items);
      await q(
        `UPDATE sales_invoices
         SET rate_type = $3,
             subtotal = $4,
             total_discount = $5,
             total_gst = $6,
             total_amount = $7,
             balance_due = $7,
             round_off = $8,
             updated_at = now()
         WHERE id = $1 AND account_id = $2`,
        [
          invoiceId,
          ctx.accountId,
          rateType,
          validated.totals.subtotal,
          validated.totals.totalDiscount,
          validated.totals.totalGst,
          validated.totals.totalAmount,
          validated.totals.roundOff
        ]
      );
      return { invoiceId, rateType, totals: validated.totals, warnings: validated.warnings || [] };
    });
    if (data?.err) return data.err;
    return ok(data, { message: "Rate type applied to all items." });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
