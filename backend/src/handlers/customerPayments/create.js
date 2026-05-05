const { created, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { withTransaction } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean, n, isFutureDate } = require("../../shared/sales");

function appendNote(base, suffix) {
  const a = clean(base);
  const b = clean(suffix);
  if (!a) return b || null;
  if (!b) return a;
  return `${a} | ${b}`;
}

function mergeInvoiceAllocations(raw) {
  const map = new Map();
  for (const row of raw || []) {
    const id = clean(row.salesInvoiceId || row.sales_invoice_id);
    const amt = n(row.amount);
    if (!id || !(amt > 0)) continue;
    map.set(id, (map.get(id) || 0) + amt);
  }
  return [...map.entries()]
    .map(([salesInvoiceId, amount]) => ({ salesInvoiceId, amount: Number(amount.toFixed(4)) }))
    .sort((a, b) => String(a.salesInvoiceId).localeCompare(String(b.salesInvoiceId)));
}

async function refreshInvoicePaymentTotals(q, accountId, invoiceId) {
  const inv = await q(
    `SELECT total_amount FROM sales_invoices WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [invoiceId, accountId]
  );
  const invoice = inv.rows?.[0];
  if (!invoice) return;
  const total = n(invoice.total_amount);
  const pay = await q(
    `SELECT COALESCE(SUM(amount),0)::numeric(12,4) AS paid FROM customer_payments WHERE account_id = $1 AND sales_invoice_id = $2`,
    [accountId, invoiceId]
  );
  const paid = n(pay.rows?.[0]?.paid);
  const balance = Math.max(0, Number((total - paid).toFixed(4)));
  const status = balance <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
  await q(
    `UPDATE sales_invoices
     SET amount_paid = $3::numeric, balance_due = $4::numeric, payment_status = $5::sales_payment_status, updated_at = now()
     WHERE id = $1 AND account_id = $2`,
    [invoiceId, accountId, paid, balance, status]
  );
}

async function applyAdvanceToInvoice(q, { accountId, customerId, invoiceId, maxApplyAmount, actorId }) {
  let remaining = Number(maxApplyAmount || 0);
  if (!(remaining > 0)) return { applied: 0 };
  let applied = 0;
  const rows = await q(
    `SELECT *
     FROM customer_payments
     WHERE account_id = $1
       AND customer_id = $2
       AND sales_invoice_id IS NULL
       AND COALESCE(allocation_type, 'ON_ACCOUNT') = 'ON_ACCOUNT'
       AND amount > 0
     ORDER BY payment_date ASC, created_at ASC, id ASC
     FOR UPDATE`,
    [accountId, customerId]
  );
  for (const r of rows.rows || []) {
    if (!(remaining > 0)) break;
    const rowAmount = Number(r.amount || 0);
    if (!(rowAmount > 0)) continue;
    const take = Math.min(rowAmount, remaining);
    if (!(take > 0)) continue;
    if (rowAmount <= take + 1e-9) {
      await q(
        `UPDATE customer_payments
         SET sales_invoice_id = $3,
             allocation_type = 'INVOICE',
             notes = $4
         WHERE id = $1 AND account_id = $2`,
        [r.id, accountId, invoiceId, appendNote(r.notes, "Advance adjusted to invoice")]
      );
    } else {
      await q(
        `UPDATE customer_payments
         SET amount = $3
         WHERE id = $1 AND account_id = $2`,
        [r.id, accountId, Number((rowAmount - take).toFixed(4))]
      );
      await q(
        `INSERT INTO customer_payments (
          account_id, customer_id, sales_invoice_id, allocation_type, payment_date, amount, payment_mode, reference_number, notes, created_by_user_id
        ) VALUES ($1,$2,$3,'INVOICE',$4,$5,$6::customer_payment_mode_type,$7,$8,$9)`,
        [
          accountId,
          customerId,
          invoiceId,
          r.payment_date,
          Number(take.toFixed(4)),
          r.payment_mode,
          r.reference_number || null,
          appendNote(r.notes, `Advance split-adjusted from payment ${r.id}`),
          actorId
        ]
      );
    }
    applied += take;
    remaining -= take;
  }
  return { applied: Number(applied.toFixed(4)) };
}

async function handler(event) {
  const auth = await requirePermission(event, "CUSTOMER_PAYMENTS", "ADD");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const customerId = clean(body.customerId || body.customer_id);
  let invoiceId = clean(body.salesInvoiceId || body.sales_invoice_id || body.invoiceId || body.invoice_id);
  const paymentDate = clean(body.paymentDate || body.payment_date) || new Date().toISOString().slice(0, 10);
  const amount = n(body.amount);
  const paymentMode = clean(body.paymentMode || body.payment_mode || "CASH").toUpperCase();
  const useAdvanceFirst = body.useAdvanceFirst !== false;
  const mergedAlloc = mergeInvoiceAllocations(body.allocations);
  const useBatchAlloc = mergedAlloc.length > 0;

  if (useBatchAlloc) invoiceId = "";

  const allocationType = invoiceId ? "INVOICE" : "ON_ACCOUNT";
  if (!customerId) return fail(400, "VALIDATION_ERROR", "customerId is required.");
  if (!useBatchAlloc && !(amount > 0) && !(invoiceId && useAdvanceFirst)) {
    return fail(400, "VALIDATION_ERROR", "amount must be greater than 0.");
  }
  if (isFutureDate(paymentDate)) return fail(400, "VALIDATION_ERROR", "Payment date cannot be in future.");
  if (!["CASH", "CHEQUE", "NEFT", "UPI", "CARD", "OTHER"].includes(paymentMode)) {
    return fail(400, "VALIDATION_ERROR", "Invalid payment mode.");
  }

  const refNum = clean(body.referenceNumber || body.reference_number) || null;
  const notes = clean(body.notes) || null;

  try {
    const data = await withTransaction(async (q) => {
      const c = await q(`SELECT id FROM customers WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [customerId, ctx.accountId]);
      if (!c.rows?.length) return { err: fail(404, "NOT_FOUND", "Customer not found") };

      if (useBatchAlloc) {
        const allocTotal = mergedAlloc.reduce((s, x) => s + n(x.amount), 0);
        const useAdvBatch = body.useAdvanceFirst !== false;
        const advStartRs = await q(
          `SELECT COALESCE(SUM(amount),0)::numeric(12,4) AS a
           FROM customer_payments
           WHERE account_id = $1
             AND customer_id = $2
             AND sales_invoice_id IS NULL
             AND COALESCE(allocation_type, 'ON_ACCOUNT') = 'ON_ACCOUNT'`,
          [ctx.accountId, customerId]
        );
        const advanceAtStart = n(advStartRs.rows?.[0]?.a);
        const coverCap = Number(amount) + (useAdvBatch ? advanceAtStart : 0);
        if (allocTotal - coverCap > 0.01) {
          return {
            err: fail(
              400,
              "BUSINESS_RULE",
              useAdvBatch
                ? `Allocated ₹${allocTotal.toFixed(2)} exceeds cash ₹${amount.toFixed(2)} plus available advance ₹${advanceAtStart.toFixed(2)}.`
                : `Allocated ₹${allocTotal.toFixed(2)} exceeds payment amount ₹${amount.toFixed(2)}. Enable useAdvanceFirst or reduce allocations.`
            )
          };
        }
        if (!(amount > 0) && !(useAdvBatch && allocTotal > 0 && advanceAtStart + 0.0001 >= allocTotal)) {
          return {
            err: fail(
              400,
              "VALIDATION_ERROR",
              "Provide a cash amount, or ensure customer advance covers all allocated amounts when useAdvanceFirst is true."
            )
          };
        }

        let remainingCash = Number(Number(amount).toFixed(4));
        const invoicePayments = [];
        let totalAdvanceApplied = 0;

        for (const line of mergedAlloc) {
          const inv = await q(
            `SELECT * FROM sales_invoices
             WHERE id = $1 AND account_id = $2 AND customer_id = $3 AND deleted_at IS NULL
             FOR UPDATE
             LIMIT 1`,
            [line.salesInvoiceId, ctx.accountId, customerId]
          );
          const invoice = inv.rows?.[0] || null;
          if (!invoice) {
            return { err: fail(404, "NOT_FOUND", `Invoice not found for this customer (${line.salesInvoiceId}).`) };
          }
          if (String(invoice.status) !== "CONFIRMED") {
            return { err: fail(400, "BUSINESS_RULE", `Invoice ${invoice.invoice_number || ""} is not confirmed; allocate only to confirmed bills.`) };
          }
          const paySoFar = await q(
            `SELECT COALESCE(SUM(amount),0)::numeric(12,4) AS paid FROM customer_payments WHERE account_id = $1 AND sales_invoice_id = $2`,
            [ctx.accountId, line.salesInvoiceId]
          );
          const paid = n(paySoFar.rows?.[0]?.paid);
          const total = n(invoice.total_amount);
          const balanceDue = Math.max(0, Number((total - paid).toFixed(4)));
          if (line.amount - balanceDue > 0.01) {
            return {
              err: fail(
                400,
                "BUSINESS_RULE",
                `₹${line.amount.toFixed(2)} for ${invoice.invoice_number || "invoice"} exceeds balance due ₹${balanceDue.toFixed(2)}.`
              )
            };
          }
          const need = Number(Math.min(line.amount, balanceDue).toFixed(4));
          let advApplied = 0;
          if (useAdvBatch && need > 0) {
            const ap = await applyAdvanceToInvoice(q, {
              accountId: ctx.accountId,
              customerId,
              invoiceId: line.salesInvoiceId,
              maxApplyAmount: need,
              actorId
            });
            advApplied = Number(ap.applied || 0);
            totalAdvanceApplied += advApplied;
          }
          const cashPart = Number((need - advApplied).toFixed(4));
          if (cashPart - remainingCash > 0.01) {
            return {
              err: fail(
                400,
                "BUSINESS_RULE",
                `After applying ₹${advApplied.toFixed(2)} advance to ${invoice.invoice_number || "invoice"}, need ₹${cashPart.toFixed(2)} cash but only ₹${remainingCash.toFixed(2)} remains from this receipt.`
              )
            };
          }
          if (cashPart > 0.0001) {
            const ins = await q(
              `INSERT INTO customer_payments (
                account_id, customer_id, sales_invoice_id, allocation_type, payment_date, amount, payment_mode, reference_number, notes, created_by_user_id
              ) VALUES ($1,$2,$3,'INVOICE',$4,$5,$6::customer_payment_mode_type,$7,$8,$9)
              RETURNING *`,
              [ctx.accountId, customerId, line.salesInvoiceId, paymentDate, cashPart, paymentMode, refNum, notes, actorId]
            );
            invoicePayments.push(ins.rows?.[0] || null);
            remainingCash = Number((remainingCash - cashPart).toFixed(4));
          }
          await refreshInvoicePaymentTotals(q, ctx.accountId, line.salesInvoiceId);
        }

        let onAccountPayment = null;
        if (remainingCash > 0.01) {
          const insOa = await q(
            `INSERT INTO customer_payments (
              account_id, customer_id, sales_invoice_id, allocation_type, payment_date, amount, payment_mode, reference_number, notes, created_by_user_id
            ) VALUES ($1,$2,NULL,'ON_ACCOUNT',$3,$4,$5::customer_payment_mode_type,$6,$7,$8)
            RETURNING *`,
            [
              ctx.accountId,
              customerId,
              paymentDate,
              remainingCash,
              paymentMode,
              refNum,
              appendNote(notes, "Unallocated remainder (on account)"),
              actorId
            ]
          );
          onAccountPayment = insOa.rows?.[0] || null;
        }
        return {
          payment: invoicePayments[0] || onAccountPayment,
          payments: invoicePayments.filter(Boolean),
          on_account_payment: onAccountPayment,
          advance_applied: Number(totalAdvanceApplied.toFixed(4)),
          allocated_to_invoices: allocTotal,
          on_account_amount: remainingCash > 0.01 ? remainingCash : 0,
          cash_recorded: Number(amount || 0)
        };
      }

      let lockedInvoice = null;
      let advanceApplied = 0;
      if (invoiceId) {
        const inv = await q(
          `SELECT * FROM sales_invoices
           WHERE id = $1 AND account_id = $2 AND customer_id = $3 AND deleted_at IS NULL
           FOR UPDATE
           LIMIT 1`,
          [invoiceId, ctx.accountId, customerId]
        );
        const invoice = inv.rows?.[0] || null;
        if (!invoice) return { err: fail(404, "NOT_FOUND", "Invoice not found for this customer") };
        if (String(invoice.status) !== "CONFIRMED") {
          return { err: fail(400, "BUSINESS_RULE", "Can only record payment against confirmed invoices.") };
        }
        const balanceDue = Number(invoice.balance_due || Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0)));
        if (useAdvanceFirst && balanceDue > 0) {
          const adv = await q(
            `SELECT COALESCE(SUM(amount),0)::numeric(12,4) AS advance
             FROM customer_payments
             WHERE account_id = $1
               AND customer_id = $2
               AND sales_invoice_id IS NULL
               AND COALESCE(allocation_type, 'ON_ACCOUNT') = 'ON_ACCOUNT'`,
            [ctx.accountId, customerId]
          );
          const availableAdvance = Number(adv.rows?.[0]?.advance || 0);
          const canApply = Math.min(balanceDue, availableAdvance);
          if (canApply > 0) {
            const ap = await applyAdvanceToInvoice(q, {
              accountId: ctx.accountId,
              customerId,
              invoiceId,
              maxApplyAmount: canApply,
              actorId
            });
            advanceApplied = Number(ap.applied || 0);
          }
        }
        const remainingAfterAdvance = Math.max(0, balanceDue - advanceApplied);
        if (!(amount > 0) && !(advanceApplied > 0)) {
          return { err: fail(400, "BUSINESS_RULE", "No payable amount. This invoice has no usable advance and no cash amount was provided.") };
        }
        if (amount > remainingAfterAdvance) {
          return {
            err: fail(
              400,
              "BUSINESS_RULE",
              `Payment amount ₹${amount} exceeds remaining due ₹${remainingAfterAdvance.toFixed(2)} after advance adjustment.`
            )
          };
        }
        lockedInvoice = invoice;
      }
      let createdPayment = null;
      if (amount > 0) {
        const ins = await q(
          `INSERT INTO customer_payments (
            account_id, customer_id, sales_invoice_id, allocation_type, payment_date, amount, payment_mode, reference_number, notes, created_by_user_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7::customer_payment_mode_type,$8,$9,$10)
          RETURNING *`,
          [ctx.accountId, customerId, invoiceId || null, allocationType, paymentDate, amount, paymentMode, refNum, notes, actorId]
        );
        createdPayment = ins.rows?.[0] || null;
      }
      if (invoiceId) {
        await refreshInvoicePaymentTotals(q, ctx.accountId, invoiceId);
        const pay = await q(
          `SELECT COALESCE(SUM(amount),0)::numeric(12,4) AS paid FROM customer_payments WHERE account_id = $1 AND sales_invoice_id = $2`,
          [ctx.accountId, invoiceId]
        );
        const paid = n(pay.rows?.[0]?.paid);
        const total = n(lockedInvoice?.total_amount || 0);
        const balance = Math.max(0, Number((total - paid).toFixed(4)));
        return {
          payment: createdPayment,
          advance_applied: advanceApplied,
          remaining_due: balance,
          cash_recorded: Number(amount || 0)
        };
      }
      return { payment: createdPayment, advance_applied: 0, remaining_due: 0, cash_recorded: Number(amount || 0) };
    });
    if (data?.err) return data.err;
    return created(data, { message: "Customer payment recorded." });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: String(e.message || "Please try again.") });
  }
}

module.exports = { handler };
