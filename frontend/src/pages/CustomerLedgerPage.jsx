import { useEffect, useMemo, useState } from "react";
import { useSeoMeta } from "../utils/seo.js";
import { useParams } from "react-router-dom";
import PartyContactEmailModal from "../components/PartyContactEmailModal.jsx";
import { can } from "../utils/access.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { listCustomers, printCustomerLedger, sendCustomerLedgerEmail, getCustomer, updateCustomer } from "../services/customerService.js";
import { EMAIL_RE, customerToUpdatePayload } from "../utils/customerContactPayload.js";
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

export function CustomerLedgerReportContent({ embedded = false } = {}) {
  const { id: routeId } = useParams();
  const canView = can("CUSTOMERS", "VIEW");
  const canUpdateCustomer = can("CUSTOMERS", "UPDATE");
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState(routeId || "");
  const [doc, setDoc] = useState(null);
  const [sendContact, setSendContact] = useState({ open: false, customerName: "" });
  const [sendContactForm, setSendContactForm] = useState({ email: "", phone: "", phoneCountryCode: "+91" });
  const [savingSendContact, setSavingSendContact] = useState(false);

  useEffect(() => {
    setCustomerId(routeId || "");
  }, [routeId]);

  async function loadMasters() {
    const c = await listCustomers({ limit: 500 });
    if (c.status >= 200 && c.status < 300 && c.json?.ok) setCustomers(c.json?.data?.customers || []);
  }

  async function refresh(cid) {
    if (!cid) return;
    setBusy(true);
    const r = await printCustomerLedger(cid);
    if (r.status >= 200 && r.status < 300 && r.json?.ok) setDoc(r.json?.data || null);
    else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
    setBusy(false);
  }

  useEffect(() => {
    if (!canView) return;
    loadMasters();
  }, [canView]);

  useEffect(() => {
    if (!canView || !customerId) return;
    refresh(customerId);
  }, [canView, customerId]);

  useEffect(() => {
    if (!sendContact.open || !customerId) return;
    (async () => {
      const g = await getCustomer(customerId);
      if (g.status >= 200 && g.status < 300 && g.json?.ok) {
        const c = g.json?.data?.customer;
        setSendContactForm({
          email: c.email || "",
          phone: c.phone_number || "",
          phoneCountryCode: c.phone_country_code || "+91"
        });
      }
    })();
  }, [sendContact.open, customerId]);

  const customerDisplayName = useMemo(() => {
    const fromDoc = doc?.customer?.name;
    if (fromDoc) return fromDoc;
    const row = (customers || []).find((x) => String(x.id) === String(customerId));
    return row?.name || "";
  }, [doc, customers, customerId]);

  async function runSendLedgerEmail() {
    if (!customerId) {
      emitToast({ type: "warning", message: "Select a customer first." });
      return;
    }
    setEmailBusy(true);
    try {
      const r = await sendCustomerLedgerEmail(customerId);
      if (!(r.status >= 200 && r.status < 300 && r.json?.ok)) {
        if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
        return;
      }
      const results = r.json?.data?.results || [];
      const noEmail = results.filter((x) => x.status === "no_email");
      if (noEmail.length) {
        const row = noEmail[0];
        setSendContact({ open: true, customerName: row?.customerName || customerDisplayName });
        return;
      }
      const sent = results.filter((x) => x.status === "sent" || x.status === "sent_dry_run").length;
      const failed = results.filter((x) => x.status === "send_failed");
      if (sent) {
        const dry = results.some((x) => x.status === "sent_dry_run");
        emitToast({
          type: "success",
          message: dry ? "Ledger email would be sent (configure SMTP on server to deliver)." : "Customer ledger emailed."
        });
      }
      if (failed.length) emitToast({ type: "warning", message: failed[0]?.message || "Email could not be sent." });
    } finally {
      setEmailBusy(false);
    }
  }

  async function saveSendContactAndResend() {
    if (!customerId) return;
    if (!canUpdateCustomer) {
      emitToast({ type: "error", message: "You do not have permission to update customer contact." });
      return;
    }
    const e = String(sendContactForm.email || "").trim();
    if (!e || !EMAIL_RE.test(e)) {
      emitToast({ type: "error", message: "Enter a valid email address." });
      return;
    }
    const digits = String(sendContactForm.phone || "").replace(/\D/g, "");
    if (digits) {
      const cc = String(sendContactForm.phoneCountryCode || "+91");
      if (cc === "+91" && !/^\d{10}$/.test(digits)) {
        emitToast({ type: "error", message: "Phone must be 10 digits for +91 (or clear phone if not needed)." });
        return;
      }
    }
    setSavingSendContact(true);
    try {
      const g = await getCustomer(customerId);
      if (!(g.status >= 200 && g.json?.ok)) {
        if (g.status !== 401) emitToast({ type: "error", message: parseApiError(g) });
        return;
      }
      const c = g.json?.data?.customer;
      const u = await updateCustomer(
        customerId,
        customerToUpdatePayload(c, {
          email: e,
          phoneNumber: digits,
          phoneCountryCode: sendContactForm.phoneCountryCode || "+91"
        })
      );
      if (!(u.status >= 200 && u.json?.ok)) {
        if (u.status !== 401) emitToast({ type: "error", message: parseApiError(u) });
        return;
      }
      setSendContact({ open: false, customerName: "" });
      await loadMasters();
      await refresh(customerId);
      await runSendLedgerEmail();
    } finally {
      setSavingSendContact(false);
    }
  }

  const entries = useMemo(() => doc?.entries || [], [doc]);
  if (!canView) return <ReportDenied title="Customer Ledger" message="You don’t have permission to view this report." />;

  const header = embedded ? null : (
    <ReportPageIntro title="Customer Ledger" subtitle="Dr/Cr running statement with invoices, payments, advances and returns." />
  );

  const body = (
    <div className={embedded ? "" : "pageWrap"}>
      {header}
      <ReportCard busy={busy}>
        <ReportToolbar>
          <ReportToolbarFilters>
            <label className="rptToolbarHint" htmlFor="customer-ledger-select">Customer</label>
            <select id="customer-ledger-select" className="rptSearchInput" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select customer</option>
              {(customers || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </ReportToolbarFilters>
          <ReportToolbarPrim>
            <button
              type="button"
              className="sfmBtnGhost"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              disabled={!customerId || emailBusy || busy}
              onClick={runSendLedgerEmail}
            >
              <IconEmail aria-hidden />
              {emailBusy ? "Sending…" : "Email ledger PDF"}
            </button>
          </ReportToolbarPrim>
        </ReportToolbar>
        <div style={{ padding: 12 }}>
          {doc?.summary ? (
            <div className="raSub" style={{ marginBottom: 8 }}>
              Net: {fmtCurrency(doc.summary.netBalance || 0)} | Due: {fmtCurrency(doc.summary.balanceDue || 0)}{" "}
              | Advance: {fmtCurrency(doc.summary.advanceAmount || 0)}
            </div>
          ) : null}
          <ReportTableScroll>
            <table className="rptBatchTable rptBatchTable--ledger">
              <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th className="rptNum">Dr</th><th className="rptNum">Cr</th><th className="rptNum">Balance</th></tr></thead>
              <tbody>
                {entries.map((e, i) => {
                  const isDr = Number(e.debit  || 0) > 0;
                  const isCr = Number(e.credit || 0) > 0;
                  return (
                    <tr key={`${e.date}-${i}`} className={isDr ? "vlRowDr" : isCr ? "vlRowCr" : ""}>
                      <td>{fmtDateIndian(e.date)}</td>
                      <td className="vlTypeCell">{e.type_label || String(e.type || "").replace(/_/g, " ")}</td>
                      <td className="vlRefCell">{e.reference || "-"}</td>
                      <td className="rptNum vlDrCell">{isDr ? fmtMoney(e.debit)  : ""}</td>
                      <td className="rptNum vlCrCell">{isCr ? fmtMoney(e.credit) : ""}</td>
                      <td className="rptNum vlBalCell">{fmtMoney(e.balance || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ReportTableScroll>
        </div>
      </ReportCard>
    </div>
  );

  const modal = (
    <PartyContactEmailModal
        open={sendContact.open}
        title="Customer contact for email"
        icon={<IconEmail />}
        partySubtitle={sendContact.customerName ? `Customer: ${sendContact.customerName}` : ""}
        permissionWarning={!canUpdateCustomer ? "You need permission to update customers to add email here." : undefined}
        email={sendContactForm.email}
        phone={sendContactForm.phone}
        phoneCountryCode={sendContactForm.phoneCountryCode}
        onEmailChange={(v) => setSendContactForm((p) => ({ ...p, email: v }))}
        onPhoneChange={(v) => setSendContactForm((p) => ({ ...p, phone: v }))}
        onPhoneCountryChange={(v) => setSendContactForm((p) => ({ ...p, phoneCountryCode: v }))}
        showPhoneFields
        canSave={canUpdateCustomer}
        saving={savingSendContact}
        onClose={() => setSendContact({ open: false, customerName: "" })}
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

export default function CustomerLedgerPage() {
  useSeoMeta({ title: "Customer Ledger" });
  return <CustomerLedgerReportContent embedded={false} />;
}
