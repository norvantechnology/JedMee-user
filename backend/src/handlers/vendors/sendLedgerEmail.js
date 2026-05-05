const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { sendMail } = require("../../shared/mailOut");
const { buildVendorLedgerPdfAttachment } = require("../../shared/pdf/vendorLedgerPdf");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(s) {
  return String(s ?? "").trim().toLowerCase();
}

function ymd(v) {
  return String(v || "").slice(0, 10);
}

function ledgerTs(isoDate, createdAt) {
  const t = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isNaN(t)) return t;
  const d = new Date(String(isoDate || "").slice(0, 10) || 0).getTime();
  return Number.isNaN(d) ? 0 : d;
}

async function buildVendorLedgerDoc({ accountId, vendorId }) {
  const vendorRs = await query(
    `SELECT id, code, name, phone_number, address, email
     FROM vendors
     WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [vendorId, accountId]
  );
  const vendor = vendorRs.rows?.[0] || null;
  if (!vendor) return null;

  const [invoicesRs, paymentsRs, returnsRs] = await Promise.all([
    query(
      `SELECT id, invoice_number, invoice_date, total_amount, created_at
       FROM purchase_invoices
       WHERE account_id = $1
         AND vendor_id = $2
         AND deleted_at IS NULL
         AND status = 'CONFIRMED'
       ORDER BY invoice_date ASC, created_at ASC`,
      [accountId, vendorId]
    ),
    query(
      `SELECT vp.id, vp.payment_date, vp.amount, vp.reference_number, vp.notes, vp.allocation_type, vp.created_at,
              pi.invoice_number
       FROM vendor_payments vp
       LEFT JOIN purchase_invoices pi ON pi.id = vp.purchase_invoice_id AND pi.account_id = vp.account_id
       WHERE vp.account_id = $1 AND vp.vendor_id = $2
       ORDER BY vp.payment_date ASC, vp.created_at ASC`,
      [accountId, vendorId]
    ),
    query(
      `SELECT pr.id, pr.return_number, pr.return_date, pr.total_return_amount, pr.created_at
       FROM purchase_returns pr
       WHERE pr.account_id = $1
         AND pr.vendor_id = $2
         AND pr.status = 'CONFIRMED'
       ORDER BY pr.return_date ASC, pr.created_at ASC`,
      [accountId, vendorId]
    )
  ]);

  const rawEntries = [
    ...(invoicesRs.rows || []).map((x) => ({
      date: ymd(x.invoice_date),
      type: "PURCHASE",
      reference: x.invoice_number || "",
      debit: Number(x.total_amount || 0),
      credit: 0,
      sortTs: ledgerTs(x.invoice_date, x.created_at),
      sortId: x.id
    })),
    ...(paymentsRs.rows || []).map((x) => {
      const alloc = String(x.allocation_type || (x.invoice_number ? "INVOICE" : "ON_ACCOUNT")).toUpperCase();
      return {
        date: ymd(x.payment_date),
        type: alloc === "ON_ACCOUNT" ? "ADVANCE_PAYMENT" : "PAYMENT",
        reference: x.invoice_number || x.reference_number || "On Account",
        debit: 0,
        credit: Number(x.amount || 0),
        sortTs: ledgerTs(x.payment_date, x.created_at),
        sortId: x.id
      };
    }),
    ...(returnsRs.rows || []).map((x) => ({
      date: ymd(x.return_date),
      type: "PURCHASE_RETURN",
      reference: x.return_number || "",
      debit: 0,
      credit: Number(x.total_return_amount || 0),
      sortTs: ledgerTs(x.return_date, x.created_at),
      sortId: x.id
    }))
  ].sort((a, b) => {
    const da = new Date(a.date || 0).getTime();
    const db = new Date(b.date || 0).getTime();
    if (da !== db) return da - db;
    if (a.sortTs !== b.sortTs) return a.sortTs - b.sortTs;
    return String(a.sortId).localeCompare(String(b.sortId), undefined, { numeric: true });
  });

  let running = 0;
  const entries = rawEntries.map((e) => {
    running += Number(e.debit || 0) - Number(e.credit || 0);
    return {
      date: e.date,
      type: e.type,
      reference: e.reference,
      debit: e.debit,
      credit: e.credit,
      balance: running
    };
  });

  return {
    vendor,
    entries,
    summary: {
      net_balance: running,
      net_balance_type: running > 0 ? "DR" : running < 0 ? "CR" : "NIL"
    }
  };
}

async function handler(event) {
  const auth = await requirePermission(event, "VENDORS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const vendorId = String(event?.pathParameters?.id || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");
  if (!vendorId) return fail(400, "VALIDATION_ERROR", "vendor id is required");

  let doc;
  try {
    doc = await buildVendorLedgerDoc({ accountId: ctx.accountId, vendorId });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
  if (!doc) return fail(404, "NOT_FOUND", "Supplier not found");

  const vendor = doc.vendor;
  const to = cleanEmail(vendor.email);
  if (!to || !EMAIL_RE.test(to)) {
    return ok({
      results: [{ status: "no_email", vendorId: vendor.id, vendorName: vendor.name || "" }]
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

  let attachment;
  try {
    attachment = await buildVendorLedgerPdfAttachment({ ...doc, seller });
  } catch (e) {
    return fail(500, "INTERNAL_ERROR", "PDF generation failed.", { subMessage: String(e?.message || "") });
  }

  const sellerName = seller?.firm_name || seller?.full_name || "";
  const subject = `Supplier Ledger — ${vendor.name || "Supplier"}`.trim();
  const text = `Dear ${vendor.name || "Supplier"},\n\nPlease find your supplier ledger statement attached as a PDF.\n\nNet Balance: Rs.${Math.abs(Number(doc.summary.net_balance || 0)).toFixed(2)} ${doc.summary.net_balance_type || ""}\n\n— ${sellerName}`;
  const balanceColor = doc.summary.net_balance > 0 ? "#dc2626" : doc.summary.net_balance < 0 ? "#16a34a" : "#4c2480";
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f3ff;font-family:system-ui,Segoe UI,Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(107,63,160,0.12);">
    <div style="background:linear-gradient(135deg,#6b3fa0 0%,#5c3390 100%);padding:24px 28px;">
      <p style="margin:0 0 4px;color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:0.05em;text-transform:uppercase;">Supplier Ledger Statement</p>
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">${vendor.name || "Supplier"}</h1>
      ${vendor.code ? `<p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Code: ${vendor.code}</p>` : ""}
    </div>
    <div style="background:#fff;padding:24px 28px;">
      <p style="margin:0 0 16px;color:#1a0c30;font-size:14px;">Dear <strong>${vendor.name || "Supplier"}</strong>,</p>
      <p style="margin:0 0 20px;color:#4c2480;font-size:14px;">Please find your supplier ledger statement attached as a PDF.</p>
      <div style="background:#fbf8ff;border:1px solid #d0b8f0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:12px;color:#9870c8;text-transform:uppercase;letter-spacing:0.05em;">Net Balance</p>
        <p style="margin:0;font-size:24px;font-weight:700;color:${balanceColor};">
          Rs.${Math.abs(Number(doc.summary.net_balance || 0)).toFixed(2)}
          <span style="font-size:14px;font-weight:600;margin-left:6px;">${doc.summary.net_balance_type || "NIL"}</span>
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