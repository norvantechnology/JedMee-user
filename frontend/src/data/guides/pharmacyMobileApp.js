import { PRIMARY_AUTHOR } from "../authors.js";

const CANONICAL = "https://jedmee.com/pharmacy-mobile-app";

export const PHARMACY_MOBILE_APP_GUIDE = {
  pageTitle: "Pharmacy Mobile App & Remote Access",
  metaTitle: "Mobile Pharmacy Software - Billing & Inventory on Phone",
  description:
    "JedMee runs in mobile browsers and offers an Android APK - check stock, confirm orders, review day book, and bill from phone or tablet with live cloud sync.",
  canonical: CANONICAL,
  label: "Mobile & Remote Access",
  datePublished: "2026-06-01",
  lastUpdated: "2026-07-09",
  relatedGuides: [
    { label: "Multi-user roles & permissions", to: "/multi-user-pharmacy-software" },
    { label: "Pharmacy inventory guide", to: "/pharmacy-inventory-guide" },
    { label: "Free trial", to: "/free-trial" },
  ],
  author: PRIMARY_AUTHOR,
  breadcrumbs: [
    { name: "Home", url: "https://jedmee.com/" },
    { name: "Mobile Pharmacy App", url: CANONICAL },
  ],
  introFacts: [
    "JedMee is a responsive web app - use it in Chrome or Safari on any phone or tablet, or install the Android APK from the homepage download section.",
    "All devices share the same cloud account, so a purchase posted at the warehouse is reflected when staff check stock on mobile without manual exports.",
  ],
  service: {
    name: "JedMee mobile pharmacy access",
    description:
      "Cloud pharmacy management in mobile browsers and Android APK with billing, inventory, and order sync.",
    serviceType: "Mobile pharmacy management software",
  },
  sections: [
    {
      heading: "Can a pharmacy run billing and inventory from a mobile app?",
      paragraphs: [
        "Yes - for retail billing, stock lookups, payment recording, and wholesale order confirmation, JedMee works on mobile browsers and the Android APK. Bulk CSV imports and wide spreadsheet-style reports are easier on desktop, but counter sales and stock checks work on phone.",
      ],
    },
    {
      heading: "What can you do on mobile vs desktop?",
      comparisonTable: {
        headers: ["Task", "Mobile", "Desktop"],
        rows: [
          ["Retail sales billing", "Yes", "Yes"],
          ["Batch & expiry lookup", "Yes", "Yes"],
          ["Wholesale order confirm", "Yes (wholesaler accounts)", "Yes"],
          ["Customer / vendor ledger view", "Yes", "Yes"],
          ["Day book & dashboard", "Yes", "Yes"],
          ["Bulk CSV import", "Limited", "Recommended"],
          ["Large purchase entry sessions", "Possible", "Recommended"],
        ],
      },
    },
    {
      heading: "How does real-time sync work?",
      paragraphs: [
        "JedMee is hosted on AWS. When staff confirm a sales invoice on the counter PC, stock quantities update for all logged-in devices. Owners can review the day book and alerts from mobile without calling the shop.",
      ],
      bullets: [
        "HTTPS encrypted sessions on every device",
        "No manual sync files between devices",
        "Android APK from jedmee.com homepage download section",
        "Mobile browser support on iPhone and iPad",
        "Log out on shared tablets between shifts",
      ],
    },
    {
      heading: "Who benefits most from mobile access?",
      bullets: [
        "Owners checking sales and alerts away from the shop",
        "Wholesale reps confirming retailer orders on visits",
        "Managers reviewing expiry notifications on the go",
        "Small shops using a tablet at the billing counter",
      ],
    },
  ],
  faqs: [
    {
      q: "Does JedMee have an iOS app?",
      a: "JedMee provides an Android APK on the homepage. iPhone and iPad users can use the responsive web app in Safari. Check the homepage download section for the latest iOS availability.",
    },
    {
      q: "Is mobile access included in all plans?",
      a: "Yes. Mobile browser and APK access are included during the 14-day free trial and on paid plans.",
    },
    {
      q: "Can multiple staff use mobile at the same time?",
      a: "Yes. Each staff member uses their own login; multiple users can work concurrently on different devices.",
    },
    {
      q: "Do I need internet for mobile billing?",
      a: "Yes. JedMee requires an active internet connection for live stock and tax calculations.",
    },
  ],
};
