import { fmtMoney, fmtCurrency } from "../utils/format.js";
import { useSeoMeta } from "../utils/seo.js";
import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../layouts/AppShell.jsx";
import CommonTable from "../components/CommonTable.jsx";
import CommonModal from "../components/CommonModal.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import CommonDatePicker from "../components/CommonDatePicker.jsx";
import CommonLoading from "../components/CommonLoading.jsx";
import CustomerMasterModal from "../components/CustomerMasterModal.jsx";
import { readAuth } from "../services/authStorage.js";
import { can } from "../utils/access.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { bulkDeleteCustomers, createCustomer, deleteCustomer, listCustomers, printCustomerLedger, updateCustomer } from "../services/customerService.js";
import { useLocale } from "../context/LocaleContext.jsx";
import { createCustomerPayment, listCustomerPayments, listSalesInvoices, listSalesReturns } from "../services/salesService.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import { IconUser } from "../components/ui/AppIcons.jsx";
import { IconBtn, IconLedger, IconTrash } from "../components/TableActionKit.jsx";
import CsvImportWizard from "../components/import/CsvImportWizard.jsx";
import { downloadCsvFile } from "../components/reports/reportExport.js";
import TableCsvActions from "../components/ui/TableCsvActions.jsx";
import "../components/StructuredForm.css";
import { printCustomerLedgerDoc } from "../print/customerLedgerPrint.js";
import { todayYmdLocal } from "../utils/date.js";

function getPaymentLedgerType(p) {
  const allocation = String(p?.allocation_type || p?.allocation_type_resolved || "").toUpperCase();
  const notes = String(p?.notes || "").toLowerCase();
  if (notes.includes("advance adjusted") || notes.includes("split-adjusted")) return "ADVANCE_APPLIED";
  if (allocation === "ON_ACCOUNT") return "ADVANCE";
  return "PAYMENT";
}

function paymentTypeLabel(type) {
  if (type === "INVOICE") return "Sales Invoice";
  if (type === "RETURN") return "Sales Return";
  if (type === "ADVANCE") return "On Account Advance";
  if (type === "ADVANCE_APPLIED") return "Advance Applied";
  if (type === "PAYMENT") return "Customer Payment";
  return String(type || "").replace(/_/g, " ") || "Entry";
}

function ledgerTs(isoDate, createdAt) {
  const t = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isNaN(t)) return t;
  const d = new Date(String(isoDate || "").slice(0, 10) || 0).getTime();
  return Number.isNaN(d) ? 0 : d;
}

function sortLedgerEntries(entries) {
  return [...entries].sort((a, b) => {
    const da = new Date(a.date || 0).getTime();
    const db = new Date(b.date || 0).getTime();
    if (da !== db) return da - db;
    const ta = Number(a.sortTs ?? 0) - Number(b.sortTs ?? 0);
    if (ta !== 0) return ta;
    return String(a.sortId ?? "").localeCompare(String(b.sortId ?? ""), undefined, { numeric: true });
  });
}

