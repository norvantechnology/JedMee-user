import { useCallback, useEffect, useState } from "react";
import { fmtCurrency } from "../utils/format.js";
import {
  listOngoingSalesInvoices,
} from "../services/salesService.js";
import {
  listOngoingPurchaseInvoices,
} from "../services/purchaseService.js";
import "./OngoingBillsBar.css";

/**
 * Horizontal rail of in-progress DRAFT bills.
 *
 * Renders above sales or purchase pages so shop staff can serve multiple
 * customers/vendors in parallel — tap a chip to resume that bill, or click
 * `+ New` to start a fresh one.
 *
 * Props:
 *   module        — "sales" | "purchase"
 *   activeId      — current bill id (highlighted)
 *   onSelect(bill)— called when user picks a chip; pass `null` for "new"
 *   refreshKey    — change to force a refetch (e.g. after save/confirm)
 *
 * Each bill object carries: id, invoiceNumber, partyName, itemCount,
 * totalAmount, createdByName.
 */
export default function OngoingBillsBar({
  module = "sales",
  activeId,
  onSelect,
  refreshKey,
}) {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isSales = module === "sales";

  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resp = isSales
        ? await listOngoingSalesInvoices({ limit: 30 })
        : await listOngoingPurchaseInvoices({ limit: 30 });
      const rows = Array.isArray(resp?.data?.items)
        ? resp.data.items
        : Array.isArray(resp?.data)
          ? resp.data
          : [];
      const mapped = rows.map((b) => mapBill(b, isSales));
      setBills(mapped);
    } catch (e) {
      setError(String(e?.message || "Failed to load ongoing bills"));
    } finally {
      setLoading(false);
    }
  }, [isSales]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills, refreshKey]);

  if (!bills.length && !loading) {
    return (
      <div className="ongoingBills empty">
        <button
          type="button"
          className="ongoingBills__newChip"
          onClick={() => onSelect?.(null)}
        >
          + {isSales ? "New bill" : "New purchase"}
        </button>
        <span className="ongoingBills__hint">
          No ongoing {isSales ? "bills" : "purchases"} — start a new one.
        </span>
      </div>
    );
  }

  return (
    <div className="ongoingBills" role="list" aria-label={isSales ? "Ongoing sales bills" : "Ongoing purchase invoices"}>
      {bills.map((bill) => {
        const active = bill.id === activeId;
        return (
          <button
            key={bill.id}
            type="button"
            role="listitem"
            className={`ongoingBills__chip${active ? " is-active" : ""}`}
            onClick={() => onSelect?.(bill)}
            title={`${bill.partyName || "Walk-in"} · ${bill.invoiceNumber}`}
          >
            <span className="ongoingBills__chipTitle">
              {bill.partyName || (isSales ? "Walk-in customer" : "New vendor")}
            </span>
            <span className="ongoingBills__chipMeta">
              {bill.itemCount} item{bill.itemCount === 1 ? "" : "s"}
              {bill.totalAmount > 0 ? ` · ${fmtCurrency(bill.totalAmount)}` : ""}
              {bill.createdByName ? ` · ${bill.createdByName}` : ""}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        className="ongoingBills__newChip"
        onClick={() => onSelect?.(null)}
      >
        + New
      </button>
      {loading ? <span className="ongoingBills__hint">Refreshing…</span> : null}
      {error ? <span className="ongoingBills__error">{error}</span> : null}
    </div>
  );
}

function mapBill(raw, isSales) {
  const id = String(raw.id ?? "");
  const invoiceNumber = String(raw.invoice_number ?? raw.invoiceNumber ?? "");
  const partyName = isSales
    ? String(raw.customer_name ?? raw.customerName ?? "")
    : String(raw.vendor_name ?? raw.vendorName ?? "");
  const itemCount = Number(raw.item_count ?? raw.itemCount ?? 0) || 0;
  const totalAmount = Number(raw.total_amount ?? raw.totalAmount ?? 0) || 0;
  const createdByName = String(raw.created_by_name ?? raw.createdByName ?? "");
  return { id, invoiceNumber, partyName, itemCount, totalAmount, createdByName, raw };
}
