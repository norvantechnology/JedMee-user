const { clean, n } = require("../../shared/sales");

function mapCustomerRow(r) {
  if (!r) return null;
  return {
    ...r,
    is_active: Boolean(r.is_active),
    is_cash_customer: Boolean(r.is_cash_customer),
    is_walk_in: Boolean(r.is_walk_in),
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
  if (out.gstNumber && !/^[0-9A-Z]{15}$/.test(out.gstNumber)) errs.push("GST number must be 15 alphanumeric characters.");
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

module.exports = { mapCustomerRow, validateCustomerPayload };
