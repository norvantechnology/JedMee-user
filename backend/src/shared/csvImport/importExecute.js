const { query, withTransaction } = require("../db");
const { runConfirmPurchaseInvoiceInTx } = require("../../handlers/purchaseInvoices/runConfirmPurchaseCore");
const { runConfirmSalesInvoiceInTx } = require("../../handlers/salesInvoices/runConfirmSalesCore");
const { runConfirmSalesReturnInTx } = require("../../handlers/salesReturns/runConfirmSalesReturnCore");
const { refreshLowStockNotifications } = require("../lowStockInstantNotify");
const { clean, parsePharmacyDateToYmd, parseGst, parseNumber, parseBool } = require("./pharmacyParsers");
const { resolveMfgId, findProductForBatch } = require("./importValidate");
const { validateCustomerPayload } = require("../../handlers/customers/_common");
const { normalizeVendorType } = require("../vendorInput");
const { nextDivisionCode } = require("../divisionsCore");
const { buildProductFields } = require("../productFields");
const { assertProductNameUniquePerMfg } = require("../productUniqueness");
const { getRoleCodeForAccount } = require("../accountRoleProfile");
const {
  validateInvoiceHeader,
  resolvePurchaseParty,
  enrichAndValidateItems,
  insertPurchaseLineItemsMany,
  resolveDueDate,
  resolveDueDateFromDivision
} = require("../../handlers/purchaseInvoices/_common");
const { nextDocNumber } = require("../purchase");
const { nextSalesNumber, clean: sClean, i, n } = require("../sales");
const {
  validateCustomer: validateSalesCustomer,
  validateAndEnrichSalesItems,
  insertSalesLineItemsMany
} = require("../../handlers/salesInvoices/_common");

const IMPORT_SOURCE = "CSV_IMPORT";

