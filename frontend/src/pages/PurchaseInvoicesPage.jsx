import AmountInput from "../components/ui/AmountInput.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { AppButton, AsyncButton, InlineButtonProgress } from "../components/ui/buttons.jsx";
import { clean, fmtMoney, fmtCurrency } from "../utils/format.js";
import { useLocale } from "../context/LocaleContext.jsx";
import ModalFooterShell from "../components/ui/ModalFooterShell.jsx";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import AppShell from "../layouts/AppShell.jsx";
import CommonTable from "../components/CommonTable.jsx";
import PartyContactEmailModal from "../components/PartyContactEmailModal.jsx";
import CommonModal from "../components/CommonModal.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import CommonSelectField from "../components/CommonSelectField.jsx";
import MasterSelectWithCreate from "../components/MasterSelectWithCreate.jsx";
import CommonInlineAddButton from "../components/CommonInlineAddButton.jsx";
import CommonDatePicker from "../components/CommonDatePicker.jsx";
import ProductBatchModal from "../components/ProductBatchModal.jsx";
import { can } from "../utils/access.js";
import { onAuthChanged, readAuth } from "../services/authStorage.js";
import { listDivisions } from "../services/divisionService.js";
import { listMfgCompanies } from "../services/mfgCompanyService.js";
import { listVendors, updateVendor } from "../services/vendorService.js";
import { listProducts, searchProductsRich } from "../services/productService.js";
import { createProductBatch, listProductBatches } from "../services/productBatchService.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import {
  bulkCancelPurchaseInvoices,
  bulkConfirmPurchaseInvoices,
  cancelPurchaseInvoice,
  confirmPurchaseInvoice,
  deletePurchaseInvoice,
  confirmPurchaseReturn,
  createPurchaseInvoice,
  createPurchaseReturn,
  bulkCompleteVendorPayments,
  createDivisionPayment,
  createVendorPayment,
  getPurchaseInvoice,
  listPurchaseInvoices,
  sendPurchaseInvoicesByEmail,
  updatePurchaseInvoice
} from "../services/purchaseService.js";
import { parseApiError } from "../utils/api.js";
import { EMAIL_RE } from "../utils/customerContactPayload.js";
import { sortBatchesByExpiryAsc } from "../utils/batchSort.js";
import { batchExpiryDaysInlineSuffix, formatBatchExpiryRelativePhrase } from "../utils/batchExpiryDisplay.js";
import { toDivisionOption } from "../utils/divisionLabel.js";
import { formatProductLabel, toProductOption } from "../utils/productLabel.js";
import { isCmPanelTopStackLayer } from "../utils/modalFocusNav.js";
import { openFocusedDropdown } from "../utils/dropdownKeyboard.js";
import { emitToast } from "../services/toastBus.js";
import { printViaHiddenIframe } from "../print/printDocument.js";
import medico from "../shared/print/medicoPrintDocuments.cjs";
import { NAV_LABELS } from "../constants/navLabels.js";
import "../components/StructuredForm.css";
import "./PurchaseInvoicesPage.css";
import { IconReceipt, IconRotateBox, IconWallet } from "../components/ui/AppIcons.jsx";
import CommonLoading from "../components/CommonLoading.jsx";
import CsvImportWizard from "../components/import/CsvImportWizard.jsx";
import { downloadCsvFile } from "../components/reports/reportExport.js";
import TableCsvActions from "../components/ui/TableCsvActions.jsx";
import LineRemoveButton from "../components/ui/LineRemoveButton.jsx";
import CommonLineItemsSection from "../components/line-items/CommonLineItemsSection.jsx";
import CommonLineItemsTable from "../components/line-items/CommonLineItemsTable.jsx";
import {
  IconBtn,
  IconCancel,
  IconConfirm,
  IconEdit,
  IconEmail,
  IconPayment,
  IconPrint,
  IconReturn,
  IconTrash,
  IconView
} from "../components/TableActionKit.jsx";

/** Keyboard help entries for the purchase invoice editor (CommonModal `shortcutsItems`). */
const PURCHASE_EDITOR_SHORTCUTS = [
  { description: "Next field (required first when marked)", keys: "Enter" },
  { description: "Primary submit / save", keys: "Shift+Enter" },
  { description: "Previous field", keys: "Shift+Tab" },
  { description: "Open focused dropdown", keys: "↓" },
  { description: "Change dropdown option", keys: "↑ / ↓" },
  { description: "Add line item", keys: "Alt+L" },
  { description: "Save draft", keys: "Alt+S" },
  { description: "Create or confirm (when enabled)", keys: "Ctrl+Enter" }
];

/*
FLOW 1: First time new product enters system
1) Quality Master creates product + batch + OPENING inventory transaction.
2) Opening stock becomes starting stock for that batch.

FLOW 2: Regular purchase
1) Purchase Invoice references existing product.
2) User selects existing batch or creates a new batch inline.
3) Confirm posts PURCHASE inventory transaction(s), updates stock and batch pricing.

FLOW 3: Purchase cancel
1) Cancelled confirmed invoice posts reverse PURCHASE_RETURN transactions.
2) Stock is decremented through immutable ledger entries.

KEY RULE: Quality Master creates master records; Purchase Invoice moves stock.
*/

/** Today's calendar date in the browser's local timezone (matches `<input type="date">`). */
function localCalendarYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function money(v) {
  return fmtMoney(v) || "0.00";
}
function round2(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function addDaysYmd(ymdValue, days) {
  const s = String(ymdValue || "").slice(0, 10);
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d + Number(days || 0));
  return localCalendarYmd(dt);
}

function ymd(v) {
  const s = String(v || "").slice(0, 10);
  return s || "";
}

