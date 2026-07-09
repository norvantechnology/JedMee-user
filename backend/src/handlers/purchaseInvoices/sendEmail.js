const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { parseJsonBody } = require("../../shared/request");
const { getPurchaseInvoicePrintDoc } = require("./printDoc");
const { sendMail } = require("../../shared/mailOut");
const { buildPurchaseInvoicePdfAttachment } = require("../../shared/pdf/purchaseInvoicePdf");
const { emailBase, summaryCard, sectionHeading, divider, greeting, para, noticeBox, E, C, ICONS } = require("../../shared/emailTemplate");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(s) {
  return String(s ?? "").trim().toLowerCase();
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmt(v) {
  return `Rs.\u202F${n(v).toFixed(2)}`;
}

function partyName(inv) {
  if (inv?.division_label || inv?.division_name)
    return `${inv.division_label || inv.division_name || ""}${inv.division_mfg_name ? ` (${inv.division_mfg_name})` : ""}`.trim();
  return String(inv?.vendor_name || "").trim();
}

function statusBadgeColor(status) {
  const s = String(status || "").toUpperCase();
  if (s === "CONFIRMED") return C.success;
  if (s === "CANCELLED") return C.danger;
  return C.accent;
}

function buildPurchaseInvoiceEmailHtml({ inv, doc }) {
  const invNo      = E(inv.invoice_number || "");
  const vendorName = E(inv.vendor_name || partyName(inv) || "Supplier");
  const sellerName = E(doc.seller?.firm_name || doc.seller?.full_name || "");
  const invDate    = String(inv.invoice_date || "").slice(0, 10);
  const status     = String(inv.status || "").toUpperCase();
  const total      = n(inv.total_amount);
  const paid       = n(inv.amount_paid);
  const due        = n(inv.balance_due ?? (total - paid));

  // ── Items table ────────────────────────────────────────────────────────────
  const items = doc.items || [];
  const itemRows = items.length
    ? items.map((l, i) => {
        const bg = i % 2 === 0 ? C.bgCard : C.bgAlt;
        return [
          `<tr style="background:${bg};">`,
          `  <td style="padding:10px 14px;font-size:13px;color:${C.textDark};border-bottom:1px solid ${C.border};">${E(l.product_name || l.product_code || "-")}</td>`,
          `  <td style="padding:10px 14px;font-size:13px;color:${C.textMid};text-align:center;border-bottom:1px solid ${C.border};">${n(l.qty)}</td>`,
          `  <td style="padding:10px 14px;font-size:13px;color:${C.textDark};text-align:right;border-bottom:1px solid ${C.border};font-weight:600;">${fmt(l.line_total)}</td>`,
          `</tr>`,
        ].join("\n");
      }).join("\n")
    : `<tr><td colspan="3" style="padding:20px;text-align:center;color:${C.textMuted};font-size:13px;">No items on this invoice.</td></tr>`;

  const itemsTable = [
    sectionHeading("Invoice Items"),
    `<table role="presentation" class="em-tbl" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${C.border};border-radius:10px;overflow:hidden;margin-bottom:24px;">`,
    `  <thead>`,
    `    <tr style="background:${C.accentLight};">`,
    `      <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:${C.accent};text-transform:uppercase;letter-spacing:0.08em;">Product</th>`,
    `      <th style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:${C.accent};text-transform:uppercase;letter-spacing:0.08em;">Qty</th>`,
    `      <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:${C.accent};text-transform:uppercase;letter-spacing:0.08em;">Amount</th>`,
    `    </tr>`,
    `  </thead>`,
    `  <tbody>${itemRows}</tbody>`,
    `</table>`,
  ].join("\n");

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalsRows = [
    `<tr><td style="padding:8px 0;font-size:13px;color:${C.textMid};">Subtotal</td><td style="padding:8px 0;font-size:13px;color:${C.textDark};text-align:right;font-weight:600;">${fmt(total)}</td></tr>`,
    paid > 0 ? `<tr><td style="padding:8px 0;font-size:13px;color:${C.success};">Amount Paid</td><td style="padding:8px 0;font-size:13px;color:${C.success};text-align:right;font-weight:600;">${fmt(paid)}</td></tr>` : "",
    due > 0  ? `<tr style="border-top:2px solid ${C.border};"><td style="padding:12px 0 4px;font-size:15px;font-weight:700;color:${C.danger};">Balance Due</td><td style="padding:12px 0 4px;font-size:15px;font-weight:700;color:${C.danger};text-align:right;">${fmt(due)}</td></tr>` : "",
  ].filter(Boolean).join("\n");

  const totalsBlock = [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bgAlt};border:1px solid ${C.border};border-radius:10px;margin-bottom:24px;">`,
    `  <tr><td style="padding:16px 20px;">`,
    `    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${totalsRows}</table>`,
    `  </td></tr>`,
    `</table>`,
  ].join("\n");

  // ── Status badge ───────────────────────────────────────────────────────────
  const statusBadge = status
    ? `<span style="display:inline-block;padding:3px 12px;border-radius:20px;background:${statusBadgeColor(status)}1a;color:${statusBadgeColor(status)};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${status}</span>`
    : "";

  const body = [
    greeting(vendorName || "Supplier"),
    para("Please find your purchase invoice details below. A PDF copy is attached for your records."),
    divider(),

    sectionHeading("Invoice Details"),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bgAlt};border:1px solid ${C.border};border-radius:10px;margin-bottom:24px;">`,
    `  <tr><td style="padding:16px 20px;">`,
    `    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    `      <tr><td style="padding:4px 0;font-size:12px;color:${C.textMuted};width:40%;">Invoice No.</td><td style="padding:4px 0;font-size:13px;color:${C.textDark};font-weight:700;">${invNo || "-"}</td></tr>`,
    `      <tr><td style="padding:4px 0;font-size:12px;color:${C.textMuted};">Date</td><td style="padding:4px 0;font-size:13px;color:${C.textDark};">${E(invDate) || "-"}</td></tr>`,
    `      <tr><td style="padding:4px 0;font-size:12px;color:${C.textMuted};">Status</td><td style="padding:6px 0;">${statusBadge || "-"}</td></tr>`,
    sellerName ? `      <tr><td style="padding:4px 0;font-size:12px;color:${C.textMuted};">From</td><td style="padding:4px 0;font-size:13px;color:${C.textDark};">${sellerName}</td></tr>` : "",
    `    </table>`,
    `  </td></tr>`,
    `</table>`,

    itemsTable,
    totalsBlock,

    para("If you have any questions about this invoice, please contact us directly.", { color: C.textMuted, size: "12px" }),
  ].filter(Boolean).join("\n");

  return emailBase({
    preheader: `Purchase invoice ${invNo} - Total ${fmt(total)}`,
    headerLabel: "Purchase Invoice",
    headerTitle: invNo ? `Invoice #${invNo}` : "Purchase Invoice",
    headerSub: vendorName || undefined,
    body,
    brandName: sellerName || "JedMee",
  });
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
    const subject = `Purchase Invoice ${inv.invoice_number || ""} - ${partyName(inv) || "Supplier"}`.trim();
    let attachment;
    try {
      attachment = await buildPurchaseInvoicePdfAttachment(doc);
    } catch (e) {
      results.push({ id: invoiceId, status: "error", message: String(e?.message || "PDF failed") });
      // eslint-disable-next-line no-continue
      continue;
    }
    const text = `Please find your purchase invoice ${inv.invoice_number || ""} attached as a PDF.\n\n- ${doc.seller?.firm_name || doc.seller?.full_name || ""}`;
    const html = buildPurchaseInvoiceEmailHtml({ inv, doc });
    const m = await sendMail({
      to,
      subject,
      text,
      html,
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