async function nextMfgCodeSimple(q, accountId) {
  const r = await q(
    `SELECT code FROM mfg_companies WHERE account_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 250`,
    [accountId]
  );
  let max = 0;
  for (const row of r.rows || []) {
    const s = String(row.code || "").trim().toUpperCase();
    const m = s.match(/^MFG-(\d{4,})$/);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  return `MFG-${String(max + 1).padStart(4, "0")}`;
}

async function nextProductCodeSimple(q, accountId) {
  const r = await q(
    `SELECT code FROM products WHERE account_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 250`,
    [accountId]
  );
  let max = 0;
  for (const row of r.rows || []) {
    const s = String(row.code || "").trim().toUpperCase();
    const m = s.match(/^PRD-(\d{4,})$/);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  return `PRD-${String(max + 1).padStart(4, "0")}`;
}

async function resolveDivisionIdByCode(accountId, code) {
  if (!clean(code)) return null;
  const r = await query(
    `SELECT id FROM divisions WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`,
    [accountId, clean(code)]
  );
  return r.rows?.[0]?.id || null;
}

async function resolveVendorIdByCode(accountId, code) {
  if (!clean(code)) return null;
  const r = await query(
    `SELECT id FROM vendors WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`,
    [accountId, clean(code)]
  );
  return r.rows?.[0]?.id || null;
}

async function resolveCustomerIdByCode(accountId, code) {
  if (!clean(code)) return null;
  const r = await query(
    `SELECT id FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`,
    [accountId, clean(code)]
  );
  return r.rows?.[0]?.id || null;
}

async function resolveProductIdByCode(accountId, code) {
  if (!clean(code)) return null;
  const r = await query(
    `SELECT id FROM products WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`,
    [accountId, clean(code)]
  );
  return r.rows?.[0]?.id || null;
}

async function resolveBatchIdByProductAndBatch(accountId, productId, batchNo) {
  const r = await query(
    `SELECT id FROM product_batches WHERE account_id = $1 AND deleted_at IS NULL AND product_id = $2 AND lower(batch_no) = lower($3) LIMIT 1`,
    [accountId, productId, clean(batchNo)]
  );
  return r.rows?.[0]?.id || null;
}

async function ensureMfg(q, accountId, actorId, code, name, importJobId) {
  const id = await resolveMfgId(q, accountId, code, name);
  if (id) return id;
  const c = clean(code) || (await nextMfgCodeSimple(q, accountId));
  const n = clean(name) || c;
  const ins = await q(
    `INSERT INTO mfg_companies (account_id, code, name, created_by_user_id, import_source, import_job_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [accountId, c.toUpperCase().slice(0, 32), n.slice(0, 150), actorId, IMPORT_SOURCE, importJobId || null]
  );
  return ins.rows[0].id;
}

async function execManufacturer(q, accountId, actorId, data, existingId, strategy, importJobId) {
  const code = clean(data.code) || (await nextMfgCodeSimple(q, accountId));
  const name = clean(data.name);
  const shortName = clean(data.short_name);
  const rackNo = clean(data.rack_no);
  const saleLock = parseBool(data.sale_lock, false);
  const purchaseOrderLock = parseBool(data.purchase_order_lock, false);
  const preventDiscount = parseBool(data.prevent_discount, false);
  const preventFreeQty = parseBool(data.prevent_free_qty, false);
  const outBillLimit = parseNumber(data.out_bill_limit, 0) ?? 0;
  const outDayLimit = parseNumber(data.out_day_limit, 0) ?? 0;
  const creditLimit = parseNumber(data.credit_limit, 0) ?? 0;

  let mainCompanyId = null;
  if (clean(data.main_company_code)) {
    const p = await q(
      `SELECT id FROM mfg_companies WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`,
      [accountId, clean(data.main_company_code)]
    );
    mainCompanyId = p.rows?.[0]?.id || null;
  }

  if (existingId) {
    if (strategy === "SKIP") return { action: "skipped" };
    await q(
      `UPDATE mfg_companies SET
        name = $2, short_name = $3, rack_no = $4, main_company_id = COALESCE($5, main_company_id),
        sale_lock = $6, purchase_order_lock = $7, prevent_discount = $8, prevent_free_qty = $9,
        out_bill_limit = $10, out_day_limit = $11, credit_limit = $12, updated_at = now(),
        import_source = $13, import_job_id = $14
       WHERE id = $1 AND account_id = $15`,
      [
        existingId,
        name,
        shortName || null,
        rackNo || null,
        mainCompanyId,
        saleLock,
        purchaseOrderLock,
        preventDiscount,
        preventFreeQty,
        outBillLimit || null,
        outDayLimit || null,
        creditLimit,
        IMPORT_SOURCE,
        importJobId || null,
        accountId
      ]
    );
    return { action: "updated" };
  }

  await q(
    `INSERT INTO mfg_companies (
      account_id, code, name, short_name, rack_no, main_company_id,
      sale_lock, purchase_order_lock, prevent_discount, prevent_free_qty,
      out_bill_limit, out_day_limit, credit_limit, created_by_user_id, import_source, import_job_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      accountId,
      code.toUpperCase().slice(0, 32),
      name,
      shortName || null,
      rackNo || null,
      mainCompanyId,
      saleLock,
      purchaseOrderLock,
      preventDiscount,
      preventFreeQty,
      outBillLimit || null,
      outDayLimit || null,
      creditLimit,
      actorId,
      IMPORT_SOURCE,
      importJobId || null
    ]
  );
  return { action: "created" };
}

async function execDivision(q, accountId, actorId, data, existingId, strategy, importJobId) {
  const mfgId = await ensureMfg(q, accountId, actorId, data.manufacturer_code, data.manufacturer_name, importJobId);
  let code = clean(data.code).toUpperCase().replace(/\s+/g, "");
  const name = clean(data.name);
  const creditDays = Math.max(0, parseInt(String(data.credit_days ?? 0), 10) || 0);
  const isActive = parseBool(data.is_active, true);
  if (!code) code = await nextDivisionCode(q, accountId);

  if (existingId) {
    if (strategy === "SKIP") return { action: "skipped" };
    await q(
      `UPDATE divisions SET name = $2, short_name = $3, credit_days = $4, is_active = $5, mfg_company_id = $6, updated_at = now(), updated_by_user_id = $7,
       import_source = $8, import_job_id = $9
       WHERE id = $1 AND account_id = $10`,
      [
        existingId,
        name,
        clean(data.short_name) || null,
        creditDays,
        isActive,
        mfgId,
        actorId,
        IMPORT_SOURCE,
        importJobId || null,
        accountId
      ]
    );
    return { action: "updated" };
  }

  const phoneDigits = clean(data.phone).replace(/\D/g, "");
  await q(
    `INSERT INTO divisions (account_id, code, name, short_name, mfg_company_id, phone_country_code, phone_number, email, address, credit_days, is_active, created_by_user_id, updated_by_user_id, import_source, import_job_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14)`,
    [
      accountId,
      code,
      name,
      clean(data.short_name) || null,
      mfgId,
      phoneDigits.length >= 10 ? "+91" : null,
      phoneDigits.length >= 10 ? phoneDigits.slice(-10) : null,
      clean(data.email).toLowerCase() || null,
      clean(data.address) || null,
      creditDays,
      isActive,
      actorId,
      IMPORT_SOURCE,
      importJobId || null
    ]
  );
  return { action: "created" };
}

async function execSupplier(q, accountId, actorId, data, existingId, strategy, importJobId) {
  let code = clean(data.code).toUpperCase();
  const name = clean(data.name);
  if (!code) code = `V-${String(Date.now()).slice(-6)}`;
  const vendorType = normalizeVendorType(data.vendor_type) || "WHOLESALER";
  const creditDays = Math.max(0, parseInt(String(data.credit_days ?? 0), 10) || 0);
  const addr = [clean(data.address), clean(data.city), clean(data.state)].filter(Boolean).join(", ");
  const pincode = clean(data.pincode) || null;
  const notes = clean(data.notes);
  const mainCompany = clean(data.main_brand);
  const gstNumber = clean(data.gst_number) || null;
  const panNumber = clean(data.pan_number) || null;
  const drugLicenseNumber = clean(data.drug_license_number) || null;
  const contactPerson = clean(data.contact_person) || null;
  const isActive = parseBool(data.is_active, true);

  if (existingId) {
    if (strategy === "SKIP") return { action: "skipped" };
    await q(
      `UPDATE vendors SET
         name = $2, short_name = $3, address = $4, notes = $5, main_company = $6, credit_days = $7, vendor_type = $8, is_active = $9,
         gst_number = COALESCE($10, gst_number),
         pan_number = COALESCE($11, pan_number),
         drug_license_number = COALESCE($12, drug_license_number),
         contact_person = COALESCE($13, contact_person),
         pincode = COALESCE($14, pincode),
         updated_at = now(), import_source = $15, import_job_id = $16
       WHERE id = $1 AND account_id = $17`,
      [
        existingId,
        name,
        clean(data.short_name) || null,
        addr || null,
        notes || null,
        mainCompany || null,
        creditDays,
        vendorType,
        isActive,
        gstNumber,
        panNumber,
        drugLicenseNumber,
        contactPerson,
        pincode,
        IMPORT_SOURCE,
        importJobId || null,
        accountId
      ]
    );
    return { action: "updated" };
  }

  await q(
    `INSERT INTO vendors (
       account_id, code, name, short_name, rack_number, main_company, credit_days, vendor_type,
       phone_number, email, address, pincode, gst_number, pan_number, drug_license_number,
       contact_person, notes, is_active, created_by_user_id, import_source, import_job_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      accountId,
      code.slice(0, 32),
      name,
      clean(data.short_name) || null,
      "",
      mainCompany || null,
      creditDays,
      vendorType,
      clean(data.phone).replace(/\D/g, "").slice(0, 15) || null,
      clean(data.email).toLowerCase() || null,
      addr || null,
      pincode,
      gstNumber,
      panNumber,
      drugLicenseNumber,
      contactPerson,
      notes || null,
      isActive,
      actorId,
      IMPORT_SOURCE,
      importJobId || null
    ]
  );
  return { action: "created" };
}

async function execCustomer(q, accountId, actorId, data, existingId, strategy, importJobId) {
  let ct = clean(data.customer_type || "RETAILER").toUpperCase();
  if (ct === "DOCTOR") ct = "OTHER";
  const payload = {
    code: clean(data.code),
    name: clean(data.name),
    short_name: clean(data.short_name),
    phone_country_code: "+91",
    phone_number: clean(data.phone),
    email: clean(data.email),
    address: clean(data.address),
    city: clean(data.city),
    state: clean(data.state),
    pincode: clean(data.pincode),
    customer_type: ct,
    gst_number: clean(data.gst_number),
    drug_license_number: clean(data.drug_license_number),
    dl_expiry_date: data.dl_expiry_date ? parsePharmacyDateToYmd(data.dl_expiry_date) : "",
    credit_days: parseNumber(data.credit_days, 0),
    credit_limit: parseNumber(data.credit_limit, 0),
    discount_percent: parseNumber(data.discount_percent, 0),
    is_active: parseBool(data.is_active, true),
    is_cash_customer: parseBool(data.is_cash_customer, false),
    notes: clean(data.notes)
  };
  const v = validateCustomerPayload(payload, false);
  if (!v.ok) throw new Error(v.errs[0]);

  if (existingId) {
    if (strategy === "SKIP") return { action: "skipped" };
    const o = v.out;
    await q(
      `UPDATE customers SET
        name = $2, short_name = $3, phone_number = $4, email = $5, address = $6, city = $7, state = $8, pincode = $9,
        customer_type = $10::customer_type_enum, gst_number = $11, drug_license_number = $12, dl_expiry_date = $13,
        credit_days = $14, credit_limit = $15, discount_percent = $16, is_active = $17, is_cash_customer = $18, notes = $19, updated_at = now(), updated_by_user_id = $20,
        import_source = $21, import_job_id = $22
       WHERE id = $1 AND account_id = $23`,
      [
        existingId,
        o.name,
        o.shortName || null,
        o.phoneNumber || null,
        o.email || null,
        o.address || null,
        o.city || null,
        o.state || null,
        o.pincode || null,
        o.customerType,
        o.gstNumber || null,
        o.drugLicenseNumber || null,
        o.dlExpiryDate || null,
        o.creditDays,
        o.creditLimit,
        o.discountPercent,
        o.isActive,
        o.isCashCustomer,
        o.notes || null,
        actorId,
        IMPORT_SOURCE,
        importJobId || null,
        accountId
      ]
    );
    return { action: "updated" };
  }

  let code = v.out.code;
  if (!code) {
    const last = await q(
      `SELECT code FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND code ILIKE 'CUS-%' ORDER BY created_at DESC LIMIT 1`,
      [accountId]
    );
    const m = String(last.rows?.[0]?.code || "").match(/^CUS-(\d{4,})$/i);
    const seq = m ? Number(m[1] || 0) + 1 : 1;
    code = `CUS-${String(seq).padStart(4, "0")}`;
  }
  const o = v.out;
  await q(
    `INSERT INTO customers (
      account_id, code, name, short_name, phone_country_code, phone_number, email, address, city, state, pincode,
      customer_type, gst_number, drug_license_number, dl_expiry_date, credit_days, credit_limit, discount_percent,
      is_active, is_cash_customer, notes, created_by_user_id, updated_by_user_id, import_source, import_job_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::customer_type_enum,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22,$23,$24)`,
    [
      accountId,
      code,
      o.name,
      o.shortName || null,
      o.phoneCountryCode || "+91",
      o.phoneNumber || null,
      o.email || null,
      o.address || null,
      o.city || null,
      o.state || null,
      o.pincode || null,
      o.customerType,
      o.gstNumber || null,
      o.drugLicenseNumber || null,
      o.dlExpiryDate || null,
      o.creditDays,
      o.creditLimit,
      o.discountPercent,
      o.isActive,
      o.isCashCustomer,
      o.notes || null,
      actorId,
      IMPORT_SOURCE,
      importJobId || null
    ]
  );
  return { action: "created" };
}

async function execProduct(q, accountId, actorId, data, existingId, strategy, isRetailer, importJobId) {
  let code = clean(data.code);
  if (!code && !existingId) code = await nextProductCodeSimple(q, accountId);
  const name = clean(data.name);
  const divisionId = await resolveDivisionIdByCode(accountId, data.division_code);
  const body = {
    name,
    code,
    drug_name: clean(data.drug_name) || null,
    division_id: divisionId,
    mfg_company_id: (await resolveMfgId(query, accountId, data.manufacturer_code, data.manufacturer_name)) || null,
    packing: clean(data.packing) || null,
    bulk_pack: clean(data.bulk_pack) || null,
    case_pack: clean(data.case_pack) || null,
    conversion_unit: clean(data.conversion_unit) || null,
    stockable: parseBool(data.stockable, true),
    is_discount_enabled: parseBool(data.is_discount_enabled, true),
    is_control: parseBool(data.is_control, false),
    is_otc: parseBool(data.is_otc, true),
    sales_gst: parseGst(data.sales_gst),
    purchase_gst: parseGst(data.purchase_gst),
    sales_scheme: clean(data.sales_scheme) || null,
    scheme_qty_paid: parseNumber(data.scheme_qty_paid, null),
    scheme_qty_free: parseNumber(data.scheme_qty_free, null),
    hsn_code: clean(data.hsn_code) || null,
    rack_location: clean(data.rack_location) || null,
    low_stock_alert_enabled: parseBool(data.low_stock_alert_enabled, false),
    low_stock_threshold: parseNumber(data.low_stock_threshold, 0) ?? 0
  };

  const normalized = await buildProductFields(body, accountId, { partial: false, requireDivision: !isRetailer });
  if (!normalized.ok) throw new Error(normalized.error.message);

  if (existingId) {
    if (strategy === "SKIP") return { action: "skipped" };
    const vals = normalized.values;
    const mfgId = vals.mfg_company_id ?? null;
    const nu = await assertProductNameUniquePerMfg(accountId, name, mfgId, existingId);
    if (!nu.ok) throw new Error(nu.message);
    await q(
      `UPDATE products SET
        drug_name = $2, division_id = $3, mfg_company_id = $4, packing = $5, bulk_pack = $6, case_pack = $7, conversion_unit = $8,
        stockable = $9, is_discount_enabled = $10, is_control = $11, is_otc = $12, sales_gst = $13, purchase_gst = $14,
        sales_scheme = $15, scheme_qty_paid = $16, scheme_qty_free = $17, hsn_code = $18, rack_location = $19,
        low_stock_alert_enabled = $20, low_stock_threshold = $21, updated_at = now(),
        import_source = $22, import_job_id = $23
       WHERE id = $1 AND account_id = $24`,
      [
        existingId,
        vals.drug_name ?? null,
        vals.division_id ?? null,
        mfgId,
        vals.packing ?? null,
        vals.bulk_pack ?? null,
        vals.case_pack ?? null,
        vals.conversion_unit ?? null,
        vals.stockable ?? true,
        vals.is_discount_enabled ?? true,
        vals.is_control ?? false,
        vals.is_otc !== undefined ? vals.is_otc : true,
        vals.sales_gst ?? null,
        vals.purchase_gst ?? null,
        vals.sales_scheme ?? null,
        vals.scheme_qty_paid ?? null,
        vals.scheme_qty_free ?? null,
        vals.hsn_code ?? null,
        vals.rack_location ?? null,
        vals.low_stock_alert_enabled ?? false,
        vals.low_stock_threshold ?? 0,
        IMPORT_SOURCE,
        importJobId || null,
        accountId
      ]
    );
    return { action: "updated" };
  }

  const vals = normalized.values;
  const mfgId = vals.mfg_company_id ?? null;
  const nu = await assertProductNameUniquePerMfg(accountId, name, mfgId, null);
  if (!nu.ok) throw new Error(nu.message);

  await q(
    `INSERT INTO products (
      account_id, code, name, drug_name, division_id, mfg_company_id,
      packing, bulk_pack, case_pack, conversion_unit, stockable, is_discount_enabled, is_control, is_otc, is_half_scheme,
      sales_gst, purchase_gst, sales_scheme, scheme_qty_paid, scheme_qty_free, hsn_code, rack_location,
      low_stock_alert_enabled, low_stock_threshold, created_by_user_id, import_source, import_job_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
    [
      accountId,
      code,
      name,
      vals.drug_name ?? null,
      vals.division_id ?? null,
      mfgId,
      vals.packing ?? null,
      vals.bulk_pack ?? null,
      vals.case_pack ?? null,
      vals.conversion_unit ?? null,
      vals.stockable ?? true,
      vals.is_discount_enabled ?? true,
      vals.is_control ?? false,
      vals.is_otc !== undefined ? vals.is_otc : true,
      vals.sales_gst ?? null,
      vals.purchase_gst ?? null,
      vals.sales_scheme ?? null,
      vals.scheme_qty_paid ?? null,
      vals.scheme_qty_free ?? null,
      vals.hsn_code ?? null,
      vals.rack_location ?? null,
      vals.low_stock_alert_enabled ?? false,
      vals.low_stock_threshold ?? 0,
      actorId,
      IMPORT_SOURCE,
      importJobId || null
    ]
  );
  return { action: "created" };
}

async function execProductBatch(event, accountId, actorId, data, existingId, strategy, isRetailer, importJobId) {
  const batchCreateHandler = require("../../handlers/productBatches/create").handler;
  const expiryDate = parsePharmacyDateToYmd(data.expiry_date);
  const divisionId = await resolveDivisionIdByCode(accountId, data.division_code);
  const vendorId = await resolveVendorIdByCode(accountId, data.supplier_code);

  if (existingId) {
    if (strategy === "SKIP") return { action: "skipped" };
    const lockRes = await query(
      `SELECT EXISTS (
        SELECT 1 FROM inventory_txns WHERE account_id = $1 AND batch_id = $2 AND txn_type::text <> 'OPENING'
      ) AS locked`,
      [accountId, existingId]
    );
    const locked = Boolean(lockRes.rows?.[0]?.locked);
    await query(
      `UPDATE product_batches SET
        mrp = COALESCE($2, mrp),
        purchase_rate = COALESCE($3, purchase_rate),
        sales_rate = COALESCE($4, sales_rate),
        retail_rate = COALESCE($5, retail_rate),
        expiry_date = COALESCE($6, expiry_date),
        barcode = COALESCE(NULLIF($7,''), barcode),
        special_rate_1 = COALESCE($8, special_rate_1),
        special_rate_2 = COALESCE($9, special_rate_2),
        retail_discount_percent = COALESCE($10, retail_discount_percent),
        net_discount_percent = COALESCE($11, net_discount_percent),
        vendor_id = COALESCE($12, vendor_id),
        division_id = COALESCE($13, division_id),
        low_stock_alert_enabled = COALESCE($14, low_stock_alert_enabled),
        low_stock_threshold = COALESCE($15, low_stock_threshold),
        import_job_id = $16,
        import_source = $17,
        updated_at = now()
       WHERE id = $1 AND account_id = $18`,
      [
        existingId,
        parseNumber(data.mrp, null),
        parseNumber(data.purchase_rate, null),
        parseNumber(data.sales_rate, null),
        parseNumber(data.retail_rate, null),
        expiryDate,
        clean(data.barcode),
        parseNumber(data.special_rate_1, null),
        parseNumber(data.special_rate_2, null),
        parseNumber(data.retail_discount_percent, null),
        parseNumber(data.net_discount_percent, null),
        vendorId,
        divisionId,
        data.low_stock_alert_enabled !== undefined ? parseBool(data.low_stock_alert_enabled, false) : null,
        parseNumber(data.low_stock_threshold, null),
        importJobId || null,
        IMPORT_SOURCE,
        accountId
      ]
    );
    if (!locked) {
      const oq = parseNumber(data.opening_stock, 0) ?? 0;
      const of = parseNumber(data.open_stock_free_qty, 0) ?? 0;
      await query(`DELETE FROM inventory_txns WHERE account_id = $1 AND batch_id = $2 AND txn_type::text = 'OPENING'`, [accountId, existingId]);
      await query(
        `INSERT INTO inventory_txns (account_id, batch_id, txn_type, qty, free_qty, note, created_by_user_id, import_job_id)
         VALUES ($1,$2,'OPENING',$3,$4,'CSV import', $5, $6)`,
        [accountId, existingId, oq, of, actorId, importJobId || null]
      );
    }
    return { action: "updated" };
  }

  const body = {
    productCode: clean(data.product_code),
    productName: clean(data.product_name),
    drugName: clean(data.drug_name),
    batchNo: clean(data.batch_no),
    barcode: clean(data.barcode),
    expiryDate,
    mfgDate: data.mfg_date ? parsePharmacyDateToYmd(data.mfg_date) : "",
    mrp: data.mrp,
    purchaseRate: data.purchase_rate,
    salesRate: data.sales_rate,
    retailRate: data.retail_rate,
    specialRate1: data.special_rate_1,
    specialRate2: data.special_rate_2,
    retailDiscountPercent: data.retail_discount_percent,
    netDiscountPercent: data.net_discount_percent,
    openingStock: data.opening_stock ?? 0,
    openStockFreeQty: data.open_stock_free_qty ?? 0,
    divisionId: divisionId || undefined,
    vendorId: vendorId || undefined,
    lowStockAlertEnabled: parseBool(data.low_stock_alert_enabled, false),
    lowStockThreshold: data.low_stock_threshold ?? 0,
    looseStock: data.loose_stock,
    looseUnitName: data.loose_unit_name,
    isHold: parseBool(data.is_hold, false)
  };

  const res = await batchCreateHandler({
    headers: event.headers,
    httpMethod: "POST",
    body: JSON.stringify(body)
  });
  const payload = JSON.parse(res.body || "{}");
  if (res.statusCode >= 400) {
    const msg = payload?.error?.message || payload?.message || "Batch create failed";
    throw new Error(msg);
  }
  const batchId =
    payload?.data?.batch?.id || payload?.data?.id || payload?.batch?.id || null;
  if (batchId) {
    await query(
      `UPDATE product_batches SET import_source = $2, import_job_id = $3 WHERE id = $1 AND account_id = $4`,
      [batchId, IMPORT_SOURCE, importJobId || null, accountId]
    );
  }
  return { action: "created" };
}

/** Fix resolveMfgId - importValidate passes q wrong. Here we use query wrapper. */
async function resolveMfgIdQ(q, accountId, code, name) {
  return resolveMfgId(q, accountId, code, name);
}

async function execPrescription(q, accountId, actorId, data) {
  const patientName = clean(data.patient_name);
  const prescDate = data.prescription_date ? parsePharmacyDateToYmd(data.prescription_date) : null;
  let salesInvoiceId = null;
  if (clean(data.sales_invoice_number)) {
    const inv = await q(
      `SELECT id FROM sales_invoices WHERE account_id = $1 AND invoice_number = $2 LIMIT 1`,
      [accountId, clean(data.sales_invoice_number)]
    );
    salesInvoiceId = inv.rows?.[0]?.id || null;
  }
  await q(
    `INSERT INTO prescriptions (
      account_id, sales_invoice_id, prescription_no, doctor_name, doctor_reg_number,
      patient_name, patient_age, patient_phone, prescription_date, notes, created_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      accountId,
      salesInvoiceId,
      clean(data.prescription_no) || null,
      clean(data.doctor_name) || null,
      clean(data.doctor_reg_number) || null,
      patientName,
      parseNumber(data.patient_age, null),
      clean(data.patient_phone) || null,
      prescDate,
      clean(data.notes) || null,
      actorId
    ]
  );
  return { action: "created" };
}

function apiFailMessage(errResp) {
  if (!errResp) return "Operation failed";
  try {
    const raw = errResp.body;
    const b = typeof raw === "string" ? JSON.parse(raw) : raw;
    return b?.error?.message || b?.message || "Operation failed";
  } catch {
    return "Operation failed";
  }
}

function wantConfirmedDoc(row) {
  const s = String(row?.status ?? "")
    .trim()
    .toUpperCase();
  return s === "CONFIRMED" || s === "POSTED" || s === "FINAL";
}

function groupRows(entries, keyFn) {
  const m = new Map();
  for (const e of entries) {
    const k = keyFn(e.data);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  }
  return m;
}

/** Resolve product id by code first, then by name fallback. */
async function resolveProductId(accountId, productCode, productName) {
  const byCode = await resolveProductIdByCode(accountId, productCode);
  if (byCode) return byCode;
  if (clean(productName)) {
    const r = await query(
      `SELECT id FROM products WHERE account_id = $1 AND deleted_at IS NULL AND lower(name) = lower($2) LIMIT 1`,
      [accountId, clean(productName)]
    );
    return r.rows?.[0]?.id || null;
  }
  return null;
}

/** Resolve vendor id by code first, then by name fallback. */
async function resolveVendorId(accountId, supplierCode, supplierName) {
  const byCode = await resolveVendorIdByCode(accountId, supplierCode);
  if (byCode) return byCode;
  if (clean(supplierName)) {
    const r = await query(
      `SELECT id FROM vendors WHERE account_id = $1 AND deleted_at IS NULL AND lower(name) = lower($2) LIMIT 1`,
      [accountId, clean(supplierName)]
    );
    return r.rows?.[0]?.id || null;
  }
  return null;
}

async function execPurchaseGroups(event, accountId, actorId, entries, importJobId) {
  const groups = groupRows(entries, (d) => clean(d.invoice_number));
  let created = 0;
  for (const [, lines] of groups) {
    const first = lines[0].data;
    const confirmAfter = wantConfirmedDoc(first);
    const invoiceDate = parsePharmacyDateToYmd(first.invoice_date);
    const dueDate = first.due_date ? parsePharmacyDateToYmd(first.due_date) : null;
    const vendorId = await resolveVendorId(accountId, first.supplier_code, first.supplier_name);
    const divisionId = await resolveDivisionIdByCode(accountId, first.division_code);
    const headerBody = {
      invoiceNumber: clean(first.invoice_number),
      vendorInvoiceNumber: clean(first.vendor_invoice_number),
      vendorId: vendorId || undefined,
      divisionId: divisionId || undefined,
      invoiceDate,
      dueDate,
      notes: clean(first.notes)
    };
    const itemsInput = [];
    for (const { data: d } of lines) {
      const pid = await resolveProductId(accountId, d.product_code, d.product_name);
      if (!pid) throw new Error(`Unknown product: ${d.product_code || d.product_name}`);
      itemsInput.push({
        productId: pid,
        batchNo: clean(d.batch_no),
        expiryDate: parsePharmacyDateToYmd(d.expiry_date),
        qty: parseNumber(d.qty, 0),
        freeQty: parseNumber(d.free_qty, 0) ?? 0,
        purchaseRate: parseNumber(d.purchase_rate, 0),
        mrp: parseNumber(d.mrp, 0),
        salesRate: parseNumber(d.sales_rate, 0) ?? 0,
        discountPercent: parseNumber(d.discount_percent, 0) ?? 0,
        gstPercent: parseGst(d.gst_percent) ?? 0,
        isNewBatch: parseBool(d.is_new_batch, true)
      });
    }

    const data = await withTransaction(async (q) => {
      const h = await validateInvoiceHeader({ ...headerBody, clientToday: new Date().toISOString().slice(0, 10) });
      if (!h.ok) return { err: new Error(h.message) };
      const party = await resolvePurchaseParty(q, accountId, h.header);
      if (!party.ok) return { err: new Error(party.message) };
      const itemsRes = await enrichAndValidateItems(q, accountId, party, itemsInput);
      if (!itemsRes.ok) return { err: new Error(itemsRes.message) };
      const invoiceNumber = h.header.invoiceNumber || (await nextDocNumber(q, "purchase_invoices", "PI", accountId));
      const resolvedDueDate =
        party.mode === "division"
          ? resolveDueDateFromDivision(h.header.invoiceDate, h.header.dueDate, party.creditSource)
          : resolveDueDate(h.header.invoiceDate, h.header.dueDate, party.creditSource);
      const t = itemsRes.totals;
      const ins = await q(
        `INSERT INTO purchase_invoices (
          account_id, invoice_number, vendor_invoice_number, vendor_id, division_id, division_name,
          purchase_source, invoice_date, due_date, status, payment_status, subtotal, total_discount, total_gst, total_amount,
          amount_paid, balance_due, notes, created_by_user_id, updated_by_user_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT','UNPAID',$10,$11,$12,$13,0,$13,$14,$15,$15) RETURNING *`,
        [
          accountId,
          invoiceNumber,
          h.header.vendorInvoiceNumber,
          party.vendorId,
          party.divisionId,
          party.divisionName,
          party.mode === "division" ? "DIVISION" : "VENDOR",
          h.header.invoiceDate,
          resolvedDueDate,
          t.subtotal,
          t.totalDiscount,
          t.totalGst,
          t.totalAmount,
          h.header.notes,
          actorId
        ]
      );
      const inv = ins.rows?.[0];
      await insertPurchaseLineItemsMany(q, accountId, inv.id, itemsRes.items);
      if (confirmAfter) {
        const cres = await runConfirmPurchaseInvoiceInTx(q, { accountId, actorId }, inv.id, null);
        if (cres?.err) return { err: new Error(apiFailMessage(cres.err)) };
        return { invoiceId: inv.id, affectedBatchIds: cres.affectedBatchIds || [] };
      }
      return { invoiceId: inv.id };
    });
    if (data?.err) throw data.err;
    if (confirmAfter) await refreshLowStockNotifications(accountId, data.affectedBatchIds || []);
    created += 1;
  }
  return created;
}

async function execSalesGroups(event, accountId, actorId, entries, importJobId) {
  const groups = groupRows(entries, (d) => clean(d.invoice_number));
  let created = 0;
  const looseUnitFactor = 10;

  for (const [, lines] of groups) {
    const first = lines[0].data;
    const confirmAfter = wantConfirmedDoc(first);
    const invoiceDate = parsePharmacyDateToYmd(first.invoice_date);
    let customerId = await resolveCustomerIdByCode(accountId, first.customer_code);
    if (!customerId && clean(first.customer_name)) {
      const r = await query(
        `SELECT id FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND lower(name) = lower($2) LIMIT 1`,
        [accountId, clean(first.customer_name)]
      );
      customerId = r.rows?.[0]?.id || null;
    }
    if (!customerId) {
      const w = await query(
        `SELECT id FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND is_walk_in = true ORDER BY created_at ASC LIMIT 1`,
        [accountId]
      );
      customerId = w.rows?.[0]?.id || null;
    }
    if (!customerId) throw new Error("customer_code not found for invoice " + clean(first.invoice_number));

    const custFlags = await query(`SELECT is_walk_in FROM customers WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [
      customerId,
      accountId
    ]);
    const isWalkInSale = Boolean(custFlags.rows?.[0]?.is_walk_in);

    const items = [];
    for (const { data: d } of lines) {
      const pid = await resolveProductId(accountId, d.product_code, d.product_name);
      if (!pid) throw new Error(`Unknown product: ${d.product_code || d.product_name}`);
      const bid = await resolveBatchIdByProductAndBatch(accountId, pid, d.batch_no);
      if (!bid) throw new Error(`Batch ${d.batch_no} not found for product ${d.product_code || d.product_name}`);
      items.push({
        productId: pid,
        batchId: bid,
        qty: i(d.qty),
        freeQty: i(d.free_qty || 0),
        mrp: n(d.mrp),
        salesRate: n(d.sales_rate),
        discountPercent: n(d.discount_percent || 0),
        gstPercent: parseGst(d.gst_percent) ?? 0
      });
    }

    const data = await withTransaction(async (q) => {
      const c = await validateSalesCustomer(q, accountId, customerId);
      if (!c.ok) return { err: new Error(c.message) };
      const ivNo = clean(first.invoice_number) || (await nextSalesNumber(q, accountId, "sales_invoices", "SI"));
      const rateType = sClean(first.rate_type) || "SALES_RATE";
      const billType = sClean(first.bill_type) || "CASH_MEMO";
      const iRes = await validateAndEnrichSalesItems(q, accountId, items, {
        rateType,
        globalDiscountPercent: 0,
        looseUnitFactor
      });
      if (!iRes.ok) return { err: new Error(iRes.message) };
      const dueDate = invoiceDate;
      const inv = await q(
        `INSERT INTO sales_invoices (
           account_id, invoice_number, customer_id, customer_name, customer_gst, customer_drug_license,
           invoice_date, due_date, status, payment_status, subtotal, total_discount, total_gst, total_amount,
           amount_paid, balance_due, round_off, notes, created_by_user_id,
           is_walk_in_sale, walk_in_patient_name, walk_in_patient_phone, walk_in_doctor_name, walk_in_prescription_no,
           rate_type, bill_type, global_discount_percent
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT'::sales_invoice_status,'UNPAID'::sales_payment_status,$9,$10,$11,$12,0,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING *`,
        [
          accountId,
          ivNo,
          c.customer.id,
          c.customer.name,
          c.customer.gst_number || null,
          c.customer.drug_license_number || null,
          invoiceDate,
          dueDate,
          iRes.totals.subtotal,
          iRes.totals.totalDiscount,
          iRes.totals.totalGst,
          iRes.totals.totalAmount,
          iRes.totals.roundOff,
          clean(first.notes) || null,
          actorId,
          isWalkInSale,
          clean(first.patient_name) || null,
          clean(first.patient_phone) || null,
          null,
          null,
          rateType,
          billType,
          0
        ]
      );
      const invoice = inv.rows?.[0];
      await insertSalesLineItemsMany(q, accountId, invoice.id, iRes.items);
      if (confirmAfter) {
        const cres = await runConfirmSalesInvoiceInTx(q, { accountId, actorId }, invoice.id);
        if (cres?.err) return { err: new Error(apiFailMessage(cres.err)) };
        return { invoiceId: invoice.id, affectedBatchIds: cres.affectedBatchIds || [] };
      }
      return { invoiceId: invoice.id };
    });
    if (data?.err) throw data.err;
    if (confirmAfter) await refreshLowStockNotifications(accountId, data.affectedBatchIds || []);
    created += 1;
  }
  return created;
}

