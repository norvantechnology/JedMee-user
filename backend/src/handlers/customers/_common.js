const { clean, n } = require("../../shared/sales");

/**
 * Validate GSTIN format: 15-char alphanumeric per GST rules.
 * Pattern: 2-digit state + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
 * Same regex used in salesInvoices/_common.js and gstrB2bB2c.js
 */
function isValidGstin(g) {
  if (!g) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    String(g).toUpperCase().trim()
  );
}

/**
 * Derive 2-digit state code from a valid GSTIN (first 2 chars).
 */
function stateCodeFromGstin(gstin) {
  if (!gstin || !isValidGstin(gstin)) return null;
  return String(gstin).toUpperCase().trim().substring(0, 2);
}

function mapCustomerRow(r) {
  if (!r) return null;
  return {
    ...r,
    is_active: Boolean(r.is_active),
    is_cash_customer: Boolean(r.is_cash_customer),
    is_walk_in: Boolean(r.is_walk_in),
    b2b_flag: Boolean(r.b2b_flag),
    credit_days: Number(r.credit_days || 0),
    credit_limit: Number(r.credit_limit || 0),
    discount_percent: Number(r.discount_percent || 0)
  };
}

function validateCustomerPayload(body, isUpdate = false) {
  const out = {
    code: clean(body.code).toUpperCase(),
    name: clean(body.name),
    shortName: clean(body.shortName || body.short_name),
    phoneCountryCode: clean(body.phoneCountryCode || body.phone_country_code || "+91"),
    phoneNumber: clean(body.phoneNumber || body.phone_number),
    email: clean(body.email).toLowerCase(),
    address: clean(body.address),
    city: clean(body.city),
    state: clean(body.state),
    pincode: clean(body.pincode),
    customerType: clean(body.customerType || body.customer_type || "RETAILER").toUpperCase(),
    gstNumber: clean(body.gstNumber || body.gst_number).toUpperCase(),
    drugLicenseNumber: clean(body.drugLicenseNumber || body.drug_license_number),
    dlExpiryDate: clean(body.dlExpiryDate || body.dl_expiry_date),
    creditDays: Number.parseInt(String(body.creditDays ?? body.credit_days ?? 0), 10),
    creditLimit: n(body.creditLimit ?? body.credit_limit),
    discountPercent: n(body.discountPercent ?? body.discount_percent),
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    isCashCustomer: body.isCashCustomer === undefined ? false : Boolean(body.isCashCustomer),
    notes: clean(body.notes)
  };

  // Derive b2b_flag and state_code from GSTIN
  const gstinValid = isValidGstin(out.gstNumber);
  out.b2bFlag = gstinValid;
  out.stateCode = gstinValid ? stateCodeFromGstin(out.gstNumber) : null;
  out.gstinValidatedAt = out.gstNumber ? new Date().toISOString() : null;

  const errs = [];
  if (!isUpdate || out.name) {
    if (out.name.length < 2) errs.push("Customer name must be at least 2 characters.");
  }
  if (out.phoneNumber) {
    const digits = out.phoneNumber.replace(/\D+/g, "");
    if (out.phoneCountryCode === "+91") {
      if (!/^\d{10}$/.test(digits)) errs.push("Phone number must be exactly 10 digits for +91.");
    } else if (!/^\d{7,15}$/.test(digits)) {
      errs.push("Phone number must be 7 to 15 digits.");
    }
  }
  // Strict GSTIN format validation — reject invalid format at save time
  if (out.gstNumber && !isValidGstin(out.gstNumber)) {
    errs.push("GST number must be a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5). Invalid format is not allowed.");
  }
  if (out.dlExpiryDate) {
    const d = String(out.dlExpiryDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) errs.push("DL expiry must be a valid date (YYYY-MM-DD).");
  }
  if (!Number.isFinite(out.creditDays) || out.creditDays < 0) errs.push("Credit days must be a non-negative integer.");
  if (out.creditLimit < 0) errs.push("Credit limit must be non-negative.");
  if (out.discountPercent < 0 || out.discountPercent > 100) errs.push("Discount percent must be between 0 and 100.");
  if (!["RETAILER", "HOSPITAL", "CLINIC", "DISTRIBUTOR", "PATIENT", "DOCTOR", "OTHER"].includes(out.customerType)) {
    errs.push("Invalid customer type.");
  }
  return { ok: errs.length === 0, errs, out };
}

module.exports = { mapCustomerRow, validateCustomerPayload, isValidGstin, stateCodeFromGstin };
