const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { withTransaction } = require("../../shared/db");
const { clean, n, nextDocNumber, round2, ensureDateNotFuture } = require("../../shared/purchase");

async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_RETURNS", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  const body = parseJsonBody(event);

  const purchaseInvoiceId = clean(body.purchaseInvoiceId);
  const returnDate = clean(body.returnDate);
  const returnReason = clean(body.returnReason || "OTHER").toUpperCase();
  const creditNoteNumber = clean(body.creditNoteNumber) || null;
  const notes = clean(body.notes) || null;
  const items = Array.isArray(body.items) ? body.items : [];
  if (!purchaseInvoiceId) return fail(400, "VALIDATION_ERROR", "purchaseInvoiceId is required.");
  if (!returnDate) return fail(400, "VALIDATION_ERROR", "returnDate is required.");
  const retDateErr = ensureDateNotFuture(returnDate, "Return date", {
    clientTodayYmd: clean(body.clientToday),
    timeZone: clean(body.timezone || body.timeZone || body.tz)
  });
  if (retDateErr) return fail(400, "VALIDATION_ERROR", retDateErr);
  const VALID_RETURN_REASONS = ["EXPIRED", "DAMAGED", "WRONG_PRODUCT", "EXCESS", "QUALITY_ISSUE", "OTHER"];
  if (!VALID_RETURN_REASONS.includes(returnReason)) {
    return fail(400, "VALIDATION_ERROR", `Invalid return reason. Must be one of: ${VALID_RETURN_REASONS.join(", ")}.`);
  }
  if (!items.length) return fail(400, "VALIDATION_ERROR", "At least one return item is required.");

  try {
    const data = await withTransaction(async (q) => {
      const inv = await q(
        `SELECT * FROM purchase_invoices WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [purchaseInvoiceId, ctx.accountId]
      );
      const invoice = inv.rows?.[0];
      if (!invoice) return { err: fail(404, "NOT_FOUND", "Original purchase invoice not found.") };

      // ── Validate item IDs up-front ────────────────────────────────────────────
      const itemIds = items.map((it) => clean(it.purchaseInvoiceItemId)).filter(Boolean);
      if (itemIds.length !== items.length) {
        return { err: fail(400, "VALIDATION_ERROR", "Each return item must have a valid purchaseInvoiceItemId.") };
      }

      // ── Batch-fetch all source invoice items in ONE query ─────────────────────
      const srcR = await q(
        `SELECT pii.*,
                COALESCE(pb.packing_units, p.units_per_strip, 1) AS packing_units
         FROM purchase_invoice_items pii
         LEFT JOIN product_batches pb ON pb.id = pii.batch_id AND pb.account_id = pii.account_id
         LEFT JOIN products p ON p.id = pii.product_id AND p.account_id = pii.account_id
         WHERE pii.id = ANY($1) AND pii.account_id = $2 AND pii.purchase_invoice_id = $3`,
        [itemIds, ctx.accountId, purchaseInvoiceId]
      );
      const srcMap = Object.fromEntries(srcR.rows.map((r) => [r.id, r]));

      const returnNumber = clean(body.returnNumber) || (await nextDocNumber(q, "purchase_returns", "PR", ctx.accountId));
      const rs = await q(
        `INSERT INTO purchase_returns (
           account_id, return_number, purchase_invoice_id, vendor_id, division_id, division_name,
           purchase_source, return_date, return_reason, status, credit_note_number, notes, created_by_user_id
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT',$10,$11,$12)
         RETURNING *`,
        [
          ctx.accountId, returnNumber, purchaseInvoiceId,
          invoice.division_id ? null : invoice.vendor_id || null,
          invoice.division_id || null, invoice.division_name || null,
          invoice.division_id ? "DIVISION" : "VENDOR",
          returnDate, returnReason, creditNoteNumber, notes, actorId
        ]
      );
      const ret = rs.rows?.[0];

      // ── Batch-fetch already-returned quantities ────────────────────────────────
      const alreadyReturnedR = await q(
        `SELECT pri.purchase_invoice_item_id,
                COALESCE(SUM(pri.return_qty), 0)       AS returned_qty,
                COALESCE(SUM(pri.return_free_qty), 0)  AS returned_free_qty,
                COALESCE(SUM(pri.return_loose_qty), 0) AS returned_loose_qty
         FROM purchase_return_items pri
         JOIN purchase_returns pr ON pr.id = pri.purchase_return_id
         WHERE pri.account_id = $1
           AND pri.purchase_invoice_item_id = ANY($2)
           AND pr.status IN ('DRAFT', 'CONFIRMED')
           AND pr.id <> $3
         GROUP BY pri.purchase_invoice_item_id`,
        [ctx.accountId, itemIds, ret.id]
      );
      const returnedMap = Object.fromEntries(
        alreadyReturnedR.rows.map((r) => [r.purchase_invoice_item_id, r])
      );

      // ── Process each item ─────────────────────────────────────────────────────
      let total = 0;
      for (const it of items) {
        const purchaseInvoiceItemId = clean(it.purchaseInvoiceItemId);
        const returnQty = n(it.returnQty);
        const returnFreeQty = n(it.returnFreeQty);
        const returnLooseQty = Math.max(0, Number(it.returnLooseQty || it.return_loose_qty || 0));

        // At least one of returnQty or returnLooseQty must be positive
        if (!purchaseInvoiceItemId || (!(returnQty > 0) && !(returnLooseQty > 0)) || returnFreeQty < 0) {
          return { err: fail(400, "VALIDATION_ERROR", "Each return item must have purchaseInvoiceItemId, returnQty > 0 (or returnLooseQty > 0), and returnFreeQty >= 0.") };
        }

        const src = srcMap[purchaseInvoiceItemId];
        if (!src) return { err: fail(400, "VALIDATION_ERROR", "Invalid source purchase invoice item in return.") };

        const packingUnits = Math.max(1, Number(src.packing_units || 1));
        const alreadyReturned     = Number(returnedMap[purchaseInvoiceItemId]?.returned_qty      || 0);
        const alreadyReturnedFree = Number(returnedMap[purchaseInvoiceItemId]?.returned_free_qty || 0);
        const alreadyReturnedLoose = Number(returnedMap[purchaseInvoiceItemId]?.returned_loose_qty || 0);

        const maxReturnable     = n(src.qty)      - alreadyReturned;
        const maxReturnableFree = n(src.free_qty) - alreadyReturnedFree;
        // For loose: use current loose_stock on the batch as the upper bound
        // (purchase_invoice_items doesn't track loose_qty, so we allow any non-negative value
        //  up to what's currently in loose_stock — validated at confirm time)

        if (returnQty > maxReturnable) {
          return { err: fail(400, "VALIDATION_ERROR", `Return qty (${returnQty}) exceeds max returnable qty (${maxReturnable}) for item "${src.product_name || purchaseInvoiceItemId}".`) };
        }
        if (returnFreeQty > maxReturnableFree) {
          return { err: fail(400, "VALIDATION_ERROR", `Return free qty (${returnFreeQty}) exceeds max returnable free qty (${maxReturnableFree}) for item "${src.product_name || purchaseInvoiceItemId}".`) };
        }

        // ── Calculate amount ──────────────────────────────────────────────────
        const rate     = n(src.purchase_rate);
        const discPct  = n(src.discount_percent);
        const gstPct   = n(src.gst_percent);
        const looseRate = rate / packingUnits;

        // Strip amount (with discount + GST)
        const taxable   = round2(returnQty * rate * (1 - discPct / 100));
        const gstAmount = round2(taxable * (gstPct / 100));
        const stripAmount = round2(taxable + gstAmount);

        // Loose amount (proportional rate, with discount + GST)
        const looseTaxable   = round2(returnLooseQty * looseRate * (1 - discPct / 100));
        const looseGst       = round2(looseTaxable * (gstPct / 100));
        const looseAmount    = round2(looseTaxable + looseGst);

        const amount = round2(stripAmount + looseAmount);
        total += amount;

        await q(
          `INSERT INTO purchase_return_items (
             account_id, purchase_return_id, purchase_invoice_item_id, batch_id,
             return_qty, return_free_qty, return_loose_qty, return_amount, notes
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [ctx.accountId, ret.id, purchaseInvoiceItemId, src.batch_id, returnQty, returnFreeQty, returnLooseQty, amount, clean(it.notes) || null]
        );
      }
      await q(`UPDATE purchase_returns SET total_amount = $3 WHERE id = $1 AND account_id = $2`, [ret.id, ctx.accountId, round2(total)]);
      const out = await q(`SELECT * FROM purchase_returns WHERE id = $1 AND account_id = $2 LIMIT 1`, [ret.id, ctx.accountId]);
      return { item: out.rows?.[0] || null };
    });
    if (data?.err) return data.err;
    return created(data, { message: "Purchase return draft created." });
  } catch (e) {
    if (String(e.code || "") === "23505") return fail(409, "DUPLICATE", "Return number already exists.");
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: e.message || "Please try again." });
  }
}

module.exports = { handler };
