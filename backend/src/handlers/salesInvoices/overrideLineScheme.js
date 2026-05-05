const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/sales");
const { validateAndEnrichSalesItems, insertSalesLineItemsMany } = require("./_common");

function mapInvoiceItemsToDraftPayload(items, overrideItemId, override) {
  return (items || []).map((it) => {
    const isTarget = String(it.id) === String(overrideItemId);
    return {
      productId: it.product_id,
      batchId: it.batch_id,
      qty: Number(it.qty || 0),
      freeQty: isTarget ? Number(override.freeQty || 0) : Number(it.free_qty || 0),
      discountPercent: isTarget ? Number(override.discountPercent || 0) : Number(it.discount_percent || 0),
      gstPercent: Number(it.gst_percent || 0),
      looseQty: Number(it.loose_qty || 0),
      looseUnitName: it.loose_unit_name || null,
      prescriptionNo: clean(it.prescription_no),
      doctorName: clean(it.doctor_name),
      patientName: clean(it.patient_name)
    };
  });
}

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "UPDATE");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const invoiceId = String(event?.pathParameters?.id || "");
  const itemId = String(event?.pathParameters?.itemId || event?.pathParameters?.item_id || "");
  if (!invoiceId || !itemId) return fail(400, "VALIDATION_ERROR", "invoice id and item id are required");
  const body = parseJsonBody(event);
  const discountPercent = Number(body.discountPercent ?? body.discount_percent ?? 0);
  const freeQty = Number(body.freeQty ?? body.free_qty ?? 0);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return fail(400, "VALIDATION_ERROR", "discountPercent must be between 0 and 100.");
  }
  if (!Number.isFinite(freeQty) || freeQty < 0) {
    return fail(400, "VALIDATION_ERROR", "freeQty must be a non-negative number.");
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
      const rows = itemRes.rows || [];
      const exists = rows.some((x) => String(x.id) === String(itemId));
      if (!exists) return { err: fail(404, "NOT_FOUND", "Invoice item not found.") };
      const draftItems = mapInvoiceItemsToDraftPayload(rows, itemId, { discountPercent, freeQty });
      const looseUnitFactorRes = await q(
        `SELECT loose_unit_factor FROM account_settings WHERE account_id = $1 LIMIT 1`,
        [ctx.accountId]
      );
      const looseUnitFactor = Math.max(1, Number(looseUnitFactorRes.rows?.[0]?.loose_unit_factor || 10));
      const validated = await validateAndEnrichSalesItems(q, ctx.accountId, draftItems, {
        rateType: String(inv.rate_type || "RETAIL_RATE").toUpperCase(),
        globalDiscountPercent: Number(inv.global_discount_percent || 0),
        looseUnitFactor
      });
      if (!validated.ok) return { err: fail(400, "VALIDATION_ERROR", validated.message) };

      await q(`DELETE FROM sales_invoice_items WHERE sales_invoice_id = $1 AND account_id = $2`, [invoiceId, ctx.accountId]);
      await insertSalesLineItemsMany(q, ctx.accountId, invoiceId, validated.items);
      await q(
        `UPDATE sales_invoices
         SET subtotal = $3,
             total_discount = $4,
             total_gst = $5,
             total_amount = $6,
             balance_due = $6,
             round_off = $7,
             updated_at = now()
         WHERE id = $1 AND account_id = $2`,
        [
          invoiceId,
          ctx.accountId,
          validated.totals.subtotal,
          validated.totals.totalDiscount,
          validated.totals.totalGst,
          validated.totals.totalAmount,
          validated.totals.roundOff
        ]
      );
      return { invoiceId, itemId, applied: { discountPercent, freeQty }, totals: validated.totals, warnings: validated.warnings || [] };
    });
    if (data?.err) return data.err;
    return ok(data, { message: "Scheme/discount override applied for line item." });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
