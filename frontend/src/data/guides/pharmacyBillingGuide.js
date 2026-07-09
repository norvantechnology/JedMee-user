import { COMPLIANCE_AUTHOR } from "../authors.js";
import { TAX_SOURCES } from "../officialSources.js";

const CANONICAL = "https://jedmee.com/pharmacy-billing-guide";

export const PHARMACY_BILLING_GUIDE = {
  pageTitle: "Pharmacy Billing & Tax Compliance Guide",
  metaTitle: "Pharmacy Billing Software & Tax Compliance Guide",
  description:
    "How pharmacy billing software supports GST, VAT, and tax-compliant invoices. Data security practices for pharmacy records and what to look for in compliant systems like JedMee.",
  canonical: CANONICAL,
  label: "Compliance & Billing",
  datePublished: "2026-03-15",
  lastUpdated: "2026-07-09",
  officialSources: [TAX_SOURCES.gstIndia, TAX_SOURCES.cbicIndia, TAX_SOURCES.hmrcVat],
  service: {
    name: "JedMee pharmacy billing & tax compliance",
    description:
      "GST, VAT, and sales tax invoicing with batch references, credit notes, and exportable tax summaries for pharmacies.",
    serviceType: "Pharmacy billing software",
  },
  howTo: {
    name: "Pharmacy billing compliance workflow",
    heading: "How to set up compliant pharmacy billing in JedMee",
    intro: "Follow these steps before and after go-live to keep tax invoices auditable.",
    steps: [
      {
        name: "Map every product to the correct tax rate",
        text: "Configure GST, VAT, or sales tax % on each product or category before staff begin billing — refer to official tax authority guidance for your region.",
      },
      {
        name: "Train staff to select batch at billing",
        text: "Require batch selection on every sale so invoice lines match inventory and expiry records.",
      },
      {
        name: "Reconcile daily sales with the day book",
        text: "Compare day book totals to cash drawer and card receipts each evening.",
      },
      {
        name: "Review credit customer outstanding weekly",
        text: "Use customer ledger reports to chase balances before extending further credit.",
      },
      {
        name: "Export monthly tax summary before filing",
        text: "Run GSTR-1 oriented or VAT summaries and share with your accountant before statutory deadlines.",
      },
    ],
  },
  relatedGuides: [
    { label: "Pharmacy inventory management guide", to: "/pharmacy-inventory-guide" },
    { label: "What is pharmacy management software?", to: "/pharmacy-management-software" },
    { label: "Pharmacy software comparison", to: "/pharmacy-software-comparison" },
  ],
  author: COMPLIANCE_AUTHOR,
  breadcrumbs: [
    { name: "Home", url: "https://jedmee.com/" },
    { name: "Pharmacy Billing Guide", url: CANONICAL },
  ],
  introFacts: [
    "JedMee generates GST-ready invoices (India), supports VAT and sales tax configurations, and stores immutable invoice numbers with batch references on every line — errors lead to tax penalties, audit issues, and customer disputes if billing is manual.",
    "Pharmacy billing software must produce accurate, auditable tax invoices for every sale and purchase with correct tax rates per medicine, customer details, and role-based access. Data is encrypted in transit (TLS) and at rest on AWS infrastructure.",
  ],
  sections: [
    {
      heading: "What compliant pharmacy billing includes",
      bullets: [
        "Unique sequential invoice numbers with date and time stamps",
        "Product-wise tax rate (HSN/SAC or local equivalent) on each line item",
        "Batch number and expiry on billed medicines where required",
        "Customer name, address, and tax ID on B2B invoices",
        "Credit notes and sales returns linked to original invoices",
        "Exportable tax reports (e.g. GSTR-1 summary for India)",
      ],
      paragraphs: [
        "Your software should never allow silent deletion of posted invoices — corrections happen through credit notes or approved adjustments with an audit trail.",
      ],
    },
    {
      heading: "How does JedMee handle GST billing in India?",
      qa: [
        {
          q: "How does JedMee handle GST billing?",
          a: "Set GST % per product or category. Sales invoices auto-calculate CGST/SGST or IGST based on place of supply rules you configure. GSTR-1 oriented reports aggregate outward supplies for filing prep.",
        },
        {
          q: "Can I bill with VAT or sales tax outside India?",
          a: "Yes. Tax labels and rates are configurable per product so pharmacies in the UAE, US, Canada, and other regions can issue compliant local invoices.",
        },
      ],
    },
    {
      heading: "Data security and privacy for pharmacy records",
      paragraphs: [
        "Pharmacy systems store patient-linked sales, prescription metadata, and financial data. While JedMee is not a covered entity under US HIPAA by default, we follow security practices aligned with healthcare-adjacent SaaS: encryption, access controls, audit logs, and regular backups.",
        "For US pharmacies handling PHI, you should execute a Business Associate Agreement (BAA) with your vendor if required — contact JedMee sales to discuss enterprise compliance needs. Indian pharmacies should align with local drug record-keeping rules and IT Act data protection expectations.",
      ],
      bullets: [
        "Role-based access: cashiers cannot change master data or delete invoices",
        "Encrypted HTTPS for all browser sessions",
        "Cloud backups and 99.9% uptime target",
        "No selling of customer data to third parties",
      ],
    },
    {
      heading: "DEA-controlled substances and local regulations",
      paragraphs: [
        "DEA Schedule II–V tracking in the United States requires specialized workflows and often state board integration — features vary by vendor and jurisdiction. JedMee focuses on general pharmaceutical retail and wholesale billing; verify your local controlled-substance rules before go-live.",
        "Always consult your accountant or compliance officer for tax filing and record retention periods in your state or country.",
      ],
    },
    {
      heading: "Billing workflow checklist for pharmacy owners",
      bullets: [
        "Map every product to the correct tax rate before go-live",
        "Train staff to select batch at billing (never sell expired stock)",
        "Reconcile daily sales total with day book report",
        "Review credit customer outstanding weekly",
        "Export monthly tax summary before filing deadline",
      ],
    },
  ],
  faqs: [
    {
      q: "Does pharmacy billing software help with GST compliance?",
      a: "Yes. Systems like JedMee calculate tax per line item and provide summaries compatible with GSTR-1 preparation for Indian pharmacies.",
    },
    {
      q: "Is JedMee HIPAA compliant?",
      a: "JedMee uses enterprise-grade security controls. HIPAA compliance for US PHI requires specific contractual and technical measures — contact us for enterprise requirements.",
    },
    {
      q: "Can I reprint or email tax invoices to customers?",
      a: "Yes. Reprint from sales history anytime. Email is available when the customer has an email address on file.",
    },
    {
      q: "What happens if I enter the wrong tax rate?",
      a: "Correct the product master rate, then issue a credit note for incorrect invoices and rebill — preserving a clear audit trail.",
    },
  ],
};
