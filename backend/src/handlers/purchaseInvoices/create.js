const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { nextDocNumber } = require("../../shared/purchase");
const { enrichAndValidateItems, validateInvoiceHeader, mapInvoiceRow, resolveDueDate, resolveDueDateFromDivision, resolvePurchaseParty, insertPurchaseLineItemsMany } = require("./_common");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_INVOICES", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const h = await validateInvoiceHeader(body);
  if (!h.ok) return fail(400, "VALIDATION_ERROR", h.message);

  try {
    const data = await withTransaction(async (q) => {
      const party = await resolvePurchaseParty(q, ctx.accountId, h.header);
      if (!party.ok) return { err: fail(400, "VALIDATION_ERROR", party.message) };

      const itemsRes = await enrichAndValidateItems(q, ctx.accountId, party, body.items);
      if (!itemsRes.ok) return { err: fail(400, "VALIDATION_ERROR", itemsRes.message, { details: itemsRes.details }) };

      const invoiceNumber = h.header.invoiceNumber || (await nextDocNumber(q, "purchase_invoices", "PI", ctx.accountId));
      const resolvedDueDate =
        party.mode === "division"
          ? resolveDueDateFromDivision(h.header.invoiceDate, h.header.dueDate, party.creditSource)
          : resolveDueDate(h.header.invoiceDate, h.header.dueDate, party.creditSource);
      const t = itemsRes.totals;
      const ins = await q(
        `
        INSERT INTO purchase_invoices (
          account_id, invoice_number, vendor_invoice_number, vendor_id, division_id, division_name,
          purchase_source,
          invoice_date, due_date,
          status, payment_status, subtotal, total_discount, total_gst, total_amount,
          amount_paid, balance_due, notes, created_by_user_id, updated_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT','UNPAID',$10,$11,$12,$13,0,$13,$14,$15,$15)
        RETURNING *
        `,
        [
          ctx.accountId,
          invoiceNumber,
          h.header.vendorInvoiceNumber,
          party.vendorId,
          party.divisionId,
          party.divisionName,
          party.mode === "division" ? "DIVISION" : "VENDOR",
          h.header.invoiceDate,
          resolvedDueDate,
          t.subtotal,
          t.totalDiscount,
          t.totalGst,
          t.totalAmount,
          h.header.notes,
          actorId
        ]
      );
      const inv = ins.rows?.[0];

      await insertPurchaseLineItemsMany(q, ctx.accountId, inv.id, itemsRes.items);
      return { invoice: mapInvoiceRow(inv) };
    });
    if (data?.err) return data.err;
    return created(data, { message: "Purchase invoice draft created." });
  } catch (e) {
    if (String(e.code || "") === "23505") return fail(409, "DUPLICATE", "Invoice number already exists.");
    // eslint-disable-next-line no-console
    console.error("[purchase-invoice:create] failed", {
      message: e.message, code: e.code, table: e.table, column: e.column,
      constraint: e.constraint, detail: e.detail, where: e.where, routine: e.routine
    });
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", {
      subMessage: String(e.message || "Please try again."),
      details: {
        code: e.code || null, table: e.table || null, column: e.column || null,
        constraint: e.constraint || null, detail: e.detail || null
      }
    });
  }
}

module.exports = { handler };
