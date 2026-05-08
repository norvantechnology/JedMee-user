import { useEffect, useMemo, useState } from "react";
import { useSeoMeta } from "../utils/seo.js";
import { useParams } from "react-router-dom";
import PartyContactEmailModal from "../components/PartyContactEmailModal.jsx";
import { can } from "../utils/access.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { listVendors, updateVendor } from "../services/vendorService.js";
import { getVendorLedger, sendVendorLedgerEmail } from "../services/purchaseService.js";
import { EMAIL_RE } from "../utils/customerContactPayload.js";
import { fmtDateIndian, fmtMoney, fmtCurrency } from "../utils/format.js";
import {
  ReportShell,
  ReportDenied,
  ReportPageIntro,
  ReportCard,
  ReportToolbar,
  ReportToolbarFilters,
  ReportToolbarPrim,
  ReportTableScroll
} from "../components/reports/index.js";
import { IconEmail } from "../components/TableActionKit.jsx";
import { Printer, Store } from "../components/ui/AppIcons.jsx";
import "./VendorLedgerPage.css";

export function VendorLedgerReportContent({ embedded = false } = {}) {
  const { id: routeId } = useParams();
  const canView = can("VENDORS", "VIEW");
  const canUpdateVendor = can("VENDORS", "UPDATE");
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState(routeId || "");
  const [doc, setDoc] = useState(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [sendContact, setSendContact] = useState({ open: false, vendorName: "" });
  const [sendContactForm, setSendContactForm] = useState({ email: "" });
  const [savingSendContact, setSavingSendContact] = useState(false);

  useEffect(() => setVendorId(routeId || ""), [routeId]);

  async function loadMasters() {
    const c = await listVendors({ limit: 500 });
    if (c.status >= 200 && c.status < 300 && c.json?.ok) setVendors(c.json?.data?.vendors || []);
  }

  async function refresh(id) {
    if (!id) return;
    setBusy(true);
    const r = await getVendorLedger(id);
    if (r.status >= 200 && r.status < 300 && r.json?.ok) setDoc(r.json?.data || null);
    else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
    setBusy(false);
  }

  useEffect(() => { if (canView) loadMasters(); }, [canView]);
  useEffect(() => { if (canView && vendorId) refresh(vendorId); }, [canView, vendorId]);

  const vendorDisplayName = useMemo(() => {
    const fromDoc = doc?.vendor?.name;
    if (fromDoc) return fromDoc;
    const row = (vendors || []).find((x) => String(x.id) === String(vendorId));
    return row?.name || "";
  }, [doc, vendors, vendorId]);

  const allEntries = useMemo(() => doc?.entries || [], [doc]);

  const entries = useMemo(() => {
    let list = allEntries;
    if (dateFrom) list = list.filter((e) => e.date >= dateFrom);
    if (dateTo) list = list.filter((e) => e.date <= dateTo);
    return list;
  }, [allEntries, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const totalDr = entries.reduce((s, e) => s + Number(e.debit || 0), 0);
    const totalCr = entries.reduce((s, e) => s + Number(e.credit || 0), 0);
    const net = doc?.summary?.net_balance || 0;
    const netType = doc?.summary?.net_balance_type || "NIL";
    return { totalDr, totalCr, net, netType };
  }, [entries, doc]);

  function buildPrintHtml() {
    const vendor = doc?.vendor || {};
    const netClass = stats.net > 0 ? "stat--net-dr" : stats.net < 0 ? "stat--net-cr" : "stat--net";
    const netType = stats.netType;
    const dateRangeHtml = (dateFrom || dateTo)
      ? `<div class="date-range">Period: <strong>${dateFrom || "—"}</strong> to <strong>${dateTo || "—"}</strong></div>`
      : "";
    const rows = entries.map((e) => {
      const isDr = Number(e.debit || 0) > 0;
      const isCr = Number(e.credit || 0) > 0;
      return `<tr class="${isDr ? "row-dr" : isCr ? "row-cr" : ""}">
        <td>${String(e.date || "").slice(0, 10)}</td>
        <td class="td-type">${String(e.type || "").replace(/_/g, " ")}</td>
        <td class="td-ref">${e.reference || "—"}</td>
        <td class="num td-dr">${isDr ? fmtCurrency(e.debit) : ""}</td>
        <td class="num td-cr">${isCr ? fmtCurrency(e.credit) : ""}</td>
        <td class="num td-bal">${fmtCurrency(e.balance || 0)}</td>
      </tr>`;
    }).join("\n");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Supplier Ledger — ${vendor.name || ""}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; background: #fff; }
    .page { padding: 32px; max-width: 820px; margin: 0 auto; }
    .header { background: linear-gradient(135deg,#6c3fc5 0%,#8b5cf6 100%); color: #fff; padding: 20px 24px; border-radius: 8px; margin-bottom: 18px; }
    .header-label { font-size: 11px; opacity: 0.7; margin-bottom: 3px; }
    .header-name  { font-size: 20px; font-weight: 700; margin-bottom: 3px; }
    .header-meta  { font-size: 11px; opacity: 0.7; margin-top: 2px; }
    .date-range { font-size: 11px; color: #6b7280; margin-bottom: 14px; padding: 6px 12px; background: #f5f3ff; border-radius: 4px; border-left: 3px solid #8b5cf6; }
    .stats { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
    .stat { flex: 1; min-width: 110px; padding: 10px 14px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fafafa; }
    .stat-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .stat-value { font-size: 15px; font-weight: 700; display: flex; align-items: baseline; gap: 4px; }
    .stat--dr .stat-value { color: #dc2626; }
    .stat--cr .stat-value { color: #16a34a; }
    .stat--net-dr .stat-value { color: #dc2626; }
    .stat--net-cr .stat-value { color: #16a34a; }
    .stat--net .stat-value { color: #6b7280; }
    .stat-badge { font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 3px; }
    .stat--net-dr .stat-badge { background: #fee2e2; color: #dc2626; }
    .stat--net-cr .stat-badge { background: #dcfce7; color: #16a34a; }
    .stat--net    .stat-badge { background: #f3f4f6; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #f4f4f6; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid #e5e7eb; }
    thead th.num { text-align: right; }
    tbody td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 11px; }
    tbody td.num { text-align: right; }
    tbody tr.row-dr { background: #fff8f8; }
    tbody tr.row-cr { background: #f0fdf4; }
    .td-type { text-transform: capitalize; color: #555; }
    .td-ref  { font-family: monospace; font-size: 11px; }
    .td-dr   { color: #dc2626; font-weight: 500; }
    .td-cr   { color: #16a34a; font-weight: 500; }
    .td-bal  { font-weight: 600; }
    .footer  { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
    @media print {
      .header, tbody tr.row-dr, tbody tr.row-cr, .stats .stat { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-label">Supplier Ledger Statement</div>
      <div class="header-name">${vendor.name || ""}</div>
      ${vendor.code ? `<div class="header-meta">Code: ${vendor.code}</div>` : ""}
      ${vendor.address ? `<div class="header-meta">${vendor.address}</div>` : ""}
    </div>
    ${dateRangeHtml}
    <div class="stats">
      <div class="stat stat--dr">
        <div class="stat-label">Total Purchases</div>
        <div class="stat-value">${fmtCurrency(stats.totalDr)}</div>
      </div>
      <div class="stat stat--cr">
        <div class="stat-label">Total Payments</div>
        <div class="stat-value">${fmtCurrency(stats.totalCr)}</div>
      </div>
      <div class="stat ${netClass}">
        <div class="stat-label">Net Balance</div>
        <div class="stat-value">${fmtCurrency(Math.abs(stats.net))}<span class="stat-badge">${netType}</span></div>
      </div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th class="num">Dr</th><th class="num">Cr</th><th class="num">Balance</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#9ca3af;">No entries found.</td></tr>'}</tbody>
    </table>
    <div class="footer">This is an automated statement. Please do not reply unless you have been asked to.</div>
  </div>
</body>
</html>`;
  }

  function handlePrint() {
    if (!vendorId || !doc) {
      emitToast({ type: "warning", message: "Select a supplier first." });
      return;
    }
    const w = window.open("", "_blank", "width=960,height=720");
    if (!w) { emitToast({ type: "error", message: "Popup blocked. Allow popups to print." }); return; }
    w.document.write(buildPrintHtml());
    w.document.close();
    w.focus();
    w.print();
  }

  async function runSendLedgerEmail() {
    if (!vendorId) {
      emitToast({ type: "warning", message: "Select a supplier first." });
      return;
    }
    setEmailBusy(true);
    try {
      const r = await sendVendorLedgerEmail(vendorId);
      if (!(r.status >= 200 && r.status < 300 && r.json?.ok)) {
        if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
        return;
      }
      const results = r.json?.data?.results || [];
      const noEmail = results.filter((x) => x.status === "no_email");
      if (noEmail.length) {
        const row = noEmail[0];
        setSendContactForm({ email: doc?.vendor?.email || "" });
        setSendContact({ open: true, vendorName: row?.vendorName || vendorDisplayName });
        return;
      }
      const sent = results.filter((x) => x.status === "sent" || x.status === "sent_dry_run").length;
      const failed = results.filter((x) => x.status === "send_failed");
      if (sent) {
        const dry = results.some((x) => x.status === "sent_dry_run");
        emitToast({
          type: "success",
          message: dry
            ? "Ledger email would be sent (configure SMTP on server to deliver)."
            : "Supplier ledger emailed successfully."
        });
      }
      if (failed.length) emitToast({ type: "warning", message: failed[0]?.message || "Email could not be sent." });
    } finally {
      setEmailBusy(false);
    }
  }

  async function saveSendContactAndResend() {
    if (!vendorId) return;
    if (!canUpdateVendor) {
      emitToast({ type: "error", message: "You do not have permission to update supplier contact." });
      return;
    }
    const e = String(sendContactForm.email || "").trim();
    if (!e || !EMAIL_RE.test(e)) {
      emitToast({ type: "error", message: "Enter a valid email address." });
      return;
    }
    setSavingSendContact(true);
    try {
      const u = await updateVendor(vendorId, { email: e });
      if (!(u.status >= 200 && u.json?.ok)) {
        if (u.status !== 401) emitToast({ type: "error", message: parseApiError(u) });
        return;
      }
      setSendContact({ open: false, vendorName: "" });
      await refresh(vendorId);
      await runSendLedgerEmail();
    } finally {
      setSavingSendContact(false);
    }
  }

  if (!canView) return <ReportDenied title="Supplier Ledger" message="You don't have permission to view this report." />;

  const hasFilters = dateFrom || dateTo;

  const body = (
    <div className={embedded ? "" : "pageWrap"}>
      {embedded ? null : (
        <ReportPageIntro title="Supplier Ledger" subtitle="Purchase, payment and return entries with running balance." />
      )}
      <ReportCard busy={busy}>
        <ReportToolbar>
          <ReportToolbarFilters>
            <label className="rptToolbarHint" htmlFor="vl-vendor">Supplier</label>
            <select
              id="vl-vendor"
              className="rptSearchInput"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">— Select supplier —</option>
              {(vendors || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label className="rptToolbarHint" htmlFor="vl-from">From</label>
            <input
              id="vl-from"
              type="date"
              className="rptSearchInput vlDateInput"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <label className="rptToolbarHint" htmlFor="vl-to">To</label>
            <input
              id="vl-to"
              type="date"
              className="rptSearchInput vlDateInput"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
            {hasFilters && (
              <button
                type="button"
                className="vlClearBtn"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                title="Clear date filters"
              >
                ✕ Clear
              </button>
            )}
          </ReportToolbarFilters>
          <ReportToolbarPrim>
            <button
              type="button"
              className="sfmBtnGhost vlActionBtn"
              disabled={!vendorId || busy}
              onClick={handlePrint}
            >
              <Printer size={15} aria-hidden="true" />
              <span>Print PDF</span>
            </button>
            <button
              type="button"
              className="sfmBtnGhost vlActionBtn"
              disabled={!vendorId || emailBusy || busy}
              onClick={runSendLedgerEmail}
            >
              <IconEmail aria-hidden />
              <span>{emailBusy ? "Sending…" : "Email PDF"}</span>
            </button>
          </ReportToolbarPrim>
        </ReportToolbar>

        {/* Summary stats */}
        {doc && vendorId ? (
          <div className="vlStats">
            <div className="vlStat vlStat--dr">
              <span className="vlStatLabel">Total Purchases</span>
              <span className="vlStatValue">{fmtCurrency(stats.totalDr)}</span>
            </div>
            <div className="vlStat vlStat--cr">
              <span className="vlStatLabel">Total Payments</span>
              <span className="vlStatValue">{fmtCurrency(stats.totalCr)}</span>
            </div>
            <div className={`vlStat vlStat--net ${stats.net > 0 ? "vlStat--netDr" : stats.net < 0 ? "vlStat--netCr" : ""}`}>
              <span className="vlStatLabel">Net Balance</span>
              <span className="vlStatValue">
                {fmtCurrency(Math.abs(stats.net))}
                <span className="vlStatBadge">{stats.netType}</span>
              </span>
            </div>
            {hasFilters && (
              <div className="vlStat vlStat--info">
                <span className="vlStatLabel">Filtered Entries</span>
                <span className="vlStatValue">{entries.length}</span>
              </div>
            )}
          </div>
        ) : null}

        {/* Empty state */}
        {!vendorId && !busy ? (
          <div className="vlEmpty">
            <div className="vlEmptyIcon"><Store size={40} aria-hidden="true" /></div>
            <p className="vlEmptyTitle">Select a supplier</p>
            <p className="vlEmptyHint">Choose a supplier from the dropdown above to view their ledger.</p>
          </div>
        ) : null}

        {/* Table */}
        {vendorId ? (
          <div className="vlTableWrap">
            <ReportTableScroll>
              <table className="rptBatchTable rptBatchTable--ledger">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Reference</th>
                    <th className="rptNum">Dr</th>
                    <th className="rptNum">Cr</th>
                    <th className="rptNum">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 && !busy ? (
                    <tr>
                      <td colSpan={6} className="vlNoRows">
                        {hasFilters ? "No entries in this date range." : "No ledger entries found."}
                      </td>
                    </tr>
                  ) : null}
                  {entries.map((e, i) => {
                    const isDr = Number(e.debit || 0) > 0;
                    const isCr = Number(e.credit || 0) > 0;
                    return (
                      <tr
                        key={`${e.date}-${i}`}
                        className={isDr ? "vlRowDr" : isCr ? "vlRowCr" : ""}
                      >
                        <td>{fmtDateIndian(e.date)}</td>
                        <td className="vlTypeCell">{String(e.type || "").replace(/_/g, " ")}</td>
                        <td className="vlRefCell">{e.reference || "—"}</td>
                        <td className="rptNum vlDrCell">
                          {isDr ? fmtMoney(e.debit) : ""}
                        </td>
                        <td className="rptNum vlCrCell">
                          {isCr ? fmtMoney(e.credit) : ""}
                        </td>
                        <td className="rptNum vlBalCell">
                          {fmtMoney(e.balance || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ReportTableScroll>
          </div>
        ) : null}
      </ReportCard>
    </div>
  );

  const modal = (
    <PartyContactEmailModal
      open={sendContact.open}
      title="Supplier contact for email"
      icon={<IconEmail />}
      partySubtitle={sendContact.vendorName ? `Supplier: ${sendContact.vendorName}` : ""}
      permissionWarning={
        !canUpdateVendor
          ? "You need permission to update suppliers to add email here."
          : undefined
      }
      email={sendContactForm.email}
      onEmailChange={(v) => setSendContactForm((p) => ({ ...p, email: v }))}
      canSave={canUpdateVendor}
      saving={savingSendContact}
      onClose={() => setSendContact({ open: false, vendorName: "" })}
      onSave={saveSendContactAndResend}
    />
  );

  const tree = (
    <>
      {body}
      {modal}
    </>
  );

  return embedded ? tree : <ReportShell>{tree}</ReportShell>;
}

export default function VendorLedgerPage() {
  useSeoMeta({ title: "Vendor Ledger" });
  return <VendorLedgerReportContent embedded={false} />;
}
