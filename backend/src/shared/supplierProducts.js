/**
 * supplierProducts.js  Auto-mapping helper for retailer "Product-Supplier"
 * relationships. Whenever a vendor-based purchase invoice is confirmed, we
 * remember which product came from which vendor (and at what rate). The same
 * data backs the Product-Supplier and Manufacturer-Stockist reports.
 *
 * Design:
 *  - INSERT … ON CONFLICT … DO UPDATE so we keep the latest typical_purchase_rate
 *    and a last_supplied_on date each time the same vendor sells us the product.
 *  - Safe to call inside a transaction. If the invoice has no vendor_id (i.e.
 *    division-based purchase for a wholesaler), this is a no-op.
 */

async function upsertSupplierProductsForPurchase({ q, accountId, vendorId, items, invoiceDate, actorId }) {
  if (!vendorId) return;
  if (!Array.isArray(items) || items.length === 0) return;
  const seen = new Set();
  for (const it of items) {
    const productId = String(it.product_id || it.productId || "").trim();
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    const rate = Number(it.purchase_rate ?? it.purchaseRate ?? 0) || null;
    const date = invoiceDate ? new Date(invoiceDate).toISOString().slice(0, 10) : null;
    await q(
      `
      INSERT INTO supplier_products (account_id, vendor_id, product_id, typical_purchase_rate, last_supplied_on, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (account_id, vendor_id, product_id) DO UPDATE
        SET typical_purchase_rate = EXCLUDED.typical_purchase_rate,
            last_supplied_on = EXCLUDED.last_supplied_on,
            updated_at = now()
      `,
      [accountId, vendorId, productId, rate, date, actorId || null]
    );
  }
}

module.exports = { upsertSupplierProductsForPurchase };
