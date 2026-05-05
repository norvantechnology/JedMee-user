import AmountInput from "../components/ui/AmountInput.jsx";
import { useSeoMeta } from "../utils/seo.js";
import { InlineButtonProgress } from "../components/ui/buttons.jsx";
import { fmtMoney, fmtMoneyINR } from "../utils/format.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppShell from "../layouts/AppShell.jsx";
import CommonTable from "../components/CommonTable.jsx";
import CommonModal from "../components/CommonModal.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import CommonSelectField from "../components/CommonSelectField.jsx";
import MasterSelectWithCreate from "../components/MasterSelectWithCreate.jsx";
import CommonInlineAddButton from "../components/CommonInlineAddButton.jsx";
import CommonLoading from "../components/CommonLoading.jsx";
import CommonDatePicker from "../components/CommonDatePicker.jsx";
import ProductBatchModal from "../components/ProductBatchModal.jsx";
import SchemeDiscountPopup from "../components/SchemeDiscountPopup.jsx";
import { readAuth } from "../services/authStorage.js";
import { can } from "../utils/access.js";
import { getCustomer, listCustomers, updateCustomer } from "../services/customerService.js";
import { listDivisions } from "../services/divisionService.js";
import { listMfgCompanies } from "../services/mfgCompanyService.js";
import {
  bulkCancelSalesInvoices,
  bulkConfirmSalesInvoices,
  bulkPrintSalesInvoices,
  cancelSalesInvoice,
  confirmSalesInvoice,
  bulkCompleteCustomerPayments,
  createCustomerPayment,
  createSalesInvoice,
  getSalesInvoice,
  listCustomerPayments,
  listSalesInvoices,
  printSalesInvoice,
  sendSalesInvoicesByEmail,
  updateSalesInvoice
} from "../services/salesService.js";
import { listProducts } from "../services/productService.js";
import { createProductBatch, listProductBatches } from "../services/productBatchService.js";
import { parseApiError, parseApiErrorToast } from "../utils/api.js";
import { toDivisionOption } from "../utils/divisionLabel.js";
import { formatProductLabel, toProductOption } from "../utils/productLabel.js";
import { sortBatchesByExpiryAsc } from "../utils/batchSort.js";
import { batchExpiryDaysInlineSuffix, formatBatchExpiryDaysCompact, formatBatchExpiryRelativePhrase } from "../utils/batchExpiryDisplay.js";
import { emitToast } from "../services/toastBus.js";
import { NAV_LABELS } from "../constants/navLabels.js";
import { salesInvoiceDefaultsStorageKey } from "../constants/brand.js";
import { printSalesInvoiceBulkDoc, printSalesInvoiceDoc } from "../print/salesInvoicePrint.js";
import { isRetailerAuth } from "../utils/businessRole.js";
import { focusAdjacentModalField, isCmPanelTopStackLayer, SALES_MODAL_FOCUS_BUTTON_ATTR } from "../utils/modalFocusNav.js";
import { openFocusedDropdown } from "../utils/dropdownKeyboard.js";
import KeyboardShortcutsModal, { KeyboardShortcutsTrigger } from "../components/KeyboardShortcutsModal.jsx";
import "../components/StructuredForm.css";
import "./PurchaseInvoicesPage.css";
import "./SalesBillingPage.css";
import CsvImportWizard from "../components/import/CsvImportWizard.jsx";
import { downloadCsvFile } from "../components/reports/reportExport.js";
import TableCsvActions from "../components/ui/TableCsvActions.jsx";
import { todayYmdLocal } from "../utils/date.js";
import PartyContactEmailModal from "../components/PartyContactEmailModal.jsx";
import { EMAIL_RE, customerToUpdatePayload } from "../utils/customerContactPayload.js";
import LineRemoveButton from "../components/ui/LineRemoveButton.jsx";
import CommonLineItemsSection from "../components/line-items/CommonLineItemsSection.jsx";
import CommonLineItemsTable from "../components/line-items/CommonLineItemsTable.jsx";
import { IconReceipt } from "../components/ui/AppIcons.jsx";
import {
  IconBtn,
  IconCancel,
  IconConfirm,
  IconEdit,
  IconEmail,
  IconPayment,
  IconPrint,
  IconReturn,
  IconView
} from "../components/TableActionKit.jsx";

/** Keyboard help for the sales invoice editor (opens from modal header). */
const SALES_BILLING_EDITOR_SHORTCUTS = [
  { description: "Next field", keys: "Enter" },
  { description: "Previous field", keys: "Shift+Enter" },
  { description: "Open focused dropdown", keys: "↓" },
  { description: "Change dropdown option", keys: "↑ / ↓" },
  { description: "Focus customer", keys: "Alt+K" },
  { description: "Add line item", keys: "Alt+L" },
  { description: "Save draft", keys: "Alt+S" },
  { description: "Confirm (unpaid) or save & confirm draft", keys: "Ctrl+Enter" },
  { description: "Confirm & mark paid (when enabled)", keys: "Ctrl+Shift+Enter" }
];

const LS_SALES_INVOICE_DEFAULTS = "medico_sales_invoice_defaults_v1";

function loadSalesFormDefaults() {
  try {
    const raw = localStorage.getItem(LS_SALES_INVOICE_DEFAULTS);
    if (!raw) return { customerId: "", divisionId: "" };
    const j = JSON.parse(raw);
    return { customerId: String(j.customerId || ""), divisionId: String(j.divisionId || "") };
  } catch {
    return { customerId: "", divisionId: "" };
  }
}

