/** Map normalized header → canonical field id per entity.
 *  Aliases cover exports from: Marg ERP, Busy Accounting, KMS, Tally, Medeil, PharmaSoft, Excel.
 */

function normalizeHeader(h) {
  return String(h ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const ALIASES = {
  MANUFACTURERS: {
    code: ["code", "mfg_code", "company_code", "manufacturer_code", "comp_code", "grp_code", "group_code"],
    name: ["name", "company", "manufacturer", "company_name", "mfg_name", "group", "group_name", "firm_name", "party_name"],
    short_name: ["short_name", "short", "abbr", "abbreviation", "alias"],
    rack_no: ["rack_no", "rack", "rack_number", "location", "rack_location"],
    main_company_code: ["main_company_code", "parent_code", "group_code", "parent_company_code"],
    sale_lock: ["sale_lock", "lock_sale", "block_sale"],
    purchase_order_lock: ["purchase_order_lock", "purchase_lock", "po_lock", "block_purchase"],
    prevent_discount: ["prevent_discount", "no_discount"],
    prevent_free_qty: ["prevent_free_qty", "prevent_free_quantity", "no_free"],
    out_bill_limit: ["out_bill_limit", "bill_limit", "max_bills"],
    out_day_limit: ["out_day_limit", "day_limit", "max_days"],
    credit_limit: ["credit_limit", "limit", "credit"]
  },

  DIVISIONS: {
    code: ["code", "division_code", "div_code", "category_code"],
    name: ["name", "division_name", "category", "category_name", "div_name"],
    short_name: ["short_name", "short", "alias"],
    manufacturer_code: ["manufacturer_code", "mfg_code", "company_code", "comp_code"],
    manufacturer_name: ["manufacturer_name", "company", "mfg_name", "manufacturer", "group", "group_name"],
    credit_days: ["credit_days", "payment_days", "due_days", "credit"],
    phone: ["phone", "mobile", "phone_number", "contact"],
    email: ["email", "email_id"],
    address: ["address", "addr"],
    is_active: ["is_active", "active", "status"]
  },

  SUPPLIERS: {
    code: ["code", "vendor_code", "supplier_code", "party_code", "acc_code", "account_code"],
    name: ["name", "vendor_name", "supplier_name", "party_name", "firm_name", "company_name", "firm", "party"],
    short_name: ["short_name", "short", "alias", "abbr"],
    vendor_type: ["vendor_type", "type", "party_type", "supplier_type"],
    credit_days: ["credit_days", "payment_days", "due_days", "credit"],
    phone: ["phone", "mobile", "phone_number", "contact", "contact_no", "mob"],
    email: ["email", "email_id", "email_address"],
    address: ["address", "addr", "billing_address"],
    city: ["city", "town"],
    state: ["state", "province"],
    pincode: ["pincode", "pin", "zip", "postal_code", "pin_code"],
    gst_number: ["gst_number", "gstin", "gst_no", "gst", "gst_reg_no", "gstin_no"],
    pan_number: ["pan_number", "pan", "pan_no", "pan_card"],
    drug_license_number: ["drug_license_number", "dl_no", "dl_number", "drug_license", "license_no", "dl"],
    contact_person: ["contact_person", "contact_name", "person", "proprietor", "owner"],
    main_brand: ["main_brand", "main_company", "main_supplier", "primary_company"],
    notes: ["notes", "remarks", "comment"],
    is_active: ["is_active", "active", "status"]
  },

  PRODUCTS: {
    code: ["code", "item_code", "product_code", "sku", "item_no", "prod_code", "article_code"],
    name: [
      "name", "item_name", "product_name", "medicine_name", "item", "product",
      "medicine", "drug", "drug_name_brand", "brand_name", "trade_name",
      "product_description", "description", "item_description"
    ],
    drug_name: [
      "drug_name", "generic_name", "generic", "composition", "salt",
      "molecule", "active_ingredient", "formula", "sub_group", "sub_category"
    ],
    manufacturer_code: ["manufacturer_code", "mfg_code", "company_code", "comp_code", "group_code"],
    manufacturer_name: [
      "manufacturer_name", "company", "mfg", "manufacturer", "mfg_name",
      "company_name", "group", "group_name", "brand_company"
    ],
    division_code: ["division_code", "division", "div_code", "category_code", "cat_code"],
    division_name: ["division_name", "category", "category_name", "div_name", "product_category"],
    packing: ["packing", "pack", "pack_size", "unit", "uom", "unit_of_measure", "pack_type", "packaging"],
    bulk_pack: ["bulk_pack", "bulk_packing", "outer_pack"],
    case_pack: ["case_pack", "case_packing"],
    conversion_unit: ["conversion_unit", "conversion", "loose_unit"],
    sales_gst: [
      "sales_gst", "gst", "gst_percent", "gst_rate", "tax_rate", "tax",
      "tax_percent", "gst_slab", "gst_applicable", "igst_rate"
    ],
    purchase_gst: ["purchase_gst", "purchase_tax", "pur_gst", "input_gst"],
    hsn_code: ["hsn_code", "hsn", "hsn_no", "hsn_sac", "sac_code"],
    rack_location: ["rack_location", "rack", "shelf", "bin", "location", "store_location", "godown"],
    is_control: [
      "is_control", "controlled", "schedule", "schedule_h", "schedule_h1",
      "narcotic", "psychotropic", "rx_required", "prescription_required"
    ],
    is_otc: ["is_otc", "otc", "over_the_counter"],
    stockable: ["stockable", "maintain_stock", "track_stock", "inventory"],
    is_discount_enabled: ["is_discount_enabled", "discount_enabled", "allow_discount"],
    sales_scheme: ["sales_scheme", "scheme", "scheme_name"],
    scheme_qty_paid: ["scheme_qty_paid", "scheme_paid", "buy_qty"],
    scheme_qty_free: ["scheme_qty_free", "scheme_free", "free_qty_scheme", "get_qty"],
    low_stock_alert_enabled: ["low_stock_alert_enabled", "low_stock_alert", "reorder_alert"],
    low_stock_threshold: [
      "low_stock_threshold", "reorder_level", "reorder_qty", "min_stock",
      "minimum_stock", "min_qty", "reorder_point", "safety_stock"
    ]
  },

  PRODUCT_BATCHES: {
    product_code: ["product_code", "item_code", "code", "sku", "item_no", "prod_code"],
    product_name: [
      "product_name", "product", "item_name", "name", "item",
      "medicine_name", "medicine", "drug", "description"
    ],
    drug_name: ["drug_name", "generic", "generic_name", "composition", "salt"],
    manufacturer_name: [
      "manufacturer_name", "company", "mfg", "mfg_name",
      "manufacturer", "group", "group_name"
    ],
    batch_no: ["batch_no", "batch", "lot", "lot_no", "batch_number", "batch_code"],
    barcode: ["barcode", "bar_code", "ean", "ean_code", "upc"],
    expiry_date: ["expiry_date", "expiry", "exp", "exp_date", "expiry_dt", "exp_dt", "expiry_month"],
    mfg_date: ["mfg_date", "manufacturing_date", "mfg_dt", "manufacture_date", "dom"],
    mrp: ["mrp", "maximum_retail_price", "max_retail_price", "retail_price", "list_price"],
    purchase_rate: [
      "purchase_rate", "pur_rate", "cost", "cost_price", "rate",
      "purchase_price", "landed_cost", "net_rate", "basic_rate"
    ],
    sales_rate: [
      "sales_rate", "sale_rate", "selling_price", "wholesale_rate",
      "selling_rate", "trade_rate", "wsp", "wholesale_price"
    ],
    retail_rate: ["retail_rate", "counter_rate", "retail_price", "ptr", "price_to_retailer"],
    special_rate_1: ["special_rate_1", "sp_rate_1", "special_price_1"],
    special_rate_2: ["special_rate_2", "sp_rate_2", "special_price_2"],
    retail_discount_percent: ["retail_discount_percent", "retail_discount", "discount", "disc", "disc_percent"],
    net_discount_percent: ["net_discount_percent", "net_discount", "nd_percent"],
    sales_gst: ["sales_gst", "gst", "gst_percent", "tax", "tax_rate"],
    purchase_gst: ["purchase_gst", "pur_gst"],
    opening_stock: [
      "opening_stock", "stock", "qty", "quantity", "current_stock",
      "closing_stock", "balance_qty", "stock_qty", "balance",
      "available_qty", "available_stock", "on_hand", "stock_on_hand",
      "opening_qty", "op_stock", "op_qty"
    ],
    open_stock_free_qty: ["open_stock_free_qty", "free_qty", "free_stock", "bonus", "bonus_qty"],
    packing: ["packing", "pack", "pack_size", "unit"],
    is_hold: ["is_hold", "hold", "blocked", "on_hold"],
    is_control: ["is_control", "controlled", "schedule"],
    is_discount_enabled: ["is_discount_enabled", "discount_enabled"],
    low_stock_alert_enabled: ["low_stock_alert_enabled", "low_stock_alert"],
    low_stock_threshold: ["low_stock_threshold", "reorder_level", "min_stock", "reorder_qty"],
    supplier_code: ["supplier_code", "vendor_code", "party_code"],
    division_code: ["division_code", "division", "category_code"],
    loose_stock: ["loose_stock", "loose", "loose_qty"],
    loose_unit_name: ["loose_unit_name", "loose_unit", "unit_name"]
  },

  CUSTOMERS: {
    code: ["code", "customer_code", "party_code", "acc_code", "account_code", "cust_code"],
    name: [
      "name", "customer_name", "party_name", "firm_name", "company_name",
      "firm", "party", "shop_name", "store_name"
    ],
    short_name: ["short_name", "short", "alias", "abbr"],
    customer_type: ["customer_type", "type", "party_type", "account_type"],
    phone: ["phone", "mobile", "phone_number", "contact", "contact_no", "mob", "cell"],
    email: ["email", "email_id", "email_address"],
    address: ["address", "addr", "billing_address", "shop_address"],
    city: ["city", "town"],
    state: ["state", "province"],
    pincode: ["pincode", "pin", "zip", "postal_code", "pin_code"],
    gst_number: ["gst_number", "gstin", "gst_no", "gst", "gst_reg_no"],
    drug_license_number: ["drug_license_number", "dl_no", "dl_number", "drug_license", "license_no", "dl"],
    dl_expiry_date: ["dl_expiry_date", "dl_expiry", "license_expiry", "dl_exp"],
    credit_days: ["credit_days", "payment_days", "due_days", "credit"],
    credit_limit: ["credit_limit", "limit", "credit_amount"],
    discount_percent: ["discount_percent", "discount", "disc", "disc_percent", "trade_discount"],
    is_cash_customer: ["is_cash_customer", "cash", "cash_customer", "walk_in"],
    is_active: ["is_active", "active", "status"],
    contact_person: ["contact_person", "contact_name", "person", "proprietor", "owner"],
    notes: ["notes", "remarks", "comment"]
  },

  PURCHASES: {
    invoice_number: ["invoice_number", "invoice_no", "bill_no", "pi_no", "purchase_no", "po_no", "grn_no"],
    supplier_code: ["supplier_code", "vendor_code", "party_code", "acc_code"],
    supplier_name: ["supplier_name", "vendor_name", "party_name", "firm_name", "party", "firm", "company"],
    division_code: ["division_code", "division", "div_code", "category_code"],
    invoice_date: ["invoice_date", "date", "bill_date", "purchase_date", "grn_date", "entry_date"],
    due_date: ["due_date", "payment_due", "due", "payment_date"],
    vendor_invoice_number: [
      "vendor_invoice_number", "ref_no", "grn", "grn_no", "challan_no",
      "dc_no", "delivery_challan", "supplier_invoice", "vendor_bill_no"
    ],
    notes: ["notes", "remarks", "narration", "comment"],
    status: ["status"],
    product_code: ["product_code", "item_code", "code", "sku", "item_no"],
    product_name: ["product_name", "item_name", "item", "medicine", "medicine_name", "description"],
    batch_no: ["batch_no", "batch", "lot", "lot_no", "batch_number"],
    expiry_date: ["expiry_date", "expiry", "exp", "exp_date", "expiry_month"],
    qty: ["qty", "quantity", "purchase_qty", "received_qty", "units"],
    free_qty: ["free_qty", "free", "bonus", "bonus_qty", "scheme_qty"],
    purchase_rate: ["purchase_rate", "rate", "cost", "pur_rate", "basic_rate", "net_rate", "price"],
    mrp: ["mrp", "maximum_retail_price", "retail_price"],
    sales_rate: ["sales_rate", "selling_price", "sale_rate", "wsp"],
    discount_percent: ["discount_percent", "disc", "disc_percent", "discount", "trade_discount"],
    gst_percent: ["gst_percent", "gst", "tax", "tax_rate", "tax_percent", "igst"],
    is_new_batch: ["is_new_batch", "new_batch", "create_batch"]
  },

  SALES: {
    invoice_number: ["invoice_number", "invoice_no", "bill_no", "si_no", "sale_no", "receipt_no"],
    status: ["status"],
    invoice_date: ["invoice_date", "date", "bill_date", "sale_date", "entry_date"],
    customer_code: ["customer_code", "cust_code", "party_code", "acc_code"],
    customer_name: ["customer_name", "party", "party_name", "firm_name", "firm", "customer", "buyer"],
    patient_name: ["patient_name", "walk_in_patient", "patient", "consumer"],
    patient_phone: ["patient_phone", "walk_in_phone", "patient_mobile"],
    doctor_name: ["doctor_name", "doctor", "dr_name", "physician", "prescriber"],
    prescription_no: ["prescription_no", "rx_no", "rx", "prescription", "presc_no"],
    bill_type: ["bill_type", "invoice_type", "sale_type"],
    rate_type: ["rate_type", "pricing_type"],
    notes: ["notes", "remarks", "narration", "comment"],
    product_code: ["product_code", "item_code", "code", "sku", "item_no"],
    product_name: ["product_name", "item_name", "item", "medicine", "medicine_name", "description"],
    batch_no: ["batch_no", "batch", "lot", "lot_no", "batch_number"],
    qty: ["qty", "quantity", "sale_qty", "sold_qty", "units"],
    free_qty: ["free_qty", "free", "bonus", "bonus_qty"],
    mrp: ["mrp", "maximum_retail_price", "retail_price"],
    sales_rate: ["sales_rate", "rate", "selling_price", "sale_rate", "price"],
    discount_percent: ["discount_percent", "disc", "disc_percent", "discount", "trade_discount"],
    gst_percent: ["gst_percent", "gst", "tax", "tax_rate", "tax_percent"]
  },

  SALES_RETURNS: {
    return_number: ["return_number", "return_no", "sr_no", "credit_note_no", "cn_no"],
    status: ["status"],
    return_date: ["return_date", "date", "cn_date", "credit_note_date"],
    customer_code: ["customer_code", "cust_code", "party_code"],
    customer_name: ["customer_name", "party_name", "party", "firm", "customer"],
    linked_invoice_number: ["linked_invoice_number", "invoice_number", "sales_invoice", "original_invoice", "ref_invoice"],
    return_reason: ["return_reason", "reason", "return_type"],
    notes: ["notes", "remarks", "narration"],
    product_code: ["product_code", "code", "item_code", "sku"],
    product_name: ["product_name", "item_name", "item", "medicine"],
    batch_no: ["batch_no", "batch", "lot"],
    return_qty: ["return_qty", "qty", "quantity", "returned_qty"],
    return_free_qty: ["return_free_qty", "free_qty", "free"],
    sales_rate: ["sales_rate", "rate", "price", "selling_price"]
  },

  PURCHASE_RETURNS: {
    return_number: ["return_number", "return_no", "pr_no", "debit_note_no", "dn_no", "purchase_return_no"],
    status: ["status"],
    return_date: ["return_date", "date", "dn_date", "debit_note_date", "return_dt"],
    supplier_code: ["supplier_code", "vendor_code", "party_code", "acc_code"],
    supplier_name: ["supplier_name", "vendor_name", "party_name", "firm_name", "party", "firm", "company"],
    division_code: ["division_code", "division", "div_code"],
    linked_invoice_number: [
      "linked_invoice_number", "invoice_number", "purchase_invoice", "original_invoice",
      "ref_invoice", "pi_no", "bill_no", "grn_no"
    ],
    return_reason: ["return_reason", "reason", "return_type"],
    notes: ["notes", "remarks", "narration"],
    product_code: ["product_code", "item_code", "code", "sku", "item_no"],
    product_name: ["product_name", "item_name", "item", "medicine", "medicine_name"],
    batch_no: ["batch_no", "batch", "lot", "lot_no"],
    expiry_date: ["expiry_date", "expiry", "exp", "exp_date"],
    return_qty: ["return_qty", "qty", "quantity", "returned_qty"],
    return_free_qty: ["return_free_qty", "free_qty", "free"],
    purchase_rate: ["purchase_rate", "rate", "cost", "pur_rate", "price"],
    mrp: ["mrp", "maximum_retail_price"],
    gst_percent: ["gst_percent", "gst", "tax", "tax_rate", "tax_percent"]
  },

  PRESCRIPTIONS: {
    prescription_no: ["prescription_no", "rx_no", "rx", "presc_no"],
    prescription_date: ["prescription_date", "date", "rx_date"],
    patient_name: ["patient_name", "patient", "consumer"],
    patient_age: ["patient_age", "age"],
    patient_phone: ["patient_phone", "phone", "mobile", "patient_mobile"],
    doctor_name: ["doctor_name", "doctor", "dr_name", "physician"],
    doctor_reg_number: ["doctor_reg_number", "reg_no", "mci_no", "registration_no"],
    sales_invoice_number: ["sales_invoice_number", "invoice_number", "bill_no", "si_no"],
    notes: ["notes", "remarks"]
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
