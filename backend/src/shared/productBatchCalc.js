function n(v) {
  const x = Number(String(v ?? "").trim());
  return Number.isFinite(x) ? x : 0;
}

function clamp(v, min, max) {
  const x = n(v);
  return Math.max(min, Math.min(max, x));
}

function round2(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function clean(v) {
  const s = String(v ?? "").trim();
  return s || "";
}

/** `product_batches.loose_unit_name` is NOT NULL; explicit NULL in INSERT overrides DB default. */
function normalizeLooseUnitNameForDb(v) {
  const s = clean(v);
  if (!s) return "TAB";
  return s.slice(0, 20).toUpperCase();
}

function ymdToDate(ymd) {
  const s = clean(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00Z`);
}

function isValidYmd(ymd) {
  const d = ymdToDate(ymd);
  return Boolean(d) && !Number.isNaN(d.getTime());
}

function isFutureYmd(ymd) {
  const d = ymdToDate(ymd);
  if (!d) return false;
  const now = new Date();
  const today = new Date(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T00:00:00Z`);
  return d.getTime() > today.getTime();
}

function isBeforeYmd(a, b) {
  const da = ymdToDate(a);
  const db = ymdToDate(b);
  if (!da || !db) return true;
  return da.getTime() < db.getTime();
}

function computeDerived(input) {
  const purchaseRate = n(input.purchaseRate);
  const mrp = n(input.mrp);
  const purchaseGST = clamp(input.purchaseGST, 0, 28);
  const salesGST = clamp(input.salesGST, 0, 28);
  const discountPurchase = Math.max(0, n(input.discountPurchase));

  // Spec-aligned: landing = purchase - purchase_discount + purchase GST on purchase rate.
  const landingCost = round2(purchaseRate - discountPurchase + (purchaseRate * purchaseGST) / 100);

  const salesRate = n(input.salesRate);
  const retailRate = n(input.retailRate || salesRate);

  const isNet = Boolean(input.isNet);
  const isDiscountEnabled = Boolean(input.isDiscountEnabled);
  const isHalfScheme = Boolean(input.isHalfScheme);
  const retailDiscountPercent = Math.max(0, n(input.retailDiscountPercent));
  const netDiscountPercent = Math.max(0, n(input.netDiscountPercent));

  const activeDiscount = isDiscountEnabled ? (isNet ? netDiscountPercent : retailDiscountPercent) : 0;
  const discountSales = round2(salesRate * (retailDiscountPercent / 100));
  const netRate = round2(salesRate * (1 - activeDiscount / 100));

  // Per spec: Sales with GST = Net Rate × (1 + SalesGST/100)
  const salesWithGST = round2(netRate + (netRate * salesGST) / 100);

  // Per spec: Wholesale Margin = ((Net Rate − Landing Cost) / Landing Cost) × 100
  const wholesaleMargin = landingCost > 0 ? round2(((netRate - landingCost) / landingCost) * 100) : 0;
  const retailMargin = purchaseRate > 0 ? round2(((mrp - purchaseRate) / purchaseRate) * 100) : 0;

  const openingStock = Math.max(0, n(input.openingStock));
  const openStockFreeQty = Math.max(0, n(input.openStockFreeQty));
  const totalStock = round2(openingStock + openStockFreeQty);

  const qtyPaid = Math.max(0, n(input.schemeQtyPaid));
  const qtyFree = Math.max(0, n(input.schemeQtyFree));
  // Per spec: Effective Rate = (SalesRate × SchemeQtyPaid) / (SchemeQtyPaid + SchemeQtyFree)
  const effFree = isHalfScheme ? qtyFree / 2 : qtyFree;
  let effectiveRate = purchaseRate;
  if (qtyPaid > 0) effectiveRate = round2((purchaseRate * qtyPaid) / (qtyPaid + Math.max(0, effFree)));

  return {
    landingCost,
    discountSales,
    netRate,
    retailRate: round2(retailRate),
    salesWithGST,
    wholesaleMargin,
    retailMargin,
    totalStock,
    effectiveRate
  };
}

function validate(input) {
  const errs = [];
  if (clean(input.productName).length < 2) errs.push("productName is required");
  if (!clean(input.batchNo)) errs.push("batchNo is required");
  if (!clean(input.expiryDate)) errs.push("expiryDate is required");
  else if (!isValidYmd(input.expiryDate)) errs.push("expiryDate must be a valid date");
  if (clean(input.mfgDate)) {
    if (!isValidYmd(input.mfgDate)) errs.push("mfgDate must be a valid date");
    else if (isFutureYmd(input.mfgDate)) errs.push("mfgDate cannot be in the future");
  }
  if (clean(input.mfgDate) && clean(input.expiryDate) && !isBeforeYmd(input.mfgDate, input.expiryDate)) {
    errs.push("mfgDate cannot be after expiryDate");
  }

  const salesGST = n(input.salesGST);
  const purchaseGST = n(input.purchaseGST);
  const allowedGst = new Set([0, 5, 12, 18, 28]);
  if (clean(input.salesGST) && !allowedGst.has(salesGST)) errs.push("salesGST must be one of 0, 5, 12, 18, 28");
  if (clean(input.purchaseGST) && !allowedGst.has(purchaseGST)) errs.push("purchaseGST must be one of 0, 5, 12, 18, 28");

  // Monetary fields must be non-negative. MRP is required and must be positive.
  const mrp = n(input.mrp);
  if (!(mrp > 0)) errs.push("MRP is required and must be greater than 0.");

  const moneyField = (value, label) => {
    if (value === undefined || value === null || clean(value) === "") return null;
    const x = n(value);
    if (!Number.isFinite(x) || x < 0) {
      errs.push(`${label} must be a non-negative number.`);
      return null;
    }
    return x;
  };

  const salesRate = moneyField(input.salesRate, "Sales rate") ?? 0;
  moneyField(input.purchaseRate, "Purchase rate");
  const retailRate = moneyField(input.retailRate, "Retail rate");
  moneyField(input.netRate, "Net rate");
  moneyField(input.landingCost, "Landing cost");

  if (mrp > 0 && salesRate > mrp) errs.push("Sales rate can’t be higher than MRP.");
  if (mrp > 0 && retailRate !== null && retailRate > mrp) errs.push("Retail rate can’t be higher than MRP.");

  const qtyField = (value, label) => {
    if (value === undefined || value === null || clean(value) === "") return;
    const x = n(value);
    if (!Number.isFinite(x) || x < 0) errs.push(`${label} must be a non-negative number.`);
  };

  qtyField(input.openingStock, "Opening stock");
  qtyField(input.openStockFreeQty, "Free quantity");
  qtyField(input.schemeQtyPaid, "Scheme paid qty");
  qtyField(input.schemeQtyFree, "Scheme free qty");
  if (n(input.schemeQtyFree) > 0 && n(input.schemeQtyPaid) <= 0) {
    errs.push("Scheme paid qty is required when scheme free qty is set");
  }

  return errs;
}

// Compute expiry status (never stored; always computed on read).
// ACTIVE          => expiry_date > today + warningDays
// NEAR_EXPIRY     => today <= expiry_date <= today + warningDays
// EXPIRED         => expiry_date < today
function computeExpiryStatus(expiry, warningDays = 90) {
  if (!expiry) return "ACTIVE";
  const expStr = typeof expiry === "string" ? expiry.slice(0, 10) : null;
  const d = expStr ? ymdToDate(expStr) : new Date(expiry);
  if (!d || Number.isNaN(d.getTime())) return "ACTIVE";
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  if (d.getTime() < today.getTime()) return "EXPIRED";
  const daysLeft = Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= warningDays) return "NEAR_EXPIRY";
  return "ACTIVE";
}

module.exports = {
  clean,
  n,
  computeDerived,
  validate,
  isFutureYmd,
  isValidYmd,
  computeExpiryStatus,
  normalizeLooseUnitNameForDb
};

