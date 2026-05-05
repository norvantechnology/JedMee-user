import { AppButton, InlineButtonProgress } from "../ui/buttons.jsx";
import { IconDispatch, IconDelivered, IconLedger } from "../ui/AppIcons.jsx";

/**
 * Renders the per-row actions for the Orders table.
 * Kept in a component so both "Orders" (wholesaler) and "My Orders" (retailer)
 * can reuse the same action UI and loading behavior.
 */
export default function OrdersQuickActions({ isRetailer, row, onView, onQuickAction, busyKey }) {
  const id = String(row?.id || "");
  const btnBusy = (type) => busyKey === `${type}:${id}`;

  return (
    <div className="ordQuickActions">
      <AppButton size="sm" onClick={() => onView(row)}>
        View
      </AppButton>

      {isRetailer && row.status === "PENDING" ? (
        <AppButton size="sm" variant="danger" onClick={() => onQuickAction("cancel", row)} disabled={btnBusy("cancel")}>
          {btnBusy("cancel") ? <InlineButtonProgress /> : "Cancel"}
        </AppButton>
      ) : null}

      {!isRetailer && row.status === "PENDING" ? (
        <AppButton size="sm" variant="primary" onClick={() => onView(row)}>
          Accept
        </AppButton>
      ) : null}

      {!isRetailer && row.status === "PENDING" ? (
        <AppButton size="sm" variant="danger" onClick={() => onQuickAction("reject", row)} disabled={btnBusy("reject")}>
          {btnBusy("reject") ? <InlineButtonProgress /> : "Reject"}
        </AppButton>
      ) : null}

      {!isRetailer && row.status === "ACCEPTED" ? (
        <AppButton size="sm" onClick={() => onQuickAction("dispatch", row)} disabled={btnBusy("dispatch")} icon={<IconDispatch />}>
          {btnBusy("dispatch") ? <InlineButtonProgress /> : "Dispatch"}
        </AppButton>
      ) : null}

      {isRetailer && row.status === "DISPATCHED" ? (
        <AppButton size="sm" onClick={() => onQuickAction("confirm", row)} disabled={btnBusy("confirm")} icon={<IconDelivered />}>
          {btnBusy("confirm") ? <InlineButtonProgress /> : "Confirm"}
        </AppButton>
      ) : null}

      {isRetailer && row.status === "DELIVERED" && !row.retailer_purchase_invoice_id ? (
        <AppButton size="sm" onClick={() => onQuickAction("purchase", row)} disabled={btnBusy("purchase")} icon={<IconLedger />}>
          {btnBusy("purchase") ? <InlineButtonProgress /> : "Add Purchase"}
        </AppButton>
      ) : null}
    </div>
  );
}

