import { PRIMARY_AUTHOR } from "../authors.js";
import { PRICING_PLANS } from "../pricingPlans.js";

const CANONICAL = "https://jedmee.com/free-trial";

export const FREE_TRIAL_GUIDE = {
  pageTitle: "JedMee Free Trial - 14 Days, No Credit Card",
  metaTitle: "Pharmacy Software Free Trial - No Credit Card Required",
  description:
    "Start JedMee's 14-day pharmacy software free trial with full billing, inventory, and expiry features. No credit card required - compare plans before you subscribe.",
  canonical: CANONICAL,
  label: "Free Trial & Pricing",
  datePublished: "2026-06-01",
  lastUpdated: "2026-07-09",
  relatedGuides: [
    { label: "Software comparison", to: "/pharmacy-software-comparison" },
    { label: "What is pharmacy management software?", to: "/pharmacy-management-software" },
    { label: "Contact sales", to: "/contact" },
  ],
  author: PRIMARY_AUTHOR,
  breadcrumbs: [
    { name: "Home", url: "https://jedmee.com/" },
    { name: "Free Trial", url: CANONICAL },
  ],
  introFacts: [
    "JedMee offers a 14-day free trial on the Starter plan with no credit card required at signup - register at jedmee.com/register to begin.",
    "During the trial you can use tax billing, batch inventory, expiry alerts, customer and vendor ledgers, and CSV import so you can run real shop workflows before choosing a paid plan from $9/month.",
  ],
  sections: [
    {
      heading: "What is included in the JedMee free trial?",
      bullets: [
        "GST / VAT / sales tax billing with printable invoices",
        "Batch-level inventory and expiry date alerts",
        "Customer and vendor ledgers with payment recording",
        "Purchase and sales returns with audit trail",
        "Wholesale order catalog (for wholesaler accounts)",
        "CSV import for products and opening stock",
        "Mobile browser access and Android APK download from the homepage",
      ],
    },
    {
      heading: "How does JedMee compare to other pharmacy software trials?",
      comparisonTable: {
        headers: ["Criteria", "JedMee", "Typical desktop / ERP trials"],
        rows: [
          ["Trial length", "14 days", "7–30 days or demo only"],
          ["Credit card at signup", "Not required", "Often required"],
          ["Cloud access during trial", "Yes", "Sometimes desktop-only"],
          ["Pharmacy batch / expiry", "Included", "Varies"],
          ["Post-trial starting price", "From $9/mo", "Often higher license fees"],
        ],
      },
    },
    {
      heading: "How do I start the free trial?",
      paragraphs: [
        "Go to jedmee.com/register, choose wholesaler or retailer account type, and complete signup with your pharmacy name and email. Import products via CSV or enter manually - contact supportjedmee@gmail.com if you need onboarding help.",
      ],
    },
    {
      heading: "What happens after 14 days?",
      paragraphs: [
        "After 14 days, subscribe to Growth ($9/mo), Professional ($19/mo), or Enterprise ($39/mo), or request a data export within 30 days if you do not continue. See live plan details on the homepage pricing section.",
      ],
    },
  ],
  faqs: [
    {
      q: "Is the JedMee free trial really free?",
      a: "Yes. You can use JedMee for 14 days without entering payment details. Paid plans only start if you choose to subscribe after the trial.",
    },
    {
      q: "Can I switch plans during the trial?",
      a: "Contact supportjedmee@gmail.com if you need to change plan limits during your evaluation. Paid plan pricing is shown on the homepage.",
    },
    {
      q: "Do I lose data if I don't subscribe?",
      a: "You can request a data export within 30 days after trial ends. We do not sell or reuse your business data.",
    },
    {
      q: "How does JedMee pricing compare after the trial?",
      a: `Paid plans start at $${PRICING_PLANS[1]?.price || "9"}/month with no large upfront license - see homepage pricing for current tiers.`,
    },
  ],
};
