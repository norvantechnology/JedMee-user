import { fmtMoney, fmtCurrency } from "../utils/format.js";
import { useSeoMeta } from "../utils/seo.js";
import { AppButton, InlineButtonProgress } from "../components/ui/buttons.jsx";
import ModalFooterShell from "../components/ui/ModalFooterShell.jsx";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import AppShell from "../layouts/AppShell.jsx";
import CommonTable from "../components/CommonTable.jsx";
import CommonModal from "../components/CommonModal.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import CommonDatePicker from "../components/CommonDatePicker.jsx";
import { readAuth } from "../services/authStorage.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { can } from "../utils/access.js";
import { listCustomers } from "../services/customerService.js";
import { confirmSalesReturn, createSalesReturn, getSalesInvoice, listSalesInvoices, listSalesReturns } from "../services/salesService.js";
import { listProducts } from "../services/productService.js";
import { listProductBatches } from "../services/productBatchService.js";
import { sortBatchesByExpiryAsc } from "../utils/batchSort.js";
import { batchExpiryDaysInlineSuffix, formatBatchExpiryRelativePhrase } from "../utils/batchExpiryDisplay.js";
import CommonSelectField from "../components/CommonSelectField.jsx";
import { toProductOption } from "../utils/productLabel.js";
import { parseApiError } from "../utils/api.js";
import { emitToast } from "../services/toastBus.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import "../components/StructuredForm.css";
import MasterSelectWithCreate from "../components/MasterSelectWithCreate.jsx";
import "./SalesReturnsPage.css";
import { IconSalesReturn } from "../components/ui/AppIcons.jsx";
import { IconBtn, IconConfirm } from "../components/TableActionKit.jsx";
import CsvImportWizard from "../components/import/CsvImportWizard.jsx";
import { downloadCsvFile } from "../components/reports/reportExport.js";
import TableCsvActions from "../components/ui/TableCsvActions.jsx";
import { todayYmdLocal } from "../utils/date.js";

function emptyReturnItem() {
  return { productId: "", batchId: "", productName: "", batchNo: "", expiryDate: "", availableBatches: [], salesInvoiceItemId: "", soldQty: 0, alreadyReturnedQty: 0, maxReturnableQty: 0, returnQty: 1, returnFreeQty: 0, salesRate: 0, netRate: 0, manual: false };
}

function mapInvoiceItemToReturnLine(x) {
  const soldQty = Number(x.qty || 0);
  const alreadyReturnedQty = Number(x.already_returned_qty || 0);
  const maxReturnableQty = Math.max(0, soldQty - alreadyReturnedQty);
  return {
    productId: x.product_id || "",
    batchId: x.batch_id || "",
    productName: x.product_name || "",
    batchNo: x.batch_no || "",
    salesInvoiceItemId: x.id || "",
    soldQty,
    alreadyReturnedQty,
    maxReturnableQty,
    returnQty: 0,
    returnFreeQty: 0,
    salesRate: Number(x.sales_rate || 0),
    netRate: Number(x.net_rate || x.sales_rate || 0)
  };
}

