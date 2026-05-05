/** Map normalized header → canonical field id per entity. */

function normalizeHeader(h) {
  return String(h ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const ALIASES = {
  MANUFACTURERS: {
    code: ["code", "mfg_code", "company_code", "manufacturer_code"],
    name: ["name", "company", "manufacturer", "company_name", "mfg_name"],
    short_name: ["short_name", "short", "abbr", "abbreviation"],
    rack_no: ["rack_no", "rack", "rack_number", "location"],
    main_company_code: ["main_company_code", "parent_code", "group_code"],
    sale_lock: ["sale_lock", "lock_sale", "block_sale"],
    purchase_order_lock: ["purchase_order_lock", "purchase_lock", "po_lock", "block_purchase"],
    prevent_discount: ["prevent_discount"],
    prevent_free_qty: ["prevent_free_qty", "prevent_free_quantity"],
    out_bill_limit: ["out_bill_limit", "bill_limit", "max_bills"],
    out_day_limit: ["out_day_limit", "day_limit", "max_days"],
    credit_limit: ["credit_limit", "limit"]
  },
  DIVISIONS: {
    code: ["code", "division_code", "div_code"],
    name: ["name", "division_name"],
    short_name: ["short_name", "short"],
    manufacturer_code: ["manufacturer_code", "mfg_code", "company_code"],
    manufacturer_name: ["manufacturer_name", "company", "mfg_name", "manufacturer"],
    credit_days: ["credit_days", "payment_days", "due_days"],
    phone: ["phone", "mobile", "phone_number"],
    email: ["email"],
    address: ["address"],
    is_active: ["is_active", "active"]
  },
  SUPPLIERS: {
    code: ["code", "vendor_code", "supplier_code"],
    name: ["name", "vendor_name", "supplier_name", "party_name"],
    short_name: ["short_name", "short"],
    vendor_type: ["vendor_type", "type"],
    credit_days: ["credit_days"],
    phone: ["phone", "mobile", "phone_number"],
    email: ["email"],
    address: ["address"],
    city: ["city"],
    state: ["state"],
    main_brand: ["main_brand", "main_company"],
    notes: ["notes"],
    is_active: ["is_active", "active"]
  },
  PRODUCTS: {
    code: ["code", "item_code", "product_code", "sku"],
    name: ["name", "item_name", "product_name", "medicine_name", "item", "product"],
    drug_name: ["drug_name", "generic_name", "generic", "composition"],
    manufacturer_code: ["manufacturer_code", "mfg_code", "company_code"],
    manufacturer_name: ["manufacturer_name", "company", "mfg", "manufacturer"],
    division_code: ["division_code", "division", "div_code"],
    packing: ["packing", "pack", "pack_size"],
    bulk_pack: ["bulk_pack"],
    case_pack: ["case_pack"],
    conversion_unit: ["conversion_unit", "conversion"],
    sales_gst: ["sales_gst", "gst", "gst_percent", "gst_rate", "tax_rate"],
    purchase_gst: ["purchase_gst", "purchase_tax"],
    hsn_code: ["hsn_code", "hsn", "hsn_no"],
    rack_location: ["rack_location", "rack", "shelf", "bin"],
    is_control: ["is_control", "controlled", "schedule"],
    is_otc: ["is_otc", "otc"],
    stockable: ["stockable"],
    is_discount_enabled: ["is_discount_enabled", "discount_enabled"],
    sales_scheme: ["sales_scheme", "scheme"],
    scheme_qty_paid: ["scheme_qty_paid"],
    scheme_qty_free: ["scheme_qty_free"],
    low_stock_alert_enabled: ["low_stock_alert_enabled"],
    low_stock_threshold: ["low_stock_threshold"]
  },
  PRODUCT_BATCHES: {
    product_code: ["product_code", "item_code", "code", "sku"],
    product_name: ["product_name", "product", "item_name", "name", "item"],
    drug_name: ["drug_name", "generic"],
    batch_no: ["batch_no", "batch", "lot", "lot_no", "batch_number"],
    barcode: ["barcode", "bar_code", "ean"],
    expiry_date: ["expiry_date", "expiry", "exp", "exp_date"],
    mfg_date: ["mfg_date", "manufacturing_date"],
    mrp: ["mrp", "maximum_retail_price"],
    purchase_rate: ["purchase_rate", "pur_rate", "cost", "cost_price"],
    sales_rate: ["sales_rate", "sale_rate", "selling_price", "wholesale_rate"],
    retail_rate: ["retail_rate", "counter_rate"],
    special_rate_1: ["special_rate_1", "sp_rate_1"],
    special_rate_2: ["special_rate_2", "sp_rate_2"],
    retail_discount_percent: ["retail_discount_percent", "retail_discount", "discount"],
    net_discount_percent: ["net_discount_percent", "net_discount"],
    sales_gst: ["sales_gst", "gst"],
    purchase_gst: ["purchase_gst"],
    opening_stock: ["opening_stock", "stock", "qty", "quantity", "current_stock"],
    open_stock_free_qty: ["open_stock_free_qty", "free_qty", "free_stock", "bonus"],
    packing: ["packing", "pack"],
    is_hold: ["is_hold", "hold"],
    is_control: ["is_control"],
    is_discount_enabled: ["is_discount_enabled"],
    low_stock_alert_enabled: ["low_stock_alert_enabled"],
    low_stock_threshold: ["low_stock_threshold"],
    supplier_code: ["supplier_code", "vendor_code"],
    division_code: ["division_code", "division"],
    manufacturer_name: ["manufacturer_name", "company", "mfg"],
    loose_stock: ["loose_stock"],
    loose_unit_name: ["loose_unit_name", "loose_unit"]
  },
  CUSTOMERS: {
    code: ["code", "customer_code", "party_code"],
    name: ["name", "customer_name", "party_name", "firm_name"],
    short_name: ["short_name", "short"],
    customer_type: ["customer_type", "type"],
    phone: ["phone", "mobile", "phone_number"],
    email: ["email"],
    address: ["address"],
    city: ["city"],
    state: ["state"],
    pincode: ["pincode", "pin", "zip"],
    gst_number: ["gst_number", "gstin", "gst_no"],
    drug_license_number: ["drug_license_number", "dl_no", "license"],
    dl_expiry_date: ["dl_expiry_date", "dl_expiry"],
    credit_days: ["credit_days"],
    credit_limit: ["credit_limit"],
    discount_percent: ["discount_percent", "discount"],
    is_cash_customer: ["is_cash_customer", "cash"],
    is_active: ["is_active", "active"],
    notes: ["notes"]
  },
  PURCHASES: {
    invoice_number: ["invoice_number", "invoice_no", "bill_no", "pi_no"],
    supplier_code: ["supplier_code", "vendor_code"],
    supplier_name: ["supplier_name", "vendor_name"],
    division_code: ["division_code", "division"],
    invoice_date: ["invoice_date", "date", "bill_date"],
    due_date: ["due_date"],
    vendor_invoice_number: ["vendor_invoice_number", "ref_no", "grn"],
    notes: ["notes"],
    status: ["status"],
    product_code: ["product_code", "item_code", "code"],
    product_name: ["product_name", "item_name"],
    batch_no: ["batch_no", "batch", "lot"],
    expiry_date: ["expiry_date", "expiry"],
    qty: ["qty", "quantity"],
    free_qty: ["free_qty", "free"],
    purchase_rate: ["purchase_rate", "rate", "cost"],
    mrp: ["mrp"],
    sales_rate: ["sales_rate"],
    discount_percent: ["discount_percent", "disc"],
    gst_percent: ["gst_percent", "gst", "tax"],
    is_new_batch: ["is_new_batch", "new_batch"]
  },
  SALES: {
    invoice_number: ["invoice_number", "invoice_no", "bill_no", "si_no"],
    status: ["status"],
    invoice_date: ["invoice_date", "date", "bill_date"],
    customer_code: ["customer_code", "cust_code"],
    customer_name: ["customer_name", "party"],
    patient_name: ["patient_name", "walk_in_patient"],
    patient_phone: ["patient_phone", "walk_in_phone"],
    bill_type: ["bill_type"],
    rate_type: ["rate_type"],
    notes: ["notes"],
    product_code: ["product_code", "item_code", "code"],
    product_name: ["product_name", "item_name"],
    batch_no: ["batch_no", "batch", "lot"],
    qty: ["qty", "quantity"],
    free_qty: ["free_qty", "free"],
    mrp: ["mrp"],
    sales_rate: ["sales_rate", "rate"],
    discount_percent: ["discount_percent", "disc"],
    gst_percent: ["gst_percent", "gst"]
  },
  SALES_RETURNS: {
    return_number: ["return_number", "return_no", "sr_no"],
    status: ["status"],
    return_date: ["return_date", "date"],
    customer_code: ["customer_code"],
    customer_name: ["customer_name"],
    linked_invoice_number: ["linked_invoice_number", "invoice_number", "sales_invoice"],
    return_reason: ["return_reason", "reason"],
    notes: ["notes"],
    product_code: ["product_code", "code"],
    batch_no: ["batch_no", "batch"],
    return_qty: ["return_qty", "qty"],
    return_free_qty: ["return_free_qty", "free_qty"],
    sales_rate: ["sales_rate", "rate"]
  },
  PRESCRIPTIONS: {
    prescription_no: ["prescription_no", "rx_no", "rx"],
    prescription_date: ["prescription_date", "date"],
    patient_name: ["patient_name", "patient"],
    patient_age: ["patient_age", "age"],
    patient_phone: ["patient_phone", "phone"],
    doctor_name: ["doctor_name", "doctor"],
    doctor_reg_number: ["doctor_reg_number", "reg_no"],
    sales_invoice_number: ["sales_invoice_number", "invoice_number"],
    notes: ["notes"]
  }
};

function invertAliasMap(entityType) {
  const map = ALIASES[entityType] || {};
  const normToField = {};
  for (const [field, aliases] of Object.entries(map)) {
    normToField[normalizeHeader(field)] = field;
    for (const a of aliases) {
      normToField[normalizeHeader(a)] = field;
    }
  }
  return normToField;
}

function suggestMappings(headers, entityType) {
  const normToField = invertAliasMap(entityType);
  const out = {};
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (normToField[n]) out[h] = normToField[n];
  }
  return out;
}

function mapRow(rawRow, mappings) {
  const out = {};
  for (const [fileCol, medicoField] of Object.entries(mappings || {})) {
    if (!medicoField || medicoField === "__skip__") continue;
    if (Object.prototype.hasOwnProperty.call(rawRow, fileCol)) {
      out[medicoField] = rawRow[fileCol];
    }
  }
  return out;
}

module.exports = {
  ALIASES,
  normalizeHeader,
  suggestMappings,
  mapRow
};