function persistSalesFormDefaults({ customerId, divisionId }) {
  try {
    localStorage.setItem(
      salesInvoiceDefaultsStorageKey(),
      JSON.stringify({ customerId: customerId || "", divisionId: divisionId || "" })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** Expiry display for read-only line cell: ok / soon / expired + days remaining. */
function expiryLabelClasses(ymd) {
  const s = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { text: "", className: "sbmExp sbmExp_muted" };
  const [y, m, d] = s.split("-").map(Number);
  const exp = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((exp.getTime() - today.getTime()) / (864e5));
  const short = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${String(y).slice(2)}`;
  const compact = formatBatchExpiryDaysCompact(s);
  const text = compact ? `${short} · ${compact}` : short;
  if (days < 0) return { text, className: "sbmExp sbmExp_bad" };
  if (days < 90) return { text, className: "sbmExp sbmExp_soon" };
  return { text, className: "sbmExp sbmExp_ok" };
}

function stockChipClass(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "sbmStockChip sbmStockChip_muted";
  if (x > 50) return "sbmStockChip sbmStockChip_ok";
  if (x > 10) return "sbmStockChip sbmStockChip_low";
  return "sbmStockChip sbmStockChip_crit";
}

function newLineKey() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `L${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clean(v) {
  return String(v ?? "").trim();
}

function addDaysYmd(ymd, days) {
  const s = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + Math.max(0, Number(days) || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function batchBillableQtyFromRow(b) {
  if (!b) return 0;
  if (b.stock_billable_qty != null && b.stock_billable_qty !== "") return Number(b.stock_billable_qty);
  if (b.current_stock != null && b.current_stock !== "") return Number(b.current_stock);
  return Number(b.total_stock ?? 0);
}

function batchFreeQtyFromRow(b) {
  if (!b) return 0;
  if (b.stock_free_qty != null && b.stock_free_qty !== "") return Number(b.stock_free_qty);
  if (b.current_free_stock != null && b.current_free_stock !== "") return Number(b.current_free_stock);
  return 0;
}

/** Label for batch `<select>` and `batchSearch` (no billable/paid or free stock counts). */
function batchDropdownLabel(b) {
  if (!b) return "";
  const ex = String(b.expiry_date || "").slice(0, 10);
  return `${b.batch_no || ""} | Exp ${ex}${batchExpiryDaysInlineSuffix(ex)}${b.is_hold ? " [ON HOLD]" : ""}`;
}

function computeLineTotal(it) {
  const qty = Number(it.qty || 0);
  const looseQty = Number(it.looseQty || 0);
  const packingUnits = Math.max(1, Number(it.packingUnits || 10));
  const rate = Number(it.salesRate || 0);
  const looseRate = rate / packingUnits;
  const discPct = Number(it.preventNetRate ? 0 : it.isNet ? it.netDiscountPercent || 0 : it.discountPercent || 0);
  const gstPct = Number(it.gstPercent || 0);
  const gross = qty * rate + looseQty * looseRate;
  const disc = gross * (discPct / 100);
  const schemeHalfTaxable = Boolean(it.isHalfScheme) ? Number(it.freeQty || 0) * rate * 0.5 : 0;
  const taxable = gross - disc + schemeHalfTaxable;
  const gst = taxable * (gstPct / 100);
  return taxable + gst;
}

function computeSalesLineParts(it) {
  const qty = Number(it.qty || 0);
  const looseQty = Number(it.looseQty || 0);
  const packingUnits = Math.max(1, Number(it.packingUnits || 10));
  const rate = Number(it.salesRate || 0);
  const looseRate = rate / packingUnits;
  const discPct = Number(it.preventNetRate ? 0 : it.isNet ? it.netDiscountPercent || 0 : it.discountPercent || 0);
  const gstPct = Number(it.gstPercent || 0);
  const gross = qty * rate + looseQty * looseRate;
  const disc = gross * (discPct / 100);
  const schemeHalfTaxable = Boolean(it.isHalfScheme) ? Number(it.freeQty || 0) * rate * 0.5 : 0;
  const taxable = gross - disc + schemeHalfTaxable;
  const gst = taxable * (gstPct / 100);
  return { gross, disc, gst, total: taxable + gst };
}

function batchWarehouseStock(items, batchId) {
  if (!batchId) return 0;
  const sid = String(batchId);
  for (const it of items) {
    if (it.batchId && String(it.batchId) === sid) return Number(it.availableStock ?? 0);
  }
  return 0;
}

function batchWarehouseFreeStock(items, batchId) {
  if (!batchId) return 0;
  const sid = String(batchId);
  for (const it of items) {
    if (it.batchId && String(it.batchId) === sid) return Number(it.availableFreeStock ?? 0);
  }
  return 0;
}

function otherLinesQtySameBatch(items, lineIndex) {
  const it = items[lineIndex];
  if (!it?.batchId) return 0;
  const sid = String(it.batchId);
  return items.reduce((s, row, j) => {
    if (j === lineIndex) return s;
    if (!row.batchId || String(row.batchId) !== sid) return s;
    return s + Number(row.qty || 0);
  }, 0);
}

function otherLinesFreeQtySameBatch(items, lineIndex) {
  const it = items[lineIndex];
  if (!it?.batchId) return 0;
  const sid = String(it.batchId);
  return items.reduce((s, row, j) => {
    if (j === lineIndex) return s;
    if (!row.batchId || String(row.batchId) !== sid) return s;
    return s + Number(row.freeQty || 0);
  }, 0);
}

function lineRemainingStock(items, lineIndex) {
  const it = items[lineIndex];
  if (!it?.batchId) return null;
  const wh = batchWarehouseStock(items, it.batchId);
  const usedElsewhere = otherLinesQtySameBatch(items, lineIndex);
  return Math.max(0, wh - usedElsewhere);
}

function lineStockExceededAtIndex(items, lineIndex) {
  const it = items[lineIndex];
  if (!it?.batchId) return false;
  const rem = lineRemainingStock(items, lineIndex);
  if (rem === null) return false;
  return Number(it.qty || 0) > rem;
}

function lineRemainingFreeStock(items, lineIndex) {
  const it = items[lineIndex];
  if (!it?.batchId) return null;
  const wh = batchWarehouseFreeStock(items, it.batchId);
  const usedElsewhere = otherLinesFreeQtySameBatch(items, lineIndex);
  return Math.max(0, wh - usedElsewhere);
}

function lineAfterCurrentStock(items, lineIndex) {
  const rem = lineRemainingStock(items, lineIndex);
  if (rem == null) return null;
  return Math.max(0, rem - Number(items?.[lineIndex]?.qty || 0));
}

function lineLooseCapacity(items, lineIndex) {
  const it = items[lineIndex];
  if (!it?.batchId) return null;
  const rem = lineRemainingStock(items, lineIndex);
  if (rem == null) return null;
  const factor = Math.max(1, Number(it.packingUnits || 10));
  const looseStock = Number(it.looseStock || 0);
  return looseStock + rem * factor;
}

function lineLooseExceededAtIndex(items, lineIndex) {
  const it = items[lineIndex];
  if (!it?.batchId) return false;
  const cap = lineLooseCapacity(items, lineIndex);
  if (cap == null) return false;
  return Number(it.looseQty || 0) > cap;
}

function lineFreeStockExceededAtIndex(items, lineIndex) {
  const it = items[lineIndex];
  if (!it?.batchId) return false;
  const rem = lineRemainingFreeStock(items, lineIndex);
  if (rem === null) return false;
  return Number(it.freeQty || 0) > rem;
}

function autoFreeQtyForScheme(it, qtyValue) {
  const qty = Number(qtyValue || 0);
  const paid = Number(it.schemeQtyPaid || 0);
  const free = Number(it.schemeQtyFree || 0);
  if (paid <= 0 || free <= 0 || qty <= 0) return 0;
  return Math.floor(qty / paid) * free;
}

const RATE_TYPES = [
  { key: "MRP", label: "1. MRP", title: "Maximum Retail Price  default for patients" },
  { key: "PURCHASE_RATE", label: "2. Pu.Rt", title: "Purchase Rate  your cost price (institutional)" },
  { key: "SPECIAL_RATE_1", label: "3. Sp.Rt", title: "Special Rate 1  custom negotiated rate" },
  { key: "SPECIAL_RATE_2", label: "4. Sl-Rt", title: "Special Rate 2 / Salesman Rate" },
  { key: "SALES_RATE", label: "5. Sl.Rt", title: "Sales Rate  your standard wholesale rate" }
];

const BILL_TYPES = [
  { value: "CASH_MEMO", label: "Cash Memo" },
  { value: "TAX_INVOICE", label: "Tax Invoice" },
  { value: "DEBIT", label: "Debit Note" },
  { value: "CREDIT", label: "Credit Note" }
];

function resolveRateForType(batch, rateType) {
  if (!batch) return 0;
  const mrp = Number(batch.mrp || 0);
  const map = {
    MRP: mrp,
    PURCHASE_RATE: Number(batch.purchase_rate || 0) || mrp,
    SPECIAL_RATE_1: Number(batch.special_rate_1 || 0) || Number(batch.retail_rate || 0) || mrp,
    SPECIAL_RATE_2: Number(batch.special_rate_2 || 0) || Number(batch.sales_rate || 0) || mrp,
    SALES_RATE: Number(batch.sales_rate || 0) || mrp,
    RETAIL_RATE: Number(batch.retail_rate || 0) || Number(batch.sales_rate || 0) || mrp
  };
  const v = map[String(rateType || "").toUpperCase()];
  return Number.isFinite(v) && v > 0 ? v : (Number(batch.sales_rate || 0) || mrp);
}

function resolveRateForLine(line, rateType) {
  return resolveRateForType(
    {
      mrp: line?.mrp,
      purchase_rate: line?.purchaseRate,
      sales_rate: line?.batchSalesRate,
      retail_rate: line?.retailRate,
      special_rate_1: line?.specialRate1,
      special_rate_2: line?.specialRate2
    },
    rateType
  );
}

function buildSalesLineUpdateFromBatch(x, b, rateType) {
  const label = batchDropdownLabel(b);
  const batchSnapshot = {
    mrp: Number(b?.mrp || 0),
    purchase_rate: Number(b?.purchase_rate || 0),
    sales_rate: Number(b?.sales_rate || 0),
    retail_rate: Number(b?.retail_rate || 0),
    special_rate_1: Number(b?.special_rate_1 || 0),
    special_rate_2: Number(b?.special_rate_2 || 0)
  };
  const resolvedRate = rateType
    ? resolveRateForType(batchSnapshot, rateType)
    : Number(b?.sales_rate || 0);
  return {
    batchSearch: label,
    batchId: b.id,
    batchNo: b?.batch_no || "",
    expiryDate: String(b?.expiry_date || "").slice(0, 10),
    mrp: Number(b?.mrp || 0),
    purchaseRate: Number(b?.purchase_rate || 0),
    batchSalesRate: Number(b?.sales_rate || 0),
    retailRate: Number(b?.retail_rate || 0),
    specialRate1: Number(b?.special_rate_1 || 0),
    specialRate2: Number(b?.special_rate_2 || 0),
    looseStock: Number(b?.loose_stock || 0),
    looseUnitName: String(b?.loose_unit_name || "TAB"),
    packingUnits: Math.max(1, Number(b?.packing_units || 10)),
    looseQty: 0,
    salesRate: resolvedRate,
    gstPercent: Number(b?.sales_gst || 0),
    availableStock: batchBillableQtyFromRow(b),
    availableFreeStock: batchFreeQtyFromRow(b),
    isHold: Boolean(b?.is_hold),
    holdReason: b?.hold_reason || "",
    saleLock: Boolean(b?.sale_lock),
    mfgName: b?.mfg_company_name || "",
    preventFreeQty: Boolean(b?.prevent_free_qty),
    preventDiscount: Boolean(b?.prevent_discount),
    preventNetRate: Boolean(b?.prevent_net_rate),
    isHalfScheme: Boolean(b?.is_half_scheme),
    isNet: Boolean(b?.is_net),
    netDiscountPercent: Number(b?.net_discount_percent || 0),
    isNonEditableFreeQty: Boolean(b?.is_non_editable_free_qty),
    schemeQtyPaid: Number(b?.scheme_qty_paid || 0),
    schemeQtyFree: Number(b?.scheme_qty_free || 0),
    isControl: Boolean(b?.is_control),
    freeQty: Boolean(b?.is_non_editable_free_qty)
      ? autoFreeQtyForScheme({ schemeQtyPaid: Number(b?.scheme_qty_paid || 0), schemeQtyFree: Number(b?.scheme_qty_free || 0) }, x.qty)
      : x.freeQty
  };
}

function formHasSaveBlockers(form) {
  const items = form.items || [];
  if (!items.length) return true;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.productId || !it.batchId) return true;
    if (Number(it.qty || 0) < 1) return true;
    if (lineStockExceededAtIndex(items, i)) return true;
    if (lineFreeStockExceededAtIndex(items, i)) return true;
    if (lineLooseExceededAtIndex(items, i)) return true;
    if (it.isHold || it.saleLock) return true;
    if (it.isControl) {
      if (!String(it.prescriptionNo || "").trim() || !String(it.doctorName || "").trim() || !String(it.patientName || "").trim()) return true;
    }
    const rate = Number(it.salesRate || 0);
    const mrp = Number(it.mrp || 0);
    if (mrp > 0 && rate > mrp) return true;
  }
  return false;
}

async function assessSalesDraftBeforeConfirm(invoiceId) {
  const g = await getSalesInvoice(invoiceId);
  if (!(g.status >= 200 && g.status < 300 && g.json?.ok)) {
    return { ok: false, message: parseApiError(g) };
  }
  const items = g.json?.data?.items || [];
  if (!items.length) return { ok: false, message: "This invoice has no line items." };

  const productIds = [...new Set(items.map((x) => String(x.product_id || "")).filter(Boolean))];
  const batchByProduct = new Map();
  await Promise.all(
    productIds.map(async (pid) => {
      const r = await listProductBatches({ productId: pid, product_id: pid });
      const list = r.status >= 200 && r.json?.ok ? r.json?.data?.items || [] : [];
      batchByProduct.set(pid, list);
    })
  );

  const qtyByBatch = new Map();
  const freeByBatch = new Map();
  for (const x of items) {
    const bid = String(x.batch_id);
    qtyByBatch.set(bid, (qtyByBatch.get(bid) || 0) + Number(x.qty || 0));
    freeByBatch.set(bid, (freeByBatch.get(bid) || 0) + Number(x.free_qty || 0));
  }

  const checkedBatches = new Set();
  for (const x of items) {
    const bid = String(x.batch_id);
    const batches = batchByProduct.get(String(x.product_id)) || [];
    const b = batches.find((bb) => String(bb.id) === bid);
    const stock = batchBillableQtyFromRow(b);
    const stockFree = batchFreeQtyFromRow(b);
    const name = x.product_name || "Product";
    const batchNo = x.batch_no || "?";
    if (!b) return { ok: false, message: `Batch missing or removed for "${name}" (${batchNo}). Edit the invoice and pick a valid batch.` };
    if (b.is_hold) return { ok: false, message: `Batch "${batchNo}" is on hold and cannot be sold.` };
    if (b.sale_lock) return { ok: false, message: `Sales are locked for manufacturer "${b.mfg_company_name || "policy"}" on this line.` };
    if (!checkedBatches.has(bid)) {
      checkedBatches.add(bid);
      const totalRequested = qtyByBatch.get(bid) || 0;
      const totalFreeRequested = freeByBatch.get(bid) || 0;
      if (totalRequested > stock) {
        const linesOnBatch = items.filter((row) => String(row.batch_id) === bid).length;
        return {
          ok: false,
          message: `Insufficient billable (paid) stock for "${name}" batch "${batchNo}". Billable: ${stock}; free balance: ${stockFree}. This invoice needs ${totalRequested} paid unit(s) across ${linesOnBatch} line(s). Paid qty cannot use the free balance.`
        };
      }
      if (totalFreeRequested > stockFree) {
        return {
          ok: false,
          message: `Insufficient free stock for "${name}" batch "${batchNo}". Free available: ${stockFree}, this invoice requests ${totalFreeRequested}. Reduce free qty or save again.`
        };
      }
    }
    if (b.is_control) {
      if (!String(x.prescription_no || "").trim()) return { ok: false, message: `Prescription number is required for controlled batch "${batchNo}".` };
      if (!String(x.doctor_name || "").trim()) return { ok: false, message: `Doctor name is required for controlled batch "${batchNo}".` };
      if (!String(x.patient_name || "").trim()) return { ok: false, message: `Patient name is required for controlled batch "${batchNo}".` };
    }
  }

  const expired = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const x of items) {
    const list = batchByProduct.get(String(x.product_id || "")) || [];
    const b = list.find((bb) => String(bb.id) === String(x.batch_id));
    const exp = String(b?.expiry_date || x.expiry_date || "").slice(0, 10);
    if (!exp) continue;
    const t = new Date(`${exp}T00:00:00`).getTime();
    if (Number.isFinite(t) && t < today) expired.push(`${x.product_name || "Product"} (${x.batch_no || "Batch"}) exp ${exp}`);
  }
  if (expired.length) {
    const proceed = globalThis.confirm(
      `Expired batch detected:\n- ${expired.join("\n- ")}\n\nContinue confirm anyway?`
    );
    if (!proceed) return { ok: false, aborted: true };
  }
  return { ok: true };
}

async function runSalesInvoiceConfirmPipeline(invoiceId, options = {}) {
  const pre = await assessSalesDraftBeforeConfirm(invoiceId);
  if (!pre.ok) {
    if (pre.aborted) return { ok: false, aborted: true };
    return { ok: false, toast: { type: "error", title: "Cannot confirm invoice", message: pre.message } };
  }
  const payload = {};
  if (options.markPaidAtConfirm === true) payload.markPaidAtConfirm = true;
  if (options.markPaidAtConfirm === false) payload.markPaidAtConfirm = false;
  const r = await confirmSalesInvoice(invoiceId, payload);
  if (r.status >= 200 && r.status < 300 && r.json?.ok) return { ok: true };
  return { ok: false, toast: { type: "error", ...parseApiErrorToast(r) } };
}

function emptyItem() {
  return {
    lineKey: newLineKey(),
    productId: "",
    batchId: "",
    qty: 1,
    freeQty: 0,
    looseQty: 0,
    salesRate: 0,
    mrp: 0,
    discountPercent: 0,
    gstPercent: 0,
    productName: "",
    productSearch: "",
    productCode: "",
    batchNo: "",
    batchSearch: "",
    expiryDate: "",
    availableStock: 0,
    availableFreeStock: 0,
    isHold: false,
    holdReason: "",
    saleLock: false,
    mfgName: "",
    preventFreeQty: false,
    preventDiscount: false,
    preventNetRate: false,
    isHalfScheme: false,
    isNet: false,
    netDiscountPercent: 0,
    isNonEditableFreeQty: false,
    schemeQtyPaid: 0,
    schemeQtyFree: 0,
    isControl: false,
    prescriptionNo: "",
    doctorName: "",
    patientName: "",
    availableBatches: []
  };
}

export default function SalesBillingPage() {
  useSeoMeta({ title: "Sales & Billing" });
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = readAuth();
  const user = auth?.user || null;
  const isRetailer = isRetailerAuth(auth);
  const canView = can("SALES_INVOICES", "VIEW");
  const canAdd = can("SALES_INVOICES", "ADD");
  const canUpdate = can("SALES_INVOICES", "UPDATE");
  const canDelete = can("SALES_INVOICES", "DELETE");
  const canUpdateCustomer = can("CUSTOMERS", "UPDATE");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [loadingEditId, setLoadingEditId] = useState(null);
  const salesInvoiceLoadGenRef = useRef(0);
  const [editing, setEditing] = useState(null);
  const [customerOutstanding, setCustomerOutstanding] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ customerId: "", salesInvoiceId: "", paymentDate: todayYmdLocal(), amount: "", paymentMode: "CASH", referenceNumber: "", notes: "", useAdvanceFirst: true });
  const [paymentAdvanceHint, setPaymentAdvanceHint] = useState({ available: 0, apply: 0, remaining: 0 });
  const [form, setForm] = useState({
    customerId: "",
    divisionId: "",
    invoiceDate: todayYmdLocal(),
    dueDate: "",
    notes: "",
    walkInPatientName: "",
    walkInPatientPhone: "",
    walkInDoctorName: "",
    walkInPrescriptionNo: "",
    cashReceived: "",
    rateType: "MRP",
    billType: "CASH_MEMO",
    globalDiscountPercent: 0,
    items: [emptyItem()]
  });

  // Dashboard quick action: `/sales-billing?new=1` auto-opens create modal.
  useEffect(() => {
    if (!canAdd) return;
    if (String(searchParams.get("new") || "") !== "1") return;
    salesInvoiceLoadGenRef.current += 1;
    setEditing(null);
    setModalLoading(false);
    setLoadingEditId(null);
    const d = loadSalesFormDefaults();
    const walk = isRetailer ? (customers || []).find((c) => Boolean(c.is_walk_in)) : null;
    setForm({
      customerId: isRetailer ? (walk?.id || d.customerId || "") : d.customerId,
      divisionId: isRetailer ? "" : d.divisionId,
      invoiceDate: todayYmdLocal(),
      dueDate: "",
      notes: "",
      walkInPatientName: "",
      walkInPatientPhone: "",
      walkInDoctorName: "",
      walkInPrescriptionNo: "",
      cashReceived: "",
      rateType: isRetailer ? "MRP" : "SALES_RATE",
      billType: "CASH_MEMO",
      globalDiscountPercent: 0,
      items: [emptyItem()]
    });
    setOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("new");
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdd, searchParams, isRetailer, customers]);
  const [confirm, setConfirm] = useState({ open: false, id: "", type: "confirm" });
  const [printingId, setPrintingId] = useState("");
  const [selectedSalesIds, setSelectedSalesIds] = useState([]);
  const [bulkPrintBusy, setBulkPrintBusy] = useState(false);
  const [bulkPaymentBusy, setBulkPaymentBusy] = useState(false);
  const [bulkConfirmBusy, setBulkConfirmBusy] = useState(false);
  const [bulkConfirmSalesDialog, setBulkConfirmSalesDialog] = useState({ open: false, ids: [] });
  const [bulkPaymentConfirm, setBulkPaymentConfirm] = useState({ open: false, ids: [], count: 0, total: 0, paymentDate: "", paymentMode: "" });
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchModalBusy, setBatchModalBusy] = useState(false);
  const [batchModalLineIdx, setBatchModalLineIdx] = useState(-1);
  const [batchModalSeed, setBatchModalSeed] = useState(null);
  const [batchModalDivisionOptions, setBatchModalDivisionOptions] = useState([]);
  const [batchModalMfgOptions, setBatchModalMfgOptions] = useState([]);
  const [schemePopup, setSchemePopup] = useState({ open: false, lineIdx: -1 });
  const [activeLineIdx, setActiveLineIdx] = useState(0);
  const [sendingEmailById, setSendingEmailById] = useState(() => ({}));
  const [savingSendContact, setSavingSendContact] = useState(false);
  const [sendContact, setSendContact] = useState({ open: false, pendingIds: [], customerId: "", customerName: "" });
  const [sendContactForm, setSendContactForm] = useState({ email: "", phone: "", phoneCountryCode: "+91" });
  const [importOpen, setImportOpen] = useState(false);

  // ref to the modal body for Enter-key navigation
  const modalBodyRef = useRef(null);
  /** Modal keydown effect only re-runs when `open` changes; keep latest confirm handlers here. */
  const createAndConfirmRef = useRef(() => Promise.resolve());
  const createAndConfirmPaidRef = useRef(() => Promise.resolve());
  const saveAndConfirmDraftRef = useRef(() => Promise.resolve());

  const bulkSendEmailBusy = useMemo(
    () => (selectedSalesIds || []).some((id) => sendingEmailById[String(id)]),
    [selectedSalesIds, sendingEmailById]
  );

  const bulkCompletePaymentCount = useMemo(() => {
    const sel = new Set((selectedSalesIds || []).map((x) => String(x)));
    return (rows || []).filter(
      (r) =>
        sel.has(String(r.id)) &&
        String(r.status || "").toUpperCase() === "CONFIRMED" &&
        Number(r.balance_due || 0) > 0
    ).length;
  }, [rows, selectedSalesIds]);

  const bulkDraftConfirmCount = useMemo(() => {
    const sel = new Set((selectedSalesIds || []).map((x) => String(x)));
    return (rows || []).filter((r) => sel.has(String(r.id)) && String(r.status || "").toUpperCase() === "DRAFT").length;
  }, [rows, selectedSalesIds]);

  const selectedPaymentInvoice = useMemo(
    () => (rows || []).find((x) => String(x.id) === String(paymentForm.salesInvoiceId || "")) || null,
    [rows, paymentForm.salesInvoiceId]
  );

  const selectedCustomer = useMemo(
    () => (customers || []).find((x) => String(x.id) === String(form.customerId || "")) || null,
    [customers, form.customerId]
  );
  const selectedCustomerIsWalkIn = Boolean(selectedCustomer?.is_walk_in);

  useEffect(() => {
    if (!sendContact.open || !sendContact.customerId) return;
    (async () => {
      const g = await getCustomer(sendContact.customerId);
      if (g.status >= 200 && g.status < 300 && g.json?.ok) {
        const c = g.json?.data?.customer;
        setSendContactForm({
          email: c.email || "",
          phone: c.phone_number || "",
          phoneCountryCode: c.phone_country_code || "+91"
        });
      }
    })();
  }, [sendContact.open, sendContact.customerId]);

  async function loadBatchesForProduct(productId) {
    if (!productId) return [];
    const b = await listProductBatches({ productId, product_id: productId });
    if (b.status >= 200 && b.status < 300 && b.json?.ok) return sortBatchesByExpiryAsc(b.json?.data?.items || []);
    return [];
  }

  async function refreshBatchModalMasters() {
    const [d, m] = await Promise.all([listDivisions({ sortBy: "name", sortDir: "asc", isActive: true }), listMfgCompanies({ limit: 500 })]);
    if (d.status >= 200 && d.status < 300 && d.json?.ok) setBatchModalDivisionOptions(d.json?.data?.divisions || []);
    if (m.status >= 200 && m.status < 300 && m.json?.ok) setBatchModalMfgOptions(m.json?.data?.companies || []);
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
      divisionId: "",
      mfgCompanyId: p?.mfg_company_id || ""
    });
    await refreshBatchModalMasters();
    setBatchModalOpen(true);
  }

  async function loadOutstanding(customerId) {
    if (!customerId) return setCustomerOutstanding(null);
    const selectedCustomer = (customers || []).find((c) => String(c.id) === String(customerId));
    const customerCreditLimit = Number(selectedCustomer?.credit_limit || 0);
    const forCustomer = (rows || []).filter((x) => String(x.customer_id) === String(customerId) && x.status === "CONFIRMED" && (x.payment_status === "UNPAID" || x.payment_status === "PARTIAL"));
    const outstandingAmount = forCustomer.reduce((s, x) => s + Number(x.balance_due || 0), 0);
    const outstandingBills = forCustomer.length;
    let oldestBillAgeDays = 0;
    if (forCustomer.length) {
      const oldest = [...forCustomer].sort((a, b) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime())[0];
      oldestBillAgeDays = Math.max(0, Math.floor((Date.now() - new Date(oldest.invoice_date).getTime()) / (1000 * 60 * 60 * 24)));
    }
    setCustomerOutstanding({ outstandingAmount, outstandingBills, oldestBillAgeDays, creditLimit: customerCreditLimit });
  }

  async function estimateAdvanceForInvoice(customerId, balanceDue) {
    const p = await listCustomerPayments({ customerId, limit: 500 });
    const items = p.status >= 200 && p.status < 300 && p.json?.ok ? p.json?.data?.items || [] : [];
    const available = items.reduce((s, x) => {
      const t = String(x.allocation_type || x.allocation_type_resolved || "").toUpperCase();
      return t === "ON_ACCOUNT" ? s + Number(x.amount || 0) : s;
    }, 0);
    const apply = Math.min(Number(balanceDue || 0), available);
    const remaining = Math.max(0, Number(balanceDue || 0) - apply);
    return { available, apply, remaining };
  }

  async function runSendInvoices(invoiceIds) {
    const ids = (invoiceIds || []).map((x) => String(x || "")).filter(Boolean);
    if (!canView || !ids.length) return;
    setSendingEmailById((s) => {
      const n = { ...s };
      for (const id of ids) n[id] = true;
      return n;
    });
    try {
      const r = await sendSalesInvoicesByEmail({ ids });
      if (!(r.status >= 200 && r.status < 300 && r.json?.ok)) {
        if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
        return;
      }
      const results = r.json?.data?.results || [];
      const noEmail = results.filter((x) => x.status === "no_email");
      if (noEmail.length) {
        const u = new Map();
        for (const x of noEmail) {
          if (x.customerId) u.set(String(x.customerId), true);
        }
        if (u.size > 1) {
          emitToast({
            type: "warning",
            message: "Some selected customers are missing an email. Add one customer at a time, or update contacts in Customers."
          });
        }
        const first = noEmail[0];
        setSendContact({ open: true, pendingIds: ids, customerId: first?.customerId || "", customerName: first?.customerName || "" });
        return;
      }
      const sent = results.filter((x) => x.status === "sent" || x.status === "sent_dry_run").length;
      const failed = results.filter(
        (x) => x.status === "send_failed" || x.status === "not_found" || x.status === "error" || x.status === "skipped"
      );
      if (sent) {
        const dry = (results || []).some((x) => x.status === "sent_dry_run");
        emitToast({
          type: "success",
          message: dry
            ? `${sent} invoice(s) would be emailed (configure SMTP on server to deliver).`
            : `Email sent for ${sent} invoice(s).`
        });
      }
      if (failed.length) emitToast({ type: "warning", message: `${failed.length} invoice(s) were skipped or failed.` });
    } finally {
      setSendingEmailById((s) => {
        const n = { ...s };
        for (const id of ids) delete n[id];
        return n;
      });
    }
  }

  async function saveSendContactAndResend() {
    if (!sendContact.customerId) return;
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
    const toRetry = [...(sendContact.pendingIds || [])];
    setSavingSendContact(true);
    try {
      const g = await getCustomer(sendContact.customerId);
      if (!(g.status >= 200 && g.json?.ok)) {
        if (g.status !== 401) emitToast({ type: "error", message: parseApiError(g) });
        return;
      }
      const c = g.json?.data?.customer;
      const u = await updateCustomer(
        sendContact.customerId,
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
      setSendContact({ open: false, pendingIds: [], customerId: "", customerName: "" });
      await refresh();
      await runSendInvoices(toRetry);
    } finally {
      setSavingSendContact(false);
    }
  }

  async function runBulkSendByEmail() {
    const list = (rows || []).filter(
      (r) => (selectedSalesIds || []).map(String).includes(String(r.id)) && String(r.status || "").toUpperCase() !== "CANCELLED"
    );
    if (!list.length) {
      emitToast({ type: "warning", message: "Select at least one non-cancelled invoice to email." });
      return;
    }
    await runSendInvoices(list.map((x) => x.id));
  }

  async function refreshSalesTableOnly() {
    const s = await listSalesInvoices({ search, status: statusFilter, paymentStatus: paymentFilter, customerId: customerFilter, dateFrom, dateTo });
    if (s.status >= 200 && s.status < 300 && s.json?.ok) setRows(s.json?.data?.items || []);
    else if (s.status !== 401) emitToast({ type: "error", message: parseApiError(s) });
  }

  async function refresh() {
    setBusy(true);
    const [s, c, p, d] = await Promise.all([
      listSalesInvoices({ search, status: statusFilter, paymentStatus: paymentFilter, customerId: customerFilter, dateFrom, dateTo }),
      listCustomers({ limit: 500, forBilling: true }),
      listProducts({ limit: 500 }),
      listDivisions({ sortBy: "name", sortDir: "asc", isActive: true })
    ]);
    if (s.status >= 200 && s.status < 300 && s.json?.ok) setRows(s.json?.data?.items || []);
    else if (s.status !== 401) emitToast({ type: "error", message: parseApiError(s) });
    if (c.status >= 200 && c.status < 300 && c.json?.ok) setCustomers(c.json?.data?.customers || []);
    if (p.status >= 200 && p.status < 300 && p.json?.ok) setProducts(p.json?.data?.items || []);
    if (d.status >= 200 && d.status < 300 && d.json?.ok) setDivisions(d.json?.data?.divisions || []);
    setBusy(false);
  }

  async function refreshMasterDropdowns() {
    const [c, p, d] = await Promise.all([
      listCustomers({ limit: 500, forBilling: true }),
      listProducts({ limit: 500 }),
      listDivisions({ sortBy: "name", sortDir: "asc", isActive: true })
    ]);
    if (c.status >= 200 && c.status < 300 && c.json?.ok) setCustomers(c.json?.data?.customers || []);
    if (p.status >= 200 && p.status < 300 && p.json?.ok) setProducts(p.json?.data?.items || []);
    if (d.status >= 200 && d.status < 300 && d.json?.ok) setDivisions(d.json?.data?.divisions || []);
  }

  async function runBulkPrint() {
    const selectedRows = (rows || []).filter((r) => selectedSalesIds.map(String).includes(String(r.id || "")));
    const printableRows = selectedRows.filter((r) => String(r.status || "").toUpperCase() === "CONFIRMED");
    if (!printableRows.length) {
      emitToast({ type: "warning", message: "Select at least one confirmed invoice to bulk print." });
      return;
    }
    setBulkPrintBusy(true);
    try {
      const r = await bulkPrintSalesInvoices(printableRows.map((x) => x.id));
      if (!(r.status >= 200 && r.status < 300 && r.json?.ok)) {
        emitToast({ type: "error", message: parseApiError(r) });
        return;
      }
      const docs = r.json?.data?.documents || [];
      const notFound = r.json?.data?.not_found_ids || [];
      if (!docs.length) {
        emitToast({ type: "warning", message: "No printable invoices found for selected rows." });
        return;
      }
      const started = printSalesInvoiceBulkDoc(docs);
      if (!started?.ok) emitToast({ type: "warning", message: "Unable to open print view. Please try again." });
      if (notFound.length) emitToast({ type: "warning", message: `${notFound.length} selected invoice(s) were skipped (not found).` });
    } finally {
      setBulkPrintBusy(false);
    }
  }

  async function runBulkCollectPayments() {
    const selectedRows = (rows || []).filter((r) => selectedSalesIds.map(String).includes(String(r.id || "")));
    const payableRows = selectedRows.filter((r) => String(r.status || "").toUpperCase() === "CONFIRMED" && Number(r.balance_due || 0) > 0);
    if (!payableRows.length) {
      emitToast({ type: "warning", message: "Select confirmed invoices with pending balance." });
      return;
    }
    const total = payableRows.reduce((s, x) => s + Number(x.balance_due || 0), 0);
    const paymentDate = todayYmdLocal();
    const paymentMode = "CASH";
    setBulkPaymentConfirm({
      open: true,
      ids: payableRows.map((x) => x.id),
      count: payableRows.length,
      total,
      paymentDate,
      paymentMode
    });
  }

  async function confirmBulkCollectPayments() {
    if (!(bulkPaymentConfirm.ids || []).length) return;
    setBulkPaymentBusy(true);
    const r = await bulkCompleteCustomerPayments({
      invoiceIds: bulkPaymentConfirm.ids,
      paymentDate: bulkPaymentConfirm.paymentDate || todayYmdLocal(),
      paymentMode: bulkPaymentConfirm.paymentMode || "CASH",
      notes: "Bulk payment settled from sales invoices table"
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
    if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
  }

  function openForEdit(invoiceId) {
    if (!canUpdate) return;
    const id = String(invoiceId || "");
    setOpen(true);
    setModalLoading(true);
    setLoadingEditId(id);
    const gen = ++salesInvoiceLoadGenRef.current;
    requestAnimationFrame(() => {
      void loadSalesInvoiceForEdit(id, gen);
    });
  }

  function closeSalesEditor() {
    salesInvoiceLoadGenRef.current += 1;
    setModalLoading(false);
    setLoadingEditId(null);
    setShortcutsHelpOpen(false);
    setSubmitted(false);
    setOpen(false);
  }

  async function loadSalesInvoiceForEdit(invoiceId, gen) {
    try {
      const g = await getSalesInvoice(invoiceId);
      if (gen !== salesInvoiceLoadGenRef.current) return;
      if (g.status >= 200 && g.status < 300 && g.json?.ok) {
        const inv = g.json?.data?.invoice;
        const items = g.json?.data?.items || [];
        const hydratedItems = await Promise.all(
          (items || []).map(async (x) => {
            const availableBatches = await loadBatchesForProduct(x.product_id);
            const batch = availableBatches.find((b) => String(b.id) === String(x.batch_id));
            return {
              lineKey: String(x.id || newLineKey()),
              productId: x.product_id,
              batchId: x.batch_id,
              qty: x.qty,
              freeQty: x.free_qty,
              salesRate: x.sales_rate,
              mrp: x.mrp,
              discountPercent: x.discount_percent,
              gstPercent: x.gst_percent,
              productName: x.product_name || "",
              productSearch: formatProductLabel({ name: x.product_name || "", code: x.product_code || "", mfg_company_name: x.mfg_company_name || "" }),
              productCode: x.product_code || "",
              batchNo: x.batch_no || "",
              expiryDate: String(batch?.expiry_date || x.expiry_date || "").slice(0, 10),
              batchSearch: `${x.batch_no || ""} | Exp ${String((batch?.expiry_date || x.expiry_date || "")).slice(0, 10)}${batchExpiryDaysInlineSuffix(batch?.expiry_date || x.expiry_date)}`,
              purchaseRate: Number(batch?.purchase_rate || 0),
              batchSalesRate: Number(batch?.sales_rate || 0),
              retailRate: Number(batch?.retail_rate || 0),
              specialRate1: Number(batch?.special_rate_1 || 0),
              specialRate2: Number(batch?.special_rate_2 || 0),
              looseStock: Number(batch?.loose_stock || 0),
              looseUnitName: String(batch?.loose_unit_name || "TAB"),
              packingUnits: Math.max(1, Number(batch?.packing_units || 10)),
              looseQty: Number(x.loose_qty || 0),
              availableStock: batchBillableQtyFromRow(batch),
              availableFreeStock: batchFreeQtyFromRow(batch),
              isHold: Boolean(batch?.is_hold),
              holdReason: batch?.hold_reason || "",
              saleLock: Boolean(batch?.sale_lock),
              mfgName: batch?.mfg_company_name || x.mfg_company_name || "",
              preventFreeQty: Boolean(batch?.prevent_free_qty),
              preventDiscount: Boolean(batch?.prevent_discount),
              preventNetRate: Boolean(batch?.prevent_net_rate),
              isHalfScheme: Boolean(batch?.is_half_scheme),
              isNet: Boolean(batch?.is_net),
              netDiscountPercent: Number(batch?.net_discount_percent || 0),
              isNonEditableFreeQty: Boolean(batch?.is_non_editable_free_qty),
              schemeQtyPaid: Number(batch?.scheme_qty_paid || 0),
              schemeQtyFree: Number(batch?.scheme_qty_free || 0),
              isControl: Boolean(batch?.is_control),
              prescriptionNo: x.prescription_no || "",
              doctorName: x.doctor_name || "",
              patientName: x.patient_name || "",
              availableBatches
            };
          })
        );
        if (gen !== salesInvoiceLoadGenRef.current) return;
        setEditing(inv);
        setForm({
          customerId: inv.customer_id || "",
          divisionId: "",
          invoiceDate: String(inv.invoice_date || "").slice(0, 10),
          dueDate: String(inv.due_date || "").slice(0, 10),
          notes: inv.notes || "",
          walkInPatientName: inv.walk_in_patient_name || "",
          walkInPatientPhone: inv.walk_in_patient_phone || "",
          walkInDoctorName: inv.walk_in_doctor_name || "",
          walkInPrescriptionNo: inv.walk_in_prescription_no || "",
          cashReceived: "",
          rateType: String(inv.rate_type || (isRetailer ? "MRP" : "SALES_RATE")).toUpperCase(),
          billType: String(inv.bill_type || "CASH_MEMO").toUpperCase(),
          globalDiscountPercent: Number(inv.global_discount_percent || 0),
          items: hydratedItems
        });
      } else if (g.status !== 401) {
        emitToast({ type: "error", message: parseApiError(g) });
        if (gen === salesInvoiceLoadGenRef.current) setOpen(false);
      }
    } finally {
      if (gen === salesInvoiceLoadGenRef.current) {
        setModalLoading(false);
        setLoadingEditId(null);
      }
    }
  }

  useEffect(() => {
    if (canView) refresh();
  }, [canView, search, statusFilter, paymentFilter, customerFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!isRetailer) return;
    if (clean(form.customerId)) return;
    const walk = (customers || []).find((c) => Boolean(c.is_walk_in));
    if (!walk?.id) return;
    setForm((p) => ({ ...p, customerId: walk.id }));
  }, [customers, form.customerId, isRetailer]);

  useEffect(() => {
    loadOutstanding(form.customerId);
  }, [form.customerId, rows, customers]);

  useEffect(() => {
    const c = (customers || []).find((x) => String(x.id) === String(form.customerId || ""));
    const days = Number(c?.credit_days || 0);
    if (!c) return;
    if (isRetailer && Boolean(c.is_walk_in)) {
      if (String(form.dueDate || "") !== String(form.invoiceDate || "")) {
        setForm((p) => ({ ...p, dueDate: String(p.invoiceDate || "").slice(0, 10) }));
      }
      return;
    }
    if (clean(form.dueDate)) return;
    const d = new Date(`${String(form.invoiceDate || "").slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return;
    d.setDate(d.getDate() + Math.max(0, days));
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setForm((p) => ({ ...p, dueDate: next }));
  }, [form.customerId, form.invoiceDate, form.dueDate, customers, isRetailer]);

  const selectedDivisionMfgId = useMemo(() => {
    const d = (divisions || []).find((x) => String(x.id) === String(form.divisionId));
    return d?.mfg_company_id ? String(d.mfg_company_id) : "";
  }, [divisions, form.divisionId]);

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
  const hasAnyBatchSelected = useMemo(
    () => (form.items || []).some((x) => String(x.batchId || "").trim().length > 0),
    [form.items]
  );
  const draftCount = useMemo(
    () => (rows || []).filter((r) => String(r.status || "").toUpperCase() === "DRAFT").length,
    [rows]
  );

  const totalAmount = useMemo(() => (form.items || []).reduce((s, it) => s + computeLineTotal(it), 0), [form.items]);
  const salesSummary = useMemo(() => {
    const lines = (form.items || []).map((it) => computeSalesLineParts(it));
    const subtotal = lines.reduce((s, x) => s + x.gross, 0);
    const totalDiscount = lines.reduce((s, x) => s + x.disc, 0);
    const totalGst = lines.reduce((s, x) => s + x.gst, 0);
    const roundOff = Math.round(totalAmount) - totalAmount;
    const totalPayable = totalAmount + roundOff;
    return { subtotal, totalDiscount, totalGst, roundOff, totalPayable };
  }, [form.items, totalAmount]);
  const salesLineColumns = useMemo(() => ([
    { key: "row", label: "#" },
    { key: "product", label: "Product" },
    { key: "batch", label: "Batch" },
    { key: "expiry", label: "Expiry", className: "c" },
    { key: "stock", label: "Stock", className: "c" },
    { key: "qty", label: "Qty", className: "r" },
    { key: "free", label: "Free", className: "r" },
    { key: "loose", label: "Loose", className: "r" },
    { key: "unit", label: "Unit", className: "c" },
    { key: "mrp", label: "MRP", className: "r" },
    { key: "rate", label: "Rate", className: "r" },
    { key: "disc", label: "Disc%", className: "r" },
    { key: "gst", label: "GST%", className: "c" },
    { key: "amount", label: "Amount", className: "r" },
    { key: "actions", label: "" }
  ]), []);

  const formIsBlocked = formHasSaveBlockers(form);

  const canSaveDraft =
    Boolean(clean(form.customerId)) && (form.items || []).length > 0 && !formIsBlocked && !busy && (editing?.id ? canUpdate : canAdd);
  const canCreateAndConfirm = !editing?.id && canAdd && canUpdate && canSaveDraft;
  const isDraftModalEdit = Boolean(editing?.id) && String(editing?.status || "").toUpperCase() === "DRAFT";
  const canSaveAndConfirm = isDraftModalEdit && canSaveDraft;

  const salesKbdRef = useRef({
    canSaveDraft,
    canCreateAndConfirm,
    canSaveAndConfirm,
    isDraftModalEdit: false,
    busy: false
  });
  salesKbdRef.current = { canSaveDraft, canCreateAndConfirm, canSaveAndConfirm, isDraftModalEdit, busy, isRetailer };

  // ─── Keyboard shortcuts (Alt+key) + Enter navigation ──────────────────────
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e) {
      if (!isCmPanelTopStackLayer(modalBodyRef.current)) return;
      // Enter behavior in modal:
      // - Enter => next field
      // - Shift+Enter => previous field
      // - Never submit/confirm on plain Enter
      if (e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const tag = document.activeElement?.tagName;
        if (tag === "TEXTAREA") return;
        if ((tag === "INPUT" || tag === "SELECT") && e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          focusAdjacentModalField(modalBodyRef.current, document.activeElement, -1, {
            buttonDataAttr: SALES_MODAL_FOCUS_BUTTON_ATTR
          });
          return;
        }
        if ((tag === "INPUT" || tag === "SELECT") && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          focusAdjacentModalField(modalBodyRef.current, document.activeElement, 1, {
            buttonDataAttr: SALES_MODAL_FOCUS_BUTTON_ATTR
          });
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // ↓ opens native select list (no Alt). ⌥/Alt+↓ still works the same.
      if (!e.ctrlKey && !e.shiftKey && e.key === "ArrowDown") {
        const el = document.activeElement;
        if (el?.tagName === "SELECT" && Number(el.size) <= 1) {
          e.preventDefault();
          openFocusedDropdown(el);
          return;
        }
      }

      const { canSaveDraft: cSave, canCreateAndConfirm: cNew, canSaveAndConfirm: cEd, isDraftModalEdit: draftEd, busy: b } = salesKbdRef.current;
      if (b) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        const markPaid = e.shiftKey === true;
        if (draftEd && cEd) void saveAndConfirmDraftRef.current({ markPaidAtConfirm: markPaid });
        else if (cNew) {
          if (markPaid) void createAndConfirmPaidRef.current();
          else void createAndConfirmRef.current();
        }
        return;
      }

      if (!e.altKey) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (k === "k") {
        e.preventDefault();
        const w = document.querySelector("[data-sbm-focus=\"customer\"]");
        const focusable = w?.querySelector?.("select, input, button, [tabindex='0']");
        if (focusable && typeof focusable.focus === "function") {
          try { focusable.focus(); } catch { /* ignore */ }
        }
        return;
      }
      if (k === "l") {
        e.preventDefault();
        setForm((p) => ({ ...p, items: [...(p.items || []), emptyItem()] }));
        return;
      }
      if (e.key === "Backspace" || k === "d") {
        e.preventDefault();
        setForm((p) => {
          const cur = p.items || [];
          if (cur.length <= 1) return p;
          return { ...p, items: cur.slice(0, -1) };
        });
        return;
      }
      if (k === "s") {
        e.preventDefault();
        if (cSave) void performSaveDraft();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  async function performSaveDraft({ confirmAfterSave = false, markPaidAtConfirm } = {}) {
    setBusy(true);
    try {
      const { divisionId: _divisionId, ...basePayload } = form;
      const payload = {
        ...basePayload,
        isWalkInSale: Boolean(isRetailer && selectedCustomerIsWalkIn),
        walkInPatientName: clean(form.walkInPatientName) || null,
        walkInPatientPhone: clean(form.walkInPatientPhone) || null,
        walkInDoctorName: clean(form.walkInDoctorName) || null,
        walkInPrescriptionNo: clean(form.walkInPrescriptionNo) || null,
        rateType: form.rateType || null,
        billType: form.billType || null,
        globalDiscountPercent: Number(form.globalDiscountPercent || 0) || 0
      };
      const r = editing?.id ? await updateSalesInvoice(editing.id, payload) : await createSalesInvoice(payload);
      if (!(r.status >= 200 && r.status < 300 && r.json?.ok)) {
        if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
        return;
      }
      persistSalesFormDefaults({ customerId: form.customerId, divisionId: form.divisionId });
      const savedId = String(r.json?.data?.invoice?.id || r.json?.data?.invoiceId || editing?.id || "");
      if (confirmAfterSave && savedId) {
        const confirmOpts =
          markPaidAtConfirm === true || markPaidAtConfirm === false ? { markPaidAtConfirm } : {};
        const pipe = await runSalesInvoiceConfirmPipeline(savedId, confirmOpts);
        if (!pipe.ok) {
          if (pipe.aborted) return;
          if (pipe.toast) emitToast(pipe.toast);
          setOpen(false);
          await refreshSalesTableOnly();
          return;
        }
      }
      setOpen(false);
      await refreshSalesTableOnly();
    } finally {
      setBusy(false);
    }
  }

  async function createAndConfirm() {
    if (!canCreateAndConfirm) return;
    await performSaveDraft({ confirmAfterSave: true, markPaidAtConfirm: false });
  }

  async function createAndConfirmPaid() {
    if (!canCreateAndConfirm) return;
    await performSaveDraft({ confirmAfterSave: true, markPaidAtConfirm: true });
  }

  async function saveAndConfirmDraft(opts = {}) {
    if (!canSaveAndConfirm) return;
    await performSaveDraft({
      confirmAfterSave: true,
      ...(opts.markPaidAtConfirm === true || opts.markPaidAtConfirm === false ? { markPaidAtConfirm: opts.markPaidAtConfirm } : {})
    });
  }

  createAndConfirmRef.current = createAndConfirm;
  createAndConfirmPaidRef.current = createAndConfirmPaid;
  saveAndConfirmDraftRef.current = saveAndConfirmDraft;

  if (!canView) {
    return (
      <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user">
        <div className="pageWrap"><div className="pageCard"><div className="raTitle">{NAV_LABELS.salesBilling}</div><div className="raSub">You do not have permission to view sales invoices.</div></div></div>
      </AppShell>
    );
  }

  // ─── Cash change display ───────────────────────────────────────────────────
  const cashChange = (() => {
    const due = Number(salesSummary.totalPayable || 0);
    const received = Number(form.cashReceived || 0);
    const change = received > 0 ? received - due : 0;
    return change > 0 ? change.toFixed(2) : "0.00";
  })();

  return (
    <AppShell userName={user?.full_name || "User"} userEmail={user?.email || auth?.email || ""} userBusinessName={user?.firm_name || ""} userGstNumber={user?.gst_number || ""} variant="user">
      <div className="pageWrap">
        <div className="raTop">
          <div>
            <div className="raTitle">{isRetailer ? "Billing" : NAV_LABELS.salesBilling}</div>
            <div className="raSub">
              {isRetailer
                ? "Counter sales. Confirm posts stock; choose whether to record full cash payment on the bill or leave it due for later."
                : "Create draft invoices and confirm to post stock."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="sfmBtnGhost"
              onClick={() => {
                setStatusFilter("DRAFT");
              }}
              title="Filter list to draft invoices"
            >
              Resume Draft ({draftCount})
            </button>
          </div>
        </div>
        <div className="pageCard">
          <CommonTable
            title=""
            subtitle=""
            compact
            countText={busy ? "Loading..." : `${rows.length} invoices`}
            search={search}
            onSearchChange={setSearch}
            filters={[
              { id: "status", label: "Status", value: statusFilter, onChange: setStatusFilter, options: [{ value: "", label: "All status" }, { value: "DRAFT", label: "Draft" }, { value: "CONFIRMED", label: "Confirmed" }, { value: "CANCELLED", label: "Cancelled" }] },
              { id: "payment", label: "Payment", value: paymentFilter, onChange: setPaymentFilter, options: [{ value: "", label: "All payment" }, { value: "UNPAID", label: "Unpaid" }, { value: "PARTIAL", label: "Partial" }, { value: "PAID", label: "Paid" }] },
              { id: "customer", label: "Customer", value: customerFilter, onChange: setCustomerFilter, options: [{ value: "", label: "All customers" }, ...customers.map((c) => ({ value: c.id, label: c.name }))] },
              { id: "from", label: "Date From", type: "date", value: dateFrom, onChange: setDateFrom },
              { id: "to", label: "Date To", type: "date", value: dateTo, onChange: setDateTo }
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
                      { key: "customer_name", label: "customer_name" },
                      { key: "total_amount", label: "total_amount" }
                    ];
                    downloadCsvFile(
                      "sales_invoices_export.csv",
                      cols,
                      rows.map((r) => ({
                        invoice_number: r.invoice_number,
                        invoice_date: String(r.invoice_date || "").slice(0, 10),
                        status: r.status,
                        customer_name: r.customer_name || "",
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
                    label: isRetailer ? "New bill" : "Add sales invoice",
                    onClick: () => {
                      salesInvoiceLoadGenRef.current += 1;
                      setEditing(null);
                      setModalLoading(false);
                      setLoadingEditId(null);
                      const d = loadSalesFormDefaults();
                      const walk = isRetailer ? (customers || []).find((c) => Boolean(c.is_walk_in)) : null;
                      setForm({
                        customerId: isRetailer ? (walk?.id || d.customerId || "") : d.customerId,
                        divisionId: isRetailer ? "" : d.divisionId,
                        invoiceDate: todayYmdLocal(),
                        dueDate: "",
                        notes: "",
                        walkInPatientName: "",
                        walkInPatientPhone: "",
                        walkInDoctorName: "",
                        walkInPrescriptionNo: "",
                        cashReceived: "",
                        rateType: isRetailer ? "MRP" : "SALES_RATE",
                        billType: "CASH_MEMO",
                        globalDiscountPercent: 0,
                        items: [emptyItem()]
                      });
                      setOpen(true);
                    }
                  }
                : null
            }
            rows={rows}
            getRowId={(r) => r.id}
            onRowClick={(r) => openForEdit(r.id)}
            onSelectionChange={setSelectedSalesIds}
            bulkActions={[
              {
                id: "bulk-payment",
                label: bulkPaymentBusy ? "Completing Payment…" : `Complete Payment (${bulkCompletePaymentCount})`,
                icon: "payment",
                danger: false,
                disabled: bulkPaymentBusy || bulkCompletePaymentCount === 0 || bulkConfirmBusy,
                onClick: runBulkCollectPayments
              },
              {
                id: "bulk-confirm-stock",
                label: bulkConfirmBusy ? "Confirming…" : `Confirm & post stock (${bulkDraftConfirmCount})`,
                icon: "confirm",
                danger: false,
                disabled:
                  bulkConfirmBusy || bulkPaymentBusy || bulkDraftConfirmCount === 0 || !canUpdate,
                onClick: () => {
                  const sel = new Set((selectedSalesIds || []).map(String));
                  const ids = (rows || [])
                    .filter((r) => sel.has(String(r.id)) && String(r.status || "").toUpperCase() === "DRAFT")
                    .map((r) => r.id);
                  setBulkConfirmSalesDialog({ open: true, ids });
                }
              },
              {
                id: "bulk-print",
                label: bulkPrintBusy ? "Printing…" : `Bulk Print (${selectedSalesIds.length})`,
                icon: "print",
                danger: false,
                disabled: bulkPrintBusy || bulkPaymentBusy || bulkConfirmBusy || !selectedSalesIds.length,
                onClick: runBulkPrint
              },
              {
                id: "bulk-email",
                label: bulkSendEmailBusy ? "Sending…" : `Send email (${selectedSalesIds.length})`,
                icon: "email",
                danger: false,
                disabled: bulkSendEmailBusy || bulkPaymentBusy || bulkConfirmBusy || !selectedSalesIds.length || !canView,
                onClick: runBulkSendByEmail
              }
            ]}
            bulkDelete={
              canDelete
                ? {
                    label: "Cancel All",
                    confirmTitle: "Cancel selected invoices?",
                    confirmMessage: (n) =>
                      `Cancel ${n} invoice(s)? Unpaid drafts and confirmed invoices with no payments can be cancelled; other rows may fail individually.`,
                    confirmLabel: "Cancel All",
                    danger: true,
                    isRowSelectable: (r) => r.status !== "CANCELLED",
                    onDelete: async (ids) => {
                      setBusy(true);
                      const r = await bulkCancelSalesInvoices(ids, { cancelReason: "Bulk cancelled from UI" });
                      setBusy(false);
                      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                        const failed = r.json?.data?.failed || [];
                        if (failed.length) emitToast({ type: "warning", message: `${failed.length} invoice(s) could not be cancelled.` });
                        await refreshSalesTableOnly();
                      } else if (r.status !== 401) emitToast({ type: "error", message: parseApiError(r) });
                    }
                  }
                : undefined
            }
            columns={[
              { id: "invoice_number", header: "Invoice", render: (r) => <span style={{ fontWeight: 700 }}>{r.invoice_number}</span> },
              { id: "customer_name", header: "Customer", render: (r) => r.customer_name || "" },
              { id: "invoice_date", header: "Date", render: (r) => String(r.invoice_date || "").slice(0, 10) },
              {
                id: "status",
                header: "Status",
                render: (r) => {
                  const color = r.status === "CONFIRMED" ? "var(--color-primary)" : r.status === "CANCELLED" ? "var(--color-danger)" : "var(--color-text-3)";
                  return <span style={{ fontWeight: 700, color }}>{r.status}</span>;
                }
              },
              {
                id: "payment_status",
                header: "Payment",
                render: (r) => {
                  if (r.status === "CANCELLED") return <span style={{ fontWeight: 700, color: "var(--color-text-4)" }}>N/A</span>;
                  const status = r.payment_status || "UNPAID";
                  const color = status === "PAID" ? "var(--color-success)" : status === "PARTIAL" ? "var(--color-warning)" : "var(--color-danger)";
                  return <span style={{ fontWeight: 700, color }}>{status}</span>;
                }
              },
              { id: "item_count", header: "Items", align: "right", render: (r) => Number(r.item_count || 0) },
              { id: "total_amount", header: "Total", align: "right", render: (r) => fmtMoney(r.total_amount || 0) },
              { id: "amount_paid", header: "Paid", align: "right", render: (r) => fmtMoney(r.amount_paid || 0) },
              { id: "balance_due", header: "Balance", align: "right", render: (r) => fmtMoney(r.balance_due || 0) },
              { id: "created_at", header: "Created", sortable: false, render: (r) => <span style={{ color: "var(--color-text-3)" }}>{String(r.created_at || "").slice(0, 10)}</span> },
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
                align: "right",
                sortable: false,
                render: (r) => (
                  <div className="ibGroup" onClick={(e) => e.stopPropagation()}>
                    <IconBtn tooltip="View or open invoice" onClick={() => openForEdit(r.id)}><IconView /></IconBtn>
                    {r.status === "DRAFT" && canUpdate ? (
                      <IconBtn tooltip="Edit draft" onClick={() => openForEdit(r.id)}><IconEdit /></IconBtn>
                    ) : null}
                    {r.status === "DRAFT" && canUpdate ? (
                      <IconBtn tooltip="Confirm and post stock" variant="success" onClick={() => setConfirm({ open: true, id: r.id, type: "confirm" })}>
                        <IconConfirm />
                      </IconBtn>
                    ) : null}
                    {r.status === "CONFIRMED" && canView ? (
                      <IconBtn
                        tooltip="Print invoice"
                        disabled={String(printingId || "") === String(r.id || "")}
                        onClick={async () => {
                          setPrintingId(String(r.id || ""));
                          try {
                            const p = await printSalesInvoice(r.id);
                            if (!(p.status >= 200 && p.status < 300 && p.json?.ok)) {
                              emitToast({ type: "error", message: parseApiError(p) });
                              return;
                            }
                            const started = printSalesInvoiceDoc(p.json?.data);
                            if (!started?.ok) emitToast({ type: "warning", message: "Unable to open print view. Please try again." });
                          } finally {
                            setPrintingId("");
                          }
                        }}
                      >
                        {String(printingId || "") === String(r.id || "") ? <CommonLoading variant="inline" text="" /> : <IconPrint />}
                      </IconBtn>
                    ) : null}
                    {r.status === "CANCELLED" || !canView ? null : (
                      <IconBtn
                        tooltip="Email invoice to customer"
                        variant="violet"
                        disabled={Boolean(sendingEmailById[String(r.id)])}
                        onClick={() => runSendInvoices([r.id])}
                      >
                        {sendingEmailById[String(r.id)] ? <CommonLoading variant="inline" text="" /> : <IconEmail />}
                      </IconBtn>
                    )}
                    {r.status === "CONFIRMED" && Number(r.balance_due || 0) > 0 ? (
                      <IconBtn
                        tooltip="Record payment"
                        variant="blue"
                        onClick={async () => {
                          const hint = await estimateAdvanceForInvoice(r.customer_id, Number(r.balance_due || 0));
                          setPaymentAdvanceHint(hint);
                          setPaymentForm({
                            customerId: r.customer_id || "",
                            salesInvoiceId: r.id,
                            paymentDate: todayYmdLocal(),
                            amount: Number(hint.remaining || 0).toFixed(2),
                            paymentMode: "CASH",
                            referenceNumber: "",
                            notes: "",
                            useAdvanceFirst: true
                          });
                          setPaymentOpen(true);
                        }}
                      >
                        <IconPayment />
                      </IconBtn>
                    ) : null}
                    {r.status === "CONFIRMED" ? (
                      String(r.return_status || "NONE") === "FULL" ? null : (
                        <IconBtn
                          tooltip={String(r.return_status || "NONE") === "PARTIAL" ? "Create additional sales return" : "Create sales return"}
                          variant="amber"
                          onClick={() =>
                            navigate(
                              `/sales-returns?invoiceId=${encodeURIComponent(String(r.id || ""))}&customerId=${encodeURIComponent(String(r.customer_id || ""))}`
                            )
                          }
                        >
                          <IconReturn />
                        </IconBtn>
                      )
                    ) : null}
                    {(r.status === "DRAFT" || (r.status === "CONFIRMED" && Number(r.amount_paid || 0) <= 0)) && canDelete ? (
                      <IconBtn tooltip="Cancel invoice" variant="danger" onClick={() => setConfirm({ open: true, id: r.id, type: "cancel" })}>
                        <IconCancel />
                      </IconBtn>
                    ) : null}
                  </div>
                )
              }
            ]}
          />
        </div>
      </div>

      {/* ─── Sales Invoice Modal ─────────────────────────────────────────────── */}
      <CommonModal
        open={open}
        ariaLabel="sales-billing-editor"
        title={
          modalLoading && loadingEditId
            ? "Opening invoice…"
            : editing?.id
              ? isRetailer ? "Edit Bill" : "Edit Sales Invoice"
              : isRetailer ? "Add Bill" : "Add Sales Invoice"
        }
        subtitle={modalLoading && loadingEditId ? "Fetching lines and batch info" : ""}
        icon={<IconReceipt />}
        loading={modalLoading}
        loadingText="Loading invoice and line items…"
        headerTools={<KeyboardShortcutsTrigger onClick={() => setShortcutsHelpOpen(true)} />}
        onClose={closeSalesEditor}
        size={1100}
        footer={
          <div className="sfmModalFooter">
            {editing?.id && canView && String(editing?.status || "").toUpperCase() !== "CANCELLED" && clean(form.customerId) ? (
              <button
                className="sfmBtnGhost sbmFooterSendBtn"
                type="button"
                title="Email this invoice to the customer"
                disabled={busy || Boolean(sendingEmailById[String(editing.id)])}
                onClick={() => runSendInvoices([editing.id])}
              >
                {sendingEmailById[String(editing.id)] ? <InlineButtonProgress /> : <span className="sbmInlSendSvg" aria-hidden="true"><IconEmail /></span>}
                <span>Send to customer</span>
              </button>
            ) : null}
            <button className="sfmBtnGhost" type="button" onClick={closeSalesEditor} disabled={busy}>
              Cancel
            </button>
            <button
              className={editing?.id ? "sfmBtnPrimary" : "sfmBtnGhost"}
              type="button"
              disabled={busy || (Boolean(editing?.id) && !isDraftModalEdit) || !(editing?.id ? canUpdate : canAdd)}
              onClick={() => { setSubmitted(true); performSaveDraft(); }}
            >
              {busy ? <InlineButtonProgress label="Working..." /> : editing?.id ? "Save Changes" : "Create Draft"}
            </button>
            {!editing?.id && canUpdate ? (
              <>
                <button
                  className="sfmBtnPrimary sbmBtnCreateConfirm"
                  data-cm-primary="true"
                  type="button"
                  disabled={busy || !canAdd || !canUpdate}
                  title="Post stock and leave invoice unpaid (collect payment later in Customers or Customer Payments)."
                  onClick={() => { setSubmitted(true); createAndConfirm(); }}
                >
                  {busy ? <InlineButtonProgress label="Working..." /> : "Create & Confirm"}
                </button>
                <button
                  className="sfmBtnGhost sbmBtnCreateConfirm"
                  type="button"
                  disabled={busy || !canAdd || !canUpdate}
                  title="Post stock and record full amount as cash received on this bill."
                  onClick={() => { setSubmitted(true); createAndConfirmPaid(); }}
                >
                  {busy ? <InlineButtonProgress label="Working..." /> : "Confirm & Mark Paid"}
                </button>
              </>
            ) : null}
            {isDraftModalEdit && canUpdate ? (
              <>
                <button
                  className="sfmBtnPrimary sbmBtnCreateConfirm"
                  data-cm-primary="true"
                  type="button"
                  disabled={busy || !isDraftModalEdit || !canUpdate}
                  title={formIsBlocked ? "Fix line errors before confirming." : "Post stock; invoice stays unpaid until you record payment."}
                  onClick={() => { setSubmitted(true); saveAndConfirmDraft({ markPaidAtConfirm: false }); }}
                >
                  {busy ? <InlineButtonProgress label="Working..." /> : "Save & Confirm"}
                </button>
                <button
                  className="sfmBtnGhost sbmBtnCreateConfirm"
                  type="button"
                  disabled={busy || !isDraftModalEdit || !canUpdate}
                  title="Post stock and record full amount as cash on this bill."
                  onClick={() => { setSubmitted(true); saveAndConfirmDraft({ markPaidAtConfirm: true }); }}
                >
                  {busy ? <InlineButtonProgress label="Working..." /> : "Save, Confirm & Mark Paid"}
                </button>
              </>
            ) : null}
          </div>
        }
      >
        {/* Modal body – ref used for Enter-key navigation */}
        <div ref={modalBodyRef} className="sfm piModalForm sbmModalForm">
          {/* ── Party + dates + notes (same section shell as purchase) ───── */}
          <div className="piSection">
            <div className="piSectionBody">
              {/* Row 1: Customer + Dates */}
              <div className="piHeaderTop">
                <div className="raField piHeadField" data-sbm-focus="customer">
                  <label>Customer <span className="reqMark" aria-hidden="true">*</span></label>
                  <MasterSelectWithCreate
                    kind="customer"
                    value={form.customerId || ""}
                    onChange={(v) =>
                      setForm((p) => {
                        const nextId = String(v || "");
                        const c = (customers || []).find((x) => String(x.id) === nextId);
                        const invoiceDate = String(p.invoiceDate || "").slice(0, 10);
                        const nextDue = c
                          ? (isRetailer && Boolean(c.is_walk_in) ? invoiceDate : addDaysYmd(invoiceDate, Number(c.credit_days || 0)))
                          : p.dueDate;
                        return { ...p, customerId: v, dueDate: nextDue || p.dueDate };
                      })
                    }
                    onListsRefresh={refreshMasterDropdowns}
                    placeholder="Select customer"
                    options={(customers || []).map((c) => ({
                      value: c.id,
                      label: `${c.is_walk_in ? "Walk-in Customer" : c.name}${c.code ? ` (${c.code})` : ""}`
                    }))}
                  />
                  {submitted && !form.customerId && <div className="mfzErr">Customer is required.</div>}
                </div>
                <div className="raField piHeadField">
                  <label>Invoice Date <span className="reqMark" aria-hidden="true">*</span></label>
                  <CommonDatePicker value={form.invoiceDate} onChange={(v) => setForm((p) => ({ ...p, invoiceDate: v }))} ariaLabel="Invoice date" />
                </div>
                <div className="raField piHeadField">
                  <label>Due Date</label>
                  <CommonDatePicker value={form.dueDate} onChange={(v) => setForm((p) => ({ ...p, dueDate: v }))} ariaLabel="Due date" />
                </div>
              </div>

              {/* Row 2: Division/PatientName + Notes + Phone */}
              <div className="piHeaderRow2">
                {!isRetailer ? (
                  <div className="raField piHeadField">
                    <label>Division (filters products)</label>
                    <MasterSelectWithCreate
                      kind="division"
                      value={form.divisionId || ""}
                      onChange={(v) => setForm((p) => ({ ...p, divisionId: v || "" }))}
                      onListsRefresh={refreshMasterDropdowns}
                      placeholder="All divisions"
                      options={[
                        ...(divisions || [])
                          .filter((d) => Boolean(d.is_active) || String(d.id) === String(form.divisionId || ""))
                          .map((d) => toDivisionOption(d))
                      ]}
                    />
                  </div>
                ) : (
                  <div className="raField piHeadField">
                    <label>Patient Name</label>
                    <input
                      className="raInput"
                      value={form.walkInPatientName || ""}
                      onChange={(e) => setForm((p) => ({ ...p, walkInPatientName: e.target.value }))}
                      placeholder={selectedCustomerIsWalkIn ? "Optional" : "Patient / recipient name"}
                    />
                  </div>
                )}
                <div className="raField piHeadField">
                  <label>Notes</label>
                  <input
                    className="raInput"
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Rx ref., phone, ref. no."
                    maxLength={500}
                    autoComplete="off"
                  />
                </div>
                {isRetailer ? (
                  <div className="raField piHeadField">
                    <label>Patient Phone</label>
                    <input
                      className="raInput"
                      value={form.walkInPatientPhone || ""}
                      onChange={(e) => setForm((p) => ({ ...p, walkInPatientPhone: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                ) : null}
              </div>

              {/* Credit line – non-retailer */}
              {!isRetailer && customerOutstanding ? (
                <div className="piCreditLine" title="Credit and outstanding for selected customer">
                  {(() => {
                    const used = Number(customerOutstanding.outstandingAmount || 0);
                    const limit = Number(customerOutstanding.creditLimit || 0);
                    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
                    const color = limit <= 0 ? "var(--color-text-3)" : pct >= 100 ? "var(--color-danger)" : pct >= 80 ? "var(--color-warning)" : "var(--color-success)";
                    return (
                      <span className="sbmCreditLineStrong" style={{ color }}>
                        Credit {limit > 0 ? `${pct}%` : ""} · O/s {fmtMoneyINR(used)} · Bills {customerOutstanding.outstandingBills} · Oldest {customerOutstanding.oldestBillAgeDays}d
                        {limit > 0 ? ` · Limit ${fmtMoneyINR(limit)}` : ""}
                      </span>
                    );
                  })()}
                </div>
              ) : null}

              {/* Rate Bar – retailer only */}
              {isRetailer ? (
                <div className="sbmRateBar" role="group" aria-label="Bill rate, type and global discount">
                  <div className="sbmRateBarLeft">
                    <span className="sbmRateBarLabel">Rate</span>
                    <div className="sbmRateBtns" role="tablist" aria-label="Bill rate type">
                      {RATE_TYPES.map((rt) => {
                        const active = String(form.rateType || "MRP").toUpperCase() === rt.key;
                        return (
                          <button
                            key={rt.key}
                            type="button"
                            role="tab"
                            aria-selected={active ? "true" : "false"}
                            className={`sbmRateBtn${active ? " sbmRateBtn_on" : ""}`}
                            title={rt.title}
                            disabled={!hasAnyBatchSelected}
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                rateType: rt.key,
                                items: (prev.items || []).map((x) => {
                                  if (!x.batchId) return x;
                                  const newRate = resolveRateForLine(x, rt.key);
                                  return { ...x, salesRate: Number(newRate.toFixed(4)) };
                                })
                              }));
                            }}
                          >
                            {rt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="sbmRateBarRight">
                    <div className="sbmRateField sbmRateField_btype">
                      <label>Bill Type</label>
                      <CommonSelectField
                        value={form.billType || "CASH_MEMO"}
                        options={BILL_TYPES}
                        onChange={(v) => setForm((p) => ({ ...p, billType: String(v || "CASH_MEMO") }))}
                        placeholder="Bill type"
                      />
                    </div>
                    <div className="sbmRateField sbmRateField_disc">
                      <label>Overall Disc %</label>
                      <input
                        className="raInput"
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        max="100"
                        step="0.01"
                        value={form.globalDiscountPercent ?? 0}
                        title="Apply this discount to each line that has no manual discount."
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                          const num = Math.max(0, Math.min(100, Number(raw) || 0));
                          setForm((prev) => {
                            const items = (prev.items || []).map((x) => {
                              if (x.preventDiscount || x.preventNetRate || x.isNet) return x;
                              return { ...x, discountPercent: num };
                            });
                            return { ...prev, globalDiscountPercent: num, items };
                          });
                        }}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* ── Line Items Section ────────────────────────────────────────── */}
          <CommonLineItemsSection
            title="Line Items"
            className="piSection"
            onAddLine={() => setForm((p) => ({ ...p, items: [...(p.items || []), emptyItem()] }))}
            addLineLabel="Add line item"
            addLineTitle="Add line item (Alt+L)"
            footerRight={(
              <div className="sbmTotalNow">
                <span className="sbmTotalNow-lbl">Total</span>
                {fmtMoneyINR(totalAmount || 0)}
              </div>
            )}
          >
              <CommonLineItemsTable className="sbmItemsTable" columns={salesLineColumns}>
                  {(form.items || []).map((it, idx) => {
                    const exp = expiryLabelClasses(it.expiryDate);
                    const afterStock = lineAfterCurrentStock(form.items, idx);
                    return (
                      <tr
                        key={it.lineKey || idx}
                        className={`sbmItemRow ${idx === activeLineIdx ? "cliItemRow_active" : ""}`}
                        onClick={() => setActiveLineIdx(idx)}
                      >
                        {/* # */}
                        <td><div className="sbmRowNum">{idx + 1}</div></td>

                        {/* Product */}
                        <td>
                          <MasterSelectWithCreate
                            kind="product"
                            selectClassName="sbmLineSelect"
                            selectAutoOpenOnFocus
                            value={it.productId || ""}
                            placeholder="Select product…"
                            options={(productsForLines || []).map((p) => toProductOption(p))}
                            onListsRefresh={refreshMasterDropdowns}
                            onChange={async (productId, created) => {
                              const p =
                                (created && String(created.id) === String(productId) ? created : null) ||
                                (productsForLines || []).find((x) => String(x.id) === String(productId)) ||
                                (products || []).find((x) => String(x.id) === String(productId));
                              if (!p) {
                                setForm((prev) => ({ ...prev, items: prev.items.map((x, i) => (i === idx ? { ...x, productId: "", productSearch: "", availableBatches: [], batchId: "" } : x)) }));
                                return;
                              }
                              const lineKey = it.lineKey;
                              setForm((prev) => ({
                                ...prev,
                                divisionId: clean(prev.divisionId) ? prev.divisionId : (p.division_id ? String(p.division_id) : ""),
                                items: prev.items.map((x, i) =>
                                  i === idx
                                    ? { ...emptyItem(), lineKey: lineKey || prev.items[idx]?.lineKey || newLineKey(), productId: p.id, productName: p?.name || "", productCode: p?.code || "", productSearch: formatProductLabel(p), availableBatches: [] }
                                    : x
                                )
                              }));
                              const availableBatches = await loadBatchesForProduct(p.id);
                              const first = availableBatches[0];
                              setForm((prev) => ({
                                ...prev,
                                items: prev.items.map((x) => {
                                  if (String(x.lineKey || "") !== String(lineKey || "") || String(x.productId || "") !== String(p.id)) return x;
                                  if (!first) return { ...x, availableBatches };
                                  return { ...x, availableBatches, ...buildSalesLineUpdateFromBatch(x, first, prev.rateType) };
                                })
                              }));
                            }}
                          />
                        </td>

                        {/* Batch */}
                        <td>
                          <div className="sbmBatchCell">
                            <CommonSelectField
                              className="sbmLineSelect"
                              value={it.batchId || ""}
                              placeholder="Select batch…"
                              options={sortBatchesByExpiryAsc(it.availableBatches || []).map((b) => ({
                                value: b.id,
                                label: batchDropdownLabel(b)
                              }))}
                              onChange={(batchId) => {
                                const b = sortBatchesByExpiryAsc(it.availableBatches || []).find((x) => String(x.id) === String(batchId));
                                if (!b) {
                                  setForm((prev) => ({ ...prev, items: prev.items.map((x, i) => (i === idx ? { ...x, batchId: "", batchSearch: "" } : x)) }));
                                  return;
                                }
                                setForm((prev) => ({
                                  ...prev,
                                  items: prev.items.map((x, i) => (i === idx ? { ...x, ...buildSalesLineUpdateFromBatch(x, b, prev.rateType) } : x))
                                }));
                              }}
                            />
                            <CommonInlineAddButton
                              className="sbmBatchAddBtn"
                              title="Add new batch"
                              label="Add"
                              onClick={() => openAddBatchForLine(idx)}
                            />
                          </div>
                        </td>

                        {/* Expiry */}
                        <td>
                          <div
                            className="sbmExpiryCell"
                            title={it.expiryDate ? `${it.expiryDate} · ${formatBatchExpiryRelativePhrase(it.expiryDate)}` : "Select a batch"}
                          >
                            <span className={exp.className}>{exp.text}</span>
                          </div>
                        </td>

                        {/* Stock */}
                        <td>
                          {it.batchId ? (
                            <div
                              className="sbmStockCell"
                              title={
                                isRetailer
                                  ? `After this line: ${afterStock ?? 0} left · WH billable: ${batchWarehouseStock(form.items, it.batchId)}`
                                  : `After this line: ${afterStock ?? 0} left in division stock`
                              }
                            >
                              <span className={stockChipClass(afterStock ?? 0)}>{afterStock ?? 0}</span>
                              {isRetailer ? <span className="sbmStockWh">/ {batchWarehouseStock(form.items, it.batchId)}</span> : null}
                            </div>
                          ) : ""}
                        </td>

                        {/* Qty */}
                        <td>
                          <input
                            className="raInput sbmNum"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={it.qty}
                            onChange={(e) => setForm((p) => ({
                              ...p,
                              items: p.items.map((x, i) => (i === idx ? {
                                ...x,
                                qty: e.target.value,
                                freeQty: x.isNonEditableFreeQty ? autoFreeQtyForScheme(x, e.target.value) : x.freeQty
                              } : x))
                            }))}
                          />
                        </td>

                        {/* Free */}
                        <td>
                          <input
                            className="raInput sbmNum"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={it.freeQty}
                            disabled={it.preventFreeQty || it.isNonEditableFreeQty}
                            onChange={(e) => setForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, freeQty: e.target.value.replace(/[^0-9]/g, "") } : x)) }))}
                          />
                        </td>

                        {/* Unit */}
                        <td>
                          <input
                            className="raInput sbmNum"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={it.looseQty || 0}
                            title={`Loose units (${String(it.looseUnitName || "TAB").toUpperCase()}) available: ${Number(it.looseStock || 0)}`}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                items: p.items.map((x, i) => (i === idx ? { ...x, looseQty: e.target.value.replace(/[^0-9]/g, "") } : x))
                              }))
                            }
                          />
                        </td>

                        {/* Unit */}
                        <td>
                          <button type="button" className="sbmUnitBtn" title="Billing unit">
                            {String(it.looseUnitName || "TAB").toUpperCase()}
                          </button>
                        </td>

                        {/* MRP */}
                        <td>
                          <input
                            className="raInput sbmNum"
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*\.?[0-9]*"
                            value={it.mrp}
                            onChange={(e) => setForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, mrp: e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1") } : x)) }))}
                          />
                        </td>

                        {/* Rate */}
                        <td>
                          <input
                            className="raInput sbmNum"
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*\.?[0-9]*"
                            value={it.salesRate}
                            onChange={(e) => setForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, salesRate: e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1") } : x)) }))}
                          />
                        </td>

                        {/* Disc% */}
                        <td>
                          <input
                            className="raInput sbmNum"
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*\.?[0-9]*"
                            value={it.discountPercent}
                            disabled={it.preventDiscount || it.isNet || it.preventNetRate}
                            onChange={(e) => setForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, discountPercent: e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1") } : x)) }))}
                          />
                        </td>

                        {/* GST% */}
                        <td>
                          <CommonSelectField
                            className="sbmLineSelect"
                            value={String(it.gstPercent)}
                            placeholder="GST"
                            options={[0, 5, 12, 18, 28].map((v) => ({ value: String(v), label: `${v}%` }))}
                            onChange={(v) => setForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, gstPercent: Number(v) } : x)) }))}
                          />
                        </td>

                        {/* Amount */}
                        <td className="sbmAmount">{fmtMoney(computeLineTotal(it))}</td>

                        {/* Remove */}
                        <td>
                          <LineRemoveButton
                            className="sbmTrashBtn"
                            disabled={busy}
                            title="Remove line"
                            onClick={() => setForm((p) => {
                              const cur = p.items || [];
                              const next = cur.filter((_, i) => i !== idx);
                              return { ...p, items: next.length ? next : [emptyItem()] };
                            })}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </CommonLineItemsTable>
          </CommonLineItemsSection>

            {/* Controlled-medicine extra fields */}
            {(form.items || []).map((it, idx) =>
              it.isControl ? (
                <div key={`rx-${it.lineKey || idx}`} className="sbmControlBlock">
                  <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Line {idx + 1} controlled medicine details</div>
                  <div className="sfmGrid">
                    <div className="raField"><label>Prescription No <span className="reqMark" aria-hidden="true">*</span></label><input className="raInput" value={it.prescriptionNo || ""} onChange={(e) => setForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, prescriptionNo: e.target.value } : x)) }))} /></div>
                    <div className="raField"><label>Doctor Name <span className="reqMark" aria-hidden="true">*</span></label><input className="raInput" value={it.doctorName || ""} onChange={(e) => setForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, doctorName: e.target.value } : x)) }))} /></div>
                    <div className="raField"><label>Patient Name <span className="reqMark" aria-hidden="true">*</span></label><input className="raInput" value={it.patientName || ""} onChange={(e) => setForm((p) => ({ ...p, items: p.items.map((x, i) => (i === idx ? { ...x, patientName: e.target.value } : x)) }))} /></div>
                  </div>
                </div>
              ) : null
            )}

            {/* Line error pills */}
            {(form.items || []).map((it, idx) =>
              it.saleLock || it.isHold || (it.batchId && (lineStockExceededAtIndex(form.items, idx) || lineFreeStockExceededAtIndex(form.items, idx) || lineLooseExceededAtIndex(form.items, idx))) ? (
                <div key={`warn-${it.lineKey || idx}`} className="psErr">
                  Line {idx + 1}:
                  {it.saleLock ? ` Sales locked${it.mfgName ? ` for ${it.mfgName}` : ""}. ` : ""}
                  {it.isHold ? ` Batch on hold${it.holdReason ? ` (${it.holdReason})` : ""}. ` : ""}
                  {it.batchId && lineStockExceededAtIndex(form.items, idx) ? " Paid qty exceeds remaining stock. " : ""}
                  {it.batchId && lineFreeStockExceededAtIndex(form.items, idx) ? " Free qty exceeds remaining free stock. " : ""}
                  {it.batchId && lineLooseExceededAtIndex(form.items, idx) ? " Loose qty exceeds available loose + breakable capacity." : ""}
                </div>
              ) : null
            )}

            {/* Summary strip */}
            <div className="cliSummaryStrip" style={{gridTemplateColumns: "repeat(6, minmax(0, 1fr))"}}>
              <div className="cliSummaryCell">
                <div className="cliSummaryLabel">Subtotal</div>
                <div className="cliSummaryValue cliSummaryValue_sm">{fmtMoney(salesSummary.subtotal || 0)}</div>
              </div>
              <div className="cliSummaryCell">
                <div className="cliSummaryLabel">(-) Discount</div>
                <div className="cliSummaryValue cliSummaryValue_sm">{fmtMoney(salesSummary.totalDiscount || 0)}</div>
              </div>
              <div className="cliSummaryCell">
                <div className="cliSummaryLabel">(+) GST</div>
                <div className="cliSummaryValue cliSummaryValue_sm">{fmtMoney(salesSummary.totalGst || 0)}</div>
              </div>
              <div className="cliSummaryCell">
                <div className="cliSummaryLabel">Round Off</div>
                <div className="cliSummaryValue cliSummaryValue_sm">{fmtMoney(salesSummary.roundOff || 0)}</div>
              </div>
              <div className="cliSummaryCell cliSummaryCell_total">
                <div className="cliSummaryLabel">Total Payable</div>
                <div className="cliSummaryValue">{fmtMoney(salesSummary.totalPayable || 0)}</div>
              </div>
              <div className="cliSummaryCell">
                <div className="cliSummaryLabel">Items</div>
                <div className="cliSummaryValue cliSummaryValue_sm">{(form.items || []).length}</div>
              </div>
            </div>

            {/* Cash row – retailer + walk-in */}
            {isRetailer && selectedCustomerIsWalkIn ? (
              <div className="sbmCashRow">
                <div className="raField">
                  <label>Cash Received</label>
                  <input
                    className="raInput"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*\.?[0-9]*"
                    value={form.cashReceived}
                    placeholder="Leave blank = exact amount"
                    onChange={(e) => setForm((p) => ({ ...p, cashReceived: e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1") }))}
                  />
                </div>
                <div className="raField">
                  <label>Change to Return</label>
                  <div
                    className={`sbmCashValue${Number(cashChange) > 0 ? " sbmCashValue_pos" : ""}`}
                  >
                    ₹{cashChange}
                  </div>
                </div>
                <div className="sbmCashHint sfmFull">
                  For change only. To record full cash against the bill use <strong>Confirm &amp; Mark Paid</strong>; use <strong>Create &amp; Confirm</strong> to leave the sale unpaid.
                </div>
              </div>
            ) : null}
        </div>
      </CommonModal>

      <KeyboardShortcutsModal
        open={shortcutsHelpOpen && open}
        onClose={() => setShortcutsHelpOpen(false)}
        title="Keyboard shortcuts"
        items={SALES_BILLING_EDITOR_SHORTCUTS}
      />

      {/* ─── Record Payment Modal ─────────────────────────────────────────── */}
      <CommonModal
        open={paymentOpen}
        title="Record Customer Payment"
        icon={<IconReceipt />}
        onClose={() => setPaymentOpen(false)}
        footer={
          <div className="sfmModalFooter">
            <button className="sfmBtnGhost" type="button" onClick={() => setPaymentOpen(false)} disabled={busy}>Cancel</button>
            <button
              className="sfmBtnPrimary"
              type="button"
              disabled={
                busy ||
                !paymentForm.customerId ||
                !(
                  Number(paymentForm.amount || 0) > 0 ||
                  (Boolean(paymentForm.salesInvoiceId) && Boolean(paymentForm.useAdvanceFirst))
                )
              }
              onClick={async () => {
                setBusy(true);
                const r = await createCustomerPayment(paymentForm);
                if (r.status >= 200 && r.status < 300 && r.json?.ok) {
                  setPaymentOpen(false);
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
        <div className="sfmGrid">
          {paymentForm.salesInvoiceId ? (
            <div className="sfmFull" style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 10, background: "var(--color-bg-2)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Summary</div>
              <div style={{ fontSize: 12, color: "var(--color-text-3)", display: "grid", gap: 2 }}>
                <div>Due: {fmtMoneyINR(selectedPaymentInvoice?.balance_due || 0)}</div>
                <div>Advance used: {fmtMoneyINR(paymentForm.useAdvanceFirst ? paymentAdvanceHint.apply || 0 : 0)}</div>
                <div><strong>Collect now: {fmtMoneyINR(paymentForm.useAdvanceFirst ? paymentAdvanceHint.remaining || 0 : paymentForm.amount || 0)}</strong></div>
              </div>
            </div>
          ) : null}
          <div className="raField"><label>Date <span className="reqMark" aria-hidden="true">*</span></label><CommonDatePicker value={paymentForm.paymentDate} onChange={(v) => setPaymentForm((p) => ({ ...p, paymentDate: v }))} ariaLabel="Payment date" /></div>
          <div className="raField"><label>Cash received now <span className="reqMark" aria-hidden="true">*</span></label><AmountInput className="raInput" value={String(paymentForm.amount ?? "")} disabled={Boolean(paymentForm.salesInvoiceId) && Boolean(paymentForm.useAdvanceFirst)} onChange={(raw) => setPaymentForm((p) => ({ ...p, amount: raw }))} inputMode="decimal" /></div>
          <div className="raField"><label>Mode</label><select className="raInput" value={paymentForm.paymentMode} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentMode: e.target.value }))}><option>CASH</option><option>CHEQUE</option><option>NEFT</option><option>UPI</option><option>CARD</option><option>OTHER</option></select></div>
          <div className="raField"><label>Reference</label><input className="raInput" value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm((p) => ({ ...p, referenceNumber: e.target.value }))} /></div>
          {paymentForm.salesInvoiceId ? (
            <label className="sfmCheck">
              <input
                type="checkbox"
                checked={Boolean(paymentForm.useAdvanceFirst)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  const row = (rows || []).find((x) => String(x.id) === String(paymentForm.salesInvoiceId));
                  const balance = Number(row?.balance_due || 0);
                  setPaymentForm((p) => ({
                    ...p,
                    useAdvanceFirst: checked,
                    amount: Number(checked ? paymentAdvanceHint.remaining : balance).toFixed(2)
                  }));
                }}
              />
              <span>Use customer advance first</span>
            </label>
          ) : null}
        </div>
      </CommonModal>

      {/* ─── Batch Modal ─────────────────────────────────────────────────── */}
      <ProductBatchModal
        open={batchModalOpen}
        mode="add"
        busy={batchModalBusy}
        initialValue={batchModalSeed}
        existingRows={[]}
        productOptions={products}
        divisionOptions={(batchModalDivisionOptions || []).filter(
          (d) => Boolean(d.is_active) || String(d.id) === String(batchModalSeed?.divisionId || "")
        )}
        mfgCompanyOptions={batchModalMfgOptions}
        onRefreshDivisionMfg={refreshBatchModalMasters}
        onClose={() => {
          if (batchModalBusy) return;
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
            const availableBatches = await loadBatchesForProduct(productId);
            const b = availableBatches.find((x) => String(x.id) === createdBatchId) || availableBatches[0];
            setForm((prev) => ({
              ...prev,
              items: prev.items.map((x, i) => {
                if (i !== batchModalLineIdx) return x;
                if (!b) return { ...x, availableBatches };
                const label = batchDropdownLabel(b);
                return {
                  ...x,
                  availableBatches,
                  batchSearch: label,
                  batchId: b.id,
                  batchNo: b?.batch_no || "",
                  mrp: Number(b?.mrp || 0),
                  salesRate: Number(b?.sales_rate || 0),
                  gstPercent: Number(b?.sales_gst || 0),
                  availableStock: batchBillableQtyFromRow(b),
                  availableFreeStock: batchFreeQtyFromRow(b),
                  isHold: Boolean(b?.is_hold),
                  holdReason: b?.hold_reason || "",
                  saleLock: Boolean(b?.sale_lock),
                  mfgName: b?.mfg_company_name || "",
                  preventFreeQty: Boolean(b?.prevent_free_qty),
                  preventDiscount: Boolean(b?.prevent_discount),
                  preventNetRate: Boolean(b?.prevent_net_rate),
                  isHalfScheme: Boolean(b?.is_half_scheme),
                  isNet: Boolean(b?.is_net),
                  netDiscountPercent: Number(b?.net_discount_percent || 0),
                  isNonEditableFreeQty: Boolean(b?.is_non_editable_free_qty),
                  schemeQtyPaid: Number(b?.scheme_qty_paid || 0),
                  schemeQtyFree: Number(b?.scheme_qty_free || 0),
                  isControl: Boolean(b?.is_control)
                };
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

      {/* ─── Scheme Discount Popup ────────────────────────────────────────── */}
      <SchemeDiscountPopup
        open={schemePopup.open}
        lineNumber={schemePopup.lineIdx >= 0 ? schemePopup.lineIdx + 1 : null}
        item={schemePopup.lineIdx >= 0 ? form.items?.[schemePopup.lineIdx] : null}
        onClose={() => setSchemePopup({ open: false, lineIdx: -1 })}
        onApply={(updates) => {
          const lineIdx = schemePopup.lineIdx;
          if (lineIdx < 0) return;
          setForm((prev) => ({
            ...prev,
            items: (prev.items || []).map((x, i) => (i === lineIdx ? { ...x, ...updates } : x))
          }));
        }}
      />

      {/* ─── Bulk Payment Confirm Modal ───────────────────────────────────── */}
      <CommonModal
        open={bulkPaymentConfirm.open}
        title="Complete selected payments?"
        icon={<IconReceipt />}
        onClose={() => (bulkPaymentBusy ? null : setBulkPaymentConfirm({ open: false, ids: [], count: 0, total: 0, paymentDate: "", paymentMode: "" }))}
        size="md"
        footer={
          <div className="sfmModalFooter">
            <button
              className="sfmBtnGhost"
              type="button"
              onClick={() => setBulkPaymentConfirm({ open: false, ids: [], count: 0, total: 0, paymentDate: "", paymentMode: "" })}
              disabled={bulkPaymentBusy}
            >
              Cancel
            </button>
            <button className="sfmBtnPrimary" type="button" onClick={confirmBulkCollectPayments} disabled={bulkPaymentBusy}>
              {bulkPaymentBusy ? <InlineButtonProgress label="Completing..." /> : "Complete payment"}
            </button>
          </div>
        }
      >
        <div className="sfmGrid">
          <div className="sfmFull sbmBulkPayBanner">
            <strong>{bulkPaymentConfirm.count || 0}</strong> invoice(s) selected | Total collection: <strong>{fmtMoneyINR(bulkPaymentConfirm.total || 0)}</strong>
          </div>
          <div className="raField">
            <label>Payment Date <span className="reqMark" aria-hidden="true">*</span></label>
            <CommonDatePicker
              value={bulkPaymentConfirm.paymentDate || todayYmdLocal()}
              onChange={(v) => setBulkPaymentConfirm((p) => ({ ...p, paymentDate: v }))}
              ariaLabel="Bulk sales payment date"
            />
          </div>
          <div className="raField">
            <label>Payment Mode <span className="reqMark" aria-hidden="true">*</span></label>
            <select
              className="raInput"
              value={bulkPaymentConfirm.paymentMode || "CASH"}
              onChange={(e) => setBulkPaymentConfirm((p) => ({ ...p, paymentMode: e.target.value }))}
            >
              <option value="CASH">CASH</option>
              <option value="CHEQUE">CHEQUE</option>
              <option value="NEFT">NEFT</option>
              <option value="UPI">UPI</option>
              <option value="CARD">CARD</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>
        </div>
      </CommonModal>

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
        onClose={() => setSendContact({ open: false, pendingIds: [], customerId: "", customerName: "" })}
        onSave={saveSendContactAndResend}
      />

      {/* ─── Confirm / Cancel Dialog ──────────────────────────────────────── */}
      <ConfirmDialog
        open={confirm.open}
        title={confirm.type === "confirm" ? "Confirm invoice?" : "Cancel invoice?"}
        message={confirm.type === "confirm" ? "This will post SALE stock transactions." : "This will cancel the invoice."}
        confirmLabel={confirm.type === "confirm" ? "Confirm" : "Cancel invoice"}
        cancelLabel="Close"
        busy={busy}
        danger={confirm.type !== "confirm"}
        onClose={() => setConfirm({ open: false, id: "", type: "confirm" })}
        onConfirm={async () => {
          if (!confirm.id) return;
          setBusy(true);
          try {
            if (confirm.type === "confirm") {
              const pipe = await runSalesInvoiceConfirmPipeline(confirm.id);
              if (!pipe.ok) {
                if (!pipe.aborted && pipe.toast) emitToast(pipe.toast);
                return;
              }
              await refreshSalesTableOnly();
              return;
            }
            const r = await cancelSalesInvoice(confirm.id, {});
            if (r.status >= 200 && r.status < 300 && r.json?.ok) await refreshSalesTableOnly();
            else if (r.status !== 401) emitToast({ type: "error", ...parseApiErrorToast(r) });
          } finally {
            setBusy(false);
            setConfirm({ open: false, id: "", type: "confirm" });
          }
        }}
      />

      <ConfirmDialog
        open={bulkConfirmSalesDialog.open}
        title="Confirm selected drafts?"
        message={`Post stock and confirm ${bulkConfirmSalesDialog.ids?.length || 0} draft invoice(s)?`}
        confirmLabel="Confirm all"
        cancelLabel="Close"
        busy={bulkConfirmBusy}
        danger={false}
        onClose={() => (bulkConfirmBusy ? null : setBulkConfirmSalesDialog({ open: false, ids: [] }))}
        onConfirm={async () => {
          const ids = bulkConfirmSalesDialog.ids || [];
          if (!ids.length) return;
          setBulkConfirmBusy(true);
          try {
            const r = await bulkConfirmSalesInvoices({ ids });
            setBulkConfirmSalesDialog({ open: false, ids: [] });
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
                emitToast({ type: "success", message: r.json?.meta?.message || "Invoices confirmed." });
              }
              await refreshSalesTableOnly();
            } else if (r.status !== 401) {
              emitToast({ type: "error", message: parseApiError(r) });
            }
          } finally {
            setBulkConfirmBusy(false);
          }
        }}
      />

      {/* ─── CSV Import Wizard ────────────────────────────────────────────── */}
      <CsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityType="SALES"
        title="Import sales invoices"
        onCompleted={() => refresh()}
      />
    </AppShell>
  );
}