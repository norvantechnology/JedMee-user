import { esc, openPrintDocument } from "./printDocument.js";

function money(v) {
  return Number(v || 0).toFixed(2);
}

function ymd(v) {
  return String(v || "").slice(0, 10) || "-";
}

export function printCustomerLedgerDoc(data) {
  const c = data?.customer || {};
  const s = data?.summary || {};
  const entries = Array.isArray(data?.entries) ? data.entries : [];

  const rows = entries.length
    ? entries
        .map(
          (e, i) => `<tr>
      <td>${i + 1}</td>
      <td>${ymd(e.date)}</td>
      <td>${esc(e.type_label || e.type || "-")}</td>
      <td>${esc(e.reference || "-")}</td>
      <td class="prNum">${money(e.debit)}</td>
      <td class="prNum">${money(e.credit)}</td>
      <td class="prNum">${money(e.balance)}</td>
    </tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="prEmpty">No ledger entries</td></tr>`;

  const html = `
    <div class="prDoc">
      <div class="prHead">
        <div>
          <h1 class="prTitle">${esc(data?.printable?.title || "Customer Ledger")}</h1>
          <p class="prSub">${esc(c.name || "-")}${c.code ? ` | Code: ${esc(c.code)}` : ""}${c.phone_number ? ` | Phone: ${esc(c.phone_number)}` : ""}</p>
          <p class="prMeta">${esc(c.full_address || "-")}${c.gst_number ? ` | GST: ${esc(c.gst_number)}` : ""}</p>
        </div>
        <div class="prNoPrint"><button onclick="window.print()">Print</button></div>
      </div>

      <div class="prSection prGrid">
        <div class="prCard">
          <h3>Summary</h3>
          <div class="prRow"><span>Total Billed</span><strong>${money(s.totalBilled)}</strong></div>
          <div class="prRow"><span>Total Paid</span><strong>${money(s.totalPaid)}</strong></div>
          <div class="prRow"><span>Balance Due</span><strong>${money(s.balanceDue)}</strong></div>
          <div class="prRow"><span>Advance From Customer</span><strong>${money(s.advanceAmount)}</strong></div>
          <div class="prRow"><span>Oldest Bill</span><strong>${Number(s.oldestBillAgeDays || 0)} day(s)</strong></div>
        </div>
        <div class="prTotals">
          <div class="prRow"><span>Net Balance</span><strong>${money(s.netBalance)}</strong></div>
          <div class="prRow"><span>Status</span><strong>${Number(s.netBalance || 0) >= 0 ? "Customer Owes You" : "Advance Held"}</strong></div>
        </div>
      </div>

      <div class="prSection">
        <table class="prTable">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Type</th>
              <th>Reference</th>
              <th class="prNum">Debit</th>
              <th class="prNum">Credit</th>
              <th class="prNum">Balance</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="prFooter">
        <span>Generated on ${new Date().toLocaleString()}</span>
        <span>Customer ${esc(c.name || "-")}</span>
      </div>
    </div>
  `;

  return openPrintDocument({ title: `Customer Ledger ${c.name || ""}`, bodyHtml: html });
}

