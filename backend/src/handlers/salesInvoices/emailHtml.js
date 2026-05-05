function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function buildSalesInvoiceEmailHtml(doc) {
  const inv = doc.invoice || {};
  const seller = doc.seller || {};
  const invNo = escapeHtml(inv.invoice_number || "");
  const cust = escapeHtml(inv.customer_name || "");
  const d = String(inv.invoice_date || "").slice(0, 10);
  const sellerName = escapeHtml(seller.firm_name || seller.full_name || "");
  const sub = n(inv.total_amount);
  const paid = n(inv.amount_paid_resolved ?? inv.amount_paid);
  const due = n(inv.balance_due_resolved ?? inv.balance_due);

  const bodyRows = (doc.items || [])
    .map(
      (l) =>
        `<tr>
          <td style="padding:7px 10px;border-bottom:1px solid #d0b8f0;font-size:13px;color:#1a0c30;">${escapeHtml(l.product_name || l.product_code || "")}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #d0b8f0;text-align:right;font-size:13px;color:#1a0c30;">${n(l.qty)}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #d0b8f0;text-align:right;font-size:13px;color:#1a0c30;">Rs.${n(l.line_total).toFixed(2)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f3ff;font-family:system-ui,Segoe UI,Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(107,63,160,0.12);">
    <div style="background:linear-gradient(135deg,#6b3fa0 0%,#5c3390 100%);padding:24px 28px;">
      <p style="margin:0 0 4px;color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:0.05em;text-transform:uppercase;">Sales Invoice</p>
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">${invNo || "Invoice"}</h1>
      ${sellerName ? `<p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">${sellerName}</p>` : ""}
    </div>
    <div style="background:#fff;padding:24px 28px;">
      <p style="margin:0 0 4px;color:#1a0c30;font-size:14px;">Customer: <strong>${cust || "—"}</strong></p>
      <p style="margin:0 0 16px;color:#4c2480;font-size:13px;">Date: ${escapeHtml(d) || "—"} &nbsp;|&nbsp; Status: ${escapeHtml(String(inv.status || "—"))}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr style="background:#f8f3ff;">
            <th style="text-align:left;padding:7px 10px;font-size:11px;color:#4c2480;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #d0b8f0;">Product</th>
            <th style="text-align:right;padding:7px 10px;font-size:11px;color:#4c2480;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #d0b8f0;">Qty</th>
            <th style="text-align:right;padding:7px 10px;font-size:11px;color:#4c2480;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #d0b8f0;">Amount</th>
          </tr>
        </thead>
        <tbody>${bodyRows || `<tr><td colspan="3" style="padding:12px 10px;text-align:center;color:#9870c8;font-size:13px;">No items</td></tr>`}</tbody>
      </table>
      <div style="background:#fbf8ff;border:1px solid #d0b8f0;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:#1a0c30;">
          <span>Total Amount</span><strong>Rs.${sub.toFixed(2)}</strong>
        </div>
        ${paid > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:#15803d;"><span>Amount Paid</span><strong>Rs.${paid.toFixed(2)}</strong></div>` : ""}
        ${due > 0 ? `<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:#dc2626;border-top:1px dashed #d0b8f0;padding-top:8px;margin-top:4px;"><span>Balance Due</span><strong>Rs.${due.toFixed(2)}</strong></div>` : ""}
      </div>
      <p style="margin:0;font-size:12px;color:#9870c8;border-top:1px solid #f8f3ff;padding-top:16px;">
        This is an automated message${sellerName ? ` from ${sellerName}` : ""}. Please do not reply unless you have been asked to.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildPlainTextFromDoc(doc) {
  const inv = doc.invoice || {};
  const lines = [
    `Sales invoice ${inv.invoice_number || ""}`,
    `Customer: ${inv.customer_name || ""}`,
    `Date: ${String(inv.invoice_date || "").slice(0, 10)}`,
    `Total: Rs.${n(inv.total_amount).toFixed(2)}`
  ];
  (doc.items || []).forEach((l) => {
    lines.push(`- ${l.product_name || l.product_code || ""}  Qty ${n(l.qty)}  Line Rs.${n(l.line_total).toFixed(2)}`);
  });
  return lines.join("\n");
}

module.exports = { buildSalesInvoiceEmailHtml, buildPlainTextFromDoc, escapeHtml };