async function execSalesReturnGroups(accountId, actorId, entries, importJobId) {
  const groups = groupRows(entries, (d) => clean(d.return_number));
  let created = 0;
  for (const [, lines] of groups) {
    const first = lines[0].data;
    const returnDate = parsePharmacyDateToYmd(first.return_date);
    let customerId = await resolveCustomerIdByCode(accountId, first.customer_code);
    if (!customerId && clean(first.customer_name)) {
      const r = await query(
        `SELECT id FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND lower(name) = lower($2) LIMIT 1`,
        [accountId, clean(first.customer_name)]
      );
      customerId = r.rows?.[0]?.id || null;
    }
    if (!customerId) {
      const w = await query(
        `SELECT id FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND is_walk_in = true ORDER BY created_at ASC LIMIT 1`,
        [accountId]
      );
      customerId = w.rows?.[0]?.id || null;
    }
    if (!customerId) throw new Error("customer not found for return " + clean(first.return_number));
    const confirmAfter = wantConfirmedDoc(first);
    let reason = sClean(first.return_reason || "OTHER")
      .toUpperCase()
      .replace("PATIENT_REFUSED", "PATIENT_RETURNED");
    if (!["EXPIRED", "DAMAGED", "WRONG_PRODUCT", "EXCESS", "PATIENT_RETURNED", "OTHER"].includes(reason)) reason = "OTHER";
    let salesInvoiceId = null;
    if (clean(first.linked_invoice_number)) {
      const inv = await query(
        `SELECT id FROM sales_invoices WHERE account_id = $1 AND invoice_number = $2 LIMIT 1`,
        [accountId, clean(first.linked_invoice_number)]
      );
      salesInvoiceId = inv.rows?.[0]?.id || null;
    }

    const data = await withTransaction(async (q) => {
      const c = await q(`SELECT * FROM customers WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [
        customerId,
        accountId
      ]);
      const customer = c.rows?.[0];
      if (!customer) return { err: new Error("Customer not found") };
      const number = clean(first.return_number) || (await nextSalesNumber(q, accountId, "sales_returns", "SR"));
      const rs = await q(
        `INSERT INTO sales_returns (
           account_id, return_number, sales_invoice_id, customer_id, customer_name, return_date, return_reason, status, notes, created_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::sales_return_reason,'DRAFT'::sales_return_status,$8,$9) RETURNING *`,
        [accountId, number, salesInvoiceId, customer.id, customer.name, returnDate, reason, clean(first.notes) || null, actorId]
      );
      const ret = rs.rows?.[0];
      for (const { data: d } of lines) {
          const pid = await resolveProductId(accountId, d.product_code, d.product_name);
          if (!pid) return { err: new Error(`Unknown product: ${d.product_code || d.product_name}`) };
          const bid = await resolveBatchIdByProductAndBatch(accountId, pid, d.batch_no);
          if (!bid) return { err: new Error(`Batch not found: ${d.batch_no}`) };
        const pb = await q(
          `SELECT pb.batch_no, pb.expiry_date, p.name AS product_name, p.mfg_company_id
           FROM product_batches pb JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
           WHERE pb.id = $1 AND pb.product_id = $2 AND pb.account_id = $3 LIMIT 1`,
          [bid, pid, accountId]
        );
        const row = pb.rows?.[0];
        const returnQty = i(d.return_qty);
        const netRate = n(d.sales_rate);
        const returnAmount = Number((returnQty * netRate).toFixed(4));
        await q(
          `INSERT INTO sales_return_items (
            account_id, sales_return_id, product_id, product_name, batch_id, batch_no, expiry_date,
            mfg_company_id, return_qty, return_free_qty, sales_rate, net_rate, return_amount
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            accountId,
            ret.id,
            pid,
            row.product_name,
            bid,
            row.batch_no,
            row.expiry_date,
            row.mfg_company_id || null,
            returnQty,
            i(d.return_free_qty || 0),
            netRate,
            netRate,
            returnAmount
          ]
        );
      }
      if (confirmAfter) {
        const cres = await runConfirmSalesReturnInTx(q, { accountId, actorId }, ret.id);
        if (cres?.err) return { err: new Error(apiFailMessage(cres.err)) };
        return { returnId: ret.id, affectedBatchIds: cres.affectedBatchIds || [] };
      }
      return { returnId: ret.id };
    });
    if (data?.err) throw data.err;
    if (confirmAfter) await refreshLowStockNotifications(accountId, data.affectedBatchIds || []);
    created += 1;
  }
  return created;
}

