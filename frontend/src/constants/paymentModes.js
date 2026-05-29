/** Align with backend customer_payment_mode_type / payment_mode_type */
export const CUSTOMER_PAYMENT_MODE_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "NEFT", label: "NEFT" },
  { value: "OTHER", label: "Other" },
];

export function formatPaymentModeLabel(mode) {
  const m = String(mode || "").toUpperCase();
  if (!m || m === "CREDIT") return "Credit";
  const hit = CUSTOMER_PAYMENT_MODE_OPTIONS.find((o) => o.value === m);
  return hit?.label || m;
}

/** Default: counter / walk-in / cash customers pay at confirm unless user chooses credit. */
export function defaultCollectPaymentNow({ isRetailer, isWalkIn, isCashCustomer }) {
  if (isRetailer && isWalkIn) return true;
  if (isCashCustomer) return true;
  return false;
}
