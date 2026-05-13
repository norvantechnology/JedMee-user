import { useEffect, useState } from "react";
import CommonModal from "./CommonModal.jsx";
import { AppButton } from "./ui/buttons.jsx";
import ModalFooterShell from "./ui/ModalFooterShell.jsx";
import { fmtMoney } from "../utils/format.js";
import { printReturnDoc } from "../print/returnPrint.js";
import { Printer } from "lucide-react";
import "./ReturnViewModal.css";

/**
 * ReturnViewModal — shared "View / Print" modal for Sales Returns and Purchase Returns.
 *
 * Props:
 *   open       {boolean}              — controls visibility
 *   onClose    {() => void}           — close handler
 *   returnId   {string|null}          — ID of the return to fetch
 *   type       {"sales"|"purchase"}   — determines labels and field mapping
 *   fetchFn    {(id) => Promise}      — service function: getSalesReturn or getPurchaseReturn
 */
export default function ReturnViewModal({ open, onClose, returnId, type = "sales", fetchFn }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);

  // Fetch return details whenever the modal opens with a new ID
  useEffect(() => {
    if (!open || !returnId || !fetchFn) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetchFn(returnId).then((r) => {
      if (cancelled) return;
      if (r.status >= 200 && r.status < 300 && r.json?.ok) {
        setData(r.json?.data ?? null);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, returnId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Normalise the response shape — APIs may return { return: {...}, items: [...] }
  // or a flat object with an `items` array embedded.
  const ret = data?.return ?? data ?? null;
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(ret?.items) ? ret.items : [];

  const isSales = type === "sales";
  const partyLabel = isSales ? "Customer" : "Supplier / Division";
  const partyName = isSales
    ? (ret?.customer_name || "—")
    : (ret?.vendor_name || ret?.division_name || "—");
  const refInvoice = isSales
    ? (ret?.invoice_number || ret?.sales_invoice_number || "—")
    : (ret?.original_invoice_number || "—");
  const totalAmount = isSales
    ? Number(ret?.total_return_amount || 0)
    : Number(ret?.total_amount || 0);

  async function handlePrint() {
    if (!ret) return;
    setPrintBusy(true);
    try {
      printReturnDoc({ ret, items, type });
    } finally {
      setPrintBusy(false);
    }
  }

  const modalTitle = ret?.return_number
    ? `${isSales ? "Sales" : "Purchase"} Return — ${ret.return_number}`
    : isSales ? "Sales Return" : "Purchase Return";

  return (
    <CommonModal
      open={open}
      title={modalTitle}
      loading={loading}
      loadingText="Loading return details…"
      onClose={onClose}
      size="lg"
      footer={
        <ModalFooterShell>
          <AppButton variant="secondary" type="button" onClick={onClose}>
            Close
          </AppButton>
          {ret && (
            <AppButton
              variant="primary"
              type="button"
              onClick={handlePrint}
              disabled={printBusy}
            >
              <Printer size={14} style={{ marginRight: 6 }} />
              Print
            </AppButton>
          )}
        </ModalFooterShell>
      }
    >
      {ret ? (
        <div className="rvmBody">
          {/* ── Info grid ── */}
          <div className="rvmInfoGrid">
            <div className="rvmInfoCell">
              <span className="rvmInfoLabel">Return #</span>
              <span className="rvmInfoVal">{ret.return_number || "—"}</span>
            </div>
            <div className="rvmInfoCell">
              <span className="rvmInfoLabel">Date</span>
              <span className="rvmInfoVal">{String(ret.return_date || "").slice(0, 10) || "—"}</span>
            </div>
            <div className="rvmInfoCell">
              <span className="rvmInfoLabel">Status</span>
              <span className={`rvmStatusPill rvmStatusPill_${String(ret.status || "").toLowerCase()}`}>
                {ret.status || "—"}
              </span>
            </div>
            <div className="rvmInfoCell">
              <span className="rvmInfoLabel">{partyLabel}</span>
              <span className="rvmInfoVal">{partyName}</span>
            </div>
            <div className="rvmInfoCell">
              <span className="rvmInfoLabel">Ref Invoice</span>
              <span className="rvmInfoVal">{refInvoice}</span>
            </div>
            {!isSales && ret.return_reason && (
              <div className="rvmInfoCell">
                <span className="rvmInfoLabel">Reason</span>
                <span className="rvmInfoVal">
                  {String(ret.return_reason).replace(/_/g, " ")}
                </span>
              </div>
            )}
            {ret.notes && (
              <div className="rvmInfoCell rvmInfoCell_full">
                <span className="rvmInfoLabel">Notes</span>
                <span className="rvmInfoVal">{ret.notes}</span>
              </div>
            )}
          </div>

          {/* ── Items table ── */}
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
                    <th className="rvmTh rvmNum">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const qty = Number(item.return_qty || item.qty || 0);
                    const freeQty = Number(item.return_free_qty || item.free_qty || 0);
                    const rate = Number(
                      item.net_rate ?? item.sales_rate ?? item.purchase_rate ?? item.rate ?? 0
                    );
                    const amt = Number(item.amount != null ? item.amount : qty * rate);
                    return (
                      <tr key={item.id || i} className="rvmRow">
                        <td className="rvmTd">{i + 1}</td>
                        <td className="rvmTd">{item.product_name || "—"}</td>
                        <td className="rvmTd">{item.batch_no || "—"}</td>
                        <td className="rvmTd rvmNum">
                          {qty}
                          {freeQty > 0 && (
                            <span className="rvmFreeQty"> +{freeQty}F</span>
                          )}
                        </td>
                        <td className="rvmTd rvmNum">{fmtMoney(rate)}</td>
                        <td className="rvmTd rvmNum rvmAmtCell">{fmtMoney(amt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="rvmTotalRow">
                    <td colSpan={5} className="rvmTotalLabel">
                      Total Return Amount
                    </td>
                    <td className="rvmNum rvmTotalVal">{fmtMoney(totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="rvmEmpty">No line items recorded for this return.</div>
          )}
        </div>
      ) : !loading ? (
        <div className="rvmEmpty">No data available.</div>
      ) : null}
    </CommonModal>
  );
}