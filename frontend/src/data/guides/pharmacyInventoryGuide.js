import { PRIMARY_AUTHOR } from "../authors.js";

const CANONICAL = "https://jedmee.com/pharmacy-inventory-guide";

export const PHARMACY_INVENTORY_GUIDE = {
  pageTitle: "Pharmacy Inventory Management Guide",
  metaTitle: "Pharmacy Inventory Management & Expiry Tracking Guide",
  description:
    "How pharmacy inventory management software tracks batches, expiry dates, low stock, and non-moving items. Practical guide for medicine shops using JedMee.",
  canonical: CANONICAL,
  label: "Inventory & Stock Control",
  datePublished: "2026-04-01",
  lastUpdated: "2026-07-09",
  service: {
    name: "JedMee pharmacy inventory management",
    description:
      "Batch-level stock control, expiry alerts, low-stock warnings, and non-moving reports for retail pharmacies.",
    serviceType: "Pharmacy inventory management software",
  },
  howTo: {
    name: "Purchase-to-sale inventory workflow",
    heading: "How to run batch inventory from purchase to sale",
    intro: "This closed loop keeps stock valuation aligned with physical shelves.",
    steps: [
      {
        name: "Create purchase invoice",
        text: "Enter supplier invoice with batch number, expiry date, and quantity - stock is added to the batch record.",
      },
      {
        name: "Bill retail sales against batch",
        text: "Select batch at billing so quantity decrements from the correct expiry lot (FEFO).",
      },
      {
        name: "Process purchase returns",
        text: "Return goods to supplier with stock removed and supplier credit recorded.",
      },
      {
        name: "Handle sales returns",
        text: "Add resaleable stock back to the batch when customers return medicines.",
      },
      {
        name: "Post physical count adjustments",
        text: "Enter adjustment with reason code when monthly count differs from system quantity.",
      },
    ],
  },
  relatedGuides: [
    { label: "Pharmacy billing & tax compliance guide", to: "/pharmacy-billing-guide" },
    { label: "Wholesale & distribution guide", to: "/wholesale-pharmacy-software" },
    { label: "What is pharmacy management software?", to: "/pharmacy-management-software" },
  ],
  author: PRIMARY_AUTHOR,
  breadcrumbs: [
    { name: "Home", url: "https://jedmee.com/" },
    { name: "Pharmacy Inventory Guide", url: CANONICAL },
  ],
  introFacts: [
    "JedMee alerts pharmacies before batches expire (typically 30–60 days ahead), supports loose-unit sales, flags low stock against minimum levels, and reports non-moving items - two cartons of the same medicine may have different expiry dates and must be tracked separately.",
    "Pharmacy inventory management tracks every medicine by product, batch, quantity, expiry date, and location so you know what is on shelf, what is expiring soon, and what to reorder.",
  ],
  sections: [
    {
      heading: "Why batch-level tracking matters",
      paragraphs: [
        "Two cartons of the same medicine may have different expiry dates and purchase costs. Billing the wrong batch affects margins and compliance. Pharmacy software forces batch selection at sale and purchase so stock always reconciles.",
      ],
    },
    {
      heading: "Key inventory features to use daily",
      qa: [
        {
          q: "Expiry date tracking",
          a: "Enter expiry on each batch at purchase. JedMee dashboard and notifications highlight batches expiring within your chosen window so you can discount, return to supplier, or destroy per SOP.",
        },
        {
          q: "Low-stock alerts",
          a: "Set minimum quantity per product. When available stock drops below threshold, staff see alerts before you run out at the counter.",
        },
        {
          q: "Opening stock and adjustments",
          a: "Import existing stock via CSV at onboarding. Use adjustment entries for breakage, theft, or physical count differences with reason codes.",
        },
        {
          q: "Loose / broken pack sales",
          a: "Sell individual tablets or partial strips while decrementing the parent batch quantity - essential for retail chemists.",
        },
      ],
    },
    {
      heading: "Purchase-to-sale inventory flow",
      bullets: [
        "Create purchase invoice → stock added to batch",
        "Sales invoice → batch quantity reduced",
        "Purchase return → stock removed with supplier credit",
        "Sales return → stock added back to batch if resaleable",
        "Physical count → adjustment entry if variance",
      ],
      paragraphs: [
        "This closed loop means your stock valuation report should match physical shelf counts during monthly audits within normal shrinkage tolerance.",
      ],
    },
    {
      heading: "Reports that improve buying decisions",
      bullets: [
        "Non-moving stock report - items with zero sales in 90+ days",
        "Product–supplier report - who you buy each SKU from",
        "Stock analysis - sales vs current quantity by category",
        "Near-expiry list - actionable before write-off",
      ],
      paragraphs: [
        "Use non-moving reports before placing repeat purchase orders. Redirect budget to fast movers identified in sales analysis.",
      ],
    },
    {
      heading: "Inventory best practices",
      paragraphs: [
        "Follow FEFO (first-expiry-first-out) when picking for customers. Reconcile purchase invoices the same day goods arrive. Run a weekly near-expiry review meeting - 15 minutes can save thousands in write-offs annually.",
      ],
    },
  ],
  faqs: [
    {
      q: "What is pharmacy expiration date tracking?",
      a: "It records expiry per batch and warns staff before medicines expire so you can sell, return, or dispose of stock in time.",
    },
    {
      q: "Can I import my existing stock into JedMee?",
      a: "Yes. Use CSV import for products, batches, quantities, and expiry dates during onboarding.",
    },
    {
      q: "Does JedMee track inventory at multiple branches?",
      a: "Multi-branch setups can use separate accounts or divisions; contact sales for chain deployments.",
    },
    {
      q: "How often should I run a physical stock count?",
      a: "Most pharmacies reconcile high-value items monthly and full counts quarterly, adjusting in the system same day.",
    },
  ],
};
