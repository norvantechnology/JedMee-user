# Calculation & Business Logic Audit

**Project:** JedMee (pharmacy/wholesaler ERP)  
**Scope:** Backend, frontend (web), mobile (Flutter), SQL/reporting  
**Date:** 2026-05-22

This document lists calculation, mapping, and business-logic issues identified across the codebase. Items marked **FIXED** were corrected in this pass; **OPEN** items are documented for follow-up.

---

## Critical (P0) — Fixed

| # | Module / File | Root cause | Impacted functionality | Fix applied | Status |
|---|---------------|------------|------------------------|-------------|--------|
| 1 | `backend/src/handlers/customerPayments/create.js`, `bulkSettle.js` | `localCalendarYmd()` used but not imported from `shared/sales` | Runtime crash when payment date omitted | Import `localCalendarYmd` | **FIXED** |
| 2 | `backend/src/handlers/vendors/sendLedgerEmail.js` | SQL selects `total_amount`; mapper reads `total_return_amount` | Purchase return credits show ₹0 in vendor ledger email | Use `x.total_amount` | **FIXED** |
| 3 | `backend/src/handlers/purchaseReturns/confirm.js` | Loose stock updated with `+ returnLooseQty` (inbound logic) | Returning loose qty to vendor *increased* stock instead of decreasing | `loose_stock - returnLooseQty` with `GREATEST(0, …)` | **FIXED** |
| 4 | `backend/src/shared/purchase.js` — `refreshInvoicePaymentSummary` | `balance_due = total - paid` ignored confirmed purchase returns | Vendor invoice balance overstated after returns | Subtract confirmed `purchase_returns.total_amount` | **FIXED** |
| 5 | `backend/src/handlers/salesReturns/runConfirmSalesReturnCore.js` | Sales return confirm never refreshed linked invoice balances | Customer invoice `balance_due` unchanged after return | Call shared `refreshSalesInvoicePaymentTotals` on confirm | **FIXED** |
| 6 | `backend/src/handlers/customerPayments/create.js`, `bulkSettle.js` | Payment refresh ignored sales return credits | Overstated receivables / wrong payment status | Centralized `refreshSalesInvoicePaymentTotals` in `shared/sales.js` (total − paid − returns) | **FIXED** |
| 7 | `backend/src/handlers/salesReturns/create.js` | `return_amount` = pre-tax net rate only | GSTR-3B, customer ledger, day book understate return value | Add GST to strip + loose return amounts (match purchase returns) | **FIXED** |
| 8 | `backend/src/handlers/salesInvoices/_common.js` | Strip line `calculateLineItem` ignored `looseQty` on same row | Under-billed invoices when strip + loose sold together | Add loose component to taxable/GST/lineTotal | **FIXED** |
| 9 | `backend/src/handlers/salesInvoices/_common.js` | `prevent_net_rate` recalc dropped half-scheme taxable add | Wrong tax base for half-scheme + prevent-net-rate batches | Preserve `schemeTaxableAdd` in recalc block | **FIXED** |
| 10 | `backend/src/handlers/purchaseInvoices/_common.js` | Line parser only accepted camelCase IDs | Mobile/snake_case payloads rejected or mis-parsed | Accept `product_id`, `batch_id`, `batch_no`, etc. | **FIXED** |
| 11 | Mobile payment sheets | `CREDIT`, `RTGS` not in backend `customer_payment_mode_type` | Payment API 400 validation errors | Align modes with web: `CASH, UPI, CARD, CHEQUE, NEFT, OTHER` | **FIXED** |
| 12 | `mobile/.../invoice_editor_helpers.dart` | `lineAmount()` excluded GST | Mobile line preview understated vs backend | Include GST (+ optional loose qty) in preview | **FIXED** |
| 13 | `backend/src/handlers/dashboard/summary.js` | Alert subtitle used `total_stock` / missing `threshold` | Low-stock dashboard alerts showed 0 | Query exposes `qty` + `threshold`; subtitle fixed | **FIXED** |
| 14 | `frontend/src/utils/currency.js` | EUR locale `en-150` (invalid) | EUR formatting falls back or throws | Use `de-DE` | **FIXED** |

---

## High (P1) — Open / Partial

