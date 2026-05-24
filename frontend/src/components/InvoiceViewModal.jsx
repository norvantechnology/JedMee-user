import { useEffect, useState } from "react";
import CommonModal from "./CommonModal.jsx";
import { AppButton } from "./ui/buttons.jsx";
import ModalFooterShell from "./ui/ModalFooterShell.jsx";
import { fmtMoney } from "../utils/format.js";
import { printSalesInvoice } from "../services/salesService.js";
import { printSalesInvoiceDoc } from "../print/salesInvoicePrint.js";
import { readAuth } from "../services/authStorage.js";
import medico from "../shared/print/medicoPrintDocuments.cjs";
import { printViaHiddenIframe } from "../print/printDocument.js";
import { emitToast } from "../services/toastBus.js";
import { Printer, Pencil } from "lucide-react";
import "./ReturnViewModal.css";

/**
 * InvoiceViewModal — shared read-only view for Sales & Purchase invoices.
 *
 * Props:
 *   open       {boolean}
 *   onClose    {() => void}
 *   invoiceId  {string|null}
 *   type       {"sales"|"purchase"}
 *   fetchFn    {(id) => Promise}
 *   canEdit    {boolean}           — show Edit for DRAFT rows
 *   onEdit     {(id) => void}      — opens the edit form (parent closes this modal)
 */
