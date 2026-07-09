import { PRIMARY_AUTHOR } from "../authors.js";

const CANONICAL = "https://jedmee.com/multi-user-pharmacy-software";

export const MULTI_USER_GUIDE = {
  pageTitle: "Multi-User Pharmacy Software & Role Permissions",
  metaTitle: "Role-Based Access for Pharmacy Staff & Wholesalers",
  description:
    "JedMee supports account owners, custom permission roles, and wholesaler vs retailer account types — control who can bill, edit masters, view reports, or place B2B orders.",
  canonical: CANONICAL,
  label: "Multi-User & Roles",
  datePublished: "2026-06-01",
  lastUpdated: "2026-07-09",
  relatedGuides: [
    { label: "Mobile pharmacy access", to: "/pharmacy-mobile-app" },
    { label: "Wholesale & distribution", to: "/wholesale-pharmacy-software" },
    { label: "Pharmacy billing guide", to: "/pharmacy-billing-guide" },
  ],
  author: PRIMARY_AUTHOR,
  breadcrumbs: [
    { name: "Home", url: "https://jedmee.com/" },
    { name: "Multi-User Access", url: CANONICAL },
  ],
  introFacts: [
    "JedMee accounts have one account owner plus additional users — each user is assigned a custom role that controls which modules they can view, add, update, or delete.",
    "At registration you choose a wholesaler or retailer account type; within your account, owners manage users and roles so billing staff, warehouse staff, and managers see only the screens they need.",
  ],
  service: {
    name: "JedMee multi-user pharmacy access",
    description:
      "Multi-user pharmacy software with custom roles, module permissions, and wholesaler/retailer account types.",
    serviceType: "Multi-user pharmacy management",
  },
  sections: [
    {
      heading: "How does access control work in JedMee?",
      comparisonTable: {
        headers: ["Concept", "What it means in JedMee"],
        rows: [
          ["Account owner", "Full control — users, roles, billing, inventory, reports"],
          ["Custom roles", "You define role names and tick permissions per module (sales, purchases, masters, reports, users)"],
          ["Sub-users", "Staff logins assigned one custom role; permissions come from that role"],
          ["Wholesaler account", "Distributor workflow — retailer order catalog, dispatch, supplier ledgers"],
          ["Retailer account", "Shop workflow — counter billing, stock, customer ledger, orders to wholesalers"],
        ],
      },
    },
    {
      heading: "Why is role-based access important for pharmacies?",
      paragraphs: [
        "Segregation of duties reduces billing fraud and accidental master-data changes. A counter user should not change product tax rates or delete posted invoices without approval workflows.",
      ],
      bullets: [
        "Posted invoices are corrected with credit notes, not silent deletion",
        "Separate login per staff member — avoid shared passwords",
        "New users can be required to change password on first login",
        "Owners configure who can access Users and Roles & Access screens",
      ],
    },
    {
      heading: "How do I add users to my pharmacy?",
      paragraphs: [
        "The account owner opens the Users screen inside the JedMee app, creates a user, and assigns a custom role. Define roles under Roles & Access — for example a billing-only role with sales permissions but without product master edits.",
      ],
    },
    {
      heading: "How do retailer and wholesaler accounts connect?",
      paragraphs: [
        "Wholesalers and retailers register as different account types. Wholesalers publish catalogs and confirm orders; retailers linked to their supplier place orders through the order catalog. Each business keeps its own login and data.",
      ],
    },
  ],
  faqs: [
    {
      q: "How many users can I add?",
      a: "User limits depend on your subscription plan. See the homepage pricing section or contact supportjedmee@gmail.com for current limits on your tier.",
    },
    {
      q: "Can I create a billing-only role?",
      a: "Yes. Create a custom role under Roles & Access with sales billing permissions only, without access to product masters, purchases, or user administration.",
    },
    {
      q: "Do retailers need their own JedMee account?",
      a: "Yes. Retailers register as a retailer account (or receive access from their wholesaler) to place orders and manage their own shop data.",
    },
    {
      q: "Where do I manage permissions?",
      a: "Account owners use Roles & Access to define roles and the Users screen to assign them. Both are available after you log in to your JedMee account.",
    },
  ],
};
