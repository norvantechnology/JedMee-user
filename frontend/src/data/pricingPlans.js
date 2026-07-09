/** Canonical JedMee pricing tiers - feeds UI fallbacks and Product JSON-LD. */
export const PRICING_PLANS = [
  {
    name: "Starter",
    price: "0",
    priceCurrency: "USD",
    period: "free",
    billingDuration: "P14D",
    description: "Free 14-day trial for small medicine shops - no credit card required",
  },
  {
    name: "Growth",
    price: "9",
    priceCurrency: "USD",
    period: "monthly",
    billingDuration: "P1M",
    description: "For growing pharmacies and medicine shops needing full features",
  },
  {
    name: "Professional",
    price: "19",
    priceCurrency: "USD",
    period: "monthly",
    billingDuration: "P1M",
    description: "For established pharmacies and distributors",
  },
  {
    name: "Enterprise",
    price: "39",
    priceCurrency: "USD",
    period: "monthly",
    billingDuration: "P1M",
    description: "For large pharmacy chains and wholesale distributors",
  },
];

export const PRICING_PAGE_URL = "https://jedmee.com/#pricing";
