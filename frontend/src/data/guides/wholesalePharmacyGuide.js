import { PRIMARY_AUTHOR } from "../authors.js";

const CANONICAL = "https://jedmee.com/wholesale-pharmacy-software";

export const WHOLESALE_PHARMACY_GUIDE = {
  pageTitle: "Wholesale & Distribution Management for Pharmacies",
  metaTitle: "Pharmacy Wholesale Management Software Guide",
  description:
    "How wholesale pharmacy software manages supplier integration, retailer order catalogs, dispatch, and division-wise inventory. Built for distributors using JedMee.",
  canonical: CANONICAL,
  label: "Wholesale & Distribution",
  datePublished: "2026-05-01",
  lastUpdated: "2026-07-09",
  relatedGuides: [
    { label: "Pharmacy inventory management guide", to: "/pharmacy-inventory-guide" },
    { label: "Pharmacy billing guide", to: "/pharmacy-billing-guide" },
    { label: "Software comparison", to: "/pharmacy-software-comparison" },
  ],
  author: PRIMARY_AUTHOR,
  breadcrumbs: [
    { name: "Home", url: "https://jedmee.com/" },
    { name: "Wholesale Pharmacy Software", url: CANONICAL },
  ],
  service: {
    name: "JedMee wholesale pharmacy distribution",
    description:
      "Wholesale purchase, retailer order catalogs, dispatch billing, and division-wise inventory for pharmaceutical distributors.",
    serviceType: "Wholesale pharmacy management software",
  },
  introFacts: [
    "Wholesale pharmacy management software helps distributors buy from manufacturers, organize stock by division and company, sell to retailers on credit, and let retailers place orders through an online catalog instead of phone calls.",
    "JedMee supports bulk purchase invoices, supplier ledgers, division-based product masters, retailer-facing order catalogs, order confirmation, and dispatch tracking for pharmaceutical distributors.",
  ],
  sections: [
    {
      heading: "Wholesale vs retail pharmacy workflows",
      paragraphs: [
        "Retail focuses on counter billing, prescriptions, and small pack sales. Wholesale adds bulk purchase orders, scheme/discount handling, route-wise delivery, and B2B credit cycles measured in weeks not minutes.",
        "A single distributor account in JedMee can manage thousands of SKUs across multiple manufacturer companies and divisions while retailers linked to your catalog order only what you publish.",
      ],
    },
    {
      heading: "Supplier integration and purchase side",
      qa: [
        {
          q: "Manufacturer and division master",
          a: "Organize products under manufacturer → division → SKU hierarchy matching how pharma companies structure their catalogs.",
        },
        {
          q: "Purchase invoices and returns",
          a: "Record supplier bills with batch and expiry at receipt. Process purchase returns against original invoices to keep supplier ledgers accurate.",
        },
        {
          q: "Supplier payments",
          a: "Track payables, schedule payments, and view vendor ledger with aging - know what you owe each supplier this week.",
        },
      ],
    },
    {
      heading: "Retailer order catalog (B2B portal)",
      bullets: [
        "Publish available stock to your retail customers",
        "Retailers browse, add to cart, and submit orders 24/7",
        "Wholesaler confirms quantity and price in one screen",
        "Confirmed orders flow into dispatch and billing workflow",
        "Reduces phone errors and missed line items",
      ],
      paragraphs: [
        "Distributors using the catalog report fewer order mistakes and faster order-to-dispatch cycles because retailers select exact SKU names and quantities themselves.",
      ],
    },
    {
      heading: "Inventory at wholesale scale",
      paragraphs: [
        "Batch tracking remains essential - a pallet of the same brand may contain three expiry dates. JedMee's near-expiry and non-moving reports help wholesalers rotate stock before write-offs and negotiate returns with suppliers.",
        "Division-wise stock analysis shows which manufacturer lines earn margin vs sit in warehouse.",
      ],
    },
    {
      heading: "Billing retailers and credit management",
      bullets: [
        "Bulk sales invoices with tax and batch detail",
        "Customer ledger with outstanding and advance",
        "Credit limit awareness per retailer account",
        "Sales returns from retailers update stock and accounts",
      ],
    },
    {
      heading: "Getting started as a wholesaler on JedMee",
      paragraphs: [
        "Import your product and batch file, invite retailer accounts or share catalog access, and train dispatch staff on order confirmation. Most distributors go live within 3–5 business days with JedMee onboarding support.",
        "Compare retail vs wholesale features on our software comparison page or start a free trial from the homepage.",
      ],
    },
  ],
  faqs: [
    {
      q: "What is pharmacy wholesale management software?",
      a: "Software for pharmaceutical distributors to manage bulk purchases, warehouse stock, retailer orders, and B2B billing in one system.",
    },
    {
      q: "Can retailers order from my wholesaler catalog in JedMee?",
      a: "Yes. Retailers browse your published catalog and place orders; you confirm and fulfill inside JedMee.",
    },
    {
      q: "Does JedMee support supplier integration?",
      a: "Supplier masters, purchase invoices, payment ledgers, and CSV import cover supplier workflows; API integrations are available for enterprise plans.",
    },
    {
      q: "Is wholesale functionality included in all plans?",
      a: "Core wholesale tools are on Growth tier and above; see homepage pricing for current plan limits.",
    },
  ],
};
