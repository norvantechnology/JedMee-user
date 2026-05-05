/** Example rows (spec §2) for “Download sample with data”. */

const SAMPLES = {
  MANUFACTURERS: `code,name,short_name,rack_no,main_company_code,sale_lock,purchase_order_lock,prevent_discount,prevent_free_qty,out_bill_limit,out_day_limit,credit_limit
MIC,Micro Laboratories Ltd,Micro Labs,A-1,,FALSE,FALSE,FALSE,FALSE,0,0,0`,

  DIVISIONS: `code,name,short_name,manufacturer_code,manufacturer_name,credit_days,phone,email,address,is_active
MIC-CARD,Cardiology Division,MicCard,MIC,Micro Labs,30,9825000001,card@micro.com,Mumbai,TRUE`,

  SUPPLIERS: `code,name,short_name,vendor_type,credit_days,phone,email,address,city,state,main_brand,notes,is_active
SUP001,Hospital Care,HCare,WHOLESALER,30,9898076007,hc@email.com,Shop 602,Surat,Gujarat,Micro Labs,,TRUE`,

  PRODUCTS: `code,name,drug_name,manufacturer_code,manufacturer_name,division_code,packing,sales_gst,purchase_gst,hsn_code,rack_location,is_control,is_otc,stockable,is_discount_enabled
PRD-0001,Dolo 650 MG Tab,Paracetamol,MIC,Micro Labs,MIC-CARD,15TAB,5,5,3004,A-3,FALSE,TRUE,TRUE,TRUE`,

  PRODUCT_BATCHES: `product_code,product_name,batch_no,expiry_date,mrp,purchase_rate,sales_rate,opening_stock,open_stock_free_qty,packing,sales_gst,purchase_gst
PRD-0001,Dolo 650 MG Tab,DOBS4120,30/06/2029,32.10,24.47,32.10,838,0,15TAB,5,5`,

  CUSTOMERS: `code,name,short_name,customer_type,phone,email,address,city,state,pincode,gst_number,credit_days,credit_limit,discount_percent,is_cash_customer,is_active,notes
CUS-001,Sharma Medical Store,Sharma,RETAILER,9825001111,sharma@email.com,Shop 5,Surat,Gujarat,395001,24ABCDE1234F1Z5,30,50000,5,FALSE,TRUE,`,

  PURCHASES: `invoice_number,invoice_date,supplier_code,vendor_invoice_number,product_code,product_name,batch_no,expiry_date,qty,free_qty,purchase_rate,mrp,sales_rate,discount_percent,gst_percent,status
PI-2024-0001,23/04/2024,SUP001,HC/2024/456,PRD-0001,Dolo 650 MG Tab,DOBS4120,30/06/2029,30,0,24.47,32.10,32.10,0,5,CONFIRMED`,

  SALES: `invoice_number,invoice_date,customer_code,customer_name,patient_name,patient_phone,bill_type,rate_type,product_code,product_name,batch_no,qty,free_qty,mrp,sales_rate,discount_percent,gst_percent,status
SI-2024-0001,23/04/2024,CUS-001,Sharma Medical,,,,CASH_MEMO,SALES_RATE,PRD-0001,Dolo 650 MG Tab,DOBS4120,30,0,32.10,32.10,0,5,CONFIRMED`,

  SALES_RETURNS: `return_number,return_date,customer_code,customer_name,linked_invoice_number,return_reason,product_code,batch_no,return_qty,return_free_qty,sales_rate,status
SR-2024-001,25/04/2024,CUS-001,Sharma Medical,SI-2024-0001,EXPIRED,PRD-0001,DOBS4120,5,0,32.10,CONFIRMED`,

  PRESCRIPTIONS: `prescription_no,prescription_date,patient_name,patient_age,patient_phone,doctor_name,doctor_reg_number,sales_invoice_number,notes
RX/2024/001,23/04/2024,Ramesh Patel,45,9825001111,Dr. Krishnan,MCI12345,SI-2024-0002,`
};

function sampleCsvForEntity(entityType) {
  return SAMPLES[String(entityType || "").toUpperCase()] || "";
}

module.exports = { sampleCsvForEntity, SAMPLES };