| # | Module / File | Root cause | Impacted functionality | Recommended fix | Status |
|---|---------------|------------|------------------------|-----------------|--------|
| 15 | `backend/src/handlers/purchaseInvoices/runConfirmPurchaseCore.js` | Line CGST/SGST/IGST splits may not be written on confirm | GSTR-2 / 3B input tax mismatch | Set split fields from place-of-supply + GST% at confirm | **OPEN** |
| 16 | `backend/src/handlers/salesInvoices/cancel.js` (or cancel core) | Cancel may not reverse loose/break-pack inventory | Stock drift after cancelled sales with loose qty | Mirror confirm reversal for loose_stock + break-pack txns | **OPEN** |
| 17 | `backend/src/handlers/salesInvoices/_common.js` — `enforceFinancialLimits` | Credit limit sums line totals, not header total with round-off | Edge over-limit approvals | Use `calculateInvoiceTotals` header total | **OPEN** |
| 18 | `frontend/src/pages/SalesBillingPage.jsx` | Global header discount vs per-line 0% can diverge from backend | Saved invoice totals differ from UI preview | Share calc module with backend rules or slim payload to server-side-only totals | **OPEN** |
| 19 | `frontend` save payloads | Full form blob includes UI-only keys | Noise / occasional validation surprises | Strip to API contract fields on save | **OPEN** |
| 20 | `backend/src/shared/productBatchCalc.js` | Landing cost / discount edge cases | Batch master cost display wrong | Audit against purchase confirm formulas | **OPEN** |
| 21 | Rounding policy | Sales uses `round4` + rupee round-off; purchase uses `round2` | Cross-module 1–2 paisa drift | Document policy; optional unified `roundMoney()` | **OPEN** |
| 22 | Mobile purchase editor | No UI for new-batch manual fields (batchNo, expiry, mrp) on all paths | Manual purchase entry blocked without scan | Add fields when `isNewBatch` | **OPEN** |
| 23 | Reports / mobile parsers | Stock qty displayed with `.toInt()` | Fractional strip stock truncated in UI | Use decimal formatter | **OPEN** |

---

## Medium (P2) — Open

| # | Module / File | Root cause | Impacted functionality | Recommended fix | Status |
|---|---------------|------------|------------------------|-----------------|--------|
| 24 | `backend/src/handlers/salesReturns/cancel.js` | Cancel may not restore invoice balance if return was confirmed | Balance stuck low after cancelled return | Call `refreshSalesInvoicePaymentTotals` on cancel | **OPEN** |
| 25 | Customer advance + returns | Return credit reduces balance but advance logic separate | Complex settlement scenarios | Integration tests for advance + return + partial pay | **OPEN** |
| 26 | `backend/src/handlers/reports/dayBook.js` | Sales returns shown informational; cash position logic | Day book cash may not reflect credit notes | Align with accountant workflow | **OPEN** |
| 27 | Duplicate calc logic | Frontend `computeLineTotal`, mobile `lineAmount`, backend `calculateLineItem` | Drift over time | Extract shared spec or single source of truth | **OPEN** |
| 28 | Async confirm flows | Double-submit on slow networks | Duplicate inventory txns | Idempotency keys on confirm endpoints | **OPEN** |

---

## Low (P3) — Open

| # | Module / File | Root cause | Impacted functionality | Recommended fix | Status |
|---|---------------|------------|------------------------|-----------------|--------|
| 29 | Dashboard KPI keys (mobile) | Historical mismatches (`billed`, `total_return_amount`) | Some tiles empty on mobile | Already partially fixed; verify after backend deploy | **PARTIAL** |
| 30 | `mobile` sales line | No loose qty UI on invoice editor | Cannot sell loose from mobile editor | Add loose qty field when batch supports it | **OPEN** |
| 31 | GST enum validation | Only 0/5/12/18/28 accepted | Future rate changes need migration | Centralize `VALID_GST` | **OPEN** |

---

## Verification checklist

After deploying backend changes:

1. **Customer payment** — Create payment without `paymentDate`; should default to today (no crash).
2. **Purchase return confirm** — Return loose tablets; `product_batches.loose_stock` should decrease.
3. **Purchase invoice balance** — Confirm return against invoice; `balance_due` should drop by return total.
4. **Sales return** — Create return with GST line; `return_amount` includes tax; confirm reduces invoice `balance_due`.
5. **Sales invoice** — Single line with qty=2 strips + loose qty; line total includes both.
6. **Dashboard** — Low stock alert shows actual qty and threshold.
7. **Mobile** — Record customer payment with NEFT/OTHER; no validation error.
8. **Mobile** — Purchase/sales editor line total roughly matches saved invoice (GST included).

---

## Files changed in this fix pass

### Backend
- `src/shared/sales.js` — `refreshSalesInvoicePaymentTotals`
- `src/shared/purchase.js` — return credits in payment summary
- `src/handlers/customerPayments/create.js`, `bulkSettle.js`
- `src/handlers/salesReturns/create.js`, `runConfirmSalesReturnCore.js`
- `src/handlers/salesInvoices/_common.js`
- `src/handlers/purchaseInvoices/_common.js`
- `src/handlers/purchaseReturns/confirm.js`
- `src/handlers/vendors/sendLedgerEmail.js`
- `src/handlers/dashboard/summary.js`

### Mobile
- `lib/features/shared/invoice_editor_helpers.dart`
- `lib/features/sales/sales_invoice_editor_screen.dart`
- `lib/features/purchase/purchase_invoice_editor_screen.dart`
- `lib/features/shared/payment_form_sheet.dart`
- `lib/features/sales/sales_billing_screen.dart`
- `lib/features/purchase/purchase_invoices_screen.dart`

### Frontend
- `src/utils/currency.js`

---

## Notes for production

- Redeploy backend Lambda/API for fixes to take effect.
- Existing confirmed sales returns do **not** retroactively fix invoice balances; run a one-time SQL refresh if historical data is wrong (script can reuse `refreshSalesInvoicePaymentTotals` per invoice).
- Do not commit `jedmee-db.pem` or other secrets.
