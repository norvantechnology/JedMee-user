/**
 * TaxLabel
 * Renders the dynamic tax label for the active country.
 * Reads from LocaleContext so it automatically updates when the country changes.
 *
 * Props:
 *   suffix    {string}  — text appended after the label (e.g. " Amount", " %", " Report")
 *   prefix    {string}  — text prepended before the label
 *   className {string}  — extra CSS class for the wrapping <span>
 *   as        {string}  — HTML element to render (default: "span")
 *
 * Examples:
 *   <TaxLabel />                    → "GST"  (India) / "VAT"  (UK)
 *   <TaxLabel suffix=" Amount" />   → "GST Amount" / "VAT Amount"
 *   <TaxLabel suffix=" Report" />   → "GST Report" / "Sales Tax Report"
 *   <TaxLabel prefix="Include " />  → "Include GST" / "Include VAT"
 */

import { useLocale } from "../../context/LocaleContext.jsx";

export default function TaxLabel({ suffix = "", prefix = "", className, as: Tag = "span" }) {
  const { taxLabel } = useLocale();
  const text = `${prefix}${taxLabel}${suffix}`;

  if (className) {
    return <Tag className={className}>{text}</Tag>;
  }
  return <>{text}</>;
}

/**
 * TaxIdLabel
 * Renders the dynamic tax ID field label (e.g. "GST Number", "VAT Number", "Tax ID").
 *
 * Props: same as TaxLabel
 */
export function TaxIdLabel({ suffix = "", prefix = "", className, as: Tag = "span" }) {
  const { taxIdLabel } = useLocale();
  const text = `${prefix}${taxIdLabel}${suffix}`;

  if (className) {
    return <Tag className={className}>{text}</Tag>;
  }
  return <>{text}</>;
}

/**
 * InvoiceLabel
 * Renders the dynamic invoice document title
 * (e.g. "Tax Invoice", "VAT Invoice", "Invoice").
 *
 * Props: same as TaxLabel
 */
export function InvoiceLabel({ suffix = "", prefix = "", className, as: Tag = "span" }) {
  const { invoiceLabel } = useLocale();
  const text = `${prefix}${invoiceLabel}${suffix}`;

  if (className) {
    return <Tag className={className}>{text}</Tag>;
  }
  return <>{text}</>;
}