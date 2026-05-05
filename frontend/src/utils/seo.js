import { useEffect } from "react";

const BASE_TITLE = "JedMee";
const BASE_DESC =
  "JedMee helps medicine shops and distributors manage stock, GST billing, orders, and payments — all in one simple app. Trusted by 500+ pharmacies across India.";

/**
 * useSeoMeta — lightweight SEO hook (no react-helmet dependency).
 *
 * Updates `document.title` and the `<meta name="description">` tag
 * for the current page, then restores the previous values on unmount.
 *
 * @param {object} [options]
 * @param {string} [options.title]       Page-specific title segment.
 *   Final title will be: "<title> — JedMee"
 *   If omitted, falls back to "JedMee — Pharmacy Management Platform".
 * @param {string} [options.description] Page-specific meta description.
 *   If omitted, falls back to the global BASE_DESC.
 *
 * @example
 *   // Public landing page
 *   useSeoMeta({
 *     title: "Pharmacy Management Software for India",
 *     description: "JedMee helps medicine shops...",
 *   });
 *
 *   // Authenticated page (browser-tab UX only)
 *   useSeoMeta({ title: "Dashboard" });
 */
export function useSeoMeta({ title, description } = {}) {
  // ── document.title ──────────────────────────────────────────────────────
  useEffect(() => {
    const fullTitle = title
      ? `${title} — ${BASE_TITLE}`
      : `${BASE_TITLE} — Pharmacy Management Platform`;

    const prevTitle = document.title;
    document.title = fullTitle;

    return () => {
      document.title = prevTitle;
    };
  }, [title]);

  // ── <meta name="description"> ────────────────────────────────────────────
  useEffect(() => {
    const el = document.querySelector('meta[name="description"]');
    if (!el) return;

    const prevDesc = el.getAttribute("content") || "";
    el.setAttribute("content", description || BASE_DESC);

    return () => {
      el.setAttribute("content", prevDesc);
    };
  }, [description]);
}