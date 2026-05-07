const { ALIASES } = require("./columnAliases");

function fieldsForEntity(entityType) {
  const keys = Object.keys(ALIASES[entityType] || {});
  return keys.map((key) => ({
    key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    required: false
  }));
}

const REQUIRED_HINTS = {
  MANUFACTURERS: ["name"],
  DIVISIONS: ["name", "manufacturer_code"],
  SUPPLIERS: ["name"],
  PRODUCTS: ["name"],
  PRODUCT_BATCHES: ["batch_no", "expiry_date", "mrp"],
  CUSTOMERS: ["name"],
  // product_code OR product_name is accepted (validated in basicRequired)
  PURCHASES: ["invoice_number", "invoice_date", "batch_no", "qty"],
  SALES: ["invoice_number", "invoice_date", "batch_no", "qty"],
  SALES_RETURNS: ["return_number", "batch_no", "return_qty"],
  PURCHASE_RETURNS: ["return_date", "batch_no", "return_qty"],
  PRESCRIPTIONS: ["patient_name"]
};

/**
 * Fields that are "either/or" — at least one must be present.
 * Key = entityType, value = array of [fieldA, fieldB] pairs.
 */
const EITHER_OR_HINTS = {
  PURCHASES: [["product_code", "product_name"], ["supplier_code", "supplier_name"]],
  SALES: [["product_code", "product_name"], ["customer_code", "customer_name"]],
  SALES_RETURNS: [["product_code", "product_name"], ["customer_code", "customer_name"]],
  PURCHASE_RETURNS: [["product_code", "product_name"], ["supplier_code", "supplier_name"]]
};

function fieldsWithRequired(entityType) {
  const req = new Set(REQUIRED_HINTS[entityType] || []);
  return fieldsForEntity(entityType).map((f) => ({ ...f, required: req.has(f.key) }));
}

module.exports = { fieldsForEntity, fieldsWithRequired, REQUIRED_HINTS, EITHER_OR_HINTS };
