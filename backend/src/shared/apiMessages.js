/** Short, user-facing API messages for sales & purchase modules. */
const MSG = {
  ACCOUNT_NOT_FOUND: "Account not found.",
  ID_REQUIRED: "ID is required.",
  INVOICE_ID_REQUIRED: "Invoice ID is required.",
  INVOICE_NOT_FOUND: "Invoice not found.",
  PURCHASE_NOT_FOUND: "Purchase not found.",
  CUSTOMER_NOT_FOUND: "Customer not found.",
  CUSTOMER_INACTIVE: "Customer is inactive.",
  VENDOR_NOT_FOUND: "Supplier not found.",
  VENDOR_INACTIVE: "Supplier is inactive.",
  VENDOR_REQUIRED: "Supplier is required.",
  DIVISION_OR_VENDOR_REQUIRED: "Division or supplier is required.",
  CUSTOMER_REQUIRED: "Customer is required.",
  ONLY_DRAFT_CONFIRM: "Only draft bills can be confirmed.",
  EMPTY_INVOICE: "Bill has no items.",
  LINE_ITEM_REQUIRED: "Add at least one item.",
  LINE_INVALID: "Each line needs product, batch, and qty.",
  LINE_LOOSE_INVALID: "Each line needs product, batch, and qty or loose qty.",
  INVALID_PRODUCT_BATCH: "Invalid product or batch.",
  BATCH_NOT_FOUND: "Batch not found.",
  BATCH_ON_HOLD: "Batch is on hold.",
  BATCH_NO_REQUIRED: "Batch number is required.",
  SALE_LOCKED: "Sales locked for this manufacturer.",
  PRESCRIPTION_REQUIRED: "Prescription details required.",
  DOCTOR_REQUIRED: "Doctor name required.",
  PATIENT_REQUIRED: "Patient name required.",
  TAX_INVOICE_NEED_GSTIN: "Tax invoice needs customer GSTIN.",
  INVALID_BILL_TYPE: "Invalid bill type.",
  NOT_ENOUGH_STOCK: "Not enough stock.",
  NOT_ENOUGH_FREE_STOCK: "Not enough free stock.",
  NOT_ENOUGH_PAID_STOCK: "Not enough paid stock.",
  CANNOT_BREAK_PACK: "Not enough stock to break packs.",
  INVOICE_DATE_REQUIRED: "Invoice date is required.",
  INVOICE_DATE_FUTURE: "Invoice date cannot be in the future.",
  DUE_DATE_INVALID: "Due date is invalid.",
  INVOICE_NUMBER_EXISTS: "Invoice number already exists.",
  CANNOT_CANCEL_WITH_PAYMENTS: "Remove payments before cancel.",
  CANNOT_PROCESS: "Could not process bill.",
  SOMETHING_WRONG: "Something went wrong.",
  TRY_AGAIN: "Please try again.",
  SALES_CONFIRMED: "Sale confirmed.",
  PURCHASE_CONFIRMED: "Purchase confirmed.",
  ALREADY_CONFIRMED: "Already confirmed.",
  SALES_DRAFT_CREATED: "Sale draft saved.",
  PURCHASE_DRAFT_CREATED: "Purchase draft saved.",
  SALES_DELETED: "Sale deleted.",
  PURCHASE_DELETED: "Purchase deleted.",
  LOOSE_QTY_INVALID: "Loose qty must be zero or more.",
  LOOSE_QTY_TOO_HIGH: "Loose qty is too high for this batch."
};

const SHORTEN_RULES = [
  [/Insufficient billable.*stock/i, MSG.NOT_ENOUGH_PAID_STOCK],
  [/Insufficient free stock/i, MSG.NOT_ENOUGH_FREE_STOCK],
  [/Insufficient stock/i, MSG.NOT_ENOUGH_STOCK],
  [/Cannot break.*pack/i, MSG.CANNOT_BREAK_PACK],
  [/Only DRAFT invoices can be confirmed/i, MSG.ONLY_DRAFT_CONFIRM],
  [/Only draft invoices can be confirmed/i, MSG.ONLY_DRAFT_CONFIRM],
  [/Cannot confirm empty invoice/i, MSG.EMPTY_INVOICE],
  [/Invoice has no line items/i, MSG.EMPTY_INVOICE],
  [/Cannot cancel invoice with manual payments/i, MSG.CANNOT_CANCEL_WITH_PAYMENTS],
  [/account not found/i, MSG.ACCOUNT_NOT_FOUND],
  [/invoice id is required/i, MSG.INVOICE_ID_REQUIRED],
  [/id is required/i, MSG.ID_REQUIRED],
  [/Invoice not found/i, MSG.INVOICE_NOT_FOUND],
  [/Purchase invoice not found/i, MSG.PURCHASE_NOT_FOUND],
  [/Customer not found/i, MSG.CUSTOMER_NOT_FOUND],
  [/Customer is inactive/i, MSG.CUSTOMER_INACTIVE],
  [/Selected vendor was not found/i, MSG.VENDOR_NOT_FOUND],
  [/Selected vendor is inactive/i, MSG.VENDOR_INACTIVE],
  [/Batch.*is on hold/i, MSG.BATCH_ON_HOLD],
  [/Sales are locked/i, MSG.SALE_LOCKED],
  [/Prescription number is required/i, MSG.PRESCRIPTION_REQUIRED],
  [/Doctor name is required/i, MSG.DOCTOR_REQUIRED],
  [/Patient name is required/i, MSG.PATIENT_REQUIRED],
  [/Tax Invoice requires customer GSTIN/i, MSG.TAX_INVOICE_NEED_GSTIN],
  [/At least one line item is required/i, MSG.LINE_ITEM_REQUIRED],
  [/Each line must include product/i, MSG.LINE_INVALID],
  [/Invalid product\/batch/i, MSG.INVALID_PRODUCT_BATCH],
  [/Something went wrong/i, MSG.SOMETHING_WRONG]
];

function shortUserMessage(message) {
  if (message == null) return message;
  const m = String(message).trim();
  if (!m) return m;
  for (const [re, repl] of SHORTEN_RULES) {
    if (re.test(m)) return repl;
  }
  if (m.length > 96) {
    const cut = m.split(/[.!?\n]/)[0].trim();
    if (cut.length >= 12 && cut.length <= 80) return cut.endsWith(".") ? cut : `${cut}.`;
  }
  return m;
}

module.exports = { MSG, shortUserMessage };
