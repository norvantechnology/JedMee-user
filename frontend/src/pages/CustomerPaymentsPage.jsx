import AmountInput from "../components/ui/AmountInput.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { fmtMoney, fmtCurrency } from "../utils/format.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "../layouts/AppShell.jsx";
import CommonTable from "../components/CommonTable.jsx";
import CommonModal, {
  ModalFormBody,
  ModalFormCheckGroup,
  ModalFormField,
  ModalFormGrid,
  ModalFormPanel,
  ModalFormPanelBody,
  ModalFormPanelHead,
  ModalFormSectionTitle,
  ModalFormShell
} from "../components/CommonModal.jsx";
import CommonDatePicker from "../components/CommonDatePicker.jsx";
import { readAuth } from "../services/authStorage.js";
import { can } from "../utils/access.js";
import { listCustomers } from "../services/customerService.js";
import { createCustomerPayment, listCustomerPayments, listSalesInvoices } from "../services/salesService.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import MasterSelectWithCreate from "../components/MasterSelectWithCreate.jsx";
import ModalFooterShell from "../components/ui/ModalFooterShell.jsx";
import { AppButton } from "../components/ui/buttons.jsx";
import { IconAdvancePayment, IconWallet } from "../components/ui/AppIcons.jsx";
import { todayYmdLocal } from "../utils/date.js";

