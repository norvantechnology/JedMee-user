/**
 * Order detail modal — facts column + retailer fulfillment block.
 */
import { fmtCurrency } from "../../utils/format.js";
export function OrderDetailFacts({ detail, isRetailer }) {
  const partyLabel = isRetailer ? "Wholesaler" : "Retailer";
  const partyName = isRetailer ? detail?.order?.wholesaler_firm_name : detail?.order?.retailer_firm_name;

  return (
    <section className="ordFactsCard" aria-label="Order facts">
      <div className="ordFactsStack">
        <div className="ordFactRow">
          <span className="ordFactLabel">Placed</span>
          <span className="ordFactValue ordFactValueMono">
            {detail?.order?.placed_at ? new Date(detail.order.placed_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
          </span>
        </div>
        <div className="ordFactRow">
          <span className="ordFactLabel">{partyLabel}</span>
          <span className="ordFactValue">{partyName || "—"}</span>
        </div>
        <div className="ordFactRow ordFactRow--total">
          <span className="ordFactLabel">Total</span>
          <span className="ordFactValue ordFactValueMoney">{fmtCurrency(detail?.order?.total_amount || 0)}</span>
        </div>
      </div>
    </section>
  );
}

const FULFILLMENT_STEPS = [
  { key: "accepted", title: "Accepted", getAt: (o) => o?.accepted_at },
  { key: "dispatched", title: "Dispatched", getAt: (o) => o?.dispatched_at },
  { key: "delivered", title: "Delivered", getAt: (o) => o?.delivered_at }
];

export function OrderDetailFulfillment({ order }) {
  return (
    <section className="ordFulfillmentCompact" aria-label="Fulfillment">
      <div className="ordFulfillmentHead">Fulfillment</div>
      <ul className="ordFulfillmentList">
        {FULFILLMENT_STEPS.map(({ key, title, getAt }) => {
          const at = getAt(order);
          return (
            <li key={key} className={at ? "ordFulfillmentItem--done" : "ordFulfillmentItem--pending"}>
              <span className="ordFulfillmentStep">{title}</span>
              <span className="ordFulfillmentStat">{at ? new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Pending"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
