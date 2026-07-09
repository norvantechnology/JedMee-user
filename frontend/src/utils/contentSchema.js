/** JSON-LD builders for public content / GEO pages */

export const SITE_URL = "https://jedmee.com";
export const OG_IMAGE_WIDTH = 1280;
export const OG_IMAGE_HEIGHT = 720;

export function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function faqPageSchema(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function personSchema({ name, jobTitle, description, url, image, title, credentials, bio }) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name,
    jobTitle: jobTitle || title,
    description: description || bio,
    url: url || `${SITE_URL}/about`,
    ...(image ? { image } : {}),
    ...(credentials ? { knowsAbout: credentials } : {}),
    worksFor: {
      "@type": "Organization",
      name: "JedMee",
      url: SITE_URL,
    },
  };
}

export function articleSchema({
  headline,
  description,
  url,
  datePublished,
  dateModified,
  author,
  image,
}) {
  const imageUrl = image || `${SITE_URL}/og-image.png`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    url,
    datePublished,
    dateModified: dateModified || datePublished,
    author: personSchema(author),
    image: {
      "@type": "ImageObject",
      url: imageUrl,
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    },
    publisher: {
      "@type": "Organization",
      name: "JedMee",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: "en",
  };
}

export function webPageSchema({ name, description, url, breadcrumbs, dateModified }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    description,
    url,
    inLanguage: "en",
    ...(dateModified ? { dateModified } : {}),
    isPartOf: { "@type": "WebSite", url: SITE_URL },
    breadcrumb: breadcrumbSchema(breadcrumbs),
  };
}

export function howToSchema({ name, description, url, steps, dateModified }) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    url,
    ...(dateModified ? { dateModified } : {}),
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

export function serviceSchema({
  name,
  description,
  url,
  serviceType = "Pharmacy management software",
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url,
    serviceType,
    provider: {
      "@type": "Organization",
      name: "JedMee",
      url: SITE_URL,
    },
    areaServed: "Worldwide",
  };
}

export function softwareApplicationSchema({
  name = "JedMee",
  description,
  url = SITE_URL,
  offers,
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    url,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Pharmacy Management Software",
    operatingSystem: "Web, Android, iOS",
    description,
    image: `${SITE_URL}/og-image.png`,
    offers: offers || {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "0",
      highPrice: "39",
      offerCount: "4",
    },
  };
}

export function aggregateRatingSchema({ ratingValue, reviewCount, bestRating = "5" }) {
  return {
    "@context": "https://schema.org",
    "@type": "AggregateRating",
    ratingValue,
    reviewCount,
    bestRating,
    worstRating: "1",
  };
}

export function reviewSchema({ authorName, reviewBody, ratingValue = "5", datePublished }) {
  return {
    "@context": "https://schema.org",
    "@type": "Review",
    author: { "@type": "Person", name: authorName },
    reviewBody,
    reviewRating: {
      "@type": "Rating",
      ratingValue,
      bestRating: "5",
    },
    datePublished,
    itemReviewed: {
      "@type": "Organization",
      name: "JedMee",
      url: SITE_URL,
    },
  };
}

export function buildGuidePageSchema({
  pageTitle,
  description,
  canonical,
  breadcrumbs,
  faqs,
  author,
  datePublished = "2026-03-01",
  dateModified = "2026-07-05",
  image,
  howTo,
  service,
}) {
  const schemas = [
    webPageSchema({
      name: pageTitle,
      description,
      url: canonical,
      breadcrumbs,
      dateModified,
    }),
    articleSchema({
      headline: pageTitle,
      description,
      url: canonical,
      datePublished,
      dateModified,
      author,
      image,
    }),
    breadcrumbSchema(breadcrumbs),
  ];
  if (faqs?.length) schemas.push(faqPageSchema(faqs));
  if (howTo?.steps?.length) {
    schemas.push(
      howToSchema({
        name: howTo.name || pageTitle,
        description: howTo.description || description,
        url: canonical,
        steps: howTo.steps,
        dateModified,
      })
    );
  }
  if (service) {
    schemas.push(
      serviceSchema({
        name: service.name || pageTitle,
        description: service.description || description,
        url: canonical,
        serviceType: service.serviceType,
      })
    );
  }
  return schemas;
}

function billingDurationForPeriod(period, billingDuration) {
  if (billingDuration) return billingDuration;
  if (period === "free") return "P14D";
  if (period === "monthly") return "P1M";
  if (period === "yearly") return "P1Y";
  return undefined;
}

export function productPlanSchema(plan, { pricingUrl }) {
  const url = pricingUrl || `${SITE_URL}/#pricing`;
  const duration = billingDurationForPeriod(plan.period, plan.billingDuration);
  const offer = {
    "@type": "Offer",
    price: plan.price,
    priceCurrency: plan.priceCurrency || "USD",
    availability: "https://schema.org/InStock",
    url,
    seller: { "@type": "Organization", name: "JedMee", url: SITE_URL },
    ...(duration
      ? {
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: plan.price,
            priceCurrency: plan.priceCurrency || "USD",
            billingDuration: duration,
            unitText: plan.period === "free" ? "TRIAL" : "MONTH",
          },
        }
      : {}),
  };
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `JedMee ${plan.name}`,
    description: plan.description,
    image: {
      "@type": "ImageObject",
      url: `${SITE_URL}/og-image.png`,
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
    },
    brand: { "@type": "Brand", name: "JedMee" },
    category: "Pharmacy Management Software",
    url,
    offers: offer,
  };
}

export function pricingAggregateOfferSchema(plans, { pricingUrl, withContext = true } = {}) {
  const url = pricingUrl || `${SITE_URL}/#pricing`;
  const prices = plans.map((p) => Number.parseFloat(p.price)).filter((n) => !Number.isNaN(n));
  const core = {
    "@type": "AggregateOffer",
    priceCurrency: plans[0]?.priceCurrency || "USD",
    lowPrice: String(Math.min(...prices)),
    highPrice: String(Math.max(...prices)),
    offerCount: String(plans.length),
    url,
    offers: plans.map((plan) => productPlanSchema(plan, { pricingUrl }).offers),
  };
  return withContext ? { "@context": "https://schema.org", ...core } : core;
}

export function buildPricingSchemas(plans, options = {}) {
  const pricingUrl = options.pricingUrl || `${SITE_URL}/#pricing`;
  return [
    ...plans.map((plan) => productPlanSchema(plan, { pricingUrl })),
    pricingAggregateOfferSchema(plans, { pricingUrl }),
  ];
}