function daysFrom(dateYmd) {
  const s = String(dateYmd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [iy, im, id] = s.split("-").map(Number);
  const now = new Date();
  const invUtc = Date.UTC(iy, im - 1, id);
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((todayUtc - invUtc) / (1000 * 60 * 60 * 24));
}

/** Apply selected batch to a purchase line (product pick default + batch dropdown). */
function buildPurchaseLineUpdateFromBatch(b) {
  const exp = String(b.expiry_date || "").slice(0, 10);
  const label = `${b.batch_no} | Exp ${exp}${batchExpiryDaysInlineSuffix(exp)} | Stock ${n(b.total_stock)}`;
  return {
    isNewBatch: false,
    batchId: b?.id || "",
    batchNo: b?.batch_no || "",
    batchSearch: label,
    expiryDate: String(b?.expiry_date || "").slice(0, 10),
    mfgDate: String(b?.mfg_date || "").slice(0, 10),
    mrp: n(b?.mrp),
    purchaseRate: n(b?.purchase_rate),
    salesRate: n(b?.sales_rate),
    gstPercent: n(b?.purchase_gst),
    currentStock: n(b?.total_stock)
  };
}

function emptyLine() {
  return {
    productId: "",
    productName: "",
    productCode: "",
    productSearch: "",
    batchId: "",
    batchNo: "",
    batchSearch: "",
    expiryDate: "",
    mfgDate: "",
    qty: 1,
    freeQty: 0,
    purchaseRate: 0,
    mrp: 0,
    salesRate: 0,
    discountPercent: 0,
    gstPercent: 0,
    landingCost: 0,
    hsnCode: "",
    isNewBatch: true,
    currentStock: 0,
    mfgPurchaseLocked: false,
    mfgCompanyName: "",
    availableBatches: []
  };
}

function computeLineAmount(it) {
  const qty = n(it.qty);
  const purchaseRate = n(it.purchaseRate);
  const discountPercent = n(it.discountPercent);
  const gstPercent = n(it.gstPercent);
  const taxable = qty * purchaseRate - qty * purchaseRate * (discountPercent / 100);
  const gstAmount = taxable * (gstPercent / 100);
  return taxable + gstAmount;
}

function computeLineParts(it) {
  const qty = n(it.qty);
  const rate = n(it.purchaseRate);
  const discPct = n(it.discountPercent);
  const gstPct = n(it.gstPercent);
  const gross = qty * rate;
  const disc = gross * (discPct / 100);
  const taxable = gross - disc;
  const gst = taxable * (gstPct / 100);
  return { gross: round2(gross), disc: round2(disc), gst: round2(gst), total: round2(taxable + gst) };
}

export default function PurchaseInvoicesPage() {
  useSeoMeta({ title: "Purchase Invoices" });
  const { taxLabel, taxRates } = useLocale();
  const auth = readAuth();
  const user = auth?.user || null;
  const isRetailer = useMemo(() => isRetailerAuth(auth), [auth]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [authTick, setAuthTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [updateConfirmedBusy, setUpdateConfirmedBusy] = useState(false);
  const [paymentSaveBusy, setPaymentSaveBusy] = useState(false);
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnLoadingItems, setReturnLoadingItems] = useState(false);
  const [rows, setRows] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [mfgCompanies, setMfgCompanies] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [mfgFilter, setMfgFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState({ by: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState(null);
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState([]);
  const [bulkPaymentBusy, setBulkPaymentBusy] = useState(false);
  const [bulkConfirmBusy, setBulkConfirmBusy] = useState(false);
  const [bulkConfirmPurchaseDialog, setBulkConfirmPurchaseDialog] = useState({ open: false, ids: [] });
  const [bulkPaymentConfirm, setBulkPaymentConfirm] = useState({ open: false, ids: [], count: 0, total: 0, paymentDate: "", paymentMode: "" });
  const [printingPurchaseIds, setPrintingPurchaseIds] = useState(() => ({}));
  const [sendingPurchaseEmailById, setSendingPurchaseEmailById] = useState(() => ({}));
  const [sendVendorContact, setSendVendorContact] = useState({ open: false, pendingIds: [], vendorId: "", vendorName: "" });
  const [sendVendorContactForm, setSendVendorContactForm] = useState({ email: "" });
  const [savingVendorContact, setSavingVendorContact] = useState(false);

  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState(null);
  const purchaseInvoiceLoadGenRef = useRef(0);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    invoiceNumber: "",
    vendorInvoiceNumber: "",
    divisionId: "",
    vendorId: "",
    invoiceDate: localCalendarYmd(),
    dueDate: "",
    notes: "",
    items: [emptyLine()]
  });
  const [confirm, setConfirm] = useState({ open: false, id: "", type: "confirm", invoiceNumber: "" });
  const [dupConfirm, setDupConfirm] = useState({ open: false, vendorInvoiceNumber: "", existingInvoiceNumber: "", action: "draft" });
  const [importOpen, setImportOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    invoiceId: "",
    divisionId: "",
    vendorId: "",
    paymentDate: localCalendarYmd(),
    amount: "",
    paymentMode: "NEFT",
    referenceNumber: "",
    notes: ""
  });
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnForm, setReturnForm] = useState({ invoiceId: "", returnDate: localCalendarYmd(), returnReason: "OTHER", notes: "", items: [] });
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchModalDepsLoading, setBatchModalDepsLoading] = useState(false);
  const [batchModalBusy, setBatchModalBusy] = useState(false);
  const [batchModalLineIdx, setBatchModalLineIdx] = useState(-1);
  const [batchModalSeed, setBatchModalSeed] = useState(null);
  const [activeLineIdx, setActiveLineIdx] = useState(0);
  const [supplierInsightsByProduct, setSupplierInsightsByProduct] = useState({});
  const [insightsBusyByProduct, setInsightsBusyByProduct] = useState({});
  const [batchInsightsBusyByProduct, setBatchInsightsBusyByProduct] = useState({});
  const itemsWrapRef = useRef(null);
  const modalBodyRef = useRef(null);
  const purchaseKbdRef = useRef({
    canSaveDraft: false,
    canCreateAndConfirm: false,
    canConfirmFromModal: false,
    isEditDraft: false,
    busy: false
  });
  const createAndConfirmRef = useRef(() => Promise.resolve());

  useEffect(() => onAuthChanged(() => setAuthTick((v) => v + 1)), []);

  useEffect(() => {
    const id = clean(searchParams.get("divisionId") || "");
    if (id) {
      setDivisionFilter(id);
      setPage(1);
    }
  }, [searchParams]);

  const canView = can("PURCHASE_INVOICES", "VIEW");
  const canAdd = can("PURCHASE_INVOICES", "ADD");
  const canUpdate = can("PURCHASE_INVOICES", "UPDATE");
  const canDelete = can("PURCHASE_INVOICES", "DELETE");
  const canUpdateVendor = can("VENDORS", "UPDATE");

  const bulkSendPurchaseEmailBusy = useMemo(
    () => (selectedPurchaseIds || []).some((id) => sendingPurchaseEmailById[String(id)]),
    [selectedPurchaseIds, sendingPurchaseEmailById]
  );

  useEffect(() => {
    if (!sendVendorContact.open || !sendVendorContact.vendorId) return;
    const v = (vendors || []).find((x) => String(x.id) === String(sendVendorContact.vendorId));
    setSendVendorContactForm({ email: v?.email || "" });
  }, [sendVendorContact.open, sendVendorContact.vendorId, vendors]);

  // Dashboard quick action: `/purchase-invoices?new=1` auto-opens create modal.
  useEffect(() => {
    if (!canAdd) return;
    if (String(searchParams.get("new") || "") !== "1") return;
    purchaseInvoiceLoadGenRef.current += 1;
    setEditing(null);
    setModalLoading(false);
    setLoadingEditId(null);
    const defaultDivisionId = !isRetailer ? clean(divisionFilter) : "";
    const defaultVendorId = isRetailer ? clean(vendorFilter) : "";
    setForm({
      invoiceNumber: "",
      vendorInvoiceNumber: "",
      divisionId: defaultDivisionId,
      vendorId: defaultVendorId,
      invoiceDate: localCalendarYmd(),
      dueDate: "",
      notes: "",
      items: [emptyLine()]
    });
    setOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdd, searchParams]);

  function canRemoveFromList(r) {
    if (!r) return false;
    if (String(r.status) === "CANCELLED") return true;
    if (String(r.status) === "DRAFT" && Number(r.amount_paid || 0) <= 0) return true;
    return false;
  }

  async function refreshPurchaseTableOnly() {
    const inv = await listPurchaseInvoices({
      page,
      limit: pageSize,
      search,
      status: statusFilter,
      paymentStatus: paymentFilter,
      dateFrom,
      dateTo,
      divisionId: isRetailer ? undefined : divisionFilter || undefined,
      mfgCompanyId: isRetailer ? undefined : mfgFilter || undefined,
      vendorId: isRetailer ? vendorFilter || undefined : undefined,
      sortBy: sort.by,
      sortOrder: sort.dir
    });
    if (inv.status >= 200 && inv.status < 300 && inv.json?.ok) {
      setRows(inv.json?.data?.items || []);
      setPagination(inv.json?.data?.pagination || null);
    } else if (inv.status !== 401) {
      emitToast({ type: "error", message: parseApiError(inv) });
    }
  }

  async function refresh() {
    setBusy(true);
    const calls = [
      listPurchaseInvoices({
        page,
        limit: pageSize,
        search,
        status: statusFilter,
        paymentStatus: paymentFilter,
        dateFrom,
        dateTo,
        divisionId: isRetailer ? undefined : divisionFilter || undefined,
        mfgCompanyId: isRetailer ? undefined : mfgFilter || undefined,
        vendorId: isRetailer ? vendorFilter || undefined : undefined,
        sortBy: sort.by,
        sortOrder: sort.dir
      }),
      listProducts({ page: 1, limit: 500, sortBy: "name", sortOrder: "asc" }),
      listVendors({ limit: 500 })
    ];
    if (!isRetailer) {
      calls.push(listDivisions({ sortBy: "name", sortDir: "asc" }));
      calls.push(listMfgCompanies({ limit: 500, offset: 0 }));
    }
    const results = await Promise.all(calls);
    const [inv, prd, vnd, ddr, mfg] = results;
    if (inv.status >= 200 && inv.status < 300 && inv.json?.ok) {
      setRows(inv.json?.data?.items || []);
      setPagination(inv.json?.data?.pagination || null);
    } else if (inv.status !== 401) {
      emitToast({ type: "error", message: parseApiError(inv) });
    }
    if (prd?.status >= 200 && prd?.status < 300 && prd?.json?.ok) setProducts(prd.json?.data?.items || []);
    if (vnd?.status >= 200 && vnd?.status < 300 && vnd?.json?.ok) setVendors(vnd.json?.data?.vendors || []);
    if (ddr?.status >= 200 && ddr?.status < 300 && ddr?.json?.ok) setDivisions(ddr.json?.data?.divisions || []);
    if (mfg?.status >= 200 && mfg?.status < 300 && mfg?.json?.ok) setMfgCompanies(mfg.json?.data?.companies || []);
    setBusy(false);
  }

  async function refreshMasterDropdowns() {
    const calls = [
      listProducts({ page: 1, limit: 500, sortBy: "name", sortOrder: "asc" }),
      listVendors({ limit: 500 })
    ];
    if (!isRetailer) calls.push(listDivisions({ sortBy: "name", sortDir: "asc" }));
    const [prd, vnd, ddr] = await Promise.all(calls);
    if (prd?.status >= 200 && prd?.status < 300 && prd?.json?.ok) setProducts(prd.json?.data?.items || []);
    if (vnd?.status >= 200 && vnd?.status < 300 && vnd?.json?.ok) setVendors(vnd.json?.data?.vendors || []);
    if (ddr?.status >= 200 && ddr?.status < 300 && ddr?.json?.ok) setDivisions(ddr.json?.data?.divisions || []);
  }

  async function runBulkSettlePayments() {
    const selectedRows = (rows || []).filter((r) => selectedPurchaseIds.map(String).includes(String(r.id || "")));
    const payableRows = selectedRows.filter((r) => String(r.status || "").toUpperCase() === "CONFIRMED" && Number(r.balance_due || 0) > 0);
    if (!payableRows.length) {
      emitToast({ type: "warning", message: "Select confirmed invoices with pending balance." });
      return;
    }
    const total = payableRows.reduce((s, x) => s + Number(x.balance_due || 0), 0);
    const paymentDate = localCalendarYmd();
    const paymentMode = "NEFT";
    setBulkPaymentConfirm({
      open: true,
      ids: payableRows.map((x) => x.id),
      count: payableRows.length,
      total,
      paymentDate,
      paymentMode
    });
  }

  async function confirmBulkSettlePayments() {
    if (!(bulkPaymentConfirm.ids || []).length) return;
    setBulkPaymentBusy(true);
    const r = await bulkCompleteVendorPayments({
      invoiceIds: bulkPaymentConfirm.ids,
      paymentDate: bulkPaymentConfirm.paymentDate || localCalendarYmd(),
      paymentMode: bulkPaymentConfirm.paymentMode || "NEFT",
      notes: "Bulk payment settled from purchase invoices table"
    });
    setBulkPaymentBusy(false);
    if (r.status >= 200 && r.status < 300 && r.json?.ok) {
      const done = Number(r.json?.data?.completedCount || 0);
      const skipped = Number(r.json?.data?.skippedCount || 0);
      emitToast({ type: done > 0 ? "success" : "warning", message: done > 0 ? `Bulk payment done for ${done} invoice(s).${skipped > 0 ? ` Skipped ${skipped}.` : ""}` : "No eligible invoices were settled." });
      setBulkPaymentConfirm({ open: false, ids: [], count: 0, total: 0, paymentDate: "", paymentMode: "" });
      await refresh();
      return;
    }
    if (r.status !== 401) {
      emitToast({ type: "error", message: parseApiError(r) });
    }
  }

  const printPurchaseInvoice = useCallback(async (id) => {
    const sid = String(id || "");
    if (!sid) return;
    setPrintingPurchaseIds((s) => ({ ...s, [sid]: true }));
    try {
      const r = await getPurchaseInvoice(sid);
      if (!(r.status >= 200 && r.status < 300 && r.json?.ok)) {
        if (r.status !== 401) emitToast({ type: "error", message: "Could not load invoice for printing." });
        return;
      }
      const invoice = r.json?.data?.invoice || {};
      const items = r.json?.data?.items || [];
      const seller = {
        firm_name: user?.firm_name || "",
        full_name: user?.full_name || "",
        address: user?.address || "",
        phone_number: user?.phone_number || user?.phone || "",
        gst_number: user?.gst_number || ""
      };
      const doc = {
        seller,
        invoice,
        items,
        printable: { title: "Purchase Invoice" }
      };
      const bodyHtml = medico.buildPurchaseInvoiceBodyHtml(doc);
      printViaHiddenIframe({ title: `Purchase Invoice ${invoice.invoice_number || ""}`.trim(), bodyHtml });
    } finally {
      setPrintingPurchaseIds((s) => {
        const n = { ...s };
        delete n[sid];
        return n;
      });
    }
  }, [user]);

  async function runBulkPrintPurchaseInvoices() {
    const ids = (selectedPurchaseIds || []).map(String).filter(Boolean);
    if (!ids.length) {
      emitToast({ type: "warning", message: "Select at least one invoice to print." });
      return;
    }
    for (const id of ids) {
      await printPurchaseInvoice(id);
    }
  }

  async function runSendPurchaseInvoices(invoiceIds) {
    const ids = (invoiceIds || []).map((x) => String(x || "")).filter(Boolean);
    if (!canView || !ids.length) return;
    setSendingPurchaseEmailById((s) => {
      const n = { ...s };
      for (const id of ids) n[id] = true;
      return n;
    });
    try {
      const r = await sendPurchaseInvoicesByEmail({ ids });
      if (!(r.status >= 200 && r.status < 300 && r.json?.ok)) {
        if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
        return;
      }
      const results = r.json?.data?.results || [];
      const partyIssues = results.filter((x) => x.status === "no_party_email");
      if (partyIssues.length) {
        emitToast({
          type: "warning",
          message:
            partyIssues[0]?.message ||
            "Some invoices have no vendor linked (division-only). Email applies to vendor purchases only."
        });
      }
      const noEmail = results.filter((x) => x.status === "no_email");
      if (noEmail.length) {
        const u = new Map();
        for (const x of noEmail) {
          if (x.vendorId) u.set(String(x.vendorId), true);
        }
        if (u.size > 1) {
          emitToast({
            type: "warning",
            message: "Some suppliers are missing email. Add one vendor at a time, or update contacts in Vendors."
          });
        }
        const first = noEmail[0];
        setSendVendorContact({
          open: true,
          pendingIds: ids,
          vendorId: first?.vendorId || "",
          vendorName: first?.vendorName || first?.partyName || ""
        });
        return;
      }
      const sent = results.filter((x) => x.status === "sent" || x.status === "sent_dry_run").length;
      const failed = results.filter(
        (x) => x.status === "send_failed" || x.status === "not_found" || x.status === "error" || x.status === "skipped"
      );
      if (sent) {
        const dry = results.some((x) => x.status === "sent_dry_run");
        emitToast({
          type: "success",
          message: dry ? `${sent} invoice(s) would be emailed (configure SMTP on server).` : `Email sent for ${sent} invoice(s).`
        });
      }
      if (failed.length) emitToast({ type: "warning", message: `${failed.length} invoice(s) were skipped or failed.` });
    } finally {
      setSendingPurchaseEmailById((s) => {
        const n = { ...s };
        for (const id of ids) delete n[id];
        return n;
      });
    }
  }

  async function saveVendorContactAndResend() {
    if (!sendVendorContact.vendorId) return;
    if (!canUpdateVendor) {
      emitToast({ type: "error", message: "You do not have permission to update vendor contact." });
      return;
    }
    const e = String(sendVendorContactForm.email || "").trim();
    if (!e || !EMAIL_RE.test(e)) {
      emitToast({ type: "error", message: "Enter a valid email address." });
      return;
    }
    const toRetry = [...(sendVendorContact.pendingIds || [])];
    setSavingVendorContact(true);
    try {
      const u = await updateVendor(sendVendorContact.vendorId, { email: e });
      if (!(u.status >= 200 && u.json?.ok)) {
        if (u.status !== 401) emitToast({ type: "error", message: parseApiError(u) });
        return;
      }
      setSendVendorContact({ open: false, pendingIds: [], vendorId: "", vendorName: "" });
      await refreshMasterDropdowns();
      await refreshPurchaseTableOnly();
      await runSendPurchaseInvoices(toRetry);
    } finally {
      setSavingVendorContact(false);
    }
  }

  async function runBulkSendPurchaseByEmail() {
    const list = (rows || []).filter(
      (r) => (selectedPurchaseIds || []).map(String).includes(String(r.id)) && String(r.status || "").toUpperCase() !== "CANCELLED"
    );
    if (!list.length) {
      emitToast({ type: "warning", message: "Select at least one non-cancelled invoice to email." });
      return;
    }
    await runSendPurchaseInvoices(list.map((x) => x.id));
  }

  useEffect(() => {
    if (canView) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, authTick, page, pageSize, sort.by, sort.dir, statusFilter, paymentFilter, divisionFilter, mfgFilter, vendorFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (isRetailer) {
      const selectedVendor = (vendors || []).find((v) => String(v.id) === String(form.vendorId));
      const creditDays = Number(selectedVendor?.credit_days || 0);
      if (!(creditDays > 0) || !clean(form.invoiceDate)) return;
      const auto = addDaysYmd(form.invoiceDate, creditDays);
      setForm((p) => {
        if (clean(p.dueDate)) return p;
        return { ...p, dueDate: auto };
      });
      return;
    }
    const selectedDivision = (divisions || []).find((d) => String(d.id) === String(form.divisionId));
    const creditDays = Number(selectedDivision?.credit_days || 0);
    if (!(creditDays > 0) || !clean(form.invoiceDate)) return;
    const auto = addDaysYmd(form.invoiceDate, creditDays);
    setForm((p) => {
      if (clean(p.dueDate)) return p;
      return { ...p, dueDate: auto };
    });
  }, [form.divisionId, form.vendorId, form.invoiceDate, divisions, vendors, isRetailer]);

  const activeLine = (form.items || [])[Math.min(Math.max(Number(activeLineIdx) || 0, 0), Math.max((form.items || []).length - 1, 0))] || null;
  const activeProductId = clean(activeLine?.productId);
  const activeProduct = (products || []).find((p) => String(p.id) === String(activeProductId || "")) || null;
  const activeBatches = useMemo(() => sortBatchesByExpiryAsc(activeLine?.availableBatches || []), [activeLine?.availableBatches]);
  const activeSuppliers = useMemo(() => supplierInsightsByProduct[activeProductId] || [], [supplierInsightsByProduct, activeProductId]);
  const insightsLoading = useMemo(
    () => Boolean(insightsBusyByProduct[activeProductId] || batchInsightsBusyByProduct[activeProductId]),
    [insightsBusyByProduct, batchInsightsBusyByProduct, activeProductId]
  );
  const supplierSnapshot = useMemo(() => {
    const list = activeSuppliers || [];
    const withDate = list
      .map((s) => ({ ...s, _d: String(s.last_purchase_date || "").slice(0, 10) }))
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s._d));
    const latest = withDate.length
      ? withDate.reduce((a, b) => (a._d > b._d ? a : b))
      : null;
    const withRate = list
      .map((s) => ({ ...s, _r: Number(s.last_purchase_rate) }))
      .filter((s) => Number.isFinite(s._r) && s._r > 0);
    const bestRate = withRate.length
      ? withRate.reduce((a, b) => (a._r < b._r ? a : b))
      : null;
    return { latest, bestRate, supplierCount: list.length };
  }, [activeSuppliers]);
  const batchSnapshot = useMemo(() => {
    const list = activeBatches || [];
    const withRate = list
      .map((b) => ({ ...b, _r: Number(b.purchase_rate) }))
      .filter((b) => Number.isFinite(b._r) && b._r > 0);
    const bestBatchByRate = withRate.length
      ? withRate.reduce((a, b) => (a._r < b._r ? a : b))
      : null;
    return { bestBatchByRate };
  }, [activeBatches]);
  const divisionInsightSnapshot = useMemo(() => {
    const list = activeBatches || [];
    const totalStock = list.reduce((sum, b) => sum + Number(b.total_stock || 0), 0);
    const expiryRows = list
      .map((b) => ({ ...b, _d: String(b.expiry_date || "").slice(0, 10) }))
      .filter((b) => /^\d{4}-\d{2}-\d{2}$/.test(b._d));
    const nearestExpiry = expiryRows.length
      ? expiryRows.reduce((a, b) => (a._d < b._d ? a : b))
      : null;
    const currentRate = Number(activeLine?.purchaseRate || 0);
    const bestRate = Number(batchSnapshot.bestBatchByRate?.purchase_rate || 0);
    const rateDiff = currentRate > 0 && bestRate > 0 ? currentRate - bestRate : 0;
    const nearestExpiryDays = nearestExpiry?._d ? -Number(daysFrom(nearestExpiry._d) ?? 0) : null;
    return {
      totalStock,
      batchCount: list.length,
      nearestExpiry,
      nearestExpiryDays,
      currentRate,
      bestRate,
      rateDiff
    };
  }, [activeBatches, activeLine?.purchaseRate, batchSnapshot.bestBatchByRate?.purchase_rate]);
  const purchaseLineColumns = useMemo(() => {
    return [
      { key: "row", label: "#" },
      { key: "product", label: "Product" },
      { key: "batch", label: "Batch No" },
      { key: "expiry", label: "Expiry Date" },
      { key: "stock", label: "Stock", className: "center" },
      { key: "qty", label: "Qty", className: "num" },
      { key: "free", label: "Free", className: "num" },
      { key: "purchaseRate", label: "Purchase Rate", className: "num" },
      { key: "mrp", label: "MRP", className: "num" },
      { key: "salesRate", label: "Sales Rate", className: "num" },
      { key: "disc", label: "Disc %", className: "num" },
      { key: "gst", label: `${taxLabel} %`, className: "center" },
      { key: "amount", label: "Amount", className: "num" },
      { key: "actions", label: "" }
    ];
  }, []);

  useEffect(() => {
    if (!isRetailer) return;
    const pid = clean(activeProductId);
    if (!pid) return;
    const hint = activeProduct?.name || activeProduct?.code || "";
    void ensureSupplierInsights(pid, hint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRetailer, activeProductId, activeProduct?.name, activeProduct?.code]);

  /** Confirmed with balance due  same filter as `runBulkSettlePayments`. */
  const bulkCompletePaymentCount = useMemo(() => {
    const sel = new Set((selectedPurchaseIds || []).map((x) => String(x)));
    return (rows || []).filter(
      (r) =>
        sel.has(String(r.id)) &&
        String(r.status || "").toUpperCase() === "CONFIRMED" &&
        Number(r.balance_due || 0) > 0
    ).length;
  }, [rows, selectedPurchaseIds]);

  const bulkDraftPurchaseConfirmCount = useMemo(() => {
    const sel = new Set((selectedPurchaseIds || []).map((x) => String(x)));
    return (rows || []).filter((r) => sel.has(String(r.id)) && String(r.status || "").toUpperCase() === "DRAFT").length;
  }, [rows, selectedPurchaseIds]);

  const selectedDivisionMfgId = useMemo(() => {
    const d = (divisions || []).find((x) => String(x.id) === String(form.divisionId));
    return d?.mfg_company_id ? String(d.mfg_company_id) : "";
  }, [divisions, form.divisionId]);

  // Filter products by the selected division:
  //  - Prefer matching product.division_id directly (new data model).
  //  - Fallback to matching mfg_company_id for legacy products that have no
  //    division_id set yet (so old SKUs don't disappear mid-migration).
  //  - When no division is chosen, show all products.
  const productsForLines = useMemo(() => {
    const all = products || [];
    const divId = clean(form.divisionId);
    if (!divId) return all;
    return all.filter((p) => {
      const pdid = p.division_id != null ? String(p.division_id) : "";
      if (pdid) return pdid === divId;
      return selectedDivisionMfgId && String(p.mfg_company_id || "") === selectedDivisionMfgId;
    });
  }, [products, form.divisionId, selectedDivisionMfgId]);

  const totals = useMemo(() => {
    const lines = (form.items || []).map((it) => computeLineParts(it));
    const subtotal = round2(lines.reduce((s, x) => s + x.gross, 0));
    const totalDiscount = round2(lines.reduce((s, x) => s + x.disc, 0));
    const totalGst = round2(lines.reduce((s, x) => s + x.gst, 0));
    const total = round2(lines.reduce((s, x) => s + x.total, 0));
    return { subtotal, totalDiscount, totalGst, total };
  }, [form.items]);

  // Ensure line-item table always opens from the first columns (Product/Batch).
  useEffect(() => {
    if (!open || modalLoading) return;
    const el = itemsWrapRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollLeft = 0;
    });
    return () => cancelAnimationFrame(id);
  }, [open, modalLoading, editing?.id]);

  const hasLockedMfg = (form.items || []).some((it) => Boolean(it.mfgPurchaseLocked));
  const hasMissingNewBatchNo = (form.items || []).some((it) => Boolean(it.isNewBatch) && Boolean(clean(it.productId)) && !clean(it.batchNo));
  const hasLineValidationErrors = (form.items || []).some((it) => {
    if (!clean(it.productId)) return true;
    if (!clean(it.batchId) && !Boolean(it.isNewBatch)) return true;
    if (!(Number(it.qty || 0) > 0)) return true;
    if (!(Number(it.purchaseRate || 0) > 0)) return true;
    if (!(Number(it.mrp || 0) > 0)) return true;
    return false;
  });
  const editingStatus = clean(editing?.status).toUpperCase();
  const isEditingDraft = Boolean(editing?.id) && editingStatus === "DRAFT";
  const canSaveDraft =
    (isEditingDraft ? canUpdate : canAdd) &&
    Boolean(clean(form.divisionId) || clean(form.vendorId)) &&
    (form.items || []).length > 0 &&
    !hasMissingNewBatchNo &&
    !hasLineValidationErrors &&
    !busy;
  const canCreateAndConfirm = canAdd && !editing?.id && canSaveDraft && !hasLockedMfg;
  const canConfirmFromModal = canUpdate && isEditingDraft && !hasLockedMfg && !busy && !saveBusy;
  const canUpdateConfirmedFromModal = canUpdate && Boolean(editing?.id) && editingStatus === "CONFIRMED" && !hasLockedMfg && !busy && !updateConfirmedBusy;
  const canAddPaymentFromModal =
    Boolean(editing?.id) && editing?.status === "CONFIRMED" && Number(editing?.balance_due || 0) > 0 && !busy && !paymentSaveBusy;
  purchaseKbdRef.current = {
    canSaveDraft,
    canCreateAndConfirm,
    canConfirmFromModal,
    isEditDraft: Boolean(editing?.id) && editingStatus === "DRAFT",
    busy
  };

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (!isCmPanelTopStackLayer(modalBodyRef.current)) return;
      if (!e.ctrlKey && !e.shiftKey && e.key === "ArrowDown") {
        const el = document.activeElement;
        if (el?.tagName === "SELECT" && Number(el.size) <= 1) {
          e.preventDefault();
          openFocusedDropdown(el);
          return;
        }
      }
      const state = purchaseKbdRef.current;
      if (state.busy) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (state.isEditDraft && state.canConfirmFromModal && editing?.id) {
          setConfirm({ open: true, id: editing.id, type: "confirm", invoiceNumber: editing.invoice_number || "" });
          return;
        }
        if (state.canCreateAndConfirm) void createAndConfirmRef.current();
        return;
      }
      if (!e.altKey) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === "l") {
        e.preventDefault();
        setForm((p) => ({ ...p, items: [...(p.items || []), emptyLine()] }));
        return;
      }
      if (k === "s") {
        e.preventDefault();
        if (state.canSaveDraft) void saveDraft();
        return;
      }
      if (k === "k") {
        e.preventDefault();
        const first = modalBodyRef.current?.querySelector?.("[data-pi-focus='party'] select, [data-pi-focus='party'] input, [data-pi-focus='party'] button");
        if (first && typeof first.focus === "function") {
          try { first.focus(); } catch { /* ignore */ }
        }
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, editing?.id, editing?.invoice_number]);

  function resetEditor() {
    purchaseInvoiceLoadGenRef.current += 1;
    setSubmitted(false);
    setOpen(false);
    setEditing(null);
    setModalLoading(false);
    setLoadingEditId(null);
    setActiveLineIdx(0);
    setForm({ invoiceNumber: "", vendorInvoiceNumber: "", divisionId: "", vendorId: "", invoiceDate: localCalendarYmd(), dueDate: "", notes: "", items: [emptyLine()] });
  }

  async function openAddBatchForLine(lineIdx) {
    const line = (form.items || [])[lineIdx];
    const productId = String(line?.productId || "");
    if (!productId) {
      emitToast({ type: "warning", message: "Select a product first, then add batch." });
      return;
    }
    const p = (products || []).find((x) => String(x.id) === productId);
    setBatchModalLineIdx(lineIdx);
    setBatchModalSeed({
      productId,
      productCode: p?.code || line?.productCode || "",
      productName: p?.name || line?.productName || "",
      drugName: p?.drug_name || line?.drugName || "",
      divisionId: p?.division_id || form.divisionId || "",
      mfgCompanyId: p?.mfg_company_id || ""
    });
    setBatchModalDepsLoading(true);
    setBatchModalOpen(true);
    try {
      await refreshMasterDropdowns();
    } finally {
      setBatchModalDepsLoading(false);
    }
  }

  function openPaymentFromInvoice(source) {
    if (!source?.id) return;
    if (!source.division_id && !source.vendor_id) {
      emitToast({ type: "warning", message: "This invoice has no division or vendor linked; cannot record payment from here." });
      return;
    }
    setPaymentForm({
      invoiceId: source.id,
      divisionId: source.division_id || "",
      vendorId: source.vendor_id || "",
      paymentDate: localCalendarYmd(),
      amount: source.balance_due || "",
      paymentMode: "NEFT",
      referenceNumber: "",
      notes: ""
    });
    setPaymentOpen(true);
  }

  function setItem(idx, patch) {
    setForm((p) => ({
      ...p,
      items: (p.items || []).map((x, i) => (i === idx ? { ...x, ...patch } : x))
    }));
  }

  async function ensureSupplierInsights(productId, hintText = "") {
    const pid = String(productId || "");
    if (!pid) return;
    if (supplierInsightsByProduct[pid]) return;
    setInsightsBusyByProduct((p) => ({ ...p, [pid]: true }));
    const q = String(hintText || "").trim();
    const r = await searchProductsRich({ q, includeBatches: false, includeSuppliers: true, stockOnly: false, limit: 60 });
    if (r.status >= 200 && r.status < 300 && r.json?.ok) {
      const all = Array.isArray(r.json?.data?.suppliers) ? r.json.data.suppliers : [];
      setSupplierInsightsByProduct((p) => ({ ...p, [pid]: all.filter((x) => String(x.product_id || "") === pid) }));
    } else {
      setSupplierInsightsByProduct((p) => ({ ...p, [pid]: [] }));
    }
    setInsightsBusyByProduct((p) => ({ ...p, [pid]: false }));
  }

  function openForEdit(id) {
    if (!canUpdate) return;
    const pid = String(id || "");
    setOpen(true);
    setModalLoading(true);
    setLoadingEditId(pid);
    const gen = ++purchaseInvoiceLoadGenRef.current;
    requestAnimationFrame(() => {
      void loadPurchaseInvoiceForEdit(pid, gen);
    });
  }

  async function loadPurchaseInvoiceForEdit(id, gen) {
    try {
      const r = await getPurchaseInvoice(id);
      if (gen !== purchaseInvoiceLoadGenRef.current) return;
      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
        const invoice = r.json?.data?.invoice;
        const items = r.json?.data?.items || [];
        const productIndex = new Map((products || []).map((p) => [String(p.id), p]));
        const productIds = [...new Set(items.map((x) => String(x.product_id || "")).filter(Boolean))];
        const batchMap = new Map();
        await Promise.all(
          productIds.map(async (pid) => {
            const b = await listProductBatches({ productId: pid, product_id: pid });
            if (b.status >= 200 && b.status < 300 && b.json?.ok) {
              batchMap.set(pid, sortBatchesByExpiryAsc(b.json?.data?.items || []));
            } else {
              batchMap.set(pid, []);
            }
          })
        );
        if (gen !== purchaseInvoiceLoadGenRef.current) return;
        setEditing(invoice);
        setForm({
          invoiceNumber: invoice.invoice_number || "",
          vendorInvoiceNumber: invoice.vendor_invoice_number || "",
          divisionId: invoice.division_id || "",
          vendorId: invoice.vendor_id || "",
          invoiceDate: String(invoice.invoice_date || "").slice(0, 10),
          dueDate: String(invoice.due_date || "").slice(0, 10),
          notes: invoice.notes || "",
          items: items.map((x) => ({
            productId: x.product_id || "",
            productName: x.product_name || "",
            productCode: x.product_code || "",
            productSearch: formatProductLabel({ name: x.product_name || "", code: x.product_code || "", drug_name: x.drug_name || "" }),
            batchId: x.batch_id || "",
            batchNo: x.batch_no || "",
            batchSearch: `${x.batch_no || ""} | Exp ${String(x.expiry_date || "").slice(0, 10)}${batchExpiryDaysInlineSuffix(x.expiry_date)}`,
            expiryDate: String(x.expiry_date || "").slice(0, 10),
            mfgDate: String(x.mfg_date || "").slice(0, 10),
            qty: n(x.qty),
            freeQty: n(x.free_qty),
            purchaseRate: n(x.purchase_rate),
            mrp: n(x.mrp),
            salesRate: n(x.sales_rate ?? x.purchase_rate),
            discountPercent: n(x.discount_percent),
            gstPercent: n(x.gst_percent),
            landingCost: n(x.landing_cost),
            hsnCode: x.hsn_code || "",
            isNewBatch: Boolean(x.is_new_batch || !x.batch_id),
            currentStock: n((batchMap.get(String(x.product_id || "")) || []).find((b) => String(b.id) === String(x.batch_id || ""))?.total_stock ?? x.batch_current_stock),
            mfgPurchaseLocked: Boolean(productIndex.get(String(x.product_id || ""))?.mfg_purchase_order_lock),
            mfgCompanyName: productIndex.get(String(x.product_id || ""))?.mfg_company_name || "",
            availableBatches: batchMap.get(String(x.product_id || "")) || []
          }))
        });
      } else if (r.status !== 401) {
        emitToast({ type: "error", message: parseApiError(r) });
        if (gen === purchaseInvoiceLoadGenRef.current) setOpen(false);
      }
    } finally {
      if (gen === purchaseInvoiceLoadGenRef.current) {
        setModalLoading(false);
        setLoadingEditId(null);
      }
    }
  }

  async function performSaveDraft({ confirmAfterSave = false } = {}) {
    setSaveBusy(true);
    const payload = { ...form, items: form.items, clientToday: localCalendarYmd() };
    const r = editing?.id ? await updatePurchaseInvoice(editing.id, payload) : await createPurchaseInvoice(payload);
    if (r.status >= 200 && r.status < 300 && r.json?.ok) {
      const savedId = String(r.json?.data?.invoice?.id || editing?.id || "");
      if (confirmAfterSave && savedId) {
        const confirmed = await confirmPurchaseInvoice(savedId, {});
        if (!(confirmed.status >= 200 && confirmed.status < 300 && confirmed.json?.ok)) {
          emitToast({ type: "error", message: `Draft created, but confirm failed: ${parseApiError(confirmed)}` });
          resetEditor();
          await refreshPurchaseTableOnly();
          setSaveBusy(false);
          return;
        }
      }
      resetEditor();
      await refreshPurchaseTableOnly();
    } else if (r.status !== 401) {
      emitToast({ type: "error", message: parseApiError(r) });
    }
    setSaveBusy(false);
  }

  async function saveDraft() {
    if (!canSaveDraft) return;
    const dup = (rows || []).find(
      (x) =>
        String(x.id) !== String(editing?.id || "") &&
        String(x.status || "").toUpperCase() !== "CANCELLED" &&
        ((clean(form.divisionId) && String(x.division_id || "") === String(form.divisionId)) ||
          (clean(form.vendorId) && String(x.vendor_id || "") === String(form.vendorId))) &&
        clean(x.vendor_invoice_number).toLowerCase() !== "" &&
        clean(x.vendor_invoice_number).toLowerCase() === clean(form.vendorInvoiceNumber).toLowerCase()
    );
    if (dup) {
      setDupConfirm({
        open: true,
        vendorInvoiceNumber: clean(form.vendorInvoiceNumber),
        existingInvoiceNumber: clean(dup.invoice_number),
        action: "draft"
      });
      return;
    }
    await performSaveDraft();
  }

  async function createAndConfirm() {
    if (!canCreateAndConfirm) return;
    const dup = (rows || []).find(
      (x) =>
        String(x.id) !== String(editing?.id || "") &&
        String(x.status || "").toUpperCase() !== "CANCELLED" &&
        ((clean(form.divisionId) && String(x.division_id || "") === String(form.divisionId)) ||
          (clean(form.vendorId) && String(x.vendor_id || "") === String(form.vendorId))) &&
        clean(x.vendor_invoice_number).toLowerCase() !== "" &&
        clean(x.vendor_invoice_number).toLowerCase() === clean(form.vendorInvoiceNumber).toLowerCase()
    );
    if (dup) {
      setDupConfirm({
        open: true,
        vendorInvoiceNumber: clean(form.vendorInvoiceNumber),
        existingInvoiceNumber: clean(dup.invoice_number),
        action: "confirm"
      });
      return;
    }
    await performSaveDraft({ confirmAfterSave: true });
  }

  createAndConfirmRef.current = createAndConfirm;

  if (!canView) {
    return (
      <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user">
        <div className="pageWrap">
          <div className="pageCard">
            <div className="raTitle">{NAV_LABELS.purchaseInvoices}</div>
            <div className="raSub">You do not have permission to view purchase invoices.</div>
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
            <div className="raTitle">{isRetailer ? "Purchases" : NAV_LABELS.purchaseInvoices}</div>
            <div className="raSub">
              {isRetailer
                ? "Record stock you purchased from suppliers. Confirm to update batch stock and pricing."
                : "Create drafts, confirm to post stock, track payments and returns."}
            </div>
          </div>
        </div>
        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            compact
            countText={busy ? "Loading..." : `${rows.length} invoices`}
            search={search}
            onSearchChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            sort={sort}
            onSortChange={setSort}
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            filters={[
              { id: "status", label: "Status", value: statusFilter, onChange: (v) => { setStatusFilter(v); setPage(1); }, options: [{ value: "", label: "All status" }, { value: "DRAFT", label: "Draft" }, { value: "CONFIRMED", label: "Confirmed" }, { value: "CANCELLED", label: "Cancelled" }] },
              { id: "payment", label: "Payment", value: paymentFilter, onChange: (v) => { setPaymentFilter(v); setPage(1); }, options: [{ value: "", label: "All payment" }, { value: "UNPAID", label: "Unpaid" }, { value: "PARTIAL", label: "Partial" }, { value: "PAID", label: "Paid" }] },
              ...(isRetailer
                ? [
                    {
                      id: "vendor",
                      label: "Supplier",
                      value: vendorFilter,
                      onChange: (v) => { setVendorFilter(v); setPage(1); },
                      options: [
                        { value: "", label: "All suppliers" },
                        ...(vendors || []).map((v) => ({ value: v.id, label: v.name || v.code || String(v.id) }))
                      ]
                    }
                  ]
                : [
                    {
                      id: "division",
                      label: "Division",
                      value: divisionFilter,
                      onChange: (v) => { setDivisionFilter(v); setPage(1); },
                      options: [
                        { value: "", label: "All divisions" },
                        ...(divisions || []).map((d) => toDivisionOption(d))
                      ]
                    },
                    {
                      id: "mfg",
                      label: "Manufacturer",
                      value: mfgFilter,
                      onChange: (v) => { setMfgFilter(v); setPage(1); },
                      options: [{ value: "", label: "All manufacturers" }, ...(mfgCompanies || []).map((c) => ({ value: c.id, label: c.name || c.code || String(c.id) }))]
                    }
                  ]),
              { id: "from", label: "Date From", type: "date", value: dateFrom, onChange: (v) => { setDateFrom(v); setPage(1); } },
              { id: "to", label: "Date To", type: "date", value: dateTo, onChange: (v) => { setDateTo(v); setPage(1); } }
            ]}
            extraHeaderActions={
              canAdd ? (
                <TableCsvActions
                  disabled={busy}
                  onImport={() => setImportOpen(true)}
                  onExport={() => {
                    const cols = [
                      { key: "invoice_number", label: "invoice_number" },
                      { key: "invoice_date", label: "invoice_date" },
                      { key: "status", label: "status" },
                      { key: "vendor_name", label: "supplier_name" },
                      { key: "total_amount", label: "total_amount" }
                    ];
                    downloadCsvFile(
                      "purchase_invoices_export.csv",
                      cols,
                      rows.map((r) => ({
                        invoice_number: r.invoice_number,
                        invoice_date: String(r.invoice_date || "").slice(0, 10),
                        status: r.status,
                        vendor_name: r.vendor_name || r.division_name || "",
                        total_amount: r.total_amount
                      }))
                    );
                  }}
                />
              ) : null
            }
            primaryAction={
              canAdd
                ? {
                    label: "Create purchase invoice",
                    onClick: () => {
                      purchaseInvoiceLoadGenRef.current += 1;
                      setEditing(null);
                      setModalLoading(false);
                      setLoadingEditId(null);
                      const defaultDivisionId = !isRetailer ? clean(divisionFilter) : "";
                      const defaultVendorId = isRetailer ? clean(vendorFilter) : "";
                      setForm({
                        invoiceNumber: "",
                        vendorInvoiceNumber: "",
                        divisionId: defaultDivisionId,
                        vendorId: defaultVendorId,
                        invoiceDate: localCalendarYmd(),
                        dueDate: "",
                        notes: "",
                        items: [emptyLine()]
                      });
                      setOpen(true);
                    }
                  }
                : null
            }
            rows={rows}
            getRowId={(r) => r.id}
            onRowClick={canUpdate ? (r) => openForEdit(r.id) : undefined}
            onSelectionChange={setSelectedPurchaseIds}
            bulkActions={[
              {
                id: "bulk-print",
                label: "Print invoices",
                icon: "print",
                disabled: !selectedPurchaseIds.length || bulkPaymentBusy || bulkConfirmBusy,
                danger: false,
                onClick: runBulkPrintPurchaseInvoices
              },
              {
                id: "bulk-payment",
                label: bulkPaymentBusy ? "Completing Payment…" : `Complete Payment (${bulkCompletePaymentCount})`,
                icon: "payment",
                disabled: bulkPaymentBusy || bulkCompletePaymentCount === 0 || bulkConfirmBusy || bulkSendPurchaseEmailBusy,
                danger: false,
                onClick: runBulkSettlePayments
              },
              {
                id: "bulk-email-supplier",
                label: bulkSendPurchaseEmailBusy ? "Emailing…" : "Email PDF to supplier",
                icon: "email",
                disabled: bulkSendPurchaseEmailBusy || bulkPaymentBusy || bulkConfirmBusy || !selectedPurchaseIds.length,
                danger: false,
                onClick: runBulkSendPurchaseByEmail
              },
              {
                id: "bulk-confirm-stock",
                label: bulkConfirmBusy ? "Confirming…" : `Confirm & post stock (${bulkDraftPurchaseConfirmCount})`,
                icon: "confirm",
                danger: false,
                disabled: bulkConfirmBusy || bulkPaymentBusy || bulkDraftPurchaseConfirmCount === 0 || !canUpdate || bulkSendPurchaseEmailBusy,
                onClick: () => {
                  const sel = new Set((selectedPurchaseIds || []).map(String));
                  const ids = (rows || [])
                    .filter((r) => sel.has(String(r.id)) && String(r.status || "").toUpperCase() === "DRAFT")
                    .map((r) => r.id);
                  setBulkConfirmPurchaseDialog({ open: true, ids });
                }
              }
            ]}
            bulkDelete={
              canUpdate
                ? {
                    label: "Cancel All",
                    confirmTitle: "Cancel selected purchase invoices?",
                    confirmMessage: (n) =>
                      `Cancel ${n} invoice(s)? Confirmed invoices will be reversed in stock where applicable; some rows may fail individually.`,
                    confirmLabel: "Cancel All",
                    danger: true,
                    isRowSelectable: (r) => r.status !== "CANCELLED",
                    onDelete: async (ids) => {
                      setBusy(true);
                      const r = await bulkCancelPurchaseInvoices(ids, { cancelReason: "Bulk cancelled from UI" });
                      setBusy(false);
                      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                        const failed = r.json?.data?.failed || [];
                        if (failed.length) emitToast({ type: "warning", message: `${failed.length} invoice(s) could not be cancelled.` });
                        await refreshPurchaseTableOnly();
                      } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                    }
                  }
                : undefined
            }
            columns={[
              { id: "invoice_number", header: "Invoice No", render: (r) => <span style={{ fontWeight: 800 }}>{r.invoice_number}</span> },
              { id: "vendor_invoice_number", header: isRetailer ? "Supplier Inv No" : "Div Inv No", render: (r) => <span>{clean(r.vendor_invoice_number) || ""}</span> },
              {
                id: "party",
                header: isRetailer ? "Supplier" : "Division (Mfg)",
                render: (r) => {
                  if (r.division_label || r.division_name) {
                    const n = r.division_label || r.division_name || "";
                    const m = r.division_mfg_name || "";
                    return <span>{m ? `${n} (${m})` : n}</span>;
                  }
                  return <span>{r.vendor_name || ""}</span>;
                }
              },
              { id: "invoice_date", header: "Invoice Date", render: (r) => <span>{ymd(r.invoice_date)}</span> },
              { id: "due_date", header: "Due Date", sortable: false, render: (r) => <span>{ymd(r.due_date)}</span> },
              {
                id: "age",
                header: "Age",
                sortable: false,
                align: "right",
                render: (r) => {
                  const d = daysFrom(r.invoice_date);
                  const color = d == null ? undefined : d > 60 ? "var(--color-danger)" : d > 30 ? "var(--color-warning)" : d > 7 ? "var(--color-primary)" : "var(--color-text-3)";
                  return <span style={{ fontWeight: 700, color }}>{d == null ? "" : `${d}d`}</span>;
                }
              },
              {
                id: "due_in",
                header: "Due In",
                sortable: false,
                align: "right",
                render: (r) => {
                  const d = daysFrom(r.due_date);
                  if (d == null) return <span></span>;
                  if (d > 0) return <span style={{ color: "var(--color-danger)", fontWeight: 700 }}>{`${d}d overdue`}</span>;
                  if (d === 0) return <span style={{ color: "var(--color-warning)", fontWeight: 700 }}>TODAY</span>;
                  return <span style={{ color: "var(--color-success)", fontWeight: 700 }}>{`+${Math.abs(d)}d`}</span>;
                }
              },
              { id: "status", header: "Status", render: (r) => <span style={{ fontWeight: 800 }}>{r.status}</span> },
              { id: "payment_status", header: "Payment", render: (r) => <span style={{ fontWeight: 700 }}>{r.status === "CANCELLED" ? "N/A" : r.payment_status}</span> },
              { id: "total_amount", header: "Total", align: "right", render: (r) => <span>{money(r.total_amount)}</span> },
              { id: "balance_due", header: "Balance", align: "right", render: (r) => <span>{money(r.balance_due)}</span> },
              { id: "created_at", header: "Created", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{ymd(r.created_at)}</span> },
              {
                id: "return_status",
                header: "Returns",
                sortable: false,
                align: "center",
                render: (r) => {
                  if (r.status !== "CONFIRMED") return null;
                  const rs = String(r.return_status || "NONE");
                  if (rs === "FULL") return <span className="piReturnStatusBadge piReturnStatusBadge_full"><span className="piReturnStatusDot" />Fully Returned</span>;
                  if (rs === "PARTIAL") return <span className="piReturnStatusBadge piReturnStatusBadge_partial"><span className="piReturnStatusDot" />Partial Return</span>;
                  return null;
                }
              },
              {
                id: "actions",
                header: "Actions",
                sortable: false,
                align: "right",
                render: (r) => (
                  <div className="ibGroup" onClick={(e) => e.stopPropagation()}>
                   <IconBtn tooltip="View or open invoice" disabled={busy} onClick={() => openForEdit(r.id)}>
                     <IconView />
                   </IconBtn>
                   <IconBtn
                     tooltip="Print purchase invoice"
                     disabled={busy || Boolean(printingPurchaseIds[String(r.id)])}
                     onClick={() => printPurchaseInvoice(r.id)}
                   >
                     <IconPrint />
                   </IconBtn>
                   {r.status !== "CANCELLED" ? (
                     <IconBtn
                       tooltip="Email purchase PDF to supplier"
                       disabled={busy || sendingPurchaseEmailById[String(r.id)]}
                       onClick={() => runSendPurchaseInvoices([r.id])}
                     >
                       <IconEmail />
                     </IconBtn>
                   ) : null}
                    {r.status === "DRAFT" && canUpdate ? (
                      <IconBtn tooltip="Edit draft" disabled={busy} onClick={() => openForEdit(r.id)}>
                        <IconEdit />
                      </IconBtn>
                    ) : null}
                    {r.status === "DRAFT" && canUpdate ? (
                      <IconBtn
                        tooltip="Confirm and post stock"
                        variant="success"
                        disabled={busy}
                        onClick={() => setConfirm({ open: true, id: r.id, type: "confirm", invoiceNumber: r.invoice_number || "" })}
                      >
                        <IconConfirm />
                      </IconBtn>
                    ) : null}
                    {r.status === "CONFIRMED" ? (
                      <>
                        {String(r.payment_status || "").toUpperCase() !== "PAID" ? (
                          <IconBtn
                            tooltip="Add supplier payment"
                            variant="blue"
                            disabled={busy}
                            onClick={() => openPaymentFromInvoice(r)}
                          >
                            <IconPayment />
                          </IconBtn>
                        ) : null}
                        {String(r.return_status || "NONE") === "FULL" ? null
                        : String(r.return_status || "NONE") === "PARTIAL" ? (
                          <IconBtn
                              tooltip="Create additional purchase return"
                              variant="amber"
                              disabled={busy}
                              onClick={async () => {
                                setReturnForm({ invoiceId: r.id, returnDate: localCalendarYmd(), returnReason: "OTHER", notes: "", items: [] });
                                setReturnLoadingItems(true);
                                setReturnOpen(true);
                                try {
                                  const d = await getPurchaseInvoice(r.id);
                                  if (d.status >= 200 && d.status < 300 && d.json?.ok) {
                                    const items = d.json?.data?.items || [];
                                    setReturnForm((p) => ({
                                      ...p,
                                      items: items.map((x) => ({ purchaseInvoiceItemId: x.id, productName: x.product_name || "", batchNo: x.batch_no || "", purchasedQty: n(x.qty), purchasedFreeQty: n(x.free_qty), alreadyReturnedQty: n(x.already_returned_qty), alreadyReturnedFreeQty: n(x.already_returned_free_qty), returnQty: 0, returnFreeQty: 0 }))
                                    }));
                                  } else if (d.status !== 401) {
                                    emitToast({ type: "error", message: "Could not load invoice items for return." });
                                  }
                                } finally {
                                  setReturnLoadingItems(false);
                                }
                              }}
                            >
                              <IconReturn />
                            </IconBtn>
                        ) : (
                          <IconBtn
                            tooltip="Create purchase return"
                            variant="amber"
                            disabled={busy}
                            onClick={async () => {
                              setReturnForm({ invoiceId: r.id, returnDate: localCalendarYmd(), returnReason: "OTHER", notes: "", items: [] });
                              setReturnLoadingItems(true);
                              setReturnOpen(true);
                              try {
                                const d = await getPurchaseInvoice(r.id);
                                if (d.status >= 200 && d.status < 300 && d.json?.ok) {
                                  const items = d.json?.data?.items || [];
                                  setReturnForm((p) => ({
                                    ...p,
                                    items: items.map((x) => ({ purchaseInvoiceItemId: x.id, productName: x.product_name || "", batchNo: x.batch_no || "", purchasedQty: n(x.qty), purchasedFreeQty: n(x.free_qty), alreadyReturnedQty: n(x.already_returned_qty), alreadyReturnedFreeQty: n(x.already_returned_free_qty), returnQty: 0, returnFreeQty: 0 }))
                                  }));
                                } else if (d.status !== 401) {
                                  emitToast({ type: "error", message: "Could not load invoice items for return." });
                                }
                              } finally {
                                setReturnLoadingItems(false);
                              }
                            }}
                          >
                            <IconReturn />
                          </IconBtn>
                        )}
                      </>
                    ) : null}
                    {r.status !== "CANCELLED" && canUpdate && Number(r.amount_paid || 0) <= 0 ? (
                      <IconBtn
                        tooltip={Number(r.amount_paid || 0) > 0 ? "Paid/partial invoices cannot be cancelled." : "Cancel purchase invoice"}
                        variant="danger"
                        disabled={busy}
                        onClick={() => setConfirm({ open: true, id: r.id, type: "cancel", invoiceNumber: r.invoice_number || "" })}
                      >
                        <IconCancel />
                      </IconBtn>
                    ) : null}
                    {canRemoveFromList(r) && canDelete ? (
                      <IconBtn
                        tooltip="Hide this draft or cancelled invoice from the list (soft delete)"
                        variant="danger"
                        disabled={busy}
                        onClick={() => setConfirm({ open: true, id: r.id, type: "delete", invoiceNumber: r.invoice_number || "" })}
                      >
                        <IconTrash />
                      </IconBtn>
                    ) : null}
                  </div>
                )
              }
            ]}
            pagination={
              pagination
                ? {
                    page: pagination.page,
                    totalPages: pagination.total_pages,
                    onPrev: () => setPage((p) => Math.max(1, p - 1)),
                    onNext: () => setPage((p) => Math.min(pagination.total_pages || p, p + 1))
                  }
                : null
            }
          />
        </div>
      </div>

      <CommonModal
        open={open}
        ariaLabel="purchase-invoice-editor"
        title={modalLoading && loadingEditId ? "Opening invoice…" : editing?.id ? (isRetailer ? "Edit Purchase" : "Edit Purchase Invoice") : (isRetailer ? "Add Purchase" : "Add Purchase Invoice")}
        subtitle={modalLoading && loadingEditId ? "Loading lines and stock options" : ""}
        icon={<IconReceipt />}
        loading={modalLoading || saveBusy || busy}
        loadingText={
          saveBusy ? "Saving invoice…" : busy ? "Working…" : "Loading invoice and product batches…"
        }
        shortcutsItems={PURCHASE_EDITOR_SHORTCUTS}
        onClose={() => {
          purchaseInvoiceLoadGenRef.current += 1;
          setModalLoading(false);
          setLoadingEditId(null);
          setOpen(false);
        }}
        size={1100}
        footer={
          <div className="piModalFooter sfmModalFooter">
            <button className="piGhostBtn sfmBtnGhost" type="button" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className={`${editing?.id ? "piPrimaryBtn sfmBtnPrimary" : "piGhostBtn sfmBtnGhost"}`} type="button" disabled={busy || !(editingStatus === "DRAFT" || !editing?.id) || !(isEditingDraft ? canUpdate : canAdd)} onClick={() => { setSubmitted(true); saveDraft(); }}>
              {saveBusy ? <InlineButtonProgress label="Saving..." /> : editing?.id ? "Save Draft" : "Create Draft"}
            </button>
            {editing?.id && editingStatus === "CONFIRMED" ? (
              <button
                className="piPrimaryBtn piPrimaryBtn_confirm sfmBtnPrimary"
                type="button"
                disabled={!canUpdateConfirmedFromModal}
                onClick={async () => {
                  setUpdateConfirmedBusy(true);
                  const payload = { ...form, items: form.items, clientToday: localCalendarYmd(), allowConfirmedEdit: true };
                  const r = await updatePurchaseInvoice(editing.id, payload);
                  if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                    resetEditor();
                    await refreshPurchaseTableOnly();
                  } else if (r.status !== 401) {
                    emitToast({ type: "error", message: parseApiError(r) });
                  }
                  setUpdateConfirmedBusy(false);
                }}
              >
                {updateConfirmedBusy ? <InlineButtonProgress label="Updating..." /> : "Update Confirmed"}
              </button>
            ) : null}
            {canAddPaymentFromModal ? (
              <button className="piPrimaryBtn piPrimaryBtn_payment sfmBtnPrimary" type="button" disabled={!canAddPaymentFromModal} onClick={() => openPaymentFromInvoice(editing)}>
                Add Payment
              </button>
            ) : null}
            {!editing?.id ? (
              <button className="piPrimaryBtn piPrimaryBtn_confirm sfmBtnPrimary" type="button" disabled={busy || !canAdd} onClick={() => { setSubmitted(true); createAndConfirm(); }}>
                {saveBusy ? <InlineButtonProgress label="Working..." /> : "Create & Confirm"}
              </button>
            ) : null}
            {editing?.id && editingStatus === "DRAFT" ? (
              <button
                className="piPrimaryBtn piPrimaryBtn_confirm sfmBtnPrimary"
                type="button"
                disabled={busy || !canUpdate || !isEditingDraft}
                onClick={() => { setSubmitted(true); setConfirm({ open: true, id: editing.id, type: "confirm", invoiceNumber: editing.invoice_number || "" }); }}
              >
                Confirm & Post Stock
              </button>
            ) : null}
          </div>
        }
      >
        <div ref={modalBodyRef} className="piModalForm">
          <div className="piSection">
            <div className="piSectionBody">
              <div className="piHeaderTop">
                <div className="raField piHeadField piHeadField_party" data-pi-focus="party">
                  <label>{isRetailer ? "Supplier" : "Division"} </label>
                  {isRetailer ? (
                    <MasterSelectWithCreate
                      kind="vendor"
                      value={form.vendorId || ""}
                      onChange={(vendorId) =>
                        setForm((p) => ({
                          ...p,
                          vendorId,
                          divisionId: "",
                          ...(!editing?.id ? { items: [emptyLine()] } : {})
                        }))
                      }
                      onListsRefresh={refreshMasterDropdowns}
                      placeholder="Select supplier"
                      options={(vendors || [])
                        .filter((v) => Boolean(v.is_active) || String(v.id) === String(form.vendorId || ""))
                        .map((v) => ({ value: v.id, label: v.name || v.code || String(v.id) }))}
                    />
                  ) : (
                    <MasterSelectWithCreate
                      kind="division"
                      productMfgOptions={mfgCompanies}
                      value={form.divisionId || ""}
                      onChange={(divisionId) =>
                        setForm((p) => ({
                          ...p,
                          divisionId,
                          vendorId: "",
                          ...(!editing?.id ? { items: [emptyLine()] } : {})
                        }))
                      }
                      onListsRefresh={refreshMasterDropdowns}
                      placeholder="Select division"
                      options={(divisions || [])
                        .filter((d) => Boolean(d.is_active) || String(d.id) === String(form.divisionId || ""))
                        .map((d) => toDivisionOption(d))}
                    />
                  )}
                  {submitted && !form.divisionId && !form.vendorId && <div className="mfzErr">{isRetailer ? "Supplier" : "Division"} is required.</div>}
                </div>
                <div className="raField piHeadField piHeadField_invDate">
                  <label>Invoice Date </label>
                  <CommonDatePicker
                    value={form.invoiceDate}
                    onChange={(v) =>
                      setForm((p) => {
                        const days = isRetailer
                          ? Number((vendors || []).find((x) => String(x.id) === String(p.vendorId))?.credit_days || 0)
                          : Number((divisions || []).find((x) => String(x.id) === String(p.divisionId))?.credit_days || 0);
                        return {
                          ...p,
                          invoiceDate: v,
                          dueDate: clean(p.dueDate) ? p.dueDate : addDaysYmd(v, days)
                        };
                      })
                    }
                    ariaLabel="Invoice date"
                  />
                </div>
                <div className="raField piHeadField piHeadField_dueDate">
                  <label>Due Date</label>
                  <CommonDatePicker value={form.dueDate} onChange={(v) => setForm((p) => ({ ...p, dueDate: v }))} ariaLabel="Due date" />
                </div>
              </div>
              <div className="piHeaderRow2">
                <div className="raField piHeadField piHeadField_invNo">
                  <label>{isRetailer ? "Supplier Invoice No" : "Division Invoice No"}</label>
                  <input className="raInput" value={form.vendorInvoiceNumber} onChange={(e) => setForm((p) => ({ ...p, vendorInvoiceNumber: e.target.value }))} placeholder={isRetailer ? "Bill no. printed on supplier's invoice" : ""} />
                </div>
                <div className="raField piHeadField piHeadField_notes">
                  <label>Notes</label>
                  <input className="raInput" value={form.notes || ""} placeholder="Optional: refs, memo" onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>
              {!isRetailer && clean(form.divisionId) ? (
                <div className="piCreditLine">
                  {(() => {
                    const d = (divisions || []).find((x) => String(x.id) === String(form.divisionId));
                    if (!d) return "";
                    const outstanding = (rows || [])
                      .filter((x) => String(x.division_id) === String(d.id) && String(x.status) === "CONFIRMED" && ["UNPAID", "PARTIAL"].includes(String(x.payment_status)))
                      .reduce((s, x) => s + Number(x.balance_due || 0), 0);
                    const phone = d.phone_number && d.phone_country_code ? `${d.phone_country_code} ${d.phone_number}`.trim() : d.phone_number || "";
                    return `Division: ${d.name || ""}${d.code ? ` (${d.code})` : ""}${phone ? ` | Phone: ${phone}` : ""}${outstanding > 0 ? ` | Outstanding: ${fmtCurrency(outstanding)}` : ""}`;
                  })()}
                </div>
              ) : null}
            </div>
          </div>

          <CommonLineItemsSection
            title="Line Items"
            wrapRef={itemsWrapRef}
            className="piSection"
            onAddLine={() => setForm((p) => ({ ...p, items: [...(p.items || []), emptyLine()] }))}
            addLineLabel="Add line item"
            addLineTitle="Add line item"
          >
              <CommonLineItemsTable className="piItemsTable" columns={purchaseLineColumns}>
                  {(form.items || []).map((it, idx) => (
                    <tr key={idx} className={`piItemRow ${idx === activeLineIdx ? "cliItemRow_active" : ""}`} onClick={() => setActiveLineIdx(idx)}>
                      <td><div className="piRowNum">{idx + 1}</div></td>
                      <td>
                        <MasterSelectWithCreate
                          kind="product"
                          selectClassName={`piLineSelect${submitted && !clean(it.productId) ? " piLineSelect_err" : ""}`}
                          selectAutoOpenOnFocus
                          value={it.productId || ""}
                          placeholder="Select product"
                          options={(productsForLines || []).map((p) => toProductOption(p))}
                          onListsRefresh={refreshMasterDropdowns}
                          onChange={async (productId, created) => {
                            setActiveLineIdx(idx);
                            const selected =
                              (created && String(created.id) === String(productId) ? created : null) ||
                              (productsForLines || []).find((p) => String(p.id) === String(productId)) ||
                              (products || []).find((p) => String(p.id) === String(productId));
                            setItem(idx, {
                              productId: selected?.id || "",
                              productName: selected?.name || "",
                              productCode: selected?.code || "",
                              productSearch: selected ? formatProductLabel(selected) : "",
                              batchId: "",
                              batchNo: "",
                              batchSearch: "",
                              expiryDate: "",
                              mfgDate: "",
                              mrp: 0,
                              salesRate: 0,
                              gstPercent: 0,
                              isNewBatch: false,
                              availableBatches: [],
                              mfgPurchaseLocked: Boolean(selected?.mfg_purchase_order_lock),
                              mfgCompanyName: selected?.mfg_company_name || ""
                            });
                            // Auto-populate header division from the product's division
                            // when the user picked a product without first choosing a division.
                            if (selected?.division_id && !clean(form.divisionId)) {
                              setForm((prev) => (clean(prev.divisionId) ? prev : { ...prev, divisionId: String(selected.division_id) }));
                            }
                            if (!selected?.id) return;
                            if (isRetailer) void ensureSupplierInsights(selected.id, selected?.name || selected?.code || "");
                            const selectedPid = String(selected.id || "");
                            setBatchInsightsBusyByProduct((p) => ({ ...p, [selectedPid]: true }));
                            try {
                              const b = await listProductBatches({ productId: selected.id, product_id: selected.id });
                              const raw = b.status >= 200 && b.status < 300 && b.json?.ok ? b.json?.data?.items || [] : [];
                              const batches = sortBatchesByExpiryAsc(raw);
                              const first = batches[0];
                              setForm((prev) => ({
                                ...prev,
                                items: (prev.items || []).map((row, i) => {
                                  if (i !== idx || String(row.productId || "") !== String(selected.id)) return row;
                                  if (!first) return { ...row, availableBatches: batches };
                                  return { ...row, availableBatches: batches, ...buildPurchaseLineUpdateFromBatch(first) };
                                })
                              }));
                            } finally {
                              setBatchInsightsBusyByProduct((p) => ({ ...p, [selectedPid]: false }));
                            }
                          }}
                        />
                      </td>
                      <td>
                        <div className="piBatchCell">
                          <CommonSelectField
                            className={`piLineSelect${submitted && !clean(it.batchId) && !it.isNewBatch ? " piLineSelect_err" : ""}`}
                            value={it.batchId || ""}
                            placeholder="Select batch"
                            options={sortBatchesByExpiryAsc(it.availableBatches || []).map((b) => {
                              const ex = String(b.expiry_date || "").slice(0, 10);
                              return {
                                value: b.id,
                                label: `${b.batch_no} | Exp ${ex}${batchExpiryDaysInlineSuffix(ex)} | Stock ${n(b.total_stock)}`
                              };
                            })}
                            onChange={(value) => {
                              const selectedBatch = sortBatchesByExpiryAsc(it.availableBatches || []).find((x) => String(x.id) === String(value));
                              if (!selectedBatch) {
                                setItem(idx, {
                                  isNewBatch: false,
                                  batchId: "",
                                  batchSearch: "",
                                  batchNo: "",
                                  expiryDate: "",
                                  mfgDate: "",
                                  currentStock: 0
                                });
                                return;
                              }
                              setItem(idx, buildPurchaseLineUpdateFromBatch(selectedBatch));
                            }}
                          />
                          <CommonInlineAddButton
                            title="Add new batch"
                            label="Add"
                            variant="icon"
                            iconSize={16}
                            onClick={() => openAddBatchForLine(idx)}
                          />
                        </div>
                      </td>
                      <td>
                        <div
                          className={`piExpiryLabel ${clean(it.expiryDate) ? "" : "piExpiryLabel_muted"}`}
                          title={
                            clean(it.expiryDate)
                              ? `${clean(it.expiryDate)} · ${formatBatchExpiryRelativePhrase(it.expiryDate)}`
                              : "Select batch to see expiry"
                          }
                        >
                          <span className="piExpiryYmd">{clean(it.expiryDate) || "--"}</span>
                          {clean(it.expiryDate) ? (
                            <span className="piExpiryMeta">{formatBatchExpiryRelativePhrase(it.expiryDate)}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {it.batchId ? (
                          <div
                            className="piStockCell"
                            title={`${isRetailer ? "Warehouse" : "Division"} stock before this purchase`}
                          >
                            <span className={`piStockPill ${Number(it.currentStock || 0) <= 0 ? "is-zero" : ""}`}>
                              {n(it.currentStock)}
                            </span>
                          </div>
                        ) : (
                          <span className="piStockDash"></span>
                        )}
                      </td>
                      <td>
                        <input className={`raInput piNum${submitted && !(Number(it.qty || 0) > 0) ? " piInput_err" : ""}`} type="text" inputMode="numeric" pattern="[0-9]*" value={it.qty} onChange={(e) => setItem(idx, { qty: e.target.value.replace(/[^0-9]/g, "") })} />
                      </td>
                      <td><input className="raInput piNum" type="text" inputMode="numeric" pattern="[0-9]*" value={it.freeQty} onChange={(e) => setItem(idx, { freeQty: e.target.value.replace(/[^0-9]/g, "") })} /></td>
                      <td><AmountInput className={`raInput piNum${submitted && !(Number(it.purchaseRate || 0) > 0) ? " piInput_err" : ""}`} value={String(it.purchaseRate ?? "")} onChange={(raw) => setItem(idx, { purchaseRate: raw })} inputMode="decimal" /></td>
                      <td><AmountInput className={`raInput piNum${submitted && !(Number(it.mrp || 0) > 0) ? " piInput_err" : ""}`} value={String(it.mrp ?? "")} onChange={(raw) => setItem(idx, { mrp: raw })} inputMode="decimal" /></td>
                      <td><AmountInput className="raInput piNum" value={String(it.salesRate ?? "")} onChange={(raw) => setItem(idx, { salesRate: raw })} inputMode="decimal" /></td>
                      <td><input className="raInput piNum" type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" value={it.discountPercent} onChange={(e) => setItem(idx, { discountPercent: e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1") })} /></td>
                      <td>
                        <CommonSelectField
                          className="piLineSelect"
                          value={String(it.gstPercent)}
                          placeholder={`${taxLabel} %`}
                          options={(taxRates.length ? taxRates : [0, 5, 12, 18, 28]).map((v) => ({ value: String(v), label: `${v}%` }))}
                          onChange={(v) => setItem(idx, { gstPercent: Number(v) })}
                        />
                      </td>
                      <td className={`piAmountCell ${n(computeLineParts(it).total) === 0 ? "piAmountZero" : ""}`}>{money(computeLineParts(it).total)}</td>
                      <td>
                        <LineRemoveButton
                          className="piTrashBtn"
                          title="Remove line"
                          disabled={(form.items || []).length <= 1}
                          onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                        />
                      </td>
                    </tr>
                  ))}
              </CommonLineItemsTable>
          </CommonLineItemsSection>
            {submitted && hasLineValidationErrors && (
              <div className="piLineErrBanner">
                Some line items are incomplete — please fill in Product, Batch, Qty, Purchase Rate and MRP for every row.
              </div>
            )}
            {(form.items || []).map((it, idx) =>
              it.mfgPurchaseLocked ? <div key={`lock-${idx}`} className="psErr">{`Purchase is locked for manufacturer: ${it.mfgCompanyName || "Selected company"}. This item cannot be confirmed.`}</div> : null
            )}
            {activeProductId ? (
              <div className="piInsights">
                <div className="piInsightsHead">
                  <div className="piInsightsTitle">
                    Batches & {isRetailer ? "Suppliers" : "Division"} for: {activeProduct?.name || activeLine?.productName || "Selected product"}
                  </div>
                  {insightsLoading ? (
                    <div className="piInsightsSub">
                      <CommonLoading variant="inline" text={`Loading ${isRetailer ? "suppliers and batches" : "division and batches"}...`} />
                    </div>
                  ) : null}
                </div>
                <div className="piInsightsGrid">
                  <div className="piInsightsCard">
                    <div className="piInsightsCardHead">Batches</div>
                    <div className="piInsightsBody">
                      {insightsLoading ? (
                        <div className="piInsightsEmpty">
                          <CommonLoading variant="inline" text="Loading batches..." />
                        </div>
                      ) : !(activeBatches || []).length ? (
                        <div className="piInsightsEmpty">No in-stock batches found for this product.</div>
                      ) : (
                        <div className="piInsightsTableWrap">
                          <table className="piInsightsTable">
                            <thead>
                              <tr>
                                <th>Batch</th>
                                <th>Expiry</th>
                                <th className="num">Stock</th>
                                <th className="num">P.Rate</th>
                                <th className="num">MRP</th>
                                <th className="num">{taxLabel}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeBatches.slice(0, 8).map((b, bIdx) => (
                                <tr key={String(b.id || `${b.batch_no || "batch"}-${b.expiry_date || bIdx}`)}>
                                  <td>{b.batch_no || ""}</td>
                                  <td>
                                    <div className="piInsightExpiryCell">
                                      <span>{String(b.expiry_date || "").slice(0, 10) || ""}</span>
                                      {b.expiry_date ? (
                                        <span className="piInsightExpirySub">{formatBatchExpiryRelativePhrase(b.expiry_date)}</span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="num">{n(b.total_stock)}</td>
                                  <td className="num">{money(b.purchase_rate)}</td>
                                  <td className="num">{money(b.mrp)}</td>
                                  <td className="num">{n(b.purchase_gst)}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                  {isRetailer ? (
                    <div className="piInsightsCard">
                      <div className="piInsightsCardHead">
                        Suppliers for this product
                        <span className="piCardHeadMeta">
                          {`${supplierSnapshot.supplierCount} supplier(s)${batchSnapshot.bestBatchByRate ? ` · Best batch rate: ${fmtCurrency(batchSnapshot.bestBatchByRate.purchase_rate)}` : ""}`}
                        </span>
                      </div>
                      <div className="piInsightsBody">
                        {insightsLoading ? (
                          <div className="piInsightsEmpty">
                            <CommonLoading variant="inline" text="Loading suppliers..." />
                          </div>
                        ) : !activeSuppliers.length ? (
                          <div className="piInsightsEmpty">No supplier mapping found.</div>
                        ) : (
                          <div className="piSupplierList">
                            {activeSuppliers
                              .slice()
                              .sort((a, b) => {
                                const ar = Number(a.last_purchase_rate || 0);
                                const br = Number(b.last_purchase_rate || 0);
                                if (ar > 0 && br > 0) return ar - br;
                                if (ar > 0) return -1;
                                if (br > 0) return 1;
                                return String(b.last_purchase_date || "").localeCompare(String(a.last_purchase_date || ""));
                              })
                              .slice(0, 6)
                              .map((s) => (
                                <div className={`piSupplierItem ${String(form.vendorId || "") === String(s.vendor_id || "") ? "is-selected" : ""}`} key={`${s.product_id}-${s.vendor_id}`}>
                                  {String(s.vendor_id || "") === String(supplierSnapshot.latest?.vendor_id || "") ||
                                  String(s.vendor_id || "") === String(supplierSnapshot.bestRate?.vendor_id || "") ? (
                                    <div className="piSupplierBadges">
                                      {String(s.vendor_id || "") === String(supplierSnapshot.latest?.vendor_id || "") ? (
                                        <div className="piSupplierBadge">Latest Purchase</div>
                                      ) : null}
                                      {String(s.vendor_id || "") === String(supplierSnapshot.bestRate?.vendor_id || "") ? (
                                        <div className="piSupplierBadge piSupplierBadge_best">Best Rate</div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  <div className="piSupplierTop">
                                    <div className="piSupplierName">{s.vendor_name || s.vendor_short || "Supplier"}</div>
                                    <button
                                      type="button"
                                      className="piSupplierSelectBtn"
                                      onClick={() => setForm((p) => ({ ...p, vendorId: String(s.vendor_id || "") }))}
                                      disabled={!s.vendor_id || String(form.vendorId || "") === String(s.vendor_id || "")}
                                    >
                                      {String(form.vendorId || "") === String(s.vendor_id || "") ? "Selected" : "Select"}
                                    </button>
                                  </div>
                                  <div className="piSupplierMeta">
                                    <span>Last Purchase: {s.last_purchase_date ? String(s.last_purchase_date).slice(0, 10) : ""}</span>
                                    <span>Last rate: {s.last_purchase_rate != null ? fmtCurrency(s.last_purchase_rate) : ""}</span>
                                    <span>Last amount: {s.last_purchase_line_total != null ? fmtCurrency(s.last_purchase_line_total) : ""}</span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="piInsightsCard">
                      <div className="piInsightsCardHead">
                        Division insights
                        <span className="piCardHeadMeta">{`${divisionInsightSnapshot.batchCount} batch(es)`}</span>
                      </div>
                      <div className="piInsightsBody">
                        {insightsLoading ? (
                          <div className="piInsightsEmpty">
                            <CommonLoading variant="inline" text="Loading division insights..." />
                          </div>
                        ) : !(activeBatches || []).length ? (
                          <div className="piInsightsEmpty">No batch insight available for this product.</div>
                        ) : (
                          <div className="piDivisionInsights">
                            <div className="piDivisionInsightItem">
                              <span className="piDivisionInsightKey">Total Stock</span>
                              <span className="piDivisionInsightVal">{n(divisionInsightSnapshot.totalStock)}</span>
                            </div>
                            <div className="piDivisionInsightItem">
                              <span className="piDivisionInsightKey">Nearest Expiry</span>
                              <span className="piDivisionInsightVal">
                                {divisionInsightSnapshot.nearestExpiry?._d || ""}
                                {divisionInsightSnapshot.nearestExpiry?._d && divisionInsightSnapshot.nearestExpiryDays != null
                                  ? divisionInsightSnapshot.nearestExpiryDays >= 0
                                    ? ` (in ${divisionInsightSnapshot.nearestExpiryDays}d)`
                                    : ` (expired ${Math.abs(divisionInsightSnapshot.nearestExpiryDays)}d ago)`
                                  : ""}
                              </span>
                            </div>
                            <div className="piDivisionInsightItem">
                              <span className="piDivisionInsightKey">Best Batch Rate</span>
                              <span className="piDivisionInsightVal">
                                {divisionInsightSnapshot.bestRate > 0 ? money(divisionInsightSnapshot.bestRate) : ""}
                              </span>
                            </div>
                            <div className="piDivisionInsightItem">
                              <span className="piDivisionInsightKey">Current Line Rate</span>
                              <span className={`piDivisionInsightVal ${divisionInsightSnapshot.rateDiff > 0 ? "is-warn" : ""}`}>
                                {divisionInsightSnapshot.currentRate > 0 ? money(divisionInsightSnapshot.currentRate) : ""}
                                {divisionInsightSnapshot.rateDiff > 0 ? ` (${money(divisionInsightSnapshot.rateDiff)} higher)` : ""}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            <div className="cliSummaryStrip" style={{gridTemplateColumns: "repeat(5, minmax(110px, 1fr))"}}>
              <div className="cliSummaryCell">
                <div className="cliSummaryLabel">Subtotal</div>
                <div className="cliSummaryValue">{money(totals.subtotal)}</div>
              </div>
              <div className="cliSummaryCell">
                <div className="cliSummaryLabel">(-) Discount</div>
                <div className="cliSummaryValue">{money(totals.totalDiscount)}</div>
              </div>
              <div className="cliSummaryCell">
                <div className="cliSummaryLabel">(+) {taxLabel}</div>
                <div className="cliSummaryValue">{money(totals.totalGst)}</div>
              </div>
              <div className="cliSummaryCell cliSummaryCell_total">
                <div className="cliSummaryLabel">Total Payable</div>
                <div className="cliSummaryValue">{money(totals.total)}</div>
              </div>
              <div className="cliSummaryCell">
                <div className="cliSummaryLabel">Items</div>
                <div className="cliSummaryValue">{(form.items || []).length}</div>
              </div>
            </div>
          </div>
      </CommonModal>

      <PartyContactEmailModal
        open={sendVendorContact.open}
        title="Supplier email for invoice"
        icon={<IconEmail />}
        partySubtitle={sendVendorContact.vendorName ? `Supplier: ${sendVendorContact.vendorName}` : ""}
        permissionWarning={!canUpdateVendor ? "You need permission to update suppliers to add email here." : undefined}
        email={sendVendorContactForm.email}
        phone=""
        phoneCountryCode="+91"
        onEmailChange={(v) => setSendVendorContactForm({ email: v })}
        showPhoneFields={false}
        canSave={canUpdateVendor}
        saving={savingVendorContact}
        onClose={() => (savingVendorContact ? null : setSendVendorContact({ open: false, pendingIds: [], vendorId: "", vendorName: "" }))}
        onSave={saveVendorContactAndResend}
      />

      <ProductBatchModal
        open={batchModalOpen}
        mode="add"
        busy={batchModalBusy}
        depsLoading={batchModalDepsLoading}
        initialValue={batchModalSeed}
        existingRows={[]}
        productOptions={products}
        divisionOptions={(divisions || []).filter((d) => Boolean(d.is_active) || String(d.id) === String(batchModalSeed?.divisionId || ""))}
        mfgCompanyOptions={mfgCompanies}
        onRefreshDivisionMfg={refreshMasterDropdowns}
        onClose={() => {
          if (batchModalBusy || batchModalDepsLoading) return;
          setBatchModalOpen(false);
          setBatchModalLineIdx(-1);
          setBatchModalSeed(null);
        }}
        onSubmit={async (payload) => {
          setBatchModalBusy(true);
          const r = await createProductBatch(payload);
          if (r.status >= 200 && r.status < 300 && r.json?.ok) {
            const createdBatchId = String(r.json?.data?.item?.id || "");
            const line = (form.items || [])[batchModalLineIdx];
            const productId = String(line?.productId || payload?.productId || batchModalSeed?.productId || "");
            const bRes = await listProductBatches({ productId, product_id: productId });
            const rawBatches = bRes.status >= 200 && bRes.status < 300 && bRes.json?.ok ? bRes.json?.data?.items || [] : [];
            const availableBatches = sortBatchesByExpiryAsc(rawBatches);
            const b = availableBatches.find((x) => String(x.id) === createdBatchId) || null;
            setForm((prev) => ({
              ...prev,
              items: (prev.items || []).map((x, i) => {
                if (i !== batchModalLineIdx) return x;
                if (!b) return { ...x, availableBatches };
                return { ...x, availableBatches, ...buildPurchaseLineUpdateFromBatch(b) };
              })
            }));
            setBatchModalOpen(false);
            setBatchModalLineIdx(-1);
            setBatchModalSeed(null);
          } else if (r.status !== 401) {
            emitToast({ type: "error", message: parseApiError(r) });
          }
          setBatchModalBusy(false);
        }}
      />

      <CommonModal
        open={paymentOpen}
        title="Record payment"
        icon={<IconWallet />}
        onClose={() => setPaymentOpen(false)}
        size="md"
        loading={paymentSaveBusy}
        loadingText="Saving payment…"
        footer={
          <div className="piModalFooter sfmModalFooter">
            <button className="piGhostBtn sfmBtnGhost" type="button" onClick={() => setPaymentOpen(false)} disabled={busy || paymentSaveBusy}>Cancel</button>
            <button
              className="piPrimaryBtn sfmBtnPrimary"
              type="button"
              disabled={
                busy ||
                paymentSaveBusy ||
                !paymentForm.invoiceId ||
                !(n(paymentForm.amount) > 0) ||
                (!clean(paymentForm.divisionId) && !clean(paymentForm.vendorId))
              }
              onClick={async () => {
                setPaymentSaveBusy(true);
                const amt = n(paymentForm.amount);
                const r = clean(paymentForm.divisionId)
                  ? await createDivisionPayment({
                      purchaseInvoiceId: paymentForm.invoiceId,
                      divisionId: paymentForm.divisionId,
                      paymentDate: paymentForm.paymentDate,
                      amount: amt,
                      paymentMode: paymentForm.paymentMode,
                      referenceNumber: paymentForm.referenceNumber,
                      notes: paymentForm.notes
                    })
                  : await createVendorPayment({ ...paymentForm, amount: amt });
                if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                  setPaymentOpen(false);
                  await refresh();
                } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                setPaymentSaveBusy(false);
              }}
            >
              {paymentSaveBusy ? <InlineButtonProgress label="Saving..." /> : "Save payment"}
            </button>
          </div>
        }
      >
        <div className="sfmGrid">
          <div className="raField"><label>Date </label><CommonDatePicker value={paymentForm.paymentDate} onChange={(v) => setPaymentForm((p) => ({ ...p, paymentDate: v }))} ariaLabel="Payment date" /></div>
          <div className="raField"><label>Amount </label><AmountInput className="raInput" value={String(paymentForm.amount ?? "")} onChange={(raw) => setPaymentForm((p) => ({ ...p, amount: raw }))} inputMode="decimal" /></div>
          <div className="raField"><label>Mode</label><select className="raInput" value={paymentForm.paymentMode} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentMode: e.target.value }))}><option>CASH</option><option>CHEQUE</option><option>NEFT</option><option>UPI</option><option>OTHER</option></select></div>
          <div className="raField"><label>Reference</label><input className="raInput" value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm((p) => ({ ...p, referenceNumber: e.target.value }))} /></div>
        </div>
      </CommonModal>

      <CommonModal
        open={returnOpen}
        title="Create Purchase Return"
        icon={<IconRotateBox />}
        onClose={() => { setReturnOpen(false); setReturnLoadingItems(false); }}
        size="lg"
        loading={returnLoadingItems || returnBusy}
        loadingText={returnBusy ? "Creating return…" : "Loading invoice lines…"}
        footer={
          <ModalFooterShell>
            <AppButton variant="secondary" type="button" onClick={() => { setReturnOpen(false); setReturnLoadingItems(false); }} disabled={busy || returnBusy}>Cancel</AppButton>
            <AsyncButton
              variant="primary"
              type="button"
              disabled={
                busy || returnBusy || returnLoadingItems ||
                !(returnForm.items || []).some((it) => n(it.returnQty) > 0) ||
                (returnForm.items || []).some((it) => {
                  const maxQty = it.purchasedQty != null ? Math.max(0, n(it.purchasedQty) - n(it.alreadyReturnedQty)) : Infinity;
                  const maxFreeQty = it.purchasedFreeQty != null ? Math.max(0, n(it.purchasedFreeQty) - n(it.alreadyReturnedFreeQty)) : Infinity;
                  return n(it.returnQty) > maxQty || n(it.returnFreeQty) > maxFreeQty;
                })
              }
              loading={returnBusy}
              loadingText="Working..."
              onClick={async () => {
                setReturnBusy(true);
                const draft = await createPurchaseReturn({
                  purchaseInvoiceId: returnForm.invoiceId,
                  returnDate: returnForm.returnDate,
                  returnReason: returnForm.returnReason,
                  notes: returnForm.notes,
                  clientToday: localCalendarYmd(),
                  items: (returnForm.items || []).map((it) => ({
                    purchaseInvoiceItemId: it.purchaseInvoiceItemId,
                    returnQty: Number(it.returnQty || 0),
                    returnFreeQty: Number(it.returnFreeQty || 0)
                  }))
                });
                if (draft.status >= 200 && draft.status < 300 && draft.json?.ok) {
                  const id = draft.json?.data?.item?.id;
                  if (id) await confirmPurchaseReturn(id, {});
                  setReturnOpen(false);
                  await refresh();
                } else if (draft.status !== 401) emitToast({ type: "error", message: parseApiError(draft) });
                setReturnBusy(false);
              }}
            >
              Create &amp; confirm return
            </AsyncButton>
          </ModalFooterShell>
        }
      >
        <div className="piReturnHeader">
          <div className="piReturnHeaderGrid">
            <div className="piReturnField">
              <label className="piReturnFieldLabel">Return Date</label>
              <CommonDatePicker value={returnForm.returnDate} onChange={(v) => setReturnForm((p) => ({ ...p, returnDate: v }))} ariaLabel="Return date" />
            </div>
            <div className="piReturnField">
              <label className="piReturnFieldLabel">Return Reason</label>
              <select className="raInput" value={returnForm.returnReason} onChange={(e) => setReturnForm((p) => ({ ...p, returnReason: e.target.value }))}>
                <option value="DAMAGED">Damaged</option>
                <option value="EXPIRED">Expired</option>
                <option value="EXCESS">Excess Stock</option>
                <option value="QUALITY_ISSUE">Quality Issue</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div className="piReturnField" style={{ marginTop: 10 }}>
            <label className="piReturnFieldLabel">Notes <span className="piReturnOptional">(optional)</span></label>
            <textarea
              className="raInput piReturnNotes"
              rows={2}
              placeholder="Add any notes about this return…"
              value={returnForm.notes || ""}
              onChange={(e) => setReturnForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
        </div>
        {returnLoadingItems ? (
          <div className="piReturnItemsLoading">
            <CommonLoading size={28} />
            <span className="piReturnItemsLoadingText">Loading invoice items…</span>
          </div>
        ) : (returnForm.items || []).length > 0 && (
          <div className="piReturnItemsSection">
            <div className="piReturnItemsSectionHead">Return Items</div>
            <div className="piReturnRows">
              {(returnForm.items || []).map((it, idx) => {
                const maxQty = Math.max(0, n(it.purchasedQty) - n(it.alreadyReturnedQty));
                const maxFreeQty = Math.max(0, n(it.purchasedFreeQty) - n(it.alreadyReturnedFreeQty));
                const enteredQty = n(it.returnQty);
                const enteredFreeQty = n(it.returnFreeQty);
                const qtyExceeds = enteredQty > maxQty;
                const freeQtyExceeds = enteredFreeQty > maxFreeQty;
                return (
                  <div key={idx} className={`piReturnRow${maxQty <= 0 ? " piReturnRow_disabled" : ""}`}>
                    <div className="piReturnItemHeader">
                      <span className="piReturnItemName">{it.productName || "—"}</span>
                      {it.batchNo ? <span className="piReturnBatch">Batch: {it.batchNo}</span> : null}
                    </div>
                    {it.purchasedQty != null ? (
                      <div className="piReturnStats">
                        <span className="piReturnStat">
                          <span className="piReturnStatLabel">Purchased</span>
                          <span className="piReturnStatVal">{n(it.purchasedQty)}</span>
                        </span>
                        {n(it.alreadyReturnedQty) > 0 ? (
                          <span className="piReturnStat piReturnStat_returned">
                            <span className="piReturnStatLabel">Already Returned</span>
                            <span className="piReturnStatVal">{n(it.alreadyReturnedQty)}</span>
                          </span>
                        ) : null}
                        <span className={`piReturnStat${maxQty > 0 ? " piReturnStat_max" : " piReturnStat_zero"}`}>
                          <span className="piReturnStatLabel">Max Returnable</span>
                          <span className="piReturnStatVal">{maxQty}</span>
                        </span>
                      </div>
                    ) : null}
                    <div className="piReturnQtyFields">
                      <div className="piReturnQtyField">
                        <label className="piReturnFieldLabel">
                          Return Qty
                          {it.purchasedQty != null ? <span className="piReturnMaxHint"> · max {maxQty}</span> : null}
                        </label>
                        <input
                          className={`raInput piReturnQtyInput${qtyExceeds ? " piInput_err" : ""}`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          disabled={maxQty <= 0}
                          value={it.returnQty}
                          onChange={(e) => setReturnForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, returnQty: e.target.value.replace(/[^0-9]/g, "") } : x)) }))}
                        />
                        {qtyExceeds ? <span className="piReturnQtyErr">Exceeds max ({maxQty})</span> : null}
                      </div>
                      {maxFreeQty > 0 || n(it.purchasedFreeQty) > 0 ? (
                        <div className="piReturnQtyField">
                          <label className="piReturnFieldLabel">
                            Free Qty
                            {it.purchasedFreeQty != null ? <span className="piReturnMaxHint"> · max {maxFreeQty}</span> : null}
                          </label>
                          <input
                            className={`raInput piReturnQtyInput${freeQtyExceeds ? " piInput_err" : ""}`}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            disabled={maxFreeQty <= 0}
                            value={it.returnFreeQty}
                            onChange={(e) => setReturnForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, returnFreeQty: e.target.value.replace(/[^0-9]/g, "") } : x)) }))}
                          />
                          {freeQtyExceeds ? <span className="piReturnQtyErr">Exceeds max ({maxFreeQty})</span> : null}
                        </div>
                      ) : null}
                    </div>
                    {maxQty <= 0 ? (
                      <div className="piReturnRowFullyReturned">All units already returned</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CommonModal>

      <ConfirmDialog
        open={confirm.open}
        title={
          confirm.type === "delete"
            ? "Remove from list?"
            : confirm.type === "confirm"
              ? "Confirm invoice?"
              : "Cancel invoice?"
        }
        message={
          confirm.type === "delete"
            ? `Remove purchase ${confirm.invoiceNumber ? `“${confirm.invoiceNumber}”` : "invoice"} from your list? It will stay in the database for audit but will no longer appear here.`
            : confirm.type === "confirm"
              ? "This will post stock entries for all line items."
              : "This will cancel invoice and reverse stock if it was confirmed."
        }
        confirmLabel={confirm.type === "delete" ? "Remove" : confirm.type === "confirm" ? "Confirm" : "Cancel invoice"}
        cancelLabel="Close"
        danger={confirm.type !== "confirm"}
        busy={busy}
        onClose={() => setConfirm({ open: false, id: "", type: "confirm", invoiceNumber: "" })}
        onConfirm={async () => {
          if (!confirm.id) return;
          setBusy(true);
          if (confirm.type === "confirm" && hasLockedMfg) {
            emitToast({ type: "error", message: "Cannot confirm: one or more line items have manufacturer purchase lock enabled." });
            setBusy(false);
            return;
          }
          let r;
          if (confirm.type === "delete") {
            r = await deletePurchaseInvoice(confirm.id);
          } else {
            r =
              confirm.type === "confirm"
                ? await confirmPurchaseInvoice(confirm.id, {})
                : await cancelPurchaseInvoice(confirm.id, { cancelReason: "Cancelled from UI" });
          }
          if (r.status >= 200 && r.status < 300 && r.json?.ok) {
            await refreshPurchaseTableOnly();
            if (String(editing?.id || "") === String(confirm.id || "")) {
              if (confirm.type === "confirm" || confirm.type === "cancel" || confirm.type === "delete") {
                resetEditor();
              }
            }
            setConfirm({ open: false, id: "", type: "confirm", invoiceNumber: "" });
          } else if (r.status !== 401) {
            emitToast({ type: "error", message: parseApiError(r) });
          }
          setBusy(false);
        }}
      />
      <CommonModal
        open={bulkPaymentConfirm.open}
        title="Complete selected payments?"
        icon={<IconWallet />}
        onClose={() => (bulkPaymentBusy ? null : setBulkPaymentConfirm({ open: false, ids: [], count: 0, total: 0, paymentDate: "", paymentMode: "" }))}
        size="md"
        loading={bulkPaymentBusy}
        loadingText="Completing payments…"
        footer={
          <div className="piModalFooter sfmModalFooter">
            <button
              className="piGhostBtn sfmBtnGhost"
              type="button"
              onClick={() => setBulkPaymentConfirm({ open: false, ids: [], count: 0, total: 0, paymentDate: "", paymentMode: "" })}
              disabled={bulkPaymentBusy}
            >
              Cancel
            </button>
            <button className="piPrimaryBtn piPrimaryBtn_payment sfmBtnPrimary" type="button" onClick={confirmBulkSettlePayments} disabled={bulkPaymentBusy}>
              {bulkPaymentBusy ? <InlineButtonProgress label="Completing..." /> : "Complete payment"}
            </button>
          </div>
        }
      >
        <div className="sfmGrid">
          <div className="sfmFull piBulkPayBanner">
            <strong>{bulkPaymentConfirm.count || 0}</strong> invoice(s) selected | Total settlement: <strong>{fmtCurrency(bulkPaymentConfirm.total)}</strong>
          </div>
          <div className="raField">
            <label>Payment Date </label>
            <CommonDatePicker
              value={bulkPaymentConfirm.paymentDate || localCalendarYmd()}
              onChange={(v) => setBulkPaymentConfirm((p) => ({ ...p, paymentDate: v }))}
              ariaLabel="Bulk purchase payment date"
            />
          </div>
          <div className="raField">
            <label>Payment Mode </label>
            <select
              className="raInput"
              value={bulkPaymentConfirm.paymentMode || "NEFT"}
              onChange={(e) => setBulkPaymentConfirm((p) => ({ ...p, paymentMode: e.target.value }))}
            >
              <option value="CASH">CASH</option>
              <option value="CHEQUE">CHEQUE</option>
              <option value="NEFT">NEFT</option>
              <option value="UPI">UPI</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>
        </div>
      </CommonModal>
      <ConfirmDialog
        open={bulkConfirmPurchaseDialog.open}
        title="Confirm selected drafts?"
        message={`Post stock and confirm ${bulkConfirmPurchaseDialog.ids?.length || 0} draft purchase(s)?`}
        confirmLabel="Confirm all"
        cancelLabel="Close"
        busy={bulkConfirmBusy}
        danger={false}
        onClose={() => (bulkConfirmBusy ? null : setBulkConfirmPurchaseDialog({ open: false, ids: [] }))}
        onConfirm={async () => {
          const ids = bulkConfirmPurchaseDialog.ids || [];
          if (!ids.length) return;
          setBulkConfirmBusy(true);
          try {
            const r = await bulkConfirmPurchaseInvoices({ ids });
            setBulkConfirmPurchaseDialog({ open: false, ids: [] });
            if (r.status >= 200 && r.status < 300 && r.json?.ok) {
              const failed = r.json?.data?.failed || [];
              if (failed.length) {
                emitToast({
                  type: "warning",
                  message: `${failed.length} failed: ${failed
                    .map((f) => f.message)
                    .slice(0, 2)
                    .join("; ")}${failed.length > 2 ? "…" : ""}`
                });
              } else {
                emitToast({ type: "success", message: r.json?.meta?.message || "Purchase invoices confirmed." });
              }
              await refreshPurchaseTableOnly();
            } else if (r.status !== 401) {
              emitToast({ type: "error", message: parseApiError(r) });
            }
          } finally {
            setBulkConfirmBusy(false);
          }
        }}
      />
      <ConfirmDialog
        open={dupConfirm.open}
        title={`Possible duplicate ${isRetailer ? "supplier" : "division"} invoice`}
        message={`${isRetailer ? "Supplier" : "Division"} invoice number "${dupConfirm.vendorInvoiceNumber}" already exists as ${dupConfirm.existingInvoiceNumber}.`}
        confirmLabel="Save anyway"
        cancelLabel="Cancel"
        danger={false}
        busy={busy}
        onClose={() => setDupConfirm({ open: false, vendorInvoiceNumber: "", existingInvoiceNumber: "", action: "draft" })}
        onConfirm={async () => {
          const action = dupConfirm.action;
          setDupConfirm({ open: false, vendorInvoiceNumber: "", existingInvoiceNumber: "", action: "draft" });
          await performSaveDraft({ confirmAfterSave: action === "confirm" });
        }}
      />
      <CsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityType="PURCHASES"
        title="Import purchase invoices"
        onCompleted={() => refresh()}
      />
    </AppShell>
  );
}