/**
 * Execute PURCHASE_RETURNS import.
 * Groups rows by return_number, creates purchase_return + items, optionally confirms.
 */
async function execPurchaseReturnGroups(accountId, actorId, entries, importJobId) {
  const groups = groupRows(entries, (d) => clean(d.return_number) || `__auto_${Math.random()}`);
  let created = 0;

  for (const [, lines] of groups) {
    const first = lines[0].data;
    const confirmAfter = wantConfirmedDoc(first);
    const returnDate = parsePharmacyDateToYmd(first.return_date);
    const vendorId = await resolveVendorId(accountId, first.supplier_code, first.supplier_name);
    const divisionId = await resolveDivisionIdByCode(accountId, first.division_code);

    // Resolve linked purchase invoice
    let purchaseInvoiceId = null;
    if (clean(first.linked_invoice_number)) {
      const inv = await query(
        `SELECT id FROM purchase_invoices WHERE account_id = $1 AND invoice_number = $2 LIMIT 1`,
        [accountId, clean(first.linked_invoice_number)]
      );
      purchaseInvoiceId = inv.rows?.[0]?.id || null;
    }

    // Normalise return reason
    let reason = String(first.return_reason || "OTHER").trim().toUpperCase();
    const validReasons = ["DAMAGED", "EXPIRED", "EXCESS", "QUALITY_ISSUE", "OTHER"];
    if (!validReasons.includes(reason)) reason = "OTHER";

    const data = await withTransaction(async (q) => {
      // Resolve vendor name for denormalisation
      let vendorName = clean(first.supplier_name) || null;
      if (vendorId && !vendorName) {
        const vr = await q(`SELECT name FROM vendors WHERE id = $1 AND account_id = $2 LIMIT 1`, [vendorId, accountId]);
        vendorName = vr.rows?.[0]?.name || null;
      }

      // Auto-generate return number if not provided
      const returnNumber = clean(first.return_number) || (await (async () => {
        const last = await q(
          `SELECT return_number FROM purchase_returns WHERE account_id = $1 AND return_number ILIKE 'PR-%' ORDER BY created_at DESC LIMIT 1`,
          [accountId]
        );
        const m = String(last.rows?.[0]?.return_number || "").match(/^PR-(\d{4,})$/i);
        const seq = m ? Number(m[1]) + 1 : 1;
        return `PR-${String(seq).padStart(4, "0")}`;
      })());

      // Calculate totals from line items
      let subtotal = 0;
      let totalGst = 0;
      const itemRows = [];

      for (const { data: d } of lines) {
        const pid = await resolveProductId(accountId, d.product_code, d.product_name);
        if (!pid) return { err: new Error(`Unknown product: ${d.product_code || d.product_name}`) };
        const bid = await resolveBatchIdByProductAndBatch(accountId, pid, d.batch_no);
        if (!bid) return { err: new Error(`Batch not found: ${d.batch_no}`) };

        const pb = await q(
          `SELECT pb.batch_no, pb.expiry_date, p.name AS product_name, p.mfg_company_id
           FROM product_batches pb JOIN products p ON p.id = pb.product_id AND p.account_id = pb.account_id
           WHERE pb.id = $1 AND pb.product_id = $2 AND pb.account_id = $3 LIMIT 1`,
          [bid, pid, accountId]
        );
        const batchRow = pb.rows?.[0];
        const returnQty = parseNumber(d.return_qty, 0) ?? 0;
        const returnFreeQty = parseNumber(d.return_free_qty, 0) ?? 0;
        const purchaseRate = parseNumber(d.purchase_rate, 0) ?? 0;
        const mrp = parseNumber(d.mrp, 0) ?? 0;
        const gstPct = parseGst(d.gst_percent) ?? 0;
        const lineAmount = Number((returnQty * purchaseRate).toFixed(4));
        const lineGst = Number((lineAmount * gstPct / 100).toFixed(4));
        subtotal += lineAmount;
        totalGst += lineGst;
        itemRows.push({ pid, bid, batchRow, returnQty, returnFreeQty, purchaseRate, mrp, gstPct, lineAmount, lineGst });
      }

      const totalAmount = Number((subtotal + totalGst).toFixed(4));

      const ins = await q(
        `INSERT INTO purchase_returns (
           account_id, return_number, vendor_id, vendor_name, division_id, purchase_invoice_id,
           return_date, return_reason, status, purchase_source,
           subtotal, total_gst, total_amount, notes, created_by_user_id, updated_by_user_id,
           import_source, import_job_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::purchase_return_reason,'DRAFT',$9,$10,$11,$12,$13,$14,$14,$15,$16)
         RETURNING *`,
        [
          accountId,
          returnNumber,
          vendorId || null,
          vendorName,
          divisionId || null,
          purchaseInvoiceId,
          returnDate,
          reason,
          vendorId ? "VENDOR" : "DIVISION",
          subtotal,
          totalGst,
          totalAmount,
          clean(first.notes) || null,
          actorId,
          IMPORT_SOURCE,
          importJobId || null
        ]
      );
      const ret = ins.rows?.[0];

      for (const item of itemRows) {
        const { pid, bid, batchRow, returnQty, returnFreeQty, purchaseRate, mrp, gstPct, lineAmount } = item;
        await q(
          `INSERT INTO purchase_return_items (
             account_id, purchase_return_id, product_id, product_name, batch_id, batch_no, expiry_date,
             mfg_company_id, return_qty, return_free_qty, purchase_rate, mrp, gst_percent, return_amount
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            accountId,
            ret.id,
            pid,
            batchRow?.product_name || null,
            bid,
            batchRow?.batch_no || null,
            batchRow?.expiry_date || null,
            batchRow?.mfg_company_id || null,
            returnQty,
            returnFreeQty,
            purchaseRate,
            mrp,
            gstPct,
            lineAmount
          ]
        );
      }

      if (confirmAfter) {
        // Confirm if the handler exists; gracefully leave as DRAFT if not yet implemented
        try {
          const confirmMod = require("../../handlers/purchaseReturns/runConfirmPurchaseReturnCore");
          const cres = await confirmMod.runConfirmPurchaseReturnInTx(q, { accountId, actorId }, ret.id);
          if (cres?.err) return { err: new Error(apiFailMessage(cres.err)) };
          return { returnId: ret.id, affectedBatchIds: cres.affectedBatchIds || [] };
        } catch (e) {
          if (e.code !== "MODULE_NOT_FOUND") return { err: e };
          return { returnId: ret.id }; // handler not yet available — leave as DRAFT
        }
      }
      return { returnId: ret.id };
    });

    if (data?.err) throw data.err;
    if (confirmAfter && data.affectedBatchIds?.length) {
      await refreshLowStockNotifications(accountId, data.affectedBatchIds);
    }
    created += 1;
  }
  return created;
}

async function runImportExecute(event, ctx, validation, duplicateStrategy, skipErrors) {
  const { accountId, actorId, importJobId } = ctx;
  const entityType = validation.entityType;
  const isRetailer = (await getRoleCodeForAccount(accountId)) === "RETAILER";
  const stats = { created: 0, updated: 0, skipped: 0, errors: [] };

  const tryRow = async (fn) => {
    try {
      const r = await fn();
      if (r.action === "created") stats.created += 1;
      else if (r.action === "updated") stats.updated += 1;
      else if (r.action === "skipped") stats.skipped += 1;
    } catch (e) {
      stats.errors.push(String(e.message || e));
      if (!skipErrors) throw e;
    }
  };

  const runList = async (list, isUpdate) => {
    for (const entry of list) {
      const { data, existing } = entry;
      const exId = existing?.id || null;
      await tryRow(async () => {
        return withTransaction(async (q) => {
          if (entityType === "MANUFACTURERS") return execManufacturer(q, accountId, actorId, data, exId, duplicateStrategy, importJobId);
          if (entityType === "DIVISIONS") return execDivision(q, accountId, actorId, data, exId, duplicateStrategy, importJobId);
          if (entityType === "SUPPLIERS") return execSupplier(q, accountId, actorId, data, exId, duplicateStrategy, importJobId);
          if (entityType === "CUSTOMERS") return execCustomer(q, accountId, actorId, data, exId, duplicateStrategy, importJobId);
          if (entityType === "PRODUCTS") return execProduct(q, accountId, actorId, data, exId, duplicateStrategy, isRetailer, importJobId);
          if (entityType === "PRODUCT_BATCHES") return execProductBatch(event, accountId, actorId, data, exId, duplicateStrategy, isRetailer, importJobId);
          if (entityType === "PRESCRIPTIONS") return execPrescription(q, accountId, actorId, data);
          return { action: "skipped" };
        });
      });
    }
  };

  if (entityType === "PURCHASES") {
    try {
      const n = await execPurchaseGroups(event, accountId, actorId, validation.valid || [], importJobId);
      stats.created += n;
    } catch (e) {
      stats.errors.push(String(e.message || e));
      if (!skipErrors) throw e;
    }
    return stats;
  }
  if (entityType === "SALES") {
    try {
      const n = await execSalesGroups(event, accountId, actorId, validation.valid || [], importJobId);
      stats.created += n;
    } catch (e) {
      stats.errors.push(String(e.message || e));
      if (!skipErrors) throw e;
    }
    return stats;
  }
  if (entityType === "SALES_RETURNS") {
    try {
      const n = await execSalesReturnGroups(accountId, actorId, validation.valid || [], importJobId);
      stats.created += n;
    } catch (e) {
      stats.errors.push(String(e.message || e));
      if (!skipErrors) throw e;
    }
    return stats;
  }
  if (entityType === "PURCHASE_RETURNS") {
    try {
      const n = await execPurchaseReturnGroups(accountId, actorId, validation.valid || [], importJobId);
      stats.created += n;
    } catch (e) {
      stats.errors.push(String(e.message || e));
      if (!skipErrors) throw e;
    }
    return stats;
  }

  if (duplicateStrategy === "SKIP") {
    stats.skipped += (validation.updates || []).length;
  } else {
    await runList(validation.updates || [], true);
  }
  await runList(validation.valid || [], false);

  return stats;
}

module.exports = { runImportExecute };