export default function CustomersPage() {
  useSeoMeta({ title: "Customers" });
  const { taxIdLabel } = useLocale();
  const auth = readAuth();
  const user = auth?.user || null;
  const isRetailer = useMemo(() => isRetailerAuth(auth), [auth]);
  const canView = can("CUSTOMERS", "VIEW");
  const canAdd = can("CUSTOMERS", "ADD");
  const canUpdate = can("CUSTOMERS", "UPDATE");
  const canDelete = can("CUSTOMERS", "DELETE");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: "", name: "" });
  const [importOpen, setImportOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerSummary, setLedgerSummary] = useState({ totalBilled: 0, totalPaid: 0, balanceDue: 0, advanceAmount: 0, netBalance: 0, oldestBillAgeDays: 0 });
  const [ledgerCustomer, setLedgerCustomer] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    customerId: "",
    salesInvoiceId: "",
    paymentDate: todayYmdLocal(),
    amount: "",
    paymentMode: "CASH",
    referenceNumber: "",
    notes: "",
    useAdvanceFirst: true
  });
  const [paymentPendingInvoices, setPaymentPendingInvoices] = useState([]);
  const [paymentPendingBusy, setPaymentPendingBusy] = useState(false);
  /** invoice id → allocate amount string */
  const [paymentAllocations, setPaymentAllocations] = useState({});
  const [ledgerPrintBusy, setLedgerPrintBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    const r = await listCustomers({
      search,
      customerType: typeFilter,
      // Retailers manage only registered customers here; walk-in is hidden from master list.
      excludeWalkIn: isRetailer ? "1" : undefined
    });
    if (r.status >= 200 && r.status < 300 && r.json?.ok) setRows(r.json?.data?.customers || []);
    else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
    setBusy(false);
  }
  useEffect(() => {
    if (canView) refresh();
  }, [canView, search, typeFilter, isRetailer]);

  useEffect(() => {
    if (!paymentOpen || !paymentForm.customerId) {
      setPaymentPendingInvoices([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setPaymentPendingBusy(true);
      const r = await listSalesInvoices({
        customerId: paymentForm.customerId,
        status: "CONFIRMED",
        limit: 500
      });
      if (cancelled) return;
      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
        const items = (r.json?.data?.items || [])
          .filter((inv) => Number(inv.balance_due || 0) > 0.001)
          .sort((a, b) => new Date(a.invoice_date || 0).getTime() - new Date(b.invoice_date || 0).getTime());
        setPaymentPendingInvoices(items);
      } else {
        setPaymentPendingInvoices([]);
        if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
      }
      setPaymentPendingBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentOpen, paymentForm.customerId]);

  const paymentAllocSum = useMemo(() => {
    let s = 0;
    for (const inv of paymentPendingInvoices) {
      const v = Number(paymentAllocations[inv.id] || 0);
      if (Number.isFinite(v) && v > 0) s += v;
    }
    return Number(s.toFixed(4));
  }, [paymentPendingInvoices, paymentAllocations]);

  const paymentAmountNum = useMemo(() => Number(paymentForm.amount || 0), [paymentForm.amount]);

  const ledgerAdvanceAvailable = useMemo(() => Number(ledgerSummary.advanceAmount || 0), [ledgerSummary.advanceAmount]);

  const paymentEffectiveCap = useMemo(() => {
    const adv = paymentForm.useAdvanceFirst ? ledgerAdvanceAvailable : 0;
    return Number((paymentAmountNum + adv).toFixed(4));
  }, [paymentAmountNum, paymentForm.useAdvanceFirst, ledgerAdvanceAvailable]);

  const paymentAllocOver = paymentAllocSum - paymentEffectiveCap > 0.02;

  const paymentHasAllocations = paymentAllocSum > 0.0001;

  const paymentSubmitAdvanceOnlyOk =
    paymentHasAllocations &&
    paymentForm.useAdvanceFirst &&
    ledgerAdvanceAvailable + 0.02 >= paymentAllocSum &&
    paymentAmountNum <= 0.0001;

  const countText = useMemo(
    () => (busy ? "Loading..." : `${rows.length} ${isRetailer ? "registered customers" : "customers"}`),
    [busy, rows.length, isRetailer]
  );

  const typeFilterOptions = useMemo(
    () =>
      isRetailer
        ? [
            { value: "", label: "All types" },
            { value: "PATIENT", label: "Patient" },
            { value: "CLINIC", label: "Clinic" },
            { value: "DOCTOR", label: "Doctor" },
            { value: "HOSPITAL", label: "Hospital" },
            { value: "OTHER", label: "Other" }
          ]
        : [
            { value: "", label: "All types" },
            { value: "RETAILER", label: "Retailer" },
            { value: "HOSPITAL", label: "Hospital" },
            { value: "CLINIC", label: "Clinic" },
            { value: "DISTRIBUTOR", label: "Distributor" },
            { value: "PATIENT", label: "Patient" },
            { value: "OTHER", label: "Other" }
          ],
    [isRetailer]
  );

  async function openLedger(customer) {
    setLedgerCustomer(customer);
    setLedgerOpen(true);
    setLedgerBusy(true);
    const [inv, pay, ret] = await Promise.all([
      listSalesInvoices({ customerId: customer.id, limit: 500 }),
      listCustomerPayments({ customerId: customer.id, limit: 500 }),
      listSalesReturns({ limit: 500 })
    ]);
    const invoices = inv.status >= 200 && inv.status < 300 && inv.json?.ok ? inv.json?.data?.items || [] : [];
    const payments = pay.status >= 200 && pay.status < 300 && pay.json?.ok ? pay.json?.data?.items || [] : [];
    const returns = ret.status >= 200 && ret.status < 300 && ret.json?.ok ? (ret.json?.data?.items || []).filter((x) => String(x.customer_id) === String(customer.id) && String(x.status) === "CONFIRMED") : [];
    const invoicesForLedger = invoices.filter((x) => String(x.status || "").toUpperCase() !== "CANCELLED");
    const entriesRaw = [
      ...invoicesForLedger.map((x) => ({
        date: String(x.invoice_date || "").slice(0, 10),
        type: "INVOICE",
        reference: x.invoice_number || "",
        debit: Number(x.total_amount || 0),
        credit: 0,
        sortTs: ledgerTs(x.invoice_date, x.created_at),
        sortId: x.id
      })),
      ...payments.map((x) => ({
        date: String(x.payment_date || "").slice(0, 10),
        type: getPaymentLedgerType(x),
        reference: x.invoice_number || x.reference_number || (getPaymentLedgerType(x) === "ADVANCE" ? "On Account" : ""),
        debit: 0,
        credit: Number(x.amount || 0),
        sortTs: ledgerTs(x.payment_date, x.created_at),
        sortId: x.id
      })),
      ...returns.map((x) => ({
        date: String(x.return_date || "").slice(0, 10),
        type: "RETURN",
        reference: x.return_number || "",
        debit: 0,
        credit: Number(x.total_return_amount || 0),
        sortTs: ledgerTs(x.return_date, x.created_at),
        sortId: x.id
      }))
    ];
    const entries = sortLedgerEntries(entriesRaw);
    let running = 0;
    const withBalance = entries.map((e) => {
      running += Number(e.debit || 0) - Number(e.credit || 0);
      const { sortTs, sortId, ...row } = e;
      return { ...row, balance: running, ledgerKey: `${e.type}-${String(sortId ?? "")}-${e.date}` };
    });
    const totalBilled = invoicesForLedger.reduce((s, x) => s + Number(x.total_amount || 0), 0);
    const totalPaid = payments.reduce((s, x) => s + Number(x.amount || 0), 0) + returns.reduce((s, x) => s + Number(x.total_return_amount || 0), 0);
    const netBalance = totalBilled - totalPaid;
    const balanceDue = Math.max(0, netBalance);
    const advanceAmount = Math.max(0, -netBalance);
    const confirmedUnpaid = invoicesForLedger.filter((x) => x.status === "CONFIRMED" && (x.payment_status === "UNPAID" || x.payment_status === "PARTIAL"));
    let oldestBillAgeDays = 0;
    if (confirmedUnpaid.length) {
      const oldest = [...confirmedUnpaid].sort((a, b) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime())[0];
      oldestBillAgeDays = Math.max(0, Math.floor((Date.now() - new Date(oldest.invoice_date).getTime()) / (1000 * 60 * 60 * 24)));
    }
    setLedgerRows(withBalance);
    setLedgerSummary({ totalBilled, totalPaid, balanceDue, advanceAmount, netBalance, oldestBillAgeDays });
    setLedgerBusy(false);
  }

  if (!canView) {
    return (
      <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user">
        <div className="pageWrap"><div className="pageCard"><div className="raTitle">{NAV_LABELS.customers}</div><div className="raSub">You do not have permission to view customers.</div></div></div>
      </AppShell>
    );
  }

  return (
    <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user">
      <div className="pageWrap">
        <div className="raTop">
          <div>
            <div className="raTitle">{NAV_LABELS.customers}</div>
            <div className="raSub">
              {isRetailer
                ? "Add your regular customers here. Walk-in / Counter Sale is a built-in billing customer and is shown only while creating bills."
                : "Manage customer master and credit defaults."}
            </div>
          </div>
        </div>
        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            compact
            countText={countText}
            search={search}
            onSearchChange={setSearch}
            filters={[{ id: "type", label: "Type", value: typeFilter, onChange: setTypeFilter, options: typeFilterOptions }]}
            extraHeaderActions={
              canAdd ? (
                <TableCsvActions
                  disabled={busy}
                  onImport={() => setImportOpen(true)}
                  onExport={() => {
                    const cols = [
                      { key: "code", label: "code" },
                      { key: "name", label: "name" },
                      { key: "customer_type", label: "customer_type" },
                      { key: "phone", label: "phone" },
                      { key: "email", label: "email" },
                      { key: "address", label: "address" },
                      { key: "city", label: "city" },
                      { key: "state", label: "state" },
                      { key: "pincode", label: "pincode" },
                      { key: "gst_number", label: "gst_number" },
                      { key: "credit_days", label: "credit_days" },
                      { key: "credit_limit", label: "credit_limit" },
                      { key: "discount_percent", label: "discount_percent" },
                      { key: "is_active", label: "is_active" }
                    ];
                    downloadCsvFile(
                      "customers_export.csv",
                      cols,
                      rows.map((r) => ({
                        code: r.code,
                        name: r.name,
                        customer_type: r.customer_type || "RETAILER",
                        phone: r.phone_number || "",
                        email: r.email || "",
                        address: r.address || "",
                        city: r.city || "",
                        state: r.state || "",
                        pincode: r.pincode || "",
                        gst_number: r.gst_number || "",
                        credit_days: r.credit_days ?? 0,
                        credit_limit: r.credit_limit ?? 0,
                        discount_percent: r.discount_percent ?? 0,
                        is_active: r.is_active ? "TRUE" : "FALSE"
                      }))
                    );
                  }}
                />
              ) : null
            }
            primaryAction={canAdd ? { label: isRetailer ? "Add customer" : "Add customer", onClick: () => { setEditing(null); setOpen(true); } } : null}
            rows={rows}
            getRowId={(r) => r.id}
            onRowDelete={
              canDelete
                ? (r) => {
                    setConfirm({ open: true, id: r.id, name: r.name || "" });
                  }
                : undefined
            }
            bulkDelete={
              canDelete
                ? {
                    label: "Delete All",
                    confirmTitle: "Delete customers?",
                    confirmMessage: (n) => `Permanently remove ${n} selected customer(s)? Outstanding balances will block deletion for those accounts.`,
                    onDelete: async (ids) => {
                      setBusy(true);
                      const r = await bulkDeleteCustomers(ids);
                      setBusy(false);
                      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                        const failed = r.json?.data?.failed || [];
                        if (failed.length) emitToast({ type: "warning", message: `${failed.length} customer(s) could not be deleted (e.g. outstanding invoices).` });
                        await refresh();
                      } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                    }
                  }
                : undefined
            }
            onRowClick={(r) => {
              if (!canUpdate) return;
              setEditing({
                id: r.id,
                code: r.code || "",
                name: r.name || "",
                shortName: r.short_name || "",
                phoneCountryCode: r.phone_country_code || "+91",
                phoneNumber: r.phone_number || "",
                email: r.email || "",
                address: r.address || "",
                city: r.city || "",
                state: r.state || "",
                pincode: r.pincode || "",
                customerType: r.customer_type || (isRetailer ? "PATIENT" : "RETAILER"),
                gstNumber: r.gst_number || "",
                drugLicenseNumber: r.drug_license_number || "",
                dlExpiryDate: String(r.dl_expiry_date || "").slice(0, 10),
                creditDays: r.credit_days || 0,
                creditLimit: r.credit_limit || 0,
                discountPercent: r.discount_percent || 0,
                isCashCustomer: Boolean(r.is_cash_customer),
                isActive: Boolean(r.is_active),
                notes: r.notes || ""
              });
              setOpen(true);
            }}
            columns={[
              { id: "code", header: "Code", render: (r) => <span style={{ fontWeight: 700 }}>{r.code}</span> },
              { id: "name", header: "Name", render: (r) => <span style={{ fontWeight: 700 }}>{r.name}</span> },
              { id: "customer_type", header: "Type", render: (r) => r.customer_type || "" },
              { id: "status", header: "Status", render: (r) => <span style={{ fontWeight: 700, color: r.is_active ? "var(--color-success)" : "var(--color-text-4)" }}>{r.is_active ? "Active" : "Inactive"}</span> },
              {
                id: "city",
                header: "City",
                sortable: false,
                render: (r) => <span style={{ color: "var(--color-text-3)" }}>{[r.city || "", r.state || ""].filter(Boolean).join(", ")}</span>
              },
              { id: "gst_number", header: taxIdLabel, sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{r.gst_number || ""}</span> },
              { id: "credit_days", header: "Credit days", align: "right", sortable: false, render: (r) => Number(r.credit_days ?? 0) },
              { id: "credit_limit", header: "Credit Limit", align: "right", render: (r) => fmtMoney(r.credit_limit || 0) },
              { id: "discount_percent", header: "Discount %", align: "right", sortable: false, render: (r) => Number(r.discount_percent ?? 0).toFixed(2) },
              { id: "phone_number", header: "Phone", render: (r) => `${r.phone_country_code || ""} ${r.phone_number || ""}`.trim() },
              { id: "email", header: "Email", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{r.email || ""}</span> },
              {
                id: "actions",
                header: "Actions",
                align: "right",
                sortable: false,
                render: (r) => (
                  <div className="ibGroup" onClick={(e) => e.stopPropagation()}>
                    <IconBtn tooltip="Customer ledger" onClick={() => openLedger(r)}>
                      <IconLedger />
                    </IconBtn>
                    {canDelete ? (
                      <IconBtn
                        tooltip="Delete customer"
                        variant="danger"
                        onClick={() => setConfirm({ open: true, id: r.id, name: r.name || "" })}
                      >
                        <IconTrash />
                      </IconBtn>
                    ) : null}
                  </div>
                )
              }
            ]}
          />
        </div>
      </div>

      <CsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityType="CUSTOMERS"
        title="Import customers"
        onCompleted={() => refresh()}
      />

      <CustomerMasterModal
        open={open}
        mode={editing?.id ? "edit" : "add"}
        busy={busy}
        initialValue={editing}
        onClose={() => !busy && setOpen(false)}
        onSubmit={async (payload) => {
          setBusy(true);
          const noAutoToast = { toast: "none" };
          const r = editing?.id
            ? await updateCustomer(editing.id, payload, noAutoToast)
            : await createCustomer(payload, noAutoToast);
          if (r.status >= 200 && r.status < 300 && r.json?.ok) {
            setOpen(false);
            await refresh();
          } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
          setBusy(false);
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        title="Delete customer?"
        message={confirm.name ? `Delete ${confirm.name}?` : "Delete this customer?"}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        busy={busy}
        onClose={() => setConfirm({ open: false, id: "", name: "" })}
        onConfirm={async () => {
          if (!confirm.id) return;
          setBusy(true);
          const r = await deleteCustomer(confirm.id);
          if (r.status >= 200 && r.status < 300 && r.json?.ok) await refresh();
          else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
          setBusy(false);
          setConfirm({ open: false, id: "", name: "" });
        }}
      />

      <CommonModal
        open={ledgerOpen}
        title={`Customer Ledger${ledgerCustomer?.name ? `  ${ledgerCustomer.name}` : ""}`}
        icon={<IconUser />}
        onClose={() => setLedgerOpen(false)}
        size="lg"
        footer={
          <div className="sfmModalFooter">
            <button className="sfmBtnGhost" type="button" onClick={() => setLedgerOpen(false)}>Close</button>
            <button
              className="sfmBtnGhost"
              type="button"
              disabled={ledgerPrintBusy || !ledgerCustomer?.id}
              onClick={async () => {
                if (!ledgerCustomer?.id) return;
                setLedgerPrintBusy(true);
                const r = await printCustomerLedger(ledgerCustomer.id);
                if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                  await printCustomerLedgerDoc(r.json?.data || {});
                } else if (r.status !== 401) {
                  emitToast({ type: "error", message: parseApiError(r) });
                }
                setLedgerPrintBusy(false);
              }}
            >
              {ledgerPrintBusy ? <CommonLoading variant="inline" text="Preparing..." /> : "Print Ledger"}
            </button>
            <button
              className="sfmBtnPrimary"
              type="button"
              onClick={() => {
                if (!ledgerCustomer?.id) return;
                setPaymentAllocations({});
                setPaymentForm({
                  customerId: ledgerCustomer.id,
                  salesInvoiceId: "",
                  paymentDate: todayYmdLocal(),
                  amount: Number(ledgerSummary.balanceDue || 0).toFixed(2),
                  paymentMode: "CASH",
                  referenceNumber: "",
                  notes: "",
                  useAdvanceFirst: true
                });
                setPaymentOpen(true);
              }}
            >
              Record Payment
            </button>
          </div>
        }
      >
        <div className="sfm">
          <div className="sfmSection">
            <div className="sfmGrid">
              <div className="raField"><label>Total Billed</label><input className="raInput" readOnly value={fmtCurrency(ledgerSummary.totalBilled || 0)} /></div>
              <div className="raField"><label>Total Paid</label><input className="raInput" readOnly value={fmtCurrency(ledgerSummary.totalPaid || 0)} /></div>
              <div className="raField"><label>Balance Due</label><input className="raInput" readOnly value={fmtCurrency(ledgerSummary.balanceDue || 0)} /></div>
              <div className="raField"><label>Advance From Customer</label><input className="raInput" readOnly value={fmtCurrency(ledgerSummary.advanceAmount || 0)} /></div>
              <div className="raField"><label>Oldest Bill</label><input className="raInput" readOnly value={`${Number(ledgerSummary.oldestBillAgeDays || 0)} day(s)`} /></div>
              <div className="sfmFull" style={{ fontSize: 12, fontWeight: 800, color: Number(ledgerSummary.netBalance || 0) >= 0 ? "var(--color-danger)" : "var(--color-success)" }}>
                {Number(ledgerSummary.netBalance || 0) >= 0
                  ? `Customer owes you: ${fmtCurrency(ledgerSummary.netBalance || 0)}`
                  : `You hold customer advance: ${fmtCurrency(Math.abs(Number(ledgerSummary.netBalance || 0)))}`}
              </div>
            </div>
          </div>
          <div className="sfmSection">
            <CommonTable
              title=""
              subtitle=""
              compact
              countText={ledgerBusy ? "Loading..." : `${ledgerRows.length} entries`}
              rows={ledgerRows}
              getRowId={(r) => r.ledgerKey || `${r.type}-${r.reference}-${r.date}`}
              columns={[
                { id: "date", header: "Date", render: (r) => r.date || "" },
                { id: "type", header: "Type", render: (r) => paymentTypeLabel(r.type) },
                { id: "reference", header: "Reference", render: (r) => r.reference || "" },
                { id: "debit", header: "Debit", align: "right", render: (r) => (Number(r.debit || 0) > 0 ? fmtMoney(r.debit) : "") },
                { id: "credit", header: "Credit", align: "right", render: (r) => (Number(r.credit || 0) > 0 ? fmtMoney(r.credit) : "") },
                { id: "balance", header: "Balance", align: "right", render: (r) => fmtMoney(r.balance || 0) }
              ]}
            />
          </div>
        </div>
      </CommonModal>
      <CommonModal
        open={paymentOpen}
        title="Record Customer Payment"
        icon={<IconUser />}
        size={920}
        onClose={() => setPaymentOpen(false)}
        footer={
          <div className="sfmModalFooter">
            <button className="sfmBtnGhost" type="button" onClick={() => setPaymentOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button
              className="sfmBtnPrimary"
              type="button"
              disabled={
                busy ||
                !paymentForm.customerId ||
                paymentAllocOver ||
                (!paymentHasAllocations && !(paymentAmountNum > 0)) ||
                (paymentHasAllocations && !(paymentAmountNum > 0) && !paymentSubmitAdvanceOnlyOk)
              }
              onClick={async () => {
                if (paymentAllocOver) {
                  emitToast({
                    type: "warning",
                    message: paymentForm.useAdvanceFirst
                      ? "Allocated total cannot exceed cash plus available customer advance."
                      : "Allocated total cannot exceed cash payment."
                  });
                  return;
                }
                const payAmt = Number(paymentForm.amount || 0);
                const allocations = paymentPendingInvoices
                  .map((inv) => ({
                    salesInvoiceId: inv.id,
                    amount: Number(paymentAllocations[inv.id] || 0)
                  }))
                  .filter((a) => a.amount > 0.0001);
                const payload = {
                  customerId: paymentForm.customerId,
                  paymentDate: paymentForm.paymentDate,
                  amount: payAmt,
                  paymentMode: paymentForm.paymentMode,
                  referenceNumber: paymentForm.referenceNumber || undefined,
                  notes: paymentForm.notes || undefined,
                  useAdvanceFirst: paymentForm.useAdvanceFirst
                };
                if (allocations.length) payload.allocations = allocations;
                setBusy(true);
                const r = await createCustomerPayment(payload);
                if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                  const advApp = Number(r.json?.data?.advance_applied || 0);
                  if (advApp > 0.0001) {
                    emitToast({ type: "success", message: `Payment recorded. ${fmtCurrency(advApp)} applied from customer advance.` });
                  } else {
                    emitToast({ type: "success", message: "Payment recorded." });
                  }
                  setPaymentOpen(false);
                  setPaymentAllocations({});
                  if (ledgerCustomer) await openLedger(ledgerCustomer);
                  await refresh();
                } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                setBusy(false);
              }}
            >
              {busy ? <InlineButtonProgress label="Working..." /> : "Record Payment"}
            </button>
          </div>
        }
      >
        <div className="sfm">
          <div className="sfmGrid">
            <div className="raField">
              <label>Date <span className="reqMark" aria-hidden="true">*</span></label>
              <CommonDatePicker value={paymentForm.paymentDate} onChange={(v) => setPaymentForm((p) => ({ ...p, paymentDate: v }))} ariaLabel="Payment date" />
            </div>
            <div className="raField">
              <label>Cash received</label>
              <input
                className="raInput"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]*"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1") }))}
              />
              <div className="sfmHint" style={{ marginTop: 6 }}>
                With allocations, cash can be {fmtCurrency(0)} if customer advance (shown in ledger) covers all lines and "Apply advance first" is on.
              </div>
            </div>
            <div className="raField">
              <label>Mode</label>
              <select className="raInput" value={paymentForm.paymentMode} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentMode: e.target.value }))}>
                <option>CASH</option>
                <option>CHEQUE</option>
                <option>NEFT</option>
                <option>UPI</option>
                <option>CARD</option>
                <option>OTHER</option>
              </select>
            </div>
            <div className="raField">
              <label>Reference</label>
              <input className="raInput" value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm((p) => ({ ...p, referenceNumber: e.target.value }))} />
            </div>
            <div className="raField sfmFull">
              <label>Notes (optional)</label>
              <input className="raInput" value={paymentForm.notes} onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Internal note  copied to each payment line" />
            </div>
            <div className="raField sfmFull">
              <label className="sfmCheck" style={{ alignItems: "flex-start", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(paymentForm.useAdvanceFirst)}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, useAdvanceFirst: e.target.checked }))}
                />
                <span>
                  Apply customer advance before cash (each allocated invoice uses advance pools first, oldest payment first; then cash from this receipt).
                </span>
              </label>
            </div>
          </div>

          <div className="sfmSection custPayAllocWrap">
            <div className="sfmSectionHead">
              <span className="sfmTitle">Allocate to sales invoices</span>
            </div>
            <p className="sfmHint">
              Enter amounts against each bill (oldest first). Any difference between payment amount and allocated total is stored as <strong>on account</strong> advance automatically.
            </p>
            <div className="custPayAllocToolbar">
              <button
                className="sfmBtnGhost"
                type="button"
                disabled={busy || paymentPendingBusy || !paymentPendingInvoices.length || !(paymentAmountNum > 0)}
                onClick={() => {
                  let left = paymentAmountNum;
                  const next = {};
                  for (const inv of paymentPendingInvoices) {
                    const due = Math.max(0, Number(inv.balance_due || 0));
                    const use = Math.min(due, left);
                    if (use > 0.0001) next[inv.id] = use.toFixed(2);
                    left -= use;
                    if (left <= 0.0001) break;
                  }
                  setPaymentAllocations(next);
                }}
              >
                Auto-fill FIFO
              </button>
              <button
                className="sfmBtnGhost"
                type="button"
                disabled={busy || !Object.keys(paymentAllocations).length}
                onClick={() => setPaymentAllocations({})}
              >
                Clear lines
              </button>
              <button
                className="sfmBtnGhost"
                type="button"
                disabled={busy || paymentAllocSum <= 0}
                onClick={() => setPaymentForm((p) => ({ ...p, amount: paymentAllocSum.toFixed(2) }))}
              >
                Set payment = allocated
              </button>
            </div>
            {paymentPendingBusy ? (
              <CommonLoading variant="inline" text="Loading outstanding invoices…" />
            ) : paymentPendingInvoices.length === 0 ? (
              <p className="sfmHint">No confirmed invoices with a balance due. Payment will be recorded entirely as customer advance (on account).</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="custPayAllocTable">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Date</th>
                      <th className="num">Total</th>
                      <th className="num">Balance due</th>
                      <th className="num">Allocate</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {paymentPendingInvoices.map((inv) => {
                      const due = Number(inv.balance_due || 0);
                      return (
                        <tr key={inv.id}>
                          <td>{inv.invoice_number || inv.id}</td>
                          <td>{String(inv.invoice_date || "").slice(0, 10)}</td>
                          <td className="num">{fmtMoney(inv.total_amount || 0)}</td>
                          <td className="num">{fmtMoney(due)}</td>
                          <td className="num">
                            <input
                              className="raInput"
                              type="text"
                              inputMode="decimal"
                              pattern="[0-9]*\.?[0-9]*"
                              placeholder="0"
                              value={paymentAllocations[inv.id] ?? ""}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                                setPaymentAllocations((prev) => {
                                  const copy = { ...prev };
                                  if (v === "" || v === ".") delete copy[inv.id];
                                  else copy[inv.id] = v;
                                  return copy;
                                });
                              }}
                            />
                          </td>
                          <td className="num">
                            <button
                              className="sfmBtnGhost"
                              type="button"
                              style={{ padding: "4px 8px", fontSize: 11 }}
                              onClick={() => setPaymentAllocations((prev) => ({ ...prev, [inv.id]: due.toFixed(2) }))}
                            >
                              Full due
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {paymentPendingInvoices.length > 0 ? (
              <div className="custPayAllocSummary">
                <div>
                  <span>Allocated</span>
                  <strong>{fmtCurrency(paymentAllocSum)}</strong>
                </div>
                <div>
                  <span>Cash + advance cap{paymentForm.useAdvanceFirst ? "" : " (advance off)"}</span>
                  <strong>{fmtCurrency(paymentEffectiveCap)}</strong>
                </div>
                <div style={{ color: paymentAllocOver ? "var(--color-danger)" : undefined }}>
                  <span>
                    {paymentAllocOver
                      ? "Over allocated  reduce lines or add cash / enable advance"
                      : paymentEffectiveCap - paymentAllocSum > 0.02
                        ? "Unallocated cash (on account)"
                        : "Allocated vs cap"}
                  </span>
                  <strong>
                    {fmtCurrency(paymentAllocOver
                      ? paymentAllocSum - paymentEffectiveCap
                      : Math.abs(paymentEffectiveCap - paymentAllocSum))}
                  </strong>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </CommonModal>
    </AppShell>
  );
}
