function n(v) {
  const x = Number(String(v ?? "").trim());
  return Number.isFinite(x) ? x : 0;
}

function round2(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function packingUnits(packing) {
  const s = String(packing ?? "").trim().toLowerCase();
  if (!s) return 0;
  // Accept: "10x10", "10×10", "10 * 10", "10/10" (extract numbers, multiply all)
  const nums = s.match(/\d+(\.\d+)?/g);
  if (!nums || !nums.length) return 0;
  return nums.map((t) => Number(t)).filter((x) => Number.isFinite(x) && x > 0).reduce((a, b) => a * b, 1);
}

export function computeProductBatch(form, opts = {}) {
  const manualSalesRate = Boolean(opts?.manualSalesRate);
  const manualRetailRate = Boolean(opts?.manualRetailRate);
  const purchaseRate = n(form.purchaseRate);
  const salesRateRaw =
    manualSalesRate || form.salesRate === "" || form.salesRate == null ? null : n(form.salesRate);
  const mrp = n(form.mrp);
  const purchaseGST = n(form.purchaseGST);
  const salesGST = n(form.salesGST);

  const retailDiscountPercent = n(form.retailDiscountPercent);
  const netDiscountPercent = n(form.netDiscountPercent);
  const discountPurchase = n(form.discountPurchase);

  const qtyPaid = Math.max(0, n(form.schemeQtyPaid));
  const qtyFree = Math.max(0, n(form.schemeQtyFree));

  const isNet = Boolean(form.isNet);
  const isDiscountEnabled = Boolean(form.isDiscountEnabled);
  const isHalfScheme = Boolean(form.isHalfScheme);

  const landingCost = round2(purchaseRate - discountPurchase + (purchaseRate * purchaseGST) / 100);

  let salesRate = salesRateRaw;
  const targetMarginPct = form.marginPercent === "" || form.marginPercent == null ? null : n(form.marginPercent);
  if ((salesRate == null || salesRate === 0) && purchaseRate > 0 && targetMarginPct != null) {
    salesRate = round2(purchaseRate + (purchaseRate * targetMarginPct) / 100);
  }
  if (salesRate == null) salesRate = 0;

  let retailRate =
    manualRetailRate || form.retailRate === "" || form.retailRate == null ? null : n(form.retailRate);
  if (retailRate == null || retailRate === 0) retailRate = salesRate;

  const discountSales = round2(salesRate * (retailDiscountPercent / 100));
  const activeDiscount = isDiscountEnabled ? (isNet ? netDiscountPercent : retailDiscountPercent) : 0;
  const netRate = round2(salesRate * (1 - activeDiscount / 100));

  // Per spec: Sales with GST = Net Rate × (1 + SalesGST/100)
  const salesWithGST = round2(netRate + (netRate * salesGST) / 100);

  // Per spec: Wholesale Margin = ((Net Rate − Landing Cost) / Landing Cost) × 100
  const wholesaleMargin = landingCost > 0 ? round2(((netRate - landingCost) / landingCost) * 100) : 0;
  const retailMargin = purchaseRate > 0 ? round2(((mrp - purchaseRate) / purchaseRate) * 100) : 0;

  const openingStock = Math.max(0, n(form.openingStock));
  const openStockFreeQty = Math.max(0, n(form.openStockFreeQty));
  const totalStock = round2(openingStock + openStockFreeQty);

  // Per spec: Effective Rate = (SalesRate × SchemeQtyPaid) / (SchemeQtyPaid + SchemeQtyFree)
  // Switches:
  // - Net bypasses scheme/discount behaviour
  // - Discount Enabled gates scheme calculation too (spec says discount/scheme wrapped)
  const effFree = isHalfScheme ? qtyFree / 2 : qtyFree;
  let effectiveRate = purchaseRate;
  if (qtyPaid > 0) effectiveRate = round2((purchaseRate * qtyPaid) / (qtyPaid + Math.max(0, effFree)));

  const netDiscount = isNet ? 0 : round2(netRate * (netDiscountPercent / 100));

  const unitsPerCase = round2(packingUnits(form.packing) * Math.max(0, n(form.bulkPack)) * Math.max(0, n(form.casePack)));

  return {
    landingCost,
    wholesaleMargin,
    retailMargin,
    salesRate: round2(salesRate),
    retailRate: round2(retailRate),
    discountSales,
    discountPurchase: round2(discountPurchase),
    netRate,
    netDiscount,
    salesWithGST,
    totalStock,
    effectiveRate,
    unitsPerCase
  };
}

