const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { sendMail } = require("../../shared/mailOut");
const { buildCustomerLedgerDoc } = require("./ledgerDoc");
const { buildCustomerLedgerPdfAttachment } = require("../../shared/pdf/customerLedgerPdf");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

async function handler(event) {
  const auth = await requirePermission(event, "CUSTOMERS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const customerId = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!customerId) return fail(400, "VALIDATION_ERROR", "customer id is required");

  let doc;
  try {
    doc = await buildCustomerLedgerDoc({ accountId: ctx.accountId, customerId });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
  if (!doc) return fail(404, "NOT_FOUND", "Customer not found");

  const cust = doc.customer;
  const to = cleanEmail(cust.email);
  if (!to || !EMAIL_RE.test(to)) {
    return ok({
      results: [{ status: "no_email", customerId: cust.id, customerName: cust.name || "" }]
    });
  }

  const sellerRs = await query(
    `SELECT
       u.id,
       u.full_name,
       COALESCE(to_jsonb(u) ->> 'firm_name', '') AS firm_name
     FROM app_users u
     WHERE u.id = $1
     LIMIT 1`,
    [ctx.accountId]
  );
  const seller = sellerRs.rows?.[0] || null;

  const netBal = Number(doc.summary?.netBalance || 0);

  let attachment;
  try {
    attachment = await buildCustomerLedgerPdfAttachment({ ...doc, seller });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "PDF generation failed.", { subMessage: String(e?.message || "") });
  }

  const sellerName = seller?.firm_name || seller?.full_name || "";
  const subject = `Customer Ledger — ${cust.name || "Customer"}`.trim();
  const text = `Dear ${cust.name || "Customer"},\n\nPlease find your customer ledger statement attached as a PDF.\n\nNet Balance: Rs.${Math.abs(netBal).toFixed(2)} ${netBal > 0 ? "DR" : netBal < 0 ? "CR" : "NIL"}\n\n— ${sellerName}`;
  const balanceColor = netBal > 0 ? "#dc2626" : netBal < 0 ? "#16a34a" : "#4c2480";
  const balanceType = netBal > 0 ? "DR" : netBal < 0 ? "CR" : "NIL";
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f3ff;font-family:system-ui,Segoe UI,Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(107,63,160,0.12);">
    <div style="background:linear-gradient(135deg,#6b3fa0 0%,#5c3390 100%);padding:24px 28px;">
      <p style="margin:0 0 4px;color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:0.05em;text-transform:uppercase;">Customer Ledger Statement</p>
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">${cust.name || "Customer"}</h1>
      ${cust.code ? `<p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Code: ${cust.code}</p>` : ""}
    </div>
    <div style="background:#fff;padding:24px 28px;">
      <p style="margin:0 0 16px;color:#1a0c30;font-size:14px;">Dear <strong>${cust.name || "Customer"}</strong>,</p>
      <p style="margin:0 0 20px;color:#4c2480;font-size:14px;">Please find your customer ledger statement attached as a PDF.</p>
      <div style="background:#fbf8ff;border:1px solid #d0b8f0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:12px;color:#9870c8;text-transform:uppercase;letter-spacing:0.05em;">Net Balance</p>
        <p style="margin:0;font-size:24px;font-weight:700;color:${balanceColor};">
          Rs.${Math.abs(netBal).toFixed(2)}
          <span style="font-size:14px;font-weight:600;margin-left:6px;">${balanceType}</span>
        </p>
      </div>
      <p style="margin:0;font-size:12px;color:#9870c8;border-top:1px solid #f8f3ff;padding-top:16px;">
        This is an automated message from ${sellerName}. Please do not reply unless you have been asked to.
      </p>
    </div>
  </div>
</body>
</html>`;
  const m = await sendMail({
    to,
    subject,
    text,
    html,
    attachments: [{ filename: attachment.filename, content: attachment.buffer, contentType: "application/pdf" }]
  });

  if (m.ok) {
    return ok({ results: [{ status: m.dryRun ? "sent_dry_run" : "sent", to }] }, { message: "Ledger emailed." });
  }
  return ok({ results: [{ status: "send_failed", message: m.error || "Send failed" }] });
}

module.exports = { handler };