export default function InvoiceViewModal({
  open,
  onClose,
  invoiceId,
  type = "sales",
  fetchFn,
  canEdit = false,
  onEdit
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);

  useEffect(() => {
    if (!open || !invoiceId || !fetchFn) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetchFn(invoiceId).then((r) => {
      if (cancelled) return;
      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
        setData(r.json?.data ?? null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const inv = data?.invoice ?? data ?? null;
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(inv?.items) ? inv.items : [];

  const isSales = type === "sales";
  const partyLabel = isSales ? "Customer" : "Supplier / Division";
  const partyName = isSales
    ? inv?.customer_name || "—"
    : inv?.vendor_name || inv?.division_name || "—";

  const totalAmount = Number(
    inv?.grand_total ?? inv?.total_amount ?? inv?.net_amount ?? 0
  );
  const amountPaid = Number(inv?.amount_paid ?? 0);
  const balanceDue = Number(inv?.balance_due ?? 0);
  const status = String(inv?.status || "").toUpperCase();
  const isDraft = status === "DRAFT";
  const canPrint = status === "CONFIRMED";

  async function handlePrint() {
    if (!invoiceId) return;
    setPrintBusy(true);
    try {
      if (isSales) {
        const p = await printSalesInvoice(invoiceId);
        if (p.status >= 200 && p.status < 300 && p.json?.ok) {
          const started = printSalesInvoiceDoc(p.json?.data);
          if (!started?.ok) {
            emitToast({ type: "warning", message: "Unable to open print view. Please try again." });
          }
        } else {
          emitToast({ type: "error", message: "Could not load invoice for printing." });
        }
        return;
      }

      const auth = readAuth();
      const user = auth?.user || {};
      const seller = {
        firm_name: user?.firm_name || "",
        full_name: user?.full_name || "",
        address: user?.address || "",
        phone_number: user?.phone_number || user?.phone || "",
        gst_number: user?.gst_number || ""
      };
      const doc = {
        seller,
        invoice: inv,
        items,
        printable: { title: "Purchase Invoice" }
      };
      const bodyHtml = medico.buildPurchaseInvoiceBodyHtml(doc);
      printViaHiddenIframe({
        title: `Purchase Invoice ${inv?.invoice_number || ""}`.trim(),
        bodyHtml
      });
    } finally {
      setPrintBusy(false);
    }
  }

  const modalTitle = inv?.invoice_number
    ? `${isSales ? "Sales" : "Purchase"} Invoice — ${inv.invoice_number}`
    : isSales
      ? "Sales Invoice"
      : "Purchase Invoice";

  return (
    <CommonModal
      open={open}
      title={modalTitle}
      loading={loading}
      loadingText="Loading invoice details…"
      onClose={onClose}
      size="lg"
      footer={
        <ModalFooterShell>
          <AppButton variant="secondary" type="button" onClick={onClose}>
            Close
          </AppButton>
          {isDraft && canEdit && onEdit && invoiceId ? (
            <AppButton
              variant="secondary"
              type="button"
              onClick={() => onEdit(invoiceId)}
            >
              <Pencil size={14} style={{ marginRight: 6 }} />
              Edit draft
            </AppButton>
          ) : null}
          {inv && canPrint ? (
            <AppButton
              variant="primary"
              type="button"
              onClick={handlePrint}
              disabled={printBusy}
            >
              <Printer size={14} style={{ marginRight: 6 }} />
              Print
            </AppButton>
          ) : null}
        </ModalFooterShell>
      }
    >
      {inv ? (
        <div className="rvmBody">
          <div className="rvmInfoGrid">
            <div className="rvmInfoCell">
              <span className="rvmInfoLabel">Invoice #</span>
              <span className="rvmInfoVal">{inv.invoice_number || "—"}</span>
            </div>
            <div className="rvmInfoCell">
              <span className="rvmInfoLabel">Date</span>
              <span className="rvmInfoVal">
                {String(inv.invoice_date || "").slice(0, 10) || "—"}
              </span>
            </div>
            {inv.due_date ? (
              <div className="rvmInfoCell">
                <span className="rvmInfoLabel">Due date</span>
                <span className="rvmInfoVal">{String(inv.due_date).slice(0, 10)}</span>
              </div>
            ) : null}
            <div className="rvmInfoCell">
              <span className="rvmInfoLabel">Status</span>
              <span
                className={`rvmStatusPill rvmStatusPill_${String(inv.status || "").toLowerCase()}`}
              >
                {inv.status || "—"}
              </span>
            </div>
            <div className="rvmInfoCell">
              <span className="rvmInfoLabel">{partyLabel}</span>
              <span className="rvmInfoVal">{partyName}</span>
            </div>
            {!isSales && inv.vendor_invoice_number ? (
              <div className="rvmInfoCell">
                <span className="rvmInfoLabel">Supplier invoice #</span>
                <span className="rvmInfoVal">{inv.vendor_invoice_number}</span>
              </div>
            ) : null}
            {isSales && inv.bill_type ? (
              <div className="rvmInfoCell">
                <span className="rvmInfoLabel">Bill type</span>
                <span className="rvmInfoVal">
                  {String(inv.bill_type).replace(/_/g, " ")}
                </span>
              </div>
            ) : null}
            {isSales && inv.rate_type ? (
              <div className="rvmInfoCell">
                <span className="rvmInfoLabel">Rate type</span>
                <span className="rvmInfoVal">{inv.rate_type}</span>
              </div>
            ) : null}
            {status !== "CANCELLED" && inv.payment_status ? (
              <div className="rvmInfoCell">
                <span className="rvmInfoLabel">Payment</span>
                <span className="rvmInfoVal">{inv.payment_status}</span>
              </div>
            ) : null}
            <div className="rvmInfoCell">
              <span className="rvmInfoLabel">Total</span>
              <span className="rvmInfoVal">{fmtMoney(totalAmount)}</span>
            </div>
            {status === "CONFIRMED" ? (
              <>
                <div className="rvmInfoCell">
                  <span className="rvmInfoLabel">Paid</span>
                  <span className="rvmInfoVal">{fmtMoney(amountPaid)}</span>
                </div>
                <div className="rvmInfoCell">
                  <span className="rvmInfoLabel">Balance</span>
                  <span className="rvmInfoVal">{fmtMoney(balanceDue)}</span>
                </div>
              </>
            ) : null}
            {inv.notes ? (
              <div className="rvmInfoCell rvmInfoCell_full">
                <span className="rvmInfoLabel">Notes</span>
                <span className="rvmInfoVal">{inv.notes}</span>
              </div>
            ) : null}
          </div>

          {items.length > 0 ? (
            <div className="rvmTableWrap">
              <table className="rvmTable">
                <thead>
                  <tr>
                    <th className="rvmTh">#</th>
                    <th className="rvmTh">Product</th>
                    <th className="rvmTh">Batch</th>
                    <th className="rvmTh rvmNum">Qty</th>
                    <th className="rvmTh rvmNum">Rate</th>
                    <th className="rvmTh rvmNum">Disc %</th>
                    <th className="rvmTh rvmNum">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const qty = Number(item.qty || 0);
                    const freeQty = Number(item.free_qty || 0);
                    const rate = Number(
                      isSales
                        ? item.sales_rate ?? item.net_rate ?? item.rate ?? 0
                        : item.purchase_rate ?? item.net_rate ?? item.rate ?? 0
                    );
                    const disc = Number(item.discount_percent ?? 0);
                    const amt = Number(
                      item.line_total ??
                        item.amount ??
                        item.net_amount ??
                        qty * rate * (1 - disc / 100)
                    );
                    return (
                      <tr key={item.id || i} className="rvmRow">
                        <td className="rvmTd">{i + 1}</td>
                        <td className="rvmTd">{item.product_name || "—"}</td>
                        <td className="rvmTd">{item.batch_no || "—"}</td>
                        <td className="rvmTd rvmNum">
                          {qty}
                          {freeQty > 0 ? (
                            <span className="rvmFreeQty"> +{freeQty}F</span>
                          ) : null}
                        </td>
                        <td className="rvmTd rvmNum">{fmtMoney(rate)}</td>
                        <td className="rvmTd rvmNum">{disc.toFixed(2)}</td>
                        <td className="rvmTd rvmNum rvmAmtCell">{fmtMoney(amt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="rvmTotalRow">
                    <td colSpan={6} className="rvmTotalLabel">
                      Grand total
                    </td>
                    <td className="rvmNum rvmTotalVal">{fmtMoney(totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="rvmEmpty">No line items on this invoice.</div>
          )}
        </div>
      ) : !loading ? (
        <div className="rvmEmpty">No data available.</div>
      ) : null}
    </CommonModal>
  );
}
