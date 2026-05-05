/** Basic email sanity check (aligned with backend sales invoice mail). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function customerToUpdatePayload(c, patch = {}) {
  return {
    code: c.code,
    name: c.name,
    shortName: c.short_name,
    phoneCountryCode: patch.phoneCountryCode != null ? patch.phoneCountryCode : c.phone_country_code || "+91",
    phoneNumber: patch.phoneNumber != null ? String(patch.phoneNumber).replace(/\D/g, "") : c.phone_number || "",
    email: patch.email != null ? String(patch.email).trim().toLowerCase() : c.email || "",
    address: c.address,
    city: c.city,
    state: c.state,
    pincode: c.pincode,
    customerType: c.customer_type || "RETAILER",
    gstNumber: c.gst_number,
    drugLicenseNumber: c.drug_license_number,
    dlExpiryDate: c.dl_expiry_date ? String(c.dl_expiry_date).slice(0, 10) : "",
    creditDays: c.credit_days ?? 0,
    creditLimit: c.credit_limit ?? 0,
    discountPercent: c.discount_percent ?? 0,
    isActive: Boolean(c.is_active),
    isCashCustomer: Boolean(c.is_cash_customer),
    notes: c.notes || ""
  };
}
