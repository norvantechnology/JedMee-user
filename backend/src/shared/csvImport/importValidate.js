const { clean, parsePharmacyDateToYmd, parseGst, parseNumber, parseBool } = require("./pharmacyParsers");
const { REQUIRED_HINTS } = require("./fieldMeta");

function basicRequired(entityType, data) {
  const reqs = REQUIRED_HINTS[entityType] || [];
  const miss = [];
  for (const k of reqs) {
    const v = data[k];
    if (v === undefined || v === null || String(v).trim() === "") {
      if (entityType === "PRODUCT_BATCHES" && k === "product_code" && String(data.product_name || "").trim()) continue;
      if (entityType === "DIVISIONS" && k === "manufacturer_code" && String(data.manufacturer_name || "").trim()) continue;
      miss.push(k);
    }
  }
  return miss;
}

async function findExistingManufacturer(q, accountId, row) {
  const code = clean(row.code);
  const name = clean(row.name);
  if (code) {
    const r = await q(
      `SELECT id FROM mfg_companies WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`,
      [accountId, code]
    );
    if (r.rows?.[0]) return r.rows[0];
  }
  if (name) {
    const r = await q(
      `SELECT id FROM mfg_companies WHERE account_id = $1 AND deleted_at IS NULL AND lower(name) = lower($2) LIMIT 1`,
      [accountId, name]
    );
    if (r.rows?.[0]) return r.rows[0];
  }
  return null;
}

async function findExistingDivision(q, accountId, row) {
  const code = clean(row.code);
  if (code) {
    const r = await q(
      `SELECT id FROM divisions WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`,
      [accountId, code]
    );
    if (r.rows?.[0]) return r.rows[0];
  }
  return null;
}

async function findExistingVendor(q, accountId, row) {
  const code = clean(row.code);
  const name = clean(row.name);
  if (code) {
    const r = await q(`SELECT id FROM vendors WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`, [
      accountId,
      code
    ]);
    if (r.rows?.[0]) return r.rows[0];
  }
  if (name) {
    const r = await q(`SELECT id FROM vendors WHERE account_id = $1 AND deleted_at IS NULL AND lower(name) = lower($2) LIMIT 1`, [
      accountId,
      name
    ]);
    if (r.rows?.[0]) return r.rows[0];
  }
  return null;
}

async function findExistingCustomer(q, accountId, row) {
  const code = clean(row.code);
  if (code) {
    const r = await q(
      `SELECT id FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`,
      [accountId, code]
    );
    if (r.rows?.[0]) return r.rows[0];
  }
  const name = clean(row.name);
  const phone = clean(row.phone).replace(/\D+/g, "");
  if (name && phone.length >= 10) {
    const r = await q(
      `SELECT id FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND lower(name) = lower($2) AND regexp_replace(phone_number, '\\D', '', 'g') = $3 LIMIT 1`,
      [accountId, name, phone.slice(-10)]
    );
    if (r.rows?.[0]) return r.rows[0];
  }
  if (name) {
    const r = await q(
      `SELECT id FROM customers WHERE account_id = $1 AND deleted_at IS NULL AND lower(name) = lower($2) LIMIT 1`,
      [accountId, name]
    );
    if (r.rows?.[0]) return r.rows[0];
  }
  return null;
}

async function resolveMfgId(q, accountId, code, name) {
  if (clean(code)) {
    const r = await q(
      `SELECT id FROM mfg_companies WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`,
      [accountId, clean(code)]
    );
    if (r.rows?.[0]) return r.rows[0].id;
  }
  if (clean(name)) {
    const r = await q(
      `SELECT id FROM mfg_companies WHERE account_id = $1 AND deleted_at IS NULL AND lower(name) = lower($2) LIMIT 1`,
      [accountId, clean(name)]
    );
    if (r.rows?.[0]) return r.rows[0].id;
  }
  return null;
}

async function findExistingProduct(q, accountId, row, mfgId) {
  const code = clean(row.code);
  if (code) {
    const r = await q(
      `SELECT id FROM products WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`,
      [accountId, code]
    );
    if (r.rows?.[0]) return r.rows[0];
  }
  const name = clean(row.name);
  if (name && mfgId) {
    const r = await q(
      `SELECT id FROM products WHERE account_id = $1 AND deleted_at IS NULL AND mfg_company_id = $2 AND lower(name) = lower($3) LIMIT 1`,
      [accountId, mfgId, name]
    );
    if (r.rows?.[0]) return r.rows[0];
  }
  if (name && !mfgId) {
    const r = await q(
      `SELECT id FROM products WHERE account_id = $1 AND deleted_at IS NULL AND mfg_company_id IS NULL AND lower(name) = lower($2) LIMIT 1`,
      [accountId, name]
    );
    if (r.rows?.[0]) return r.rows[0];
  }
  return null;
}

async function findProductForBatch(q, accountId, productCode, productName) {
  if (clean(productCode)) {
    const r = await q(
      `SELECT id FROM products WHERE account_id = $1 AND deleted_at IS NULL AND lower(code) = lower($2) LIMIT 1`,
      [accountId, clean(productCode)]
    );
    if (r.rows?.[0]) return r.rows[0];
  }
  if (clean(productName)) {
    const r = await q(
      `SELECT id FROM products WHERE account_id = $1 AND deleted_at IS NULL AND lower(name) = lower($2) LIMIT 1`,
      [accountId, clean(productName)]
    );
    if (r.rows?.[0]) return r.rows[0];
  }
  return null;
}