export default function SalesReturnsPage() {
  useSeoMeta({ title: "Sales Returns" });
  const location = useLocation();
  const auth = readAuth();
  const user = auth?.user || null;
  const isRetailer = isRetailerAuth(auth);
  const canView = can("SALES_RETURNS", "VIEW");
  const canAdd = can("SALES_RETURNS", "ADD");
  const canUpdate = can("SALES_RETURNS", "UPDATE");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) setSubmitted(false); }, [open]);
  const [modalLoading, setModalLoading] = useState(false);
  const returnPrefillGenRef = useRef(0);
  const [form, setForm] = useState({ customerId: "", salesInvoiceId: "", returnDate: todayYmdLocal(), returnReason: "OTHER", notes: "", items: [emptyReturnItem()] });
  const [confirm, setConfirm] = useState({ open: false, id: "" });
  const [importOpen, setImportOpen] = useState(false);
  const returnTotal = (form.items || []).reduce((s, x) => s + Number(x.returnQty || 0) * Number(x.netRate || 0), 0);
  const hasAnyReturnQty = (form.items || []).some((x) => Number(x.returnQty || 0) > 0);
  const hasInvalidReturnQty = (form.items || []).some((x) => {
    const q = Number(x.returnQty || 0);
    const max = Number(x.maxReturnableQty || 0);
    if (x.manual) return q < 0;
    return q < 0 || q > max;
  });
  const isManualReturn = isRetailer && !form.salesInvoiceId;
  const hasIncompleteManualLine = isManualReturn
    ? (form.items || []).some((x) => !x.productId || !x.batchId || Number(x.returnQty || 0) <= 0)
    : (form.items || []).some((x) => x.manual && (!x.productId || !x.batchId || Number(x.returnQty || 0) <= 0));

  async function refresh() {
    setBusy(true);
    const [r, c, s, pr] = await Promise.all([
      listSalesReturns({ search, status: statusFilter, customerId: customerFilter, dateFrom, dateTo, limit: 500 }),
      listCustomers({ limit: 500 }),
      listSalesInvoices({ limit: 500, status: "CONFIRMED" }),
      listProducts({ limit: 500 })
    ]);
    if (r.status >= 200 && r.status < 300 && r.json?.ok) setRows(r.json?.data?.items || []);
    if (c.status >= 200 && c.status < 300 && c.json?.ok) setCustomers(c.json?.data?.customers || []);
    if (s.status >= 200 && s.status < 300 && s.json?.ok) setInvoices(s.json?.data?.items || []);
    if (pr.status >= 200 && pr.status < 300 && pr.json?.ok) setProducts(pr.json?.data?.items || []);
    setBusy(false);
  }

  async function loadBatchesForProduct(productId) {
    if (!productId) return [];
    const b = await listProductBatches({ productId, product_id: productId });
    if (b.status >= 200 && b.status < 300 && b.json?.ok) return sortBatchesByExpiryAsc(b.json?.data?.items || []);
    return [];
  }
  useEffect(() => { if (canView) refresh(); }, [canView, search, statusFilter, customerFilter, dateFrom, dateTo]);

  async function refreshCustomersOnly() {
    const c = await listCustomers({ limit: 500 });
    if (c.status >= 200 && c.status < 300 && c.json?.ok) setCustomers(c.json?.data?.customers || []);
  }

  useEffect(() => {
    const qs = new URLSearchParams(location.search || "");
    const wantsNew = String(qs.get("new") || "") === "1";
    const invoiceId = String(qs.get("invoiceId") || "");
    const customerId = String(qs.get("customerId") || "");
    if (wantsNew && !invoiceId && canAdd) {
      returnPrefillGenRef.current += 1;
      setModalLoading(false);
      setOpen(true);
      try {
        const next = new URLSearchParams(location.search || "");
        next.delete("new");
        const qs2 = next.toString();
        window.history.replaceState(null, "", `${location.pathname}${qs2 ? `?${qs2}` : ""}`);
      } catch {
        // ignore
      }
      return;
    }
    if (!invoiceId) return;
    returnPrefillGenRef.current += 1;
    const gen = returnPrefillGenRef.current;
    setOpen(true);
    setModalLoading(true);
    if (customerId) setForm((p) => ({ ...p, customerId }));
    requestAnimationFrame(() => {
      void (async () => {
        try {
          const g = await getSalesInvoice(invoiceId);
          if (gen !== returnPrefillGenRef.current) return;
          if (g.status >= 200 && g.status < 300 && g.json?.ok) {
            const invItems = g.json?.data?.items || [];
            setForm((p) => ({
              ...p,
              customerId: customerId || p.customerId,
              salesInvoiceId: invoiceId,
              items: invItems.map(mapInvoiceItemToReturnLine)
            }));
          } else if (g.status !== 401) {
            emitToast({ type: "error", message: parseApiError(g) });
          }
        } finally {
          if (gen === returnPrefillGenRef.current) setModalLoading(false);
        }
      })();
    });
  }, [location.search, location.pathname, canAdd]);

  if (!canView) {
    return <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user"><div className="pageWrap"><div className="pageCard"><div className="raTitle">{NAV_LABELS.salesReturns}</div><div className="raSub">You do not have permission to view sales returns.</div></div></div></AppShell>;
  }

  return (
    <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user">
      <div className="pageWrap">
        <div className="raTop"><div><div className="raTitle">{NAV_LABELS.salesReturns}</div><div className="raSub">{isRetailer ? "Counter returns. Pick the original bill, then enter return quantities." : "Create and confirm sales return entries."}</div></div></div>
        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            compact
            countText={busy ? "Loading..." : `${rows.length} returns`}
            search={search}
            onSearchChange={setSearch}
            filters={[
              {
                id: "status",
                label: "Status",
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { value: "", label: "All status" },
                  { value: "DRAFT", label: "Draft" },
                  { value: "CONFIRMED", label: "Confirmed" },
                  { value: "CANCELLED", label: "Cancelled" }
                ]
              },
              {
                id: "customer",
                label: "Customer",
                value: customerFilter,
                onChange: setCustomerFilter,
                options: [{ value: "", label: "All customers" }, ...(customers || []).map((c) => ({ value: c.id, label: c.name || c.code || "Customer" }))]
              },
              { id: "from", type: "date", label: "From", value: dateFrom, onChange: setDateFrom },
              { id: "to", type: "date", label: "To", value: dateTo, onChange: setDateTo }
            ]}
            extraHeaderActions={
              canAdd ? (
                <TableCsvActions
                  disabled={busy}
                  onImport={() => setImportOpen(true)}
                  onExport={() => {
                    const cols = [
                      { key: "return_number", label: "return_number" },
                      { key: "return_date", label: "return_date" },
                      { key: "status", label: "status" },
                      { key: "customer_name", label: "customer_name" },
                      { key: "total_return_amount", label: "total_return_amount" }
                    ];
                    downloadCsvFile(
                      "sales_returns_export.csv",
                      cols,
                      rows.map((r) => ({
                        return_number: r.return_number,
                        return_date: String(r.return_date || "").slice(0, 10),
                        status: r.status,
                        customer_name: r.customer_name || "",
                        total_return_amount: r.total_return_amount
                      }))
                    );
                  }}
                />
              ) : null
            }
            primaryAction={canAdd ? { label: isRetailer ? "New return" : "Create sales return", onClick: () => { returnPrefillGenRef.current += 1; setModalLoading(false); setOpen(true); } } : null}
            rows={rows}
            getRowId={(r) => r.id}
            columns={[
              { id: "return_number", header: "Return No", render: (r) => <span style={{ fontWeight: 700 }}>{r.return_number}</span> },
              { id: "customer_name", header: "Customer", render: (r) => r.customer_name || "" },
              { id: "return_date", header: "Date", render: (r) => String(r.return_date || "").slice(0, 10) },
              { id: "invoice_number", header: "Ref Invoice", sortable: false, render: (r) => r.invoice_number || r.sales_invoice_number || "" },
              { id: "status", header: "Status", render: (r) => <span style={{ fontWeight: 700 }}>{r.status}</span> },
              { id: "total_return_amount", header: "Amount", align: "right", render: (r) => fmtMoney(r.total_return_amount || 0) },
              { id: "created_at", header: "Created", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{String(r.created_at || "").slice(0, 10)}</span> },
              {
                id: "actions",
                header: "Actions",
                align: "right",
                sortable: false,
                render: (r) => (
                  <div className="ibGroup" onClick={(e) => e.stopPropagation()}>
                    {r.status === "DRAFT" && canUpdate ? (
                      <IconBtn tooltip="Confirm and post return" variant="success" onClick={() => setConfirm({ open: true, id: r.id })}>
                        <IconConfirm />
                      </IconBtn>
                    ) : null}
                  </div>
                )
              }
            ]}
          />
        </div>
      </div>

      <CommonModal
        open={open}
        title={modalLoading ? "Opening return…" : isRetailer ? "Create Counter Return" : "Create Sales Return"}
        icon={<IconSalesReturn />}
        loading={modalLoading || busy}
        loadingText={busy ? "Creating return…" : "Loading invoice lines…"}
        onClose={() => {
          returnPrefillGenRef.current += 1;
          setModalLoading(false);
          setOpen(false);
        }}
        size="lg"
        footer={
          <ModalFooterShell>
            <AppButton
              variant="secondary"
              type="button"
              onClick={() => {
                returnPrefillGenRef.current += 1;
                setModalLoading(false);
                setOpen(false);
              }}
              disabled={busy}
            >
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              type="button"
              disabled={busy}
              onClick={async () => {
                setSubmitted(true);
                if (!form.customerId || (!isRetailer && !form.salesInvoiceId) || !hasAnyReturnQty || hasInvalidReturnQty || hasIncompleteManualLine) return;
                setBusy(true);
                const r = await createSalesReturn(form);
                if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                  setOpen(false);
                  await refresh();
                } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                setBusy(false);
              }}
            >
              {busy ? <InlineButtonProgress label="Working..." /> : "Create Return"}
            </AppButton>
          </ModalFooterShell>
        }
      >
        <div className="sfm srmWrap">

          {/* ── Header section ── */}
          <div className="sfmSection">
            <div className="sfmGrid srmHeadGrid">
              <div className="raField">
                <label>Customer</label>
                <MasterSelectWithCreate
                  kind="customer"
                  value={form.customerId}
                  onChange={(v) => { setSubmitted(false); setForm((p) => ({ ...p, customerId: v, salesInvoiceId: "", items: [emptyReturnItem()] })); }}
                  onListsRefresh={refreshCustomersOnly}
                  placeholder="Select customer"
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                />
                {submitted && !form.customerId && <div className="mfzErr">Customer is required.</div>}
              </div>

              <div className="raField">
                <label>
                  Linked Invoice{" "}
                  {isRetailer
                    ? <span className="raSubMuted" style={{ color: "var(--color-text-3)", fontWeight: 600 }}>(optional)</span>
                    : null}
                </label>
                <select
                  className={`raInput${submitted && !isRetailer && !form.salesInvoiceId ? " srmSelectErr" : ""}`}
                  value={form.salesInvoiceId}
                  onChange={async (e) => {
                    const salesInvoiceId = e.target.value;
                    if (!salesInvoiceId) {
                      setForm((p) => ({ ...p, salesInvoiceId: "", items: [emptyReturnItem()] }));
                      return;
                    }
                    setBusy(true);
                    const g = await getSalesInvoice(salesInvoiceId);
                    if (g.status >= 200 && g.status < 300 && g.json?.ok) {
                      const invItems = g.json?.data?.items || [];
                      setForm((p) => ({
                        ...p,
                        salesInvoiceId,
                        items: invItems.map(mapInvoiceItemToReturnLine)
                      }));
                    }
                    setBusy(false);
                  }}
                >
                  <option value="">{isRetailer ? "No invoice — counter return" : "Select invoice"}</option>
                  {(invoices || [])
                    .filter((x) => !form.customerId || String(x.customer_id) === String(form.customerId))
                    .map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} ({String(inv.invoice_date || "").slice(0, 10)})
                      </option>
                    ))}
                </select>
                {submitted && !isRetailer && !form.salesInvoiceId && <div className="mfzErr">Invoice is required.</div>}
                {isRetailer ? (
                  <div className="raHint" style={{ fontSize: 11, color: "var(--color-text-3)", marginTop: 4 }}>
                    Walk-ins rarely keep their bill. Leave blank and add product, batch and qty manually below.
                  </div>
                ) : null}
              </div>

              <div className="raField">
                <label>Return Date</label>
                <CommonDatePicker value={form.returnDate} onChange={(v) => setForm((p) => ({ ...p, returnDate: v }))} ariaLabel="Return date" />
              </div>

              <div className="raField">
                <label>Reason</label>
                <select className="raInput" value={form.returnReason} onChange={(e) => setForm((p) => ({ ...p, returnReason: e.target.value }))}>
                  <option>DAMAGED</option>
                  <option>EXPIRED</option>
                  <option>WRONG_PRODUCT</option>
                  <option>EXCESS</option>
                  <option>PATIENT_RETURNED</option>
                  <option>OTHER</option>
                </select>
              </div>

              <div className="raField sfmFull">
                <label>Notes</label>
                <input className="raInput" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* ── Return Items section ── */}
          <div className="sfmSection srmItemsSection">
            <div className="srmItemsHead">
              <div className="sfmTitle">Return Items</div>
              <div className="sfmHint">
                {form.salesInvoiceId
                  ? "Set return quantity for each line."
                  : isRetailer
                    ? "No invoice linked. Add the product, batch and quantity returned across the counter."
                    : "Set return quantity for each line."}
              </div>
            </div>

            {submitted && !hasAnyReturnQty && (
              <div className="mfzErr srmItemsErr">Enter a return quantity for at least one item.</div>
            )}

            {(form.items || []).map((it, idx) => {
              const isManualLine = Boolean(it.manual) || (!form.salesInvoiceId && isRetailer);
              return (
                <div key={idx} className="srmItemCard">
                  <div className="srmItemTitle">
                    Line {idx + 1}
                    {isManualLine ? (
                      <button
                        type="button"
                        className="mfzBtn appBtn appBtn_secondary appBtn_sm"
                        style={{ marginLeft: 8, padding: "2px 8px", fontSize: 11 }}
                        disabled={busy}
                        onClick={() => setForm((p) => {
                          const cur = p.items || [];
                          if (cur.length <= 1) return p;
                          return { ...p, items: cur.filter((_, i) => i !== idx) };
                        })}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <div className="srmBadgeRow">
                    <div className="srmBadge"><span>Product</span><strong>{it.productName || "—"}</strong></div>
                    <div className="srmBadge"><span>Batch</span><strong>{it.batchNo || "—"}</strong></div>
                    {it.expiryDate ? (
                      <div className="srmBadge srmBadge_expiry" title={formatBatchExpiryRelativePhrase(it.expiryDate)}>
                        <span>Expiry</span>
                        <strong>
                          {String(it.expiryDate).slice(0, 10)}
                          <span className="srmExpirySub"> · {formatBatchExpiryRelativePhrase(it.expiryDate)}</span>
                        </strong>
                      </div>
                    ) : null}
                  </div>

                  {!form.salesInvoiceId && !isRetailer ? (
                    <div className="raField" style={{ marginTop: 8 }}>
                      <label>Line source</label>
                      <input className="raInput" readOnly value="Select linked invoice to load product and batch lines." />
                    </div>
                  ) : null}

                  {isManualLine ? (
                    <div className="sfmGrid srmItemGrid" style={{ marginTop: 8 }}>
                      <div className={`raField sfmFull${submitted && !it.productId ? " srmFieldErr" : ""}`}>
                        <label>Product</label>
                        <MasterSelectWithCreate
                          kind="product"
                          value={it.productId || ""}
                          placeholder="Search product"
                          options={(products || []).map((p) => toProductOption(p))}
                          onChange={async (productId) => {
                            const p = (products || []).find((x) => String(x.id) === String(productId));
                            if (!p) {
                              setForm((prev) => ({ ...prev, items: prev.items.map((x, i) => (i === idx ? { ...emptyReturnItem(), manual: true } : x)) }));
                              return;
                            }
                            setForm((prev) => ({
                              ...prev,
                              items: prev.items.map((x, i) =>
                                i === idx
                                  ? { ...emptyReturnItem(), manual: true, productId: p.id, productName: p.name || "", availableBatches: [] }
                                  : x
                              )
                            }));
                            const batches = await loadBatchesForProduct(p.id);
                            const first = batches[0];
                            setForm((prev) => ({
                              ...prev,
                              items: prev.items.map((x, i) => {
                                if (i !== idx || String(x.productId || "") !== String(p.id)) return x;
                                if (!first) return { ...x, availableBatches: batches };
                                return {
                                  ...x,
                                  availableBatches: batches,
                                  batchId: first.id,
                                  batchNo: first.batch_no || "",
                                  expiryDate: String(first.expiry_date || "").slice(0, 10),
                                  salesRate: Number(first.retail_rate || first.sales_rate || first.mrp || 0),
                                  netRate: Number(first.retail_rate || first.sales_rate || first.mrp || 0)
                                };
                              })
                            }));
                          }}
                        />
                        {submitted && !it.productId && <div className="mfzErr">Product is required.</div>}
                      </div>

                      <div className={`raField${submitted && !it.batchId ? " srmFieldErr" : ""}`}>
                        <label>Batch</label>
                        <CommonSelectField
                          value={it.batchId || ""}
                          placeholder="Pick batch"
                          options={sortBatchesByExpiryAsc(it.availableBatches || []).map((b) => {
                            const ex = String(b.expiry_date || "").slice(0, 10);
                            return { value: b.id, label: `${b.batch_no} | Exp ${ex}${batchExpiryDaysInlineSuffix(ex)}` };
                          })}
                          onChange={(batchId) => {
                            const b = (it.availableBatches || []).find((x) => String(x.id) === String(batchId));
                            if (!b) return;
                            setForm((prev) => ({
                              ...prev,
                              items: prev.items.map((x, i) => (i === idx ? {
                                ...x,
                                batchId: b.id,
                                batchNo: b.batch_no || "",
                                expiryDate: String(b.expiry_date || "").slice(0, 10),
                                salesRate: Number(b.retail_rate || b.sales_rate || b.mrp || 0),
                                netRate: Number(b.retail_rate || b.sales_rate || b.mrp || 0)
                              } : x))
                            }));
                          }}
                        />
                        {submitted && !it.batchId && <div className="mfzErr">Batch is required.</div>}
                      </div>

                      <div className={`raField${submitted && !(Number(it.returnQty || 0) > 0) ? " srmFieldErr" : ""}`}>
                        <label>Return Qty</label>
                        <input
                          className={`raInput${submitted && !(Number(it.returnQty || 0) > 0) ? " srmInputErr" : ""}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={it.returnQty}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, "");
                            setForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, returnQty: val } : x)) }));
                          }}
                        />
                        {submitted && !(Number(it.returnQty || 0) > 0) && <div className="mfzErr">Return qty must be greater than 0.</div>}
                      </div>

                      <div className="raField">
                        <label>Rate</label>
                        <input
                          className="raInput"
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*\.?[0-9]*"
                          value={it.netRate ?? ""}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                            const next = val === "" ? 0 : Math.max(0, Number(val || 0));
                            setForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, netRate: next, salesRate: next } : x)) }));
                          }}
                        />
                      </div>

                      <div className="raField">
                        <label>Return Amount</label>
                        <input className="raInput" readOnly value={fmtMoney(Number(it.returnQty || 0) * Number(it.netRate || 0))} />
                      </div>
                    </div>
                  ) : (
                    <div className="sfmGrid srmItemGrid">
                      <div className="raField"><label>Sold Qty</label><input className="raInput" readOnly value={it.soldQty || 0} /></div>
                      {Number(it.alreadyReturnedQty || 0) > 0 && (
                        <div className="raField"><label>Already Returned</label><input className="raInput" readOnly value={it.alreadyReturnedQty} /></div>
                      )}
                      <div className="raField"><label>Max Returnable</label><input className="raInput" readOnly value={it.maxReturnableQty || 0} /></div>
                      <div className="raField">
                        <label>Return Qty</label>
                        <input
                          className="raInput"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          disabled={Number(it.maxReturnableQty || 0) <= 0}
                          value={it.returnQty}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, "");
                            setForm((p) => ({ ...p, items: p.items.map((x, i) => i === idx ? { ...x, returnQty: val } : x) }));
                          }}
                        />
                        {Number(it.returnQty || 0) > Number(it.maxReturnableQty || 0) ? <div className="mfzErr">Return qty cannot exceed max returnable.</div> : null}
                      </div>
                      <div className="raField"><label>Rate</label><input className="raInput" readOnly value={it.netRate || 0} /></div>
                      <div className="raField"><label>Return Amount</label><input className="raInput" readOnly value={fmtMoney(Number(it.returnQty || 0) * Number(it.netRate || 0))} /></div>
                    </div>
                  )}
                </div>
              );
            })}

            {!form.salesInvoiceId && isRetailer ? (
              <div className="srmAddLineWrap">
                <button
                  type="button"
                  className="mfzBtn appBtn appBtn_secondary appBtn_md"
                  disabled={busy}
                  onClick={() => setForm((p) => ({ ...p, items: [...(p.items || []), { ...emptyReturnItem(), manual: true }] }))}
                >
                  + Add another product
                </button>
              </div>
            ) : null}

            {hasInvalidReturnQty && (
              <div className="mfzErr srmItemsErr">One or more return quantities are invalid. Please keep qty between 0 and max returnable.</div>
            )}
            {hasIncompleteManualLine && (
              <div className="mfzErr srmItemsErr">Each manual line must have product, batch and a return quantity.</div>
            )}

            <div className="srmTotalBar">
              Total Return Amount: {fmtCurrency(returnTotal || 0)}
            </div>
          </div>

        </div>
      </CommonModal>

      <ConfirmDialog
        open={confirm.open}
        title="Confirm sales return?"
        message="This posts SALE_RETURN stock transactions."
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        busy={busy}
        onClose={() => setConfirm({ open: false, id: "" })}
        onConfirm={async () => {
          if (!confirm.id) return;
          setBusy(true);
          const r = await confirmSalesReturn(confirm.id, {});
          if (r.status >= 200 && r.status < 300 && r.json?.ok) await refresh();
          else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
          setBusy(false);
          setConfirm({ open: false, id: "" });
        }}
      />
      <CsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityType="SALES_RETURNS"
        title="Import sales returns"
        onCompleted={() => refresh()}
      />
    </AppShell>
  );
}
