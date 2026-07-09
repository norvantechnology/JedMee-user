/**
 * packagingConversion.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pharmaceutical packaging unit conversion helpers.
 *
 * Hierarchy (largest → smallest):
 *   CASE  → boxes_per_case  → BOX
 *   BOX   → strips_per_box  → STRIP   (base inventory unit)
 *   STRIP → units_per_strip → UNIT    (tablet / capsule / ml)
 *
 * The database always stores:
 *   qty          in STRIPS  (e.g. purchase_invoice_items.qty)
 *   purchase_rate per STRIP (e.g. product_batches.purchase_rate)
 *   sales_rate   per STRIP  (e.g. product_batches.sales_rate / mrp)
 *   loose_qty    in UNITS   (individual tablets - sales_invoice_items.loose_qty)
 *
 * These helpers convert between display units and the stored strip-based values.
 */

/** Unit type constants */
export const UNIT_TYPES = {
  CASE:  "CASE",
  BOX:   "BOX",
  STRIP: "STRIP",
  UNIT:  "UNIT",   // individual tablet / capsule / ml
};

/**
 * Extract numeric packaging values from a product object.
 * Handles both snake_case (API) and camelCase (form state) keys.
 *
 * @param {object} product
 * @returns {{ stripsPerBox: number, boxesPerCase: number, stripsPerCase: number, unitsPerStrip: number }}
 */
export function getPackagingFactors(product) {
  const p = product || {};
  const stripsPerBox  = Math.max(1, Number(p.packing      ?? p.strips_per_box  ?? 1));
  const boxesPerCase  = Math.max(1, Number(p.bulk_pack     ?? p.boxes_per_case  ?? 1));
  const stripsPerCase = Math.max(1, Number(p.case_pack     ?? p.strips_per_case ?? stripsPerBox * boxesPerCase));
  const unitsPerStrip = Math.max(1, Number(p.units_per_strip ?? p.unitsPerStrip  ?? 1));
  return { stripsPerBox, boxesPerCase, stripsPerCase, unitsPerStrip };
}

/**
 * Returns the available unit options for a product, based on its packaging.
 * Only includes units that make sense (e.g. BOX only if stripsPerBox > 1).
 *
 * @param {object} product
 * @returns {Array<{ value: string, label: string, title: string }>}
 */
export function getUnitOptions(product) {
  const { stripsPerBox, boxesPerCase, unitsPerStrip } = getPackagingFactors(product);
  const opts = [];

  if (boxesPerCase > 1 && stripsPerBox > 1) {
    opts.push({
      value: UNIT_TYPES.CASE,
      label: "Case",
      title: `1 case = ${stripsPerBox * boxesPerCase} strips`
    });
  }

  if (stripsPerBox > 1) {
    opts.push({
      value: UNIT_TYPES.BOX,
      label: "Box",
      title: `1 box = ${stripsPerBox} strips`
    });
  }

  opts.push({
    value: UNIT_TYPES.STRIP,
    label: "Strip",
    title: "Base inventory unit"
  });

  if (unitsPerStrip > 1) {
    opts.push({
      value: UNIT_TYPES.UNIT,
      label: "Unit",
      title: `1 strip = ${unitsPerStrip} units (tablets/capsules)`
    });
  }

  return opts;
}

/**
 * How many strips does 1 unit of the given type equal?
 *
 * CASE  → stripsPerCase
 * BOX   → stripsPerBox
 * STRIP → 1
 * UNIT  → 1 / unitsPerStrip  (fractional strip)
 *
 * @param {string} unitType
 * @param {object} product
 * @returns {number}
 */
export function stripsPerDisplayUnit(unitType, product) {
  const { stripsPerBox, stripsPerCase, unitsPerStrip } = getPackagingFactors(product);
  switch (String(unitType || UNIT_TYPES.STRIP).toUpperCase()) {
    case UNIT_TYPES.CASE:  return stripsPerCase;
    case UNIT_TYPES.BOX:   return stripsPerBox;
    case UNIT_TYPES.STRIP: return 1;
    case UNIT_TYPES.UNIT:  return 1 / unitsPerStrip;
    default:               return 1;
  }
}

/**
 * Convert a display quantity (in the chosen unit) to strips.
 *
 * Example: displayQty=2, unitType="BOX", stripsPerBox=10 → 20 strips
 *
 * @param {number} displayQty
 * @param {string} unitType
 * @param {object} product
 * @returns {number}  quantity in strips (may be fractional for UNIT type)
 */
