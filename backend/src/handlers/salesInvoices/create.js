const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { nextSalesNumber } = require("../../shared/sales");
const { validateCustomer, validateAndEnrichSalesItems, validateInvoiceHeader, insertSalesLineItemsMany, isValidGstin } = require("./_common");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const body = parseJsonBody(event);
  const h = validateInvoiceHeader(body);
  if (!h.ok) return fail(400, "VALIDATION_ERROR", h.message);

  try {
    const data = await withTransaction(async (q) => {
      const roleCode = await getRoleCodeForAccount(ctx.accountId);
      const isRetailer = roleCode === "RETAILER";
      const c = await validateCustomer(q, ctx.accountId, h.header.customerId);
      if (!c.ok) return { err: fail(400, "VALIDATION_ERROR", c.message) };
      const isWalkInSale = Boolean(h.header.isWalkInSale && c.customer.is_walk_in);
      const ivNo = h.header.invoiceNumber || (await nextSalesNumber(q, ctx.accountId, "sales_invoices", "SI"));
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
      const dueDate = isRetailer && isWalkInSale
        ? h.header.invoiceDate
        : h.header.dueDate || (Number(c.customer.credit_days || 0) > 0 ? new Date(Date.now() + Number(c.customer.credit_days || 0) * 86400000).toISOString().slice(0, 10) : null);

      // ── B2B / B2C auto-tagging ────────────────────────────────────────────────
      // Walk-in sales are always B2C regardless of any other field.
      // B2B requires a valid 15-char GSTIN on the customer profile.
      const customerGstinRaw = String(c.customer.gst_number || "").trim().toUpperCase();
      const gstinValid = !isWalkInSale && isValidGstin(customerGstinRaw);
      const b2bB2cTag = gstinValid ? "B2B" : "B2C";
      const customerGstinSnapshot = gstinValid ? customerGstinRaw : null;

      // Place of supply: 2-digit state code from GSTIN prefix (most reliable),
      // fallback to customer.state_code, then null.
      const placeOfSupply = customerGstinSnapshot
        ? customerGstinSnapshot.substring(0, 2)
        : (String(c.customer.state_code || "").trim() || null);

      // Supply type: compare business GSTIN state with customer state.
      // Default INTRA_STATE (most common for local pharmacy).
      let supplyType = "INTRA_STATE";
      if (placeOfSupply) {
        try {
          // NOTE: app_users does not have a state_code column — derive the
          // 2-digit state code from the first two chars of gst_number instead.
          const bizRs = await q(
            `SELECT gst_number FROM app_users WHERE id = $1 LIMIT 1`,
            [ctx.accountId]
          );
          const biz = bizRs.rows?.[0] || null;
          const bizStateCode = biz?.gst_number && String(biz.gst_number).length >= 2
            ? String(biz.gst_number).substring(0, 2)
            : null;
          if (bizStateCode && bizStateCode !== placeOfSupply) {
            supplyType = "INTER_STATE";
          }
        } catch {
          // Default to INTRA_STATE on error
        }
      }

      // Large B2C flag: B2C invoice with total > ₹2.5 lakh must be reported individually.
      // Rechecked at confirm time with the final total.
      const largB2cFlag = b2bB2cTag === "B2C" && Number(i.totals.totalAmount) > 250000;

      const inv = await q(
        `INSERT INTO sales_invoices (
           account_id, invoice_number, customer_id, customer_name, customer_gst, customer_drug_license,
           invoice_date, due_date, status, payment_status, subtotal, total_discount, total_gst, total_amount,
           amount_paid, balance_due, round_off, notes, created_by_user_id,
           is_walk_in_sale, walk_in_patient_name, walk_in_patient_phone, walk_in_doctor_name, walk_in_prescription_no,
           rate_type, bill_type, global_discount_percent,
           b2b_b2c_tag, large_b2c_flag, place_of_supply, supply_type, customer_gstin_snapshot
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT'::sales_invoice_status,'UNPAID'::sales_payment_status,$9,$10,$11,$12,0,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
         RETURNING *`,
        [
          ctx.accountId, ivNo, c.customer.id, c.customer.name, c.customer.gst_number || null, c.customer.drug_license_number || null,
          h.header.invoiceDate, dueDate, i.totals.subtotal, i.totals.totalDiscount, i.totals.totalGst, i.totals.totalAmount, i.totals.roundOff, h.header.notes || null, actorId,
          isWalkInSale,
          h.header.walkInPatientName || null,
          h.header.walkInPatientPhone || null,
          h.header.walkInDoctorName || null,
          h.header.walkInPrescriptionNo || null,
          h.header.rateType || "RETAIL_RATE",
          h.header.billType || "CASH_MEMO",
          h.header.globalDiscountPercent || 0,
          b2bB2cTag,
          largB2cFlag,
          placeOfSupply,
          supplyType,
          customerGstinSnapshot
        ]
      );
      const invoice = inv.rows?.[0];
      await insertSalesLineItemsMany(q, ctx.accountId, invoice.id, i.items);
      return { invoice, warnings: i.warnings || [] };
    });
    if (data?.err) return data.err;
    return created(data, { message: "Sales invoice draft created.", warnings: data.warnings || [] });
  } catch (e) {
    if (String(e.code || "") === "23505") return fail(409, "DUPLICATE", "Invoice number already exists.");
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