export default function CustomerPaymentsPage() {
  useSeoMeta({ title: "Customer Payments" });
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = readAuth();
  const user = auth?.user || null;
  const canView = can("CUSTOMER_PAYMENTS", "VIEW");
  const canAdd = can("CUSTOMER_PAYMENTS", "ADD");
  const [busy, setBusy] = useState(false);
  const [paySubmitted, setPaySubmitted] = useState(false);
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) setPaySubmitted(false); }, [open]);
  const [paymentKind, setPaymentKind] = useState("INVOICE");
  const advanceCalcGenRef = useRef(0);
  const [form, setForm] = useState({ customerId: "", salesInvoiceId: "", paymentDate: todayYmdLocal(), amount: "", paymentMode: "CASH", referenceNumber: "", notes: "", useAdvanceFirst: true });
  const [advanceHint, setAdvanceHint] = useState({ available: 0, apply: 0, remaining: 0 });
  const selectedFormInvoice = useMemo(
    () => (invoices || []).find((x) => String(x.id) === String(form.salesInvoiceId || "")) || null,
    [invoices, form.salesInvoiceId]
  );

  /** Invoices that can still receive payments (confirmed, not fully paid). */
  const invoicesPayable = useMemo(
    () =>
      (invoices || []).filter((x) => {
        if (String(x.status || "").toUpperCase() !== "CONFIRMED") return false;
        const ps = String(x.payment_status || "").toUpperCase();
        if (ps !== "UNPAID" && ps !== "PARTIAL") return false;
        return Number(x.balance_due || 0) > 0.0001;
      }),
    [invoices]
  );

  async function refresh() {
    setBusy(true);
    const [p, c, s] = await Promise.all([
      listCustomerPayments({
        search,
        customerId: customerFilter || undefined,
        salesInvoiceId: invoiceFilter || undefined,
        paymentMode: modeFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      }),
      listCustomers({ limit: 500 }),
      listSalesInvoices({ limit: 500 })
    ]);
    if (p.status >= 200 && p.status < 300 && p.json?.ok) setRows(p.json?.data?.items || []);
    if (c.status >= 200 && c.status < 300 && c.json?.ok) setCustomers(c.json?.data?.customers || []);
    if (s.status >= 200 && s.status < 300 && s.json?.ok) setInvoices((s.json?.data?.items || []).filter((x) => String(x.status) === "CONFIRMED"));
    setBusy(false);
  }
  useEffect(() => { if (canView) refresh(); }, [canView, search, customerFilter, invoiceFilter, modeFilter, dateFrom, dateTo]);

  async function refreshCustomersOnly() {
    const c = await listCustomers({ limit: 500 });
    if (c.status >= 200 && c.status < 300 && c.json?.ok) setCustomers(c.json?.data?.customers || []);
  }

  // Dashboard quick action: `/customer-payments?new=1` auto-opens create modal.
  useEffect(() => {
    if (!canAdd) return;
    if (String(searchParams.get("new") || "") !== "1") return;
    setPaymentKind("INVOICE");
    setForm({ customerId: "", salesInvoiceId: "", paymentDate: todayYmdLocal(), amount: "", paymentMode: "CASH", referenceNumber: "", notes: "", useAdvanceFirst: true });
    setOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("new");
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdd, searchParams]);

  useEffect(() => {
    const invoiceId = String(form.salesInvoiceId || "");
    const customerId = String(form.customerId || "");
    const reqId = ++advanceCalcGenRef.current;
    if (!invoiceId || !customerId) {
      setAdvanceHint({ available: 0, apply: 0, remaining: Number(form.amount || 0) });
      return;
    }
    const inv = invoices.find((x) => String(x.id) === invoiceId);
    const balance = Number(inv?.balance_due || 0);
    (async () => {
      const p = await listCustomerPayments({ customerId, limit: 500 });
      if (reqId !== advanceCalcGenRef.current) return;
      const list = p.status >= 200 && p.status < 300 && p.json?.ok ? p.json?.data?.items || [] : [];
      const available = list.reduce((s, x) => {
        const t = String(x.allocation_type || x.allocation_type_resolved || "").toUpperCase();
        return t === "ON_ACCOUNT" ? s + Number(x.amount || 0) : s;
      }, 0);
      const apply = Math.min(balance, available);
      const remaining = Math.max(0, balance - apply);
      setAdvanceHint({ available, apply, remaining });
      setForm((prev) => {
        if (reqId !== advanceCalcGenRef.current) return prev;
        return { ...prev, amount: Number(prev.useAdvanceFirst ? remaining : balance).toFixed(2) };
      });
    })();
  }, [form.salesInvoiceId, form.customerId, invoices]);

  useEffect(() => {
    if (!open || !form.salesInvoiceId) return;
    const ok = invoicesPayable.some(
      (x) =>
        String(x.id) === String(form.salesInvoiceId) &&
        (!form.customerId || String(x.customer_id) === String(form.customerId))
    );
    if (!ok) setForm((p) => ({ ...p, salesInvoiceId: "", amount: "" }));
  }, [open, form.customerId, form.salesInvoiceId, invoicesPayable]);

  function closePaymentModal() {
    if (busy) return;
    setOpen(false);
  }

  if (!canView) {
    return <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user"><div className="pageWrap"><div className="pageCard"><div className="raTitle">{NAV_LABELS.customerPayments}</div><div className="raSub">You do not have permission to view customer payments.</div></div></div></AppShell>;
  }

  return (
    <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user">
      <div className="pageWrap">
        <div className="raTop"><div><div className="raTitle">{NAV_LABELS.customerPayments}</div><div className="raSub">Track and record customer payments.</div></div></div>
        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            compact
            countText={busy ? "Loading..." : `${rows.length} payments`}
            search={search}
            onSearchChange={setSearch}
            filters={[
              { id: "customer", label: "Customer", value: customerFilter, onChange: setCustomerFilter, options: [{ value: "", label: "All customers" }, ...customers.map((c) => ({ value: c.id, label: c.name }))] },
              { id: "invoice", label: "Invoice", value: invoiceFilter, onChange: setInvoiceFilter, options: [{ value: "", label: "All invoices" }, ...invoices.map((x) => ({ value: x.id, label: x.invoice_number }))] },
              { id: "mode", label: "Mode", value: modeFilter, onChange: setModeFilter, options: [{ value: "", label: "All modes" }, { value: "CASH", label: "Cash" }, { value: "CHEQUE", label: "Cheque" }, { value: "NEFT", label: "NEFT" }, { value: "UPI", label: "UPI" }, { value: "CARD", label: "Card" }, { value: "OTHER", label: "Other" }] },
              { id: "from", label: "From", type: "date", value: dateFrom, onChange: setDateFrom },
              { id: "to", label: "To", type: "date", value: dateTo, onChange: setDateTo }
            ]}
            primaryAction={canAdd ? { label: "Record payment", onClick: () => {
              setAdvanceHint({ available: 0, apply: 0, remaining: 0 });
              setPaymentKind("INVOICE");
              setForm({ customerId: "", salesInvoiceId: "", paymentDate: todayYmdLocal(), amount: "", paymentMode: "CASH", referenceNumber: "", notes: "", useAdvanceFirst: true });
              setOpen(true);
            } } : null}
            rows={rows}
            getRowId={(r) => r.id}
            columns={[
              { id: "payment_date", header: "Date", render: (r) => String(r.payment_date || "").slice(0, 10) },
              { id: "customer_name", header: "Customer", render: (r) => r.customer_name || "" },
              { id: "invoice_number", header: "Invoice", render: (r) => r.invoice_number || (String(r.allocation_type || r.allocation_type_resolved || "").toUpperCase() === "ON_ACCOUNT" ? "On Account" : "") },
              {
                id: "allocation_type",
                header: "Kind",
                sortable: false,
                render: (r) => {
                  const t = String(r.allocation_type || r.allocation_type_resolved || "").toUpperCase();
                  if (t === "ON_ACCOUNT") return <span style={{ fontWeight: 800, color: "var(--color-primary)" }}>Advance</span>;
                  return <span style={{ color: "var(--color-text-3)" }}>Invoice</span>;
                }
              },
              { id: "amount", header: "Amount", align: "right", render: (r) => fmtMoney(r.amount || 0) },
              { id: "payment_mode", header: "Mode", render: (r) => r.payment_mode || "" },
              { id: "reference_number", header: "Reference", render: (r) => r.reference_number || "" },
              { id: "notes", header: "Notes", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{r.notes || ""}</span> },
              { id: "created_at", header: "Created", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{String(r.created_at || "").slice(0, 10)}</span> }
            ]}
          />
        </div>
      </div>

      <CommonModal
        open={open}
        title="Record Customer Payment"
        subtitle={paymentKind === "ON_ACCOUNT" ? "Advance payment" : "Invoice payment"}
        icon={paymentKind === "ON_ACCOUNT" ? <IconAdvancePayment /> : <IconWallet />}
        onClose={closePaymentModal}
        loading={busy}
        loadingText="Saving payment…"
        footer={
          <ModalFooterShell>
            <AppButton variant="secondary" type="button" onClick={closePaymentModal} disabled={busy}>
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              type="button"
              disabled={busy}
              onClick={async () => {
                setPaySubmitted(true);
                const needAmount = paymentKind === "ON_ACCOUNT" || !form.salesInvoiceId;
                if (!form.customerId || (needAmount && !(Number(form.amount) > 0))) return;
                setBusy(true);
                const payload = { ...form, clientToday: todayYmdLocal() };
                if (paymentKind === "ON_ACCOUNT") payload.salesInvoiceId = "";
                const r = await createCustomerPayment(payload);
                if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                  setOpen(false);
                  await refresh();
                } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                setBusy(false);
              }}
            >
              {busy ? <InlineButtonProgress label="Working..." /> : "Record Payment"}
            </AppButton>
          </ModalFooterShell>
        }
      >
        <ModalFormShell>
          <ModalFormBody>
            <ModalFormPanel aria-label="Payment">
              <ModalFormPanelHead>
                <ModalFormSectionTitle kicker="Payment" />
                <div className="mfzHeadRight">
                  <button
                    type="button"
                    className={`mfzBtn appBtn appBtn_sm ${paymentKind === "INVOICE" ? "appBtn_primary" : "appBtn_secondary"}`}
                    onClick={() => setPaymentKind("INVOICE")}
                  >
                    Receive Payment
                  </button>
                  <button
                    type="button"
                    className={`mfzBtn appBtn appBtn_sm ${paymentKind === "ON_ACCOUNT" ? "appBtn_primary" : "appBtn_secondary"}`}
                    onClick={() => {
                      setPaymentKind("ON_ACCOUNT");
                      setForm((p) => ({ ...p, salesInvoiceId: "", useAdvanceFirst: false }));
                    }}
                  >
                    Record Advance
                  </button>
                </div>
              </ModalFormPanelHead>
              <ModalFormPanelBody>
                <ModalFormGrid>
                  <ModalFormField span={12} label="Customer" required error={paySubmitted && !form.customerId ? "Customer is required." : null}>
                    <MasterSelectWithCreate
                      kind="customer"
                      selectClassName="mfzInput"
                      value={form.customerId}
                      onChange={(v) => {
                        setPaySubmitted(false);
                        setForm((p) => {
                          const next = { ...p, customerId: v };
                          if (p.salesInvoiceId) {
                            const inv = (invoices || []).find((x) => String(x.id) === String(p.salesInvoiceId));
                            const stillOk =
                              inv &&
                              String(inv.customer_id) === String(v) &&
                              invoicesPayable.some((x) => String(x.id) === String(p.salesInvoiceId));
                            if (!stillOk) {
                              next.salesInvoiceId = "";
                              next.amount = "";
                            }
                          }
                          return next;
                        });
                      }}
                      onListsRefresh={refreshCustomersOnly}
                      placeholder="Select customer"
                      options={customers.map((c) => ({ value: c.id, label: c.name }))}
                    />
                  </ModalFormField>

                  <ModalFormField span={12} label="Invoice">
                    <select
                      className="mfzInput"
                      value={form.salesInvoiceId}
                      disabled={paymentKind === "ON_ACCOUNT"}
                      onChange={(e) => {
                        const invoiceId = e.target.value;
                        const inv = (invoicesPayable || []).find((x) => String(x.id) === String(invoiceId));
                        const balance = Number(inv?.balance_due || 0);
                        setForm((p) => ({
                          ...p,
                          salesInvoiceId: invoiceId,
                          amount: Number(p.useAdvanceFirst ? Math.max(0, balance - Number(advanceHint.apply || 0)) : balance).toFixed(2)
                        }));
                      }}
                    >
                      <option value="">On Account / Advance</option>
                      {invoicesPayable
                        .filter((x) => !form.customerId || String(x.customer_id) === String(form.customerId))
                        .map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.invoice_number} (Bal {fmtCurrency(inv.balance_due || 0)})
                          </option>
                        ))}
                    </select>
                  </ModalFormField>

                  {form.salesInvoiceId ? (
                    <ModalFormCheckGroup>
                      <label className="mfzCheck">
                        <input
                          type="checkbox"
                          checked={Boolean(form.useAdvanceFirst)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const balance = Number(selectedFormInvoice?.balance_due || 0);
                            setForm((p) => ({
                              ...p,
                              useAdvanceFirst: checked,
                              amount: Number(checked ? advanceHint.remaining : balance).toFixed(2)
                            }));
                          }}
                        />
                        <span>Use customer advance first</span>
                      </label>
                    </ModalFormCheckGroup>
                  ) : null}

                  {form.salesInvoiceId ? (
                    <ModalFormField span={12} label={false}>
                      <div
                        style={{
                          border: "1px solid var(--color-border)",
                          borderRadius: 10,
                          padding: 10,
                          background: "var(--color-bg-2)"
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Summary</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-3)", display: "grid", gap: 2 }}>
                          <div>Due: {fmtCurrency(selectedFormInvoice?.balance_due || 0)}</div>
                          <div>Advance used: {fmtCurrency(form.useAdvanceFirst ? advanceHint.apply || 0 : 0)}</div>
                          <div>
                            <strong>Collect now: {fmtCurrency(form.useAdvanceFirst ? advanceHint.remaining || 0 : form.amount || 0)}</strong>
                          </div>
                        </div>
                      </div>
                    </ModalFormField>
                  ) : null}

                  <ModalFormField span={12} label="Date" required>
                    <CommonDatePicker value={form.paymentDate} onChange={(v) => setForm((p) => ({ ...p, paymentDate: v }))} ariaLabel="Payment date" />
                  </ModalFormField>

                  <ModalFormField
                    span={12}
                    label="Cash received now"
                    required
                    error={
                      paySubmitted && (paymentKind === "ON_ACCOUNT" || !form.salesInvoiceId) && !(Number(form.amount) > 0) ? "Amount is required." : null
                    }
                    hint={
                      form.salesInvoiceId && form.useAdvanceFirst
                        ? `If advance fully covers the due, cash can stay ${fmtCurrency(0)}.`
                        : null
                    }
                  >
                    <AmountInput
                      className={`mfzInput${paySubmitted && (paymentKind === "ON_ACCOUNT" || !form.salesInvoiceId) && !(Number(form.amount) > 0) ? " mfzInput_err" : ""}`}
                      value={String(form.amount ?? "")}
                      disabled={Boolean(form.salesInvoiceId) && Boolean(form.useAdvanceFirst)}
                      onChange={(raw) => setForm((p) => ({ ...p, amount: raw }))}
                      inputMode="decimal"
                    />
                  </ModalFormField>

                  <ModalFormField span={12} label="Mode">
                    <select className="mfzInput" value={form.paymentMode} onChange={(e) => setForm((p) => ({ ...p, paymentMode: e.target.value }))}>
                      <option>CASH</option>
                      <option>CHEQUE</option>
                      <option>NEFT</option>
                      <option>UPI</option>
                      <option>CARD</option>
                      <option>OTHER</option>
                    </select>
                  </ModalFormField>

                  <ModalFormField span={12} label="Reference">
                    <input className="mfzInput" value={form.referenceNumber} onChange={(e) => setForm((p) => ({ ...p, referenceNumber: e.target.value }))} />
                  </ModalFormField>
                </ModalFormGrid>
              </ModalFormPanelBody>
            </ModalFormPanel>
          </ModalFormBody>
        </ModalFormShell>
      </CommonModal>
    </AppShell>
  );
}
