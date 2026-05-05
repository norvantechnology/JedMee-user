/*
 * Shared formatting helpers.
 * Keep all currency/date/quantity formatting here so UI, print, and API
 * consumers stay consistent. Do NOT duplicate these in components/pages.
 */
import { formatIndianAmount } from "./amountFormat.js";

/** Two-decimal fixed money string with Indian comma separation. Returns "" for non-finite input. */
export function fmtMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return formatIndianAmount(n.toFixed(2));
}

/** "₹1,23,456.78" style display; empty string for non-finite input. */
export function fmtMoneyINR(value) {
  const s = fmtMoney(value);
  return s === "" ? "" : `₹${s}`;
}

/** Quantity formatter. Integers when whole, up to 3 decimals otherwise. */
export function fmtQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(3)));
}

/** ISO date → YYYY-MM-DD (first 10 chars). "" for empty/null. */
export function ymd(value) {
  const s = String(value || "").slice(0, 10);
  return s || "";
}

/** Format a date to DD/MM/YYYY. Returns "-" for empty/invalid input. */
export function fmtDateDMY(value) {
  const s = ymd(value);
  if (!s) return "-";
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

/** ISO date -> Indian short date (e.g., "27 Apr 2026"). */
export function fmtDateIndian(value) {
  const s = ymd(value);
  if (!s) return "-";
  const d = new Date(`${s}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return s;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Format a date-time string as a localized readable stamp. */
export function fmtDateTime(value) {
  if (!value) return "-";
  const s = String(value).trim();
  if (!s) return "-";
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return s;
  const d = new Date(ms);
  return d.toLocaleString();
}

/** Left-pad an integer to a given width (default 2). */
export function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

/** Days between `dateStr` and today (negative if already past). */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = Date.parse(String(dateStr));
  if (!Number.isFinite(ms)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(ms);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
