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
  PURCHASES: ["invoice_number", "invoice_date", "product_code", "batch_no", "qty"],
  SALES: ["invoice_number", "invoice_date", "product_code", "batch_no", "qty"],
  SALES_RETURNS: ["return_number", "customer_code", "product_code", "batch_no", "return_qty"],
  PRESCRIPTIONS: ["patient_name"]
};

function fieldsWithRequired(entityType) {
  const req = new Set(REQUIRED_HINTS[entityType] || []);
  return fieldsForEntity(entityType).map((f) => ({ ...f, required: req.has(f.key) }));
}

module.exports = { fieldsForEntity, fieldsWithRequired, REQUIRED_HINTS };
