import AmountInput from "../components/ui/AmountInput.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { fmtMoney, fmtCurrency } from "../utils/format.js";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "../layouts/AppShell.jsx";
import CommonTable from "../components/CommonTable.jsx";
import CommonModal, {
  ModalFormBody,
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
import { isRetailerAuth } from "../utils/businessRole.js";
import { listDivisions } from "../services/divisionService.js";
import { listVendors } from "../services/vendorService.js";
import {
  listPurchaseInvoices,
  createDivisionPayment,
  createVendorPayment,
  listDivisionPayments,
  listVendorPayments
} from "../services/purchaseService.js";
import { parseApiError } from "../utils/api.js";
import { toDivisionOption } from "../utils/divisionLabel.js";
import { emitToast } from "../services/toastBus.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import { IconAdvancePayment, IconWallet } from "../components/ui/AppIcons.jsx";
import ModalFooterShell from "../components/ui/ModalFooterShell.jsx";
import { AppButton } from "../components/ui/buttons.jsx";
import { todayYmdLocal } from "../utils/date.js";

function canViewSupplierPayments() {
  return can("DIVISION_PAYMENTS", "VIEW") || can("VENDOR_PAYMENTS", "VIEW");
}

export default function VendorPaymentsPage() {
  useSeoMeta({ title: "Supplier Payments" });
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = readAuth();
  const user = auth?.user || null;
  const isRetailer = useMemo(() => isRetailerAuth(auth), [auth]);
  const canView = canViewSupplierPayments();
  const canAdd = can("DIVISION_PAYMENTS", "ADD") || can("VENDOR_PAYMENTS", "ADD");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [search, setSearch] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [open, setOpen] = useState(false);
  const [paymentKind, setPaymentKind] = useState("INVOICE");
  const [paySubmitted, setPaySubmitted] = useState(false);
  const [form, setForm] = useState({
    partyId: "",
    purchaseInvoiceId: "",
    paymentDate: todayYmdLocal(),
    amount: "",
    paymentMode: "CASH",
    referenceNumber: "",
    notes: ""
  });

  // Dashboard quick action: `/division-payments?new=1` auto-opens create modal.
  useEffect(() => {
    if (!canAdd) return;
    if (String(searchParams.get("new") || "") !== "1") return;
    setPaymentKind("INVOICE");
    setForm((p) => ({ ...p, partyId: "", purchaseInvoiceId: "", paymentDate: todayYmdLocal(), amount: "", paymentMode: "CASH", referenceNumber: "", notes: "" }));
    setOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("new");
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdd, searchParams]);

  async function refresh() {
    setBusy(true);
    const params = {
      search,
      purchaseInvoiceId: invoiceFilter || undefined,
      paymentMode: modeFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined
    };
    const fetchPayments = isRetailer
      ? listVendorPayments({ ...params, vendorId: partyFilter || undefined })
      : listDivisionPayments({ ...params, divisionId: partyFilter || undefined });

    const masterPromise = isRetailer
      ? listVendors({ limit: 500, sortBy: "name", sortDir: "asc" })
      : listDivisions({ limit: 500, sortBy: "name", sortDir: "asc" });

    const [r, m, i] = await Promise.all([
      fetchPayments,
      masterPromise,
      listPurchaseInvoices({ limit: 500 })
    ]);
    if (r.status >= 200 && r.status < 300 && r.json?.ok) setRows(r.json?.data?.items || []);
    else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
    if (m.status >= 200 && m.status < 300 && m.json?.ok) {
      if (isRetailer) setVendors(m.json?.data?.vendors || []);
      else setDivisions(m.json?.data?.divisions || []);
    }
    if (i.status >= 200 && i.status < 300 && i.json?.ok) setInvoices(i.json?.data?.items || []);
    setBusy(false);
  }
  useEffect(() => {
    if (canView) refresh();
  }, [canView, isRetailer, search, partyFilter, invoiceFilter, modeFilter, dateFrom, dateTo]);

  const partyOptions = useMemo(() => {
    if (isRetailer) {
      return [
        { value: "", label: "All suppliers" },
        ...(vendors || [])
          .filter((v) => Boolean(v.is_active) || String(v.id) === String(partyFilter || ""))
          .map((v) => ({
            value: String(v.id),
            label: `${v.name || ""}${v.code ? ` (${v.code})` : ""}`
          }))
      ];
    }
    return [
      { value: "", label: "All divisions" },
      ...divisions.map((x) => toDivisionOption(x))
    ];
  }, [isRetailer, vendors, divisions, partyFilter]);

  const pageTitle = isRetailer ? "Supplier Payments" : NAV_LABELS.divisionPayments;
  const pageSubtitle = isRetailer
    ? "Money paid to your suppliers, against purchase bills."
    : "Payments recorded against purchase invoices (by division).";
  const invoiceOptions = useMemo(() => {
    return (invoices || []).filter((x) => String(x.status || "").toUpperCase() === "CONFIRMED" && Number(x.balance_due || 0) > 0);
  }, [invoices]);

  if (!canView) {
    return (
      <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user">
        <div className="pageWrap">
          <div className="pageCard">
            <div className="raTitle">{pageTitle}</div>
            <div className="raSub">You do not have permission to view {isRetailer ? "supplier" : "division"} payments.</div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user">
      <div className="pageWrap">
        <div className="raTop">
          <div>
            <div className="raTitle">{pageTitle}</div>
            <div className="raSub">{pageSubtitle}</div>
          </div>
        </div>
        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            compact
            countText={busy ? "Loading..." : `${rows.length} payments`}
            search={search}
            onSearchChange={setSearch}
            filters={[
              {
                id: "party",
                label: isRetailer ? "Supplier" : "Division",
                value: partyFilter,
                onChange: setPartyFilter,
                options: partyOptions
              },
              {
                id: "invoice",
                label: "Invoice",
                value: invoiceFilter,
                onChange: setInvoiceFilter,
                options: [{ value: "", label: "All invoices" }, ...invoices.map((x) => ({ value: x.id, label: x.invoice_number }))]
              },
              {
                id: "mode",
                label: "Mode",
                value: modeFilter,
                onChange: setModeFilter,
                options: [
                  { value: "", label: "All modes" },
                  { value: "CASH", label: "Cash" },
                  { value: "CHEQUE", label: "Cheque" },
                  { value: "NEFT", label: "NEFT" },
                  { value: "UPI", label: "UPI" },
                  { value: "OTHER", label: "Other" }
                ]
              },
              { id: "from", label: "From", type: "date", value: dateFrom, onChange: setDateFrom },
              { id: "to", label: "To", type: "date", value: dateTo, onChange: setDateTo }
            ]}
            primaryAction={{
              label: isRetailer ? "Record supplier payment" : "Record division payment",
              onClick: () => {
                setPaymentKind("INVOICE");
                setForm({
                  partyId: "",
                  purchaseInvoiceId: "",
                  paymentDate: new Date().toISOString().slice(0, 10),
                  amount: "",
                  paymentMode: "CASH",
                  referenceNumber: "",
                  notes: ""
                });
                setOpen(true);
              }
            }}
            rows={rows}
            getRowId={(r) => r.id}
            columns={[
              { id: "payment_date", header: "Date", render: (r) => String(r.payment_date || "").slice(0, 10) },
              {
                id: "party_name",
                header: isRetailer ? "Supplier" : "Division",
                render: (r) => (isRetailer ? r.vendor_name || "" : r.division_name || "")
              },
              { id: "invoice_number", header: "Invoice", render: (r) => r.invoice_number || "" },
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
        title={isRetailer ? "Record Supplier Payment" : "Record Division Payment"}
        subtitle={paymentKind === "ON_ACCOUNT" ? "Advance / on-account payment" : "Invoice payment"}
        icon={paymentKind === "ON_ACCOUNT" ? <IconAdvancePayment /> : <IconWallet />}
        onClose={() => (busy ? null : setOpen(false))}
        loading={busy}
        loadingText="Saving payment…"
        footer={(
          <ModalFooterShell>
            <AppButton variant="secondary" type="button" disabled={busy} onClick={() => { setOpen(false); setPaySubmitted(false); }}>
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              type="button"
              disabled={busy}
              onClick={async () => {
                setPaySubmitted(true);
                if (!form.partyId || !form.paymentDate || !(Number(form.amount) > 0) || (paymentKind === "INVOICE" && !form.purchaseInvoiceId)) return;
                setBusy(true);
                const payload = {
                  paymentDate: form.paymentDate,
                  amount: Number(form.amount),
                  paymentMode: form.paymentMode,
                  referenceNumber: form.referenceNumber,
                  notes: form.notes
                };
                if (paymentKind === "INVOICE") payload.purchaseInvoiceId = form.purchaseInvoiceId;
                let r;
                if (isRetailer) {
                  r = await createVendorPayment({
                    ...payload,
                    vendorId: form.partyId,
                    allocationType: paymentKind
                  });
                } else {
                  r = await createDivisionPayment({
                    ...payload,
                    divisionId: form.partyId
                  });
                }
                if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                  setOpen(false);
                  setPaySubmitted(false);
                  await refresh();
                } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                setBusy(false);
              }}
            >
              {busy ? <InlineButtonProgress label="Working..." /> : "Save"}
            </AppButton>
          </ModalFooterShell>
        )}
      >
        <ModalFormShell>
          <ModalFormBody>
            <ModalFormPanel aria-label="Payment details">
              <ModalFormPanelHead>
                <ModalFormSectionTitle kicker="Payment details" />
                {isRetailer ? (
                  <div className="mfzHeadRight">
                    <button
                      type="button"
                      className={`mfzBtn appBtn appBtn_sm ${paymentKind === "INVOICE" ? "appBtn_primary" : "appBtn_secondary"}`}
                      onClick={() => setPaymentKind("INVOICE")}
                    >
                      Invoice
                    </button>
                    <button
                      type="button"
                      className={`mfzBtn appBtn appBtn_sm ${paymentKind === "ON_ACCOUNT" ? "appBtn_primary" : "appBtn_secondary"}`}
                      onClick={() => {
                        setPaymentKind("ON_ACCOUNT");
                        setForm((p) => ({ ...p, purchaseInvoiceId: "" }));
                      }}
                    >
                      Advance
                    </button>
                  </div>
                ) : null}
              </ModalFormPanelHead>
              <ModalFormPanelBody>
                <ModalFormGrid>
                  <ModalFormField
                    span={12}
                    label={isRetailer ? "Supplier" : "Division"}
                    required
                    error={paySubmitted && !form.partyId ? `${isRetailer ? "Supplier" : "Division"} is required.` : null}
                  >
                    <select
                      className={`mfzInput${paySubmitted && !form.partyId ? " mfzInput_err" : ""}`}
                      value={form.partyId}
                      onChange={(e) => setForm((p) => ({ ...p, partyId: e.target.value }))}
                    >
                      <option value="">Select</option>
                      {partyOptions.filter((o) => o.value).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </ModalFormField>
                  {paymentKind === "INVOICE" ? (
                    <ModalFormField span={12} label="Invoice" required error={paySubmitted && !form.purchaseInvoiceId ? "Invoice is required." : null}>
                      <select
                        className={`mfzInput${paySubmitted && !form.purchaseInvoiceId ? " mfzInput_err" : ""}`}
                        value={form.purchaseInvoiceId}
                        onChange={(e) => {
                          const invoiceId = e.target.value;
                          const inv = invoiceOptions.find((x) => String(x.id) === String(invoiceId));
                          setForm((p) => ({ ...p, purchaseInvoiceId: invoiceId, amount: inv ? Number(inv.balance_due || 0).toFixed(2) : p.amount }));
                        }}
                      >
                        <option value="">Select invoice</option>
                        {invoiceOptions
                          .filter((x) => !form.partyId || String(isRetailer ? x.vendor_id : x.division_id) === String(form.partyId))
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.invoice_number} (Bal {fmtCurrency(x.balance_due || 0)})
                            </option>
                          ))}
                      </select>
                    </ModalFormField>
                  ) : null}
                  <ModalFormField span={12} label="Date" required>
                    <CommonDatePicker value={form.paymentDate} onChange={(v) => setForm((p) => ({ ...p, paymentDate: v }))} ariaLabel="Payment date" />
                  </ModalFormField>
                  <ModalFormField span={12} label="Amount" required error={paySubmitted && !(Number(form.amount) > 0) ? "Amount must be greater than 0." : null}>
                    <AmountInput
                      className={`mfzInput${paySubmitted && !(Number(form.amount) > 0) ? " mfzInput_err" : ""}`}
                      value={String(form.amount ?? "")}
                      onChange={(raw) => setForm((p) => ({ ...p, amount: raw }))}
                      inputMode="decimal"
                    />
                  </ModalFormField>
                  <ModalFormField span={12} label="Mode">
                    <select className="mfzInput" value={form.paymentMode} onChange={(e) => setForm((p) => ({ ...p, paymentMode: e.target.value }))}>
                      <option>CASH</option>
                      <option>UPI</option>
                      <option>CARD</option>
                      <option>CHEQUE</option>
                      <option>NEFT</option>
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
