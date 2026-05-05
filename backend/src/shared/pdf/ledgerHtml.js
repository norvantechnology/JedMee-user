/**
 * Shared HTML template for ledger statements (customer & vendor).
 * Used by both the email PDF attachment (puppeteer) and can be mirrored
 * in the frontend print window.
 *
 * @param {object} p
 * @param {"Customer"|"Supplier"} p.partyType
 * @param {{ name:string, code?:string, address?:string }} p.party
 * @param {Array<{date,type,reference,debit,credit,balance}>} p.entries
 * @param {{ net:number, netType:string, totalDr?:number, totalCr?:number, balanceDue?:number, advanceAmount?:number }} p.summary
 * @param {{ firm_name?:string, full_name?:string }} [p.seller]
 * @param {{ from?:string, to?:string }} [p.dateRange]
 * @returns {string} Complete HTML document
 */
function buildLedgerHtml({ partyType, party, entries, summary, seller, dateRange }) {
  const sellerName = (seller?.firm_name || seller?.full_name || "").trim();
  const net = Number(summary?.net || 0);
  const netType = summary?.netType || (net > 0 ? "DR" : net < 0 ? "CR" : "NIL");
  const totalDr = Number(summary?.totalDr || 0);
  const totalCr = Number(summary?.totalCr || 0);
  const netClass = net > 0 ? "stat--net-dr" : net < 0 ? "stat--net-cr" : "stat--net";

  const drLabel = partyType === "Supplier" ? "Total Purchases" : "Total Invoiced";
  const crLabel = partyType === "Supplier" ? "Total Payments" : "Total Received";

  const dateRangeHtml =
    dateRange?.from || dateRange?.to
      ? `<div class="date-range">Period: <strong>${dateRange.from || "—"}</strong> to <strong>${dateRange.to || "—"}</strong></div>`
      : "";

  const extraStats =
    summary?.balanceDue != null
      ? `<div class="stat stat--due">
           <div class="stat-label">Balance Due</div>
           <div class="stat-value">Rs.${Math.abs(Number(summary.balanceDue || 0)).toFixed(2)}</div>
         </div>
         <div class="stat stat--adv">
           <div class="stat-label">Advance</div>
           <div class="stat-value">Rs.${Math.abs(Number(summary.advanceAmount || 0)).toFixed(2)}</div>
         </div>`
      : "";

  const rows = (entries || [])
    .map((e) => {
      const isDr = Number(e.debit || 0) > 0;
      const isCr = Number(e.credit || 0) > 0;
      const rowClass = isDr ? "row-dr" : isCr ? "row-cr" : "";
      const typeLabel = String(e.type_label || e.type || "").replace(/_/g, " ");
      return `<tr class="${rowClass}">
        <td>${String(e.date || "").slice(0, 10)}</td>
        <td class="td-type">${typeLabel}</td>
        <td class="td-ref">${e.reference || "—"}</td>
        <td class="num td-dr">${isDr ? `Rs.${Number(e.debit).toFixed(2)}` : ""}</td>
        <td class="num td-cr">${isCr ? `Rs.${Number(e.credit).toFixed(2)}` : ""}</td>
        <td class="num td-bal">Rs.${Number(e.balance || 0).toFixed(2)}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${partyType} Ledger — ${party.name || ""}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a0c30; background: #fff; }
    .page { padding: 32px; max-width: 820px; margin: 0 auto; }

    /* ── Header ── */
    .header {
      background: linear-gradient(135deg, #6b3fa0 0%, #5c3390 100%);
      color: #fff;
      padding: 20px 24px;
      border-radius: 8px;
      margin-bottom: 18px;
    }
    .header-seller { font-size: 11px; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
    .header-label  { font-size: 11px; opacity: 0.7; margin-bottom: 3px; }
    .header-name   { font-size: 20px; font-weight: 700; margin-bottom: 3px; }
    .header-meta   { font-size: 11px; opacity: 0.7; margin-top: 2px; }

    /* ── Date range ── */
    .date-range {
      font-size: 11px; color: #4c2480; margin-bottom: 14px;
      padding: 6px 12px; background: #f8f3ff;
      border-radius: 4px; border-left: 3px solid #6b3fa0;
    }

    /* ── Stats ── */
    .stats { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
    .stat {
      flex: 1; min-width: 110px;
      padding: 10px 14px; border-radius: 8px;
      border: 1px solid #d0b8f0; background: #fbf8ff;
    }
    .stat-label { font-size: 10px; color: #9870c8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .stat-value { font-size: 15px; font-weight: 700; color: #1a0c30; display: flex; align-items: baseline; gap: 4px; }
    .stat--dr   .stat-value { color: #dc2626; }
    .stat--cr   .stat-value { color: #16a34a; }
    .stat--net-dr .stat-value { color: #dc2626; }
    .stat--net-cr .stat-value { color: #16a34a; }
    .stat--net  .stat-value { color: #4c2480; }
    .stat--due  .stat-value { color: #f59e0b; }
    .stat--adv  .stat-value { color: #6b3fa0; }
    .stat-badge {
      font-size: 10px; font-weight: 600;
      padding: 1px 5px; border-radius: 3px;
    }
    .stat--net-dr .stat-badge { background: #fef2f2; color: #dc2626; }
    .stat--net-cr .stat-badge { background: #f0fdf4; color: #16a34a; }
    .stat--net    .stat-badge { background: #f8f3ff; color: #4c2480; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; }
    thead th {
      background: #f8f3ff; padding: 8px 10px;
      text-align: left; font-size: 10px; font-weight: 600;
      color: #4c2480; text-transform: uppercase; letter-spacing: 0.04em;
      border-bottom: 2px solid #d0b8f0;
    }
    thead th.num { text-align: right; }
    tbody td { padding: 7px 10px; border-bottom: 1px solid #f8f3ff; font-size: 11px; vertical-align: middle; }
    tbody td.num { text-align: right; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr.row-dr { background: #fef2f2; }
    tbody tr.row-cr { background: #f0fdf4; }
    .td-type { text-transform: capitalize; color: #623898; }
    .td-ref  { font-family: monospace; font-size: 11px; color: #381870; }
    .td-dr   { color: #dc2626; font-weight: 500; }
    .td-cr   { color: #16a34a; font-weight: 500; }
    .td-bal  { font-weight: 600; color: #1a0c30; }

    /* ── Footer ── */
    .footer {
      margin-top: 24px; padding-top: 12px;
      border-top: 1px solid #d0b8f0;
      font-size: 10px; color: #9870c8; text-align: center;
    }

    @media print {
      body { background: #fff; }
      .header,
      tbody tr.row-dr,
      tbody tr.row-cr,
      .stats .stat { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      ${sellerName ? `<div class="header-seller">${sellerName}</div>` : ""}
      <div class="header-label">${partyType} Ledger Statement</div>
      <div class="header-name">${party.name || ""}</div>
      ${party.code ? `<div class="header-meta">Code: ${party.code}</div>` : ""}
      ${party.address ? `<div class="header-meta">${party.address}</div>` : ""}
    </div>

    ${dateRangeHtml}

    <div class="stats">
      <div class="stat stat--dr">
        <div class="stat-label">${drLabel}</div>
        <div class="stat-value">Rs.${totalDr.toFixed(2)}</div>
      </div>
      <div class="stat stat--cr">
        <div class="stat-label">${crLabel}</div>
        <div class="stat-value">Rs.${totalCr.toFixed(2)}</div>
      </div>
      <div class="stat ${netClass}">
        <div class="stat-label">Net Balance</div>
        <div class="stat-value">
          Rs.${Math.abs(net).toFixed(2)}
          <span class="stat-badge">${netType}</span>
        </div>
      </div>
      ${extraStats}
    </div>

    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Reference</th>
          <th class="num">Dr</th>
          <th class="num">Cr</th>
          <th class="num">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#9870c8;">No entries found.</td></tr>'}
      </tbody>
    </table>

    <div class="footer">
      This is an automated statement${sellerName ? ` from ${sellerName}` : ""}. Please do not reply unless you have been asked to.
    </div>
  </div>
</body>
</html>`;
}

module.exports = { buildLedgerHtml };