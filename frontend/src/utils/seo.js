import { useEffect } from "react";

const BASE_TITLE = "JedMee";
const BASE_DESC =
  "Best pharmacy management software for Indian medicine shops & distributors. GST billing, inventory tracking, purchase orders, sales invoices, expiry alerts. Free trial — no credit card required.";
const BASE_KEYWORDS =
  "pharmacy management software India, medicine shop software, GST billing pharmacy, medical store management software, pharmacy inventory software, drug store software India, pharmacy POS software, medicine distributor software";
const BASE_URL = "https://jedmee.com";

/**
 * useSeoMeta — comprehensive SEO hook (no react-helmet dependency).
 *
 * Updates document.title, meta description, meta keywords, canonical,
 * og:title, og:description, og:url, twitter:title, twitter:description
 * for the current page, then restores previous values on unmount.
 *
 * @param {object} [options]
 * @param {string} [options.title]       Page-specific title segment.
 *   Final title: "<title> — JedMee" or fallback.
 * @param {string} [options.description] Page-specific meta description.
 * @param {string} [options.keywords]    Page-specific keywords (appended to base).
 * @param {string} [options.canonical]   Full canonical URL for this page.
 * @param {string} [options.ogImage]     Full URL to OG image (defaults to /og-image.png).
 *
 * @example
 *   useSeoMeta({
 *     title: "Pharmacy Management Software for India",
 *     description: "JedMee helps medicine shops...",
 *     keywords: "pharmacy billing, GST invoice pharmacy",
 *     canonical: "https://jedmee.com/",
 *   });
 */
export function useSeoMeta({ title, description, keywords, canonical, ogImage } = {}) {
  const fullTitle = title
    ? `${title} — ${BASE_TITLE}`
    : `${BASE_TITLE} — #1 Pharmacy Management Software India`;
  const fullDesc = description || BASE_DESC;
  const fullKeywords = keywords
    ? `${keywords}, ${BASE_KEYWORDS}`
    : BASE_KEYWORDS;
  const canonicalUrl = canonical || BASE_URL;
  const ogImg = ogImage || `${BASE_URL}/og-image.png`;

  // ── document.title ──────────────────────────────────────────────────────
  useEffect(() => {
    const prev = document.title;
    document.title = fullTitle;
    return () => { document.title = prev; };
  }, [fullTitle]);

  // ── <meta name="description"> ────────────────────────────────────────────
  useEffect(() => {
    const el = document.querySelector('meta[name="description"]');
    if (!el) return;
    const prev = el.getAttribute("content") || "";
    el.setAttribute("content", fullDesc);
    return () => { el.setAttribute("content", prev); };
  }, [fullDesc]);

  // ── <meta name="keywords"> ───────────────────────────────────────────────
  useEffect(() => {
    let el = document.querySelector('meta[name="keywords"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "keywords");
      document.head.appendChild(el);
    }
    const prev = el.getAttribute("content") || "";
    el.setAttribute("content", fullKeywords);
    return () => { el.setAttribute("content", prev); };
  }, [fullKeywords]);

  // ── <link rel="canonical"> ───────────────────────────────────────────────
  useEffect(() => {
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      document.head.appendChild(el);
    }
    const prev = el.getAttribute("href") || "";
    el.setAttribute("href", canonicalUrl);
    return () => { el.setAttribute("href", prev); };
  }, [canonicalUrl]);

  // ── og:title ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = document.querySelector('meta[property="og:title"]');
    if (!el) return;
    const prev = el.getAttribute("content") || "";
    el.setAttribute("content", fullTitle);
    return () => { el.setAttribute("content", prev); };
  }, [fullTitle]);

  // ── og:description ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = document.querySelector('meta[property="og:description"]');
    if (!el) return;
    const prev = el.getAttribute("content") || "";
    el.setAttribute("content", fullDesc);
    return () => { el.setAttribute("content", prev); };
  }, [fullDesc]);

  // ── og:url ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = document.querySelector('meta[property="og:url"]');
    if (!el) return;
    const prev = el.getAttribute("content") || "";
    el.setAttribute("content", canonicalUrl);
    return () => { el.setAttribute("content", prev); };
  }, [canonicalUrl]);

  // ── og:image ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = document.querySelector('meta[property="og:image"]');
    if (!el) return;
    const prev = el.getAttribute("content") || "";
    el.setAttribute("content", ogImg);
    return () => { el.setAttribute("content", prev); };
  }, [ogImg]);

  // ── twitter:title ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = document.querySelector('meta[name="twitter:title"]');
    if (!el) return;
    const prev = el.getAttribute("content") || "";
    el.setAttribute("content", fullTitle);
    return () => { el.setAttribute("content", prev); };
  }, [fullTitle]);

  // ── twitter:description ──────────────────────────────────────────────────
  useEffect(() => {
    const el = document.querySelector('meta[name="twitter:description"]');
    if (!el) return;
    const prev = el.getAttribute("content") || "";
    el.setAttribute("content", fullDesc);
    return () => { el.setAttribute("content", prev); };
  }, [fullDesc]);
}