async function findExistingBatch(q, accountId, productId, batchNo) {
  const r = await q(
    `SELECT id FROM product_batches WHERE account_id = $1 AND deleted_at IS NULL AND product_id = $2 AND lower(batch_no) = lower($3) LIMIT 1`,
    [accountId, productId, clean(batchNo)]
  );
  return r.rows?.[0] || null;
}

async function validateOneRow(q, accountId, roleCode, entityType, rowIndex, data) {
  const errs = [];
  const miss = basicRequired(entityType, data);
  if (miss.length) errs.push(`Missing required: ${miss.join(", ")}`);

  if (entityType === "MANUFACTURERS") {
    if (clean(data.name) && clean(data.name).length < 2) errs.push("Name too short");
  }

  if (entityType === "PRODUCT_BATCHES") {
    try {
      if (data.expiry_date) parsePharmacyDateToYmd(data.expiry_date);
    } catch (e) {
      errs.push(e.message || "Invalid expiry");
    }
    const mrp = parseNumber(data.mrp);
    if (mrp == null || mrp <= 0) errs.push("MRP must be positive");
  }

  if (entityType === "CUSTOMERS") {
    const ct = clean(data.customer_type || "RETAILER").toUpperCase();
    if (ct === "DOCTOR") {
      /* mapped later */
    } else if (!["RETAILER", "HOSPITAL", "CLINIC", "DISTRIBUTOR", "PATIENT", "OTHER"].includes(ct)) {
      errs.push("Invalid customer_type");
    }
    if (data.dl_expiry_date) {
      try {
        parsePharmacyDateToYmd(data.dl_expiry_date);
      } catch (e) {
        errs.push("Invalid dl_expiry_date");
      }
    }
  }

  if (entityType === "PRODUCTS") {
    if (data.sales_gst != null && String(data.sales_gst).trim() !== "" && parseGst(data.sales_gst) === null) {
      errs.push("Invalid sales_gst slab");
    }
    if (data.purchase_gst != null && String(data.purchase_gst).trim() !== "" && parseGst(data.purchase_gst) === null) {
      errs.push("Invalid purchase_gst slab");
    }
  }

  if (errs.length) return { ok: false, errs };

  let existing = null;
  if (entityType === "MANUFACTURERS") existing = await findExistingManufacturer(q, accountId, data);
  else if (entityType === "DIVISIONS") existing = await findExistingDivision(q, accountId, data);
  else if (entityType === "SUPPLIERS") existing = await findExistingVendor(q, accountId, data);
  else if (entityType === "CUSTOMERS") existing = await findExistingCustomer(q, accountId, data);
  else if (entityType === "PRODUCTS") {
    const mfgId = await resolveMfgId(q, accountId, data.manufacturer_code, data.manufacturer_name);
    existing = await findExistingProduct(q, accountId, data, mfgId);
  } else if (entityType === "PRODUCT_BATCHES") {
    const prod = await findProductForBatch(q, accountId, data.product_code, data.product_name);
    if (prod) {
      existing = await findExistingBatch(q, accountId, prod.id, data.batch_no);
    } else if (!clean(data.product_name) && !clean(data.product_code)) {
      errs.push("Product not found: provide product_code or product_name");
    }
  }

  if (errs.length) return { ok: false, errs };

  return { ok: true, existing, data, rowIndex };
}

async function validateImportRows(accountId, roleCode, entityType, rowsWithIndex, q) {
  const valid = [];
  const updates = [];
  const invalid = [];

  const docGroupTypes = new Set(["PURCHASES", "SALES", "SALES_RETURNS"]);
  if (docGroupTypes.has(entityType)) {
    for (const { rowIndex, data } of rowsWithIndex) {
      const miss = basicRequired(entityType, data);
      if (miss.length) {
        invalid.push({ rowIndex, error: `Missing: ${miss.join(", ")}`, raw: data });
        continue;
      }
      try {
        if (data.expiry_date && entityType === "PURCHASES") parsePharmacyDateToYmd(data.expiry_date);
        if (data.invoice_date || data.return_date) {
          const d = data.invoice_date || data.return_date;
          parsePharmacyDateToYmd(d);
        }
      } catch (e) {
        invalid.push({ rowIndex, error: e.message || "Invalid date", raw: data });
        continue;
      }
      valid.push({ rowIndex, data });
    }
    return { valid, updates, invalid, summary: { valid: valid.length, updates: 0, invalid: invalid.length } };
  }

  if (entityType === "PRESCRIPTIONS") {
    for (const { rowIndex, data } of rowsWithIndex) {
      const miss = basicRequired(entityType, data);
      if (miss.length) {
        invalid.push({ rowIndex, error: `Missing: ${miss.join(", ")}`, raw: data });
        continue;
      }
      if (data.prescription_date) {
        try {
          parsePharmacyDateToYmd(data.prescription_date);
        } catch (e) {
          invalid.push({ rowIndex, error: e.message, raw: data });
          continue;
        }
      }
      valid.push({ rowIndex, data });
    }
    return { valid, updates, invalid, summary: { valid: valid.length, updates: 0, invalid: invalid.length } };
  }

  for (const { rowIndex, data } of rowsWithIndex) {
    const r = await validateOneRow(q, accountId, roleCode, entityType, rowIndex, data);
    if (!r.ok) {
      invalid.push({ rowIndex, error: r.errs.join("; "), raw: data });
      continue;
    }
    if (r.existing?.id) {
      updates.push({ rowIndex, data: r.data, existing: r.existing });
    } else {
      valid.push({ rowIndex, data: r.data });
    }
  }

  return {
    valid,
    updates,
    invalid,
    summary: {
      valid: valid.length,
      updates: updates.length,
      invalid: invalid.length
    }
  };
}

module.exports = { validateImportRows, findExistingManufacturer, resolveMfgId, findProductForBatch };
