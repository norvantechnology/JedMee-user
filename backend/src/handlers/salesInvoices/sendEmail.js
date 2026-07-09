const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseJsonBody } = require("../../shared/request");
const { getSalesInvoicePrintDoc } = require("./printDoc");
const { sendMail } = require("../../shared/mailOut");
const { buildSalesInvoicePdfAttachment } = require("../../shared/pdf/salesInvoicePdf");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Body: { ids: string[] }  (sales invoice ids, one or many)
 */
async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event) || {};
  const ids = Array.isArray(body.ids) ? body.ids.map((x) => String(x || "")).filter(Boolean) : [];
  if (!ids.length) return fail(400, "VALIDATION_ERROR", "Request body must include a non-empty ids array.");

  const results = [];
  for (const invoiceId of ids) {
    let doc;
    try {
      doc = await getSalesInvoicePrintDoc({ accountId: ctx.accountId, invoiceId });
    } catch {
      results.push({ id: invoiceId, status: "error", message: "Load failed" });
      // eslint-disable-next-line no-continue
      continue;
    }
    if (!doc) {
      results.push({ id: invoiceId, status: "not_found" });
      // eslint-disable-next-line no-continue
      continue;
    }
    const inv = doc.invoice;
    if (String(inv?.status || "").toUpperCase() === "CANCELLED") {
      results.push({ id: invoiceId, status: "skipped", message: "Invoice is cancelled." });
      // eslint-disable-next-line no-continue
      continue;
    }
    const to = cleanEmail(inv.customer_email);
    if (!to || !EMAIL_RE.test(to)) {
      results.push({ id: invoiceId, status: "no_email", customerId: inv.customer_id, customerName: inv.customer_name || "" });
      // eslint-disable-next-line no-continue
      continue;
    }
    const subject = `Sales invoice ${inv.invoice_number || ""}  ${inv.customer_name || "Customer"}`.trim();
    let attachment;
    try {
      attachment = await buildSalesInvoicePdfAttachment(doc);
    } catch (e) {
      results.push({ id: invoiceId, status: "error", message: String(e?.message || "PDF failed") });
      // eslint-disable-next-line no-continue
      continue;
    }
    const text = `Please find your sales invoice ${inv.invoice_number || ""} attached as a PDF.\n\n- ${doc.seller?.firm_name || doc.seller?.full_name || ""}`;
    const m = await sendMail({
      to,
      subject,
      text,
      attachments: [{ filename: attachment.filename, content: attachment.buffer, contentType: "application/pdf" }]
    });
    if (m.ok) {
      results.push({ id: invoiceId, status: m.dryRun ? "sent_dry_run" : "sent", to });
    } else {
      results.push({ id: invoiceId, status: "send_failed", message: m.error || "Send failed" });
    }
  }

  return ok({ results }, { message: "Email send completed (see per-invoice results)." });
}

module.exports = { handler };
