const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { sendMail } = require("../../shared/mailOut");
const { buildCustomerLedgerDoc } = require("./ledgerDoc");
const { buildCustomerLedgerPdfAttachment } = require("../../shared/pdf/customerLedgerPdf");
const { emailBase, summaryCard, sectionHeading, divider, greeting, para, noticeBox, E, C, ICONS } = require("../../shared/emailTemplate");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(s) {
  return String(s ?? "").trim().toLowerCase();
}

function buildCustomerLedgerEmailHtml({ cust, sellerName, netBal, balanceType, balanceColor }) {
  const custName = E(cust.name || "Customer");
  const safeSeller = E(sellerName || "");

  const balanceSummary = summaryCard({
    label: "Net Balance",
    value: `Rs.\u202F${Math.abs(netBal).toFixed(2)}`,
    valueColor: balanceColor,
    badge: balanceType,
  });

  // Contact info block
  const contactRows = [
    cust.code        ? `<tr><td style="padding:4px 0;font-size:12px;color:${C.textMuted};width:40%;">Code</td><td style="padding:4px 0;font-size:13px;color:${C.textDark};">${E(cust.code)}</td></tr>` : "",
    cust.phone_number ? `<tr><td style="padding:4px 0;font-size:12px;color:${C.textMuted};">Phone</td><td style="padding:4px 0;font-size:13px;color:${C.textDark};">${E(cust.phone_number)}</td></tr>` : "",
    cust.gst_number  ? `<tr><td style="padding:4px 0;font-size:12px;color:${C.textMuted};">GSTIN</td><td style="padding:4px 0;font-size:13px;color:${C.textDark};">${E(cust.gst_number)}</td></tr>` : "",
    cust.address     ? `<tr><td style="padding:4px 0;font-size:12px;color:${C.textMuted};">Address</td><td style="padding:4px 0;font-size:13px;color:${C.textDark};">${E(cust.address)}</td></tr>` : "",
  ].filter(Boolean).join("\n");

  const contactBlock = contactRows ? [
    sectionHeading("Customer Details"),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bgAlt};border:1px solid ${C.border};border-radius:10px;margin-bottom:24px;">`,
    `  <tr><td style="padding:16px 20px;">`,
    `    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`,
    contactRows,
    `    </table>`,
    `  </td></tr>`,
    `</table>`,
  ].join("\n") : "";

  // Balance explanation
  const balanceNote = netBal > 0
    ? `You have an outstanding <strong style="color:${C.danger};">debit balance</strong> of Rs.\u202F${Math.abs(netBal).toFixed(2)}. Please arrange payment at your earliest convenience.`
    : netBal < 0
    ? `You have a <strong style="color:${C.success};">credit balance</strong> of Rs.\u202F${Math.abs(netBal).toFixed(2)} with us.`
    : `Your account is <strong style="color:${C.neutral};">fully settled</strong> with no outstanding balance.`;

  const body = [
    greeting(cust.name || "Customer"),
    para("Please find your customer ledger statement attached as a PDF. Below is a summary of your account."),
    divider(),

    sectionHeading("Account Summary"),
    balanceSummary,
    para(balanceNote),

    contactBlock ? divider() : "",
    contactBlock,

    divider(),
    para(
      `The attached PDF contains a complete transaction history. For any queries, please contact ${safeSeller || "us"} directly.`,
      { color: C.textMuted, size: "12px" }
    ),
  ].filter(Boolean).join("\n");

  return emailBase({
    preheader: `Your ledger statement - Balance Rs.${Math.abs(netBal).toFixed(2)} ${balanceType}`,
    headerLabel: "Customer Ledger Statement",
    headerTitle: custName,
    headerSub: cust.code ? `Code: ${E(cust.code)}` : undefined,
    body,
    brandName: sellerName || "JedMee",
  });
}

async function handler(event) {
  const auth = await requirePermission(event, "CUSTOMERS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId    = String(auth.claims?.sub || "");
  const customerId = String(event?.pathParameters?.id || "");
  const ctx        = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!customerId)    return fail(400, "VALIDATION_ERROR", "customer id is required");

  let doc;
  try {
    doc = await buildCustomerLedgerDoc({ accountId: ctx.accountId, customerId });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
  if (!doc) return fail(404, "NOT_FOUND", "Customer not found");

  const cust = doc.customer;
  const to   = cleanEmail(cust.email);
  if (!to || !EMAIL_RE.test(to)) {
    return ok({ results: [{ status: "no_email", customerId: cust.id, customerName: cust.name || "" }] });
  }

  const sellerRs = await query(
    `SELECT u.id, u.full_name, COALESCE(to_jsonb(u) ->> 'firm_name', '') AS firm_name
     FROM app_users u WHERE u.id = $1 LIMIT 1`,
    [ctx.accountId]
  );
  const seller     = sellerRs.rows?.[0] || null;
  const sellerName = seller?.firm_name || seller?.full_name || "";

  const netBal      = Number(doc.summary?.netBalance || 0);
  const balanceType = netBal > 0 ? "DR" : netBal < 0 ? "CR" : "NIL";
  const balanceColor = netBal > 0 ? C.danger : netBal < 0 ? C.success : C.neutral;

  let attachment;
  try {
    attachment = await buildCustomerLedgerPdfAttachment({ ...doc, seller });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "PDF generation failed.", { subMessage: String(e?.message || "") });
  }

  const subject = `Customer Ledger Statement - ${cust.name || "Customer"}`.trim();
  const text    = `Dear ${cust.name || "Customer"},\n\nPlease find your customer ledger statement attached as a PDF.\n\nNet Balance: Rs.${Math.abs(netBal).toFixed(2)} ${balanceType}\n\n- ${sellerName}`;
  const html    = buildCustomerLedgerEmailHtml({ cust, sellerName, netBal, balanceType, balanceColor });

  const m = await sendMail({
    to,
    subject,
    text,
    html,
    attachments: [{ filename: attachment.filename, content: attachment.buffer, contentType: "application/pdf" }],
  });

  if (m.ok) {
    return ok({ results: [{ status: m.dryRun ? "sent_dry_run" : "sent", to }] }, { message: "Ledger emailed." });
  }
  return ok({ results: [{ status: "send_failed", message: m.error || "Send failed" }] });
}

module.exports = { handler };
