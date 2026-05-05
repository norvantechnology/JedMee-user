const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseJsonBody } = require("../../shared/request");
const { getPurchaseInvoicePrintDoc } = require("./printDoc");
const { sendMail } = require("../../shared/mailOut");
const { buildPurchaseInvoicePdfAttachment } = require("../../shared/pdf/purchaseInvoicePdf");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function partyName(inv) {
  if (inv?.division_label || inv?.division_name)
    return `${inv.division_label || inv.division_name || ""}${inv.division_mfg_name ? ` (${inv.division_mfg_name})` : ""}`.trim();
  return String(inv?.vendor_name || "").trim();
}

/**
 * Body: { ids: string[] }
 */
async function handler(event) {
  const auth = await requirePermission(event, "PURCHASE_INVOICES", "VIEW");
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
      doc = await getPurchaseInvoicePrintDoc({ accountId: ctx.accountId, invoiceId });
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
    const vid = inv.vendor_id ? String(inv.vendor_id) : "";
    if (!vid) {
      results.push({
        id: invoiceId,
        status: "no_party_email",
        message: "This invoice has no linked vendor (division-only). Add a vendor purchase or enter supplier email on a vendor record.",
        partyName: partyName(inv)
      });
      // eslint-disable-next-line no-continue
      continue;
    }
    const to = cleanEmail(inv.vendor_email);
    if (!to || !EMAIL_RE.test(to)) {
      results.push({
        id: invoiceId,
        status: "no_email",
        vendorId: vid,
        vendorName: String(inv.vendor_name || "").trim(),
        partyName: partyName(inv)
      });
      // eslint-disable-next-line no-continue
      continue;
    }
    const subject = `Purchase invoice ${inv.invoice_number || ""}  ${partyName(inv) || "Supplier"}`.trim();
    let attachment;
    try {
      attachment = await buildPurchaseInvoicePdfAttachment(doc);
    } catch (e) {
      results.push({ id: invoiceId, status: "error", message: String(e?.message || "PDF failed") });
      // eslint-disable-next-line no-continue
      continue;
    }
    const text = `Please find your purchase invoice ${inv.invoice_number || ""} attached as a PDF.\n\n— ${doc.seller?.firm_name || doc.seller?.full_name || ""}`;
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
