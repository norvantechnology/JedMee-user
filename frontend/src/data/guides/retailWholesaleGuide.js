import { PRIMARY_AUTHOR } from "../authors.js";

const CANONICAL = "https://jedmee.com/retail-wholesale-pharmacy";

export const RETAIL_WHOLESALE_GUIDE = {
  pageTitle: "Retail + Wholesale Pharmacy in One System",
  metaTitle: "Combined Retail Billing & Wholesale Distribution Software",
  description:
    "Run retail counter billing and wholesale distribution from one JedMee account — shared inventory, separate workflows, retailer order catalogs, and unified reporting.",
  canonical: CANONICAL,
  label: "Retail & Wholesale",
  datePublished: "2026-06-01",
  lastUpdated: "2026-07-09",
  relatedGuides: [
    { label: "Wholesale & distribution guide", to: "/wholesale-pharmacy-software" },
    { label: "Multi-user roles", to: "/multi-user-pharmacy-software" },
    { label: "Inventory management guide", to: "/pharmacy-inventory-guide" },
  ],
  author: PRIMARY_AUTHOR,
  breadcrumbs: [
    { name: "Home", url: "https://jedmee.com/" },
    { name: "Retail + Wholesale", url: CANONICAL },
  ],
  introFacts: [
    "Many medicine businesses run a retail counter and a wholesale division — JedMee supports both in one cloud account with division-wise stock, retail GST billing, and B2B order catalogs for retailer customers.",
    "Retail sales decrement batch stock at the shop; wholesale dispatch bills retailers on credit or cash with separate price lists — owners see combined day book and division-level stock valuation.",
  ],
  service: {
    name: "JedMee retail and wholesale pharmacy platform",
    description:
      "Unified pharmacy software for retail billing and wholesale distribution with shared inventory and role-based access.",
    serviceType: "Retail and wholesale pharmacy management",
  },
  sections: [
    {
      heading: "How do combined retail and wholesale workflows work?",
      paragraphs: [
        "Use divisions or separate stock locations within one account. Retail staff bill walk-in customers with loose-unit and Rx-friendly invoices. Wholesale staff publish a product catalog retailers order from; confirmed orders generate dispatch invoices and reduce warehouse stock.",
      ],
    },
    {
      heading: "Retail vs wholesale: what is different in JedMee?",
      comparisonTable: {
        headers: ["Workflow", "Retail counter", "Wholesale division"],
        rows: [
          ["Customer type", "Walk-in / Rx patients", "Retailer pharmacies"],
          ["Pricing", "MRP / retail margin", "Wholesale rate lists"],
          ["Order entry", "Direct billing", "Retailer self-service catalog"],
          ["Tax invoice", "Per sale at counter", "Bulk dispatch invoice"],
          ["Payment", "Cash, UPI, credit", "Credit terms, ledger"],
          ["Stock impact", "Immediate on billing", "On dispatch confirmation"],
        ],
      },
    },
    {
      heading: "Can one product exist in both retail and wholesale stock?",
      paragraphs: [
        "Yes. Products and batches are shared master data. You can hold stock in a retail division and a warehouse division, transfer between them, and report sales velocity separately for buying decisions.",
      ],
      bullets: [
        "Division-wise stock reports",
        "Shared expiry alerts across locations",
        "Retailer order minimums and credit limits",
        "Owner dashboard combining both revenue streams",
      ],
    },
    {
      heading: "When should a pharmacy use combined retail + wholesale mode?",
      bullets: [
        "You operate a shop front and supply nearby retailers",
        "You are a distributor adding their own retail outlet",
        "You want one login for owner oversight across both lines",
        "You need separate staff permissions for counter vs warehouse",
      ],
    },
  ],
  faqs: [
    {
      q: "Do I need two JedMee subscriptions for retail and wholesale?",
      a: "No. One account can run both workflows with divisions and role-based users. Enterprise plans support complex multi-branch setups.",
    },
    {
      q: "Can retailers order without calling my sales team?",
      a: "Yes. Wholesalers publish an online catalog; retailers with JedMee retailer logins place orders 24/7.",
    },
    {
      q: "Does retail billing affect wholesale stock automatically?",
      a: "Stock moves when you bill or dispatch from the relevant division. Transfers between divisions are recorded explicitly.",
    },
    {
      q: "Can I report retail and wholesale profit separately?",
      a: "Use division-wise stock and sales reports where your account is split by division. Contact support if you need help configuring divisions.",
    },
  ],
};
