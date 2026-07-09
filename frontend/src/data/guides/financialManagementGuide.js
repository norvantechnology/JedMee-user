import { COMPLIANCE_AUTHOR } from "../authors.js";
import { TAX_SOURCES } from "../officialSources.js";

const CANONICAL = "https://jedmee.com/pharmacy-financial-management";

export const FINANCIAL_MANAGEMENT_GUIDE = {
  pageTitle: "Pharmacy Financial Management & Automated Billing",
  metaTitle: "Pharmacy Financial Reports, Day Book & GST Billing",
  description:
    "Reduce manual billing errors with JedMee day book, customer/vendor ledgers, automated tax invoices, and GST-oriented reports for pharmacy owners and accountants.",
  canonical: CANONICAL,
  label: "Financial Management",
  datePublished: "2026-06-01",
  lastUpdated: "2026-07-09",
  relatedGuides: [
    { label: "Pharmacy billing & tax guide", to: "/pharmacy-billing-guide" },
    { label: "Software comparison", to: "/pharmacy-software-comparison" },
    { label: "Free trial", to: "/free-trial" },
  ],
  author: COMPLIANCE_AUTHOR,
  breadcrumbs: [
    { name: "Home", url: "https://jedmee.com/" },
    { name: "Financial Management", url: CANONICAL },
  ],
  officialSources: [TAX_SOURCES.gstIndia, TAX_SOURCES.cbicIndia, TAX_SOURCES.hmrcVat],
  introFacts: [
    "JedMee links every sales and purchase invoice to customer and vendor ledgers and the day book - so totals update automatically without duplicate spreadsheet entry.",
    "Owners reconcile cash and credit daily using the day book report, review outstanding balances on ledger screens, and use GST-oriented reports for filing preparation (India) or VAT/sales tax records in other regions.",
  ],
  service: {
    name: "JedMee pharmacy financial management",
    description:
      "Automated billing, ledgers, day book, and tax reporting for pharmacy retail and wholesale operations.",
    serviceType: "Pharmacy financial management software",
  },
  howTo: {
    name: "Daily pharmacy financial reconciliation in JedMee",
    heading: "How to reconcile daily pharmacy finances in JedMee",
    intro: "Follow these steps each business day to keep billing, cash, and credit aligned.",
    steps: [
      {
        name: "Review day book totals",
        text: "Open Reports → Day Book and verify sales, purchases, receipts, and payments match your cash drawer and bank deposits for the day.",
      },
      {
        name: "Post all sales and purchase invoices",
        text: "Ensure every counter sale and supplier delivery is invoiced the same day - unposted stock breaks valuation and tax reports.",
      },
      {
        name: "Record customer and vendor payments",
        text: "Use Customer Payments and Vendor Payments screens to allocate receipts against outstanding invoices.",
      },
      {
        name: "Check credit outstanding",
        text: "Review customer ledger balances before extending further credit sales.",
      },
      {
        name: "Export tax summary at month-end",
        text: "Run GST reports (e.g. GSTR-1 oriented views) and share with your accountant before filing deadlines.",
      },
    ],
  },
  sections: [
    {
      heading: "How does automated billing reduce manual errors?",
      paragraphs: [
        "Tax rates pull from the product master at billing time - staff do not re-type percentages. Batch selection links each line to inventory. Invoice numbers are sequential; corrections use credit notes to preserve an audit trail.",
      ],
      bullets: [
        "Auto-calculate line tax, discounts, and round-off",
        "Link customer payments to specific invoices",
        "Day book shows gross profit margin on sales",
        "Reprint invoices from sales history; email when customer email is on file",
      ],
    },
    {
      heading: "What financial reports do pharmacy owners use?",
      comparisonTable: {
        headers: ["Report (in JedMee)", "Purpose"],
        rows: [
          ["Day book", "Daily sales, purchases, receipts, payments, profit summary"],
          ["Customer ledger", "Outstanding credit and payment history per customer"],
          ["Vendor ledger", "Amounts owed to suppliers"],
          ["GST R-1 oriented report", "Outward supplies summary (India GST)"],
          ["Sales stock analysis", "Revenue vs inventory by product"],
          ["Non-moving stock", "Slow-moving items tying up capital"],
        ],
      },
    },
    {
      heading: "How does JedMee support GST and multi-tax filing?",
      paragraphs: [
        "Configure GST, VAT, or sales tax per product. Outward invoice lines feed GST-oriented reports for Indian pharmacies. Always verify final filing with your chartered accountant and official portals such as the GST portal.",
      ],
    },
    {
      heading: "Can my accountant access JedMee reports?",
      paragraphs: [
        "Create a user with a read-only custom role (reports view only, no billing edits) or export data from reports. For export help, contact supportjedmee@gmail.com.",
      ],
    },
  ],
  faqs: [
    {
      q: "Does JedMee replace my accountant?",
      a: "No. JedMee prepares transaction data and tax summaries; your accountant remains responsible for statutory filing and advice.",
    },
    {
      q: "Can I see payment modes in the day book?",
      a: "Yes. The day book report includes a payment-mode breakdown for the selected day.",
    },
    {
      q: "How do credit notes affect financial reports?",
      a: "Credit notes reduce revenue and restore stock; they stay linked to the original invoice in reports and ledgers.",
    },
    {
      q: "Is there a trial for financial reporting features?",
      a: "Yes - day book, ledgers, and GST reports are available during the 14-day free trial.",
    },
  ],
};
