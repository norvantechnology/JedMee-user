import { useEffect } from "react";

const BASE_TITLE = "JedMee";
const BASE_DESC =
  "JedMee is pharmacy management software for medicine shops and distributors worldwide. Tax billing, inventory tracking, expiry alerts, and invoicing - free trial, no credit card required.";
const BASE_URL = "https://jedmee.com";
const DEFAULT_OG_IMAGE = `${BASE_URL}/logo-400.png`;

/** Public marketing pages that should be indexed. Everything else gets noindex. */
export const PUBLIC_SEO_PATHS = new Set([
  "/",
  "/about",
  "/contact",
  "/terms",
  "/pharmacy-management-software",
  "/pharmacy-billing-guide",
  "/pharmacy-inventory-guide",
  "/pharmacy-software-comparison",
  "/wholesale-pharmacy-software",
  "/pharmacy-mobile-app",
  "/free-trial",
  "/multi-user-pharmacy-software",
  "/retail-wholesale-pharmacy",
  "/pharmacy-financial-management",
]);

const INDEX_ROBOTS =
  "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
const NOINDEX_ROBOTS = "noindex, nofollow";

function upsertMeta(name, content, { property = false } = {}) {
  const selector = property
    ? `meta[property="${name}"]`
    : `meta[name="${name}"]`;
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    if (property) el.setAttribute("property", name);
    else el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  const prev = el.getAttribute("content") || "";
  el.setAttribute("content", content);
  return () => {
    el.setAttribute("content", prev);
  };
}

function upsertLink(rel, href) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  const prev = el.getAttribute("href") || "";
  el.setAttribute("href", href);
  return () => {
    el.setAttribute("href", prev);
  };
}

/**
 * injectJsonLd - inject a page-specific JSON-LD <script> block into <head>
 * and remove it on unmount.
 */
export function injectJsonLd(schema) {
  const el = document.createElement("script");
  el.setAttribute("type", "application/ld+json");
  el.setAttribute("data-page-schema", "true");
  el.textContent = JSON.stringify(Array.isArray(schema) ? schema : [schema]);
  document.head.appendChild(el);
  return () => {
    if (el.parentNode) el.parentNode.removeChild(el);
  };
}

export function useJsonLd(schema) {
  useEffect(() => {
    if (!schema) return;
    return injectJsonLd(schema);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Sets robots noindex on app/auth pages; index on public marketing pages.
 * Call once at the app shell level (see App.jsx).
 */
export function useRouteIndexing(pathname) {
  useEffect(() => {
    const robots = PUBLIC_SEO_PATHS.has(pathname) ? INDEX_ROBOTS : NOINDEX_ROBOTS;
    return upsertMeta("robots", robots);
  }, [pathname]);
}

/**
 * useSeoMeta - page-level title, description, canonical, and social tags.
 *
 * Google uses title + description for search snippets. Meta keywords are omitted
 * (Google Search does not use the keywords meta tag).
 */
export function useSeoMeta({
  title,
  description,
  canonical,
  ogImage,
  noIndex,
} = {}) {
  const fullTitle = title
    ? `${title} - ${BASE_TITLE}`
    : `${BASE_TITLE} - Pharmacy Management Software for Medicine Shops`;
  const fullDesc = description || BASE_DESC;
  const canonicalUrl = canonical || BASE_URL;
  const ogImg = ogImage || DEFAULT_OG_IMAGE;
  const robots = noIndex ? NOINDEX_ROBOTS : undefined;

  useEffect(() => {
    const prev = document.title;
    document.title = fullTitle;
    return () => {
      document.title = prev;
    };
  }, [fullTitle]);

  useEffect(() => upsertMeta("description", fullDesc), [fullDesc]);

  useEffect(() => {
    if (!robots) return;
    return upsertMeta("robots", robots);
  }, [robots]);

  useEffect(() => upsertLink("canonical", canonicalUrl), [canonicalUrl]);

  useEffect(() => upsertMeta("og:title", fullTitle, { property: true }), [fullTitle]);
  useEffect(() => upsertMeta("og:description", fullDesc, { property: true }), [fullDesc]);
  useEffect(() => upsertMeta("og:url", canonicalUrl, { property: true }), [canonicalUrl]);
  useEffect(() => upsertMeta("og:image", ogImg, { property: true }), [ogImg]);
  useEffect(() => upsertMeta("twitter:title", fullTitle), [fullTitle]);
  useEffect(() => upsertMeta("twitter:description", fullDesc), [fullDesc]);
  useEffect(() => upsertMeta("twitter:image", ogImg), [ogImg]);
}