export function displayQtyToStrips(displayQty, unitType, product) {
  const qty = Number(displayQty) || 0;
  return qty * stripsPerDisplayUnit(unitType, product);
}

/**
 * Convert a strip quantity back to display quantity in the chosen unit.
 *
 * @param {number} stripQty
 * @param {string} unitType
 * @param {object} product
 * @returns {number}
 */
export function stripsToDisplayQty(stripQty, unitType, product) {
  const factor = stripsPerDisplayUnit(unitType, product);
  if (!factor) return 0;
  return (Number(stripQty) || 0) / factor;
}

/**
 * Convert a per-strip rate to a per-display-unit rate.
 *
 * Example: stripRate=10, unitType="BOX", stripsPerBox=10 → 100 per box
 *
 * @param {number} stripRate   rate per strip (as stored in DB)
 * @param {string} unitType
 * @param {object} product
 * @returns {number}
 */
export function stripRateToDisplayRate(stripRate, unitType, product) {
  const rate = Number(stripRate) || 0;
  return rate * stripsPerDisplayUnit(unitType, product);
}

/**
 * Convert a per-display-unit rate back to a per-strip rate.
 *
 * Example: displayRate=100, unitType="BOX", stripsPerBox=10 → 10 per strip
 *
 * @param {number} displayRate  rate per chosen unit (what user enters)
 * @param {string} unitType
 * @param {object} product
 * @returns {number}
 */
export function displayRateToStripRate(displayRate, unitType, product) {
  const factor = stripsPerDisplayUnit(unitType, product);
  if (!factor) return 0;
  return (Number(displayRate) || 0) / factor;
}

/**
 * Human-readable label for a unit type, optionally with the product's unit name.
 *
 * @param {string} unitType
 * @param {object} product
 * @param {string} [looseUnitName]  e.g. "TAB", "CAP", "ML"
 * @returns {string}
 */
export function unitTypeLabel(unitType, product, looseUnitName) {
  const { stripsPerBox, stripsPerCase, unitsPerStrip } = getPackagingFactors(product);
  const unitName = String(looseUnitName || "Unit").toUpperCase();
  switch (String(unitType || UNIT_TYPES.STRIP).toUpperCase()) {
    case UNIT_TYPES.CASE:  return `Case (${stripsPerCase} strips)`;
    case UNIT_TYPES.BOX:   return `Box (${stripsPerBox} strips)`;
    case UNIT_TYPES.STRIP: return "Strip";
    case UNIT_TYPES.UNIT:  return `${unitName} (1/${unitsPerStrip} strip)`;
    default:               return "Strip";
  }
}

/**
 * Given a product and a chosen unit type, return a summary string for display.
 * e.g. "1 Box = 10 Strips = 100 Tablets"
 *
 * @param {string} unitType
 * @param {object} product
 * @param {string} [looseUnitName]
 * @returns {string}
 */
export function packagingSummary(unitType, product, looseUnitName) {
  const { stripsPerBox, stripsPerCase, unitsPerStrip } = getPackagingFactors(product);
  const unitName = String(looseUnitName || "units").toLowerCase();
  const ut = String(unitType || UNIT_TYPES.STRIP).toUpperCase();

  if (ut === UNIT_TYPES.CASE) {
    const parts = [`1 Case = ${stripsPerCase} Strips`];
    if (unitsPerStrip > 1) parts.push(`${stripsPerCase * unitsPerStrip} ${unitName}`);
    return parts.join(" = ");
  }
  if (ut === UNIT_TYPES.BOX) {
    const parts = [`1 Box = ${stripsPerBox} Strips`];
    if (unitsPerStrip > 1) parts.push(`${stripsPerBox * unitsPerStrip} ${unitName}`);
    return parts.join(" = ");
  }
  if (ut === UNIT_TYPES.UNIT) {
    return `1 ${unitName} = 1/${unitsPerStrip} Strip`;
  }
  return "";
}

/**
 * Round a strip quantity to a reasonable precision.
 * Strips are usually whole numbers, but UNIT sales produce fractions.
 *
 * @param {number} qty
 * @returns {number}
 */
export function roundStripQty(qty) {
  const x = Number(qty) || 0;
  // Round to 3 decimal places (supports up to 1000 units per strip)
  return Math.round(x * 1000) / 1000;
}