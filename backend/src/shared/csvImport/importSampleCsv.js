/** Example rows for "Download sample with data".
 *  Each sample includes the most common columns exported by Marg ERP, Busy, KMS, Tally, and Excel.
 */

const SAMPLES = {
  MANUFACTURERS: `code,name,short_name,rack_no,main_company_code,sale_lock,purchase_order_lock,prevent_discount,prevent_free_qty,out_bill_limit,out_day_limit,credit_limit
MIC,Micro Laboratories Ltd,Micro Labs,A-1,,FALSE,FALSE,FALSE,FALSE,0,0,0
SUN,Sun Pharmaceutical Industries,Sun Pharma,B-2,,FALSE,FALSE,FALSE,FALSE,0,0,0
CIP,Cipla Ltd,Cipla,C-1,,FALSE,FALSE,FALSE,FALSE,0,0,50000`,

  DIVISIONS: `code,name,short_name,manufacturer_code,manufacturer_name,credit_days,phone,email,address,is_active
MIC-CARD,Cardiology Division,MicCard,MIC,Micro Labs,30,9825000001,card@micro.com,Mumbai,TRUE
SUN-ANTI,Anti-Infectives,SunAnti,SUN,Sun Pharma,21,9825000002,anti@sunpharma.com,Mumbai,TRUE`,

  SUPPLIERS: `code,name,short_name,vendor_type,credit_days,phone,email,address,city,state,pincode,gst_number,drug_license_number,contact_person,main_brand,notes,is_active
SUP001,Hospital Care Pharma,HCare,WHOLESALER,30,9898076007,hc@email.com,Shop 602 Surat Market,Surat,Gujarat,395001,24ABCDE1234F1Z5,GJ-DL-2024-001,Ramesh Shah,Micro Labs,,TRUE
SUP002,MedPlus Distributors,MedPlus,DISTRIBUTOR,21,9898076008,medplus@email.com,Ring Road,Ahmedabad,Gujarat,380001,24XYZAB5678G2Z6,GJ-DL-2024-002,Suresh Patel,Sun Pharma,,TRUE`,

  PRODUCTS: `code,name,drug_name,manufacturer_code,manufacturer_name,division_code,packing,sales_gst,purchase_gst,hsn_code,rack_location,is_control,is_otc,stockable,is_discount_enabled,low_stock_threshold
PRD-0001,Dolo 650 MG Tab,Paracetamol 650mg,MIC,Micro Labs,MIC-CARD,15TAB,5,5,3004,A-3,FALSE,TRUE,TRUE,TRUE,50
PRD-0002,Azithromycin 500 Tab,Azithromycin 500mg,CIP,Cipla Ltd,,6TAB,12,12,3004,B-1,FALSE,FALSE,TRUE,TRUE,20
PRD-0003,Metformin 500 Tab,Metformin HCl 500mg,SUN,Sun Pharma,,10TAB,5,5,3004,C-2,FALSE,FALSE,TRUE,TRUE,30`,

  PRODUCT_BATCHES: `product_code,product_name,batch_no,expiry_date,mrp,purchase_rate,sales_rate,retail_rate,opening_stock,open_stock_free_qty,packing,sales_gst,purchase_gst,barcode,supplier_code
PRD-0001,Dolo 650 MG Tab,DOBS4120,Jun-29,32.10,24.47,32.10,32.10,838,0,15TAB,5,5,,SUP001
PRD-0001,Dolo 650 MG Tab,DOBS5001,Dec-29,32.10,24.80,32.10,32.10,500,0,15TAB,5,5,,SUP001
PRD-0002,Azithromycin 500 Tab,AZ2024A,Mar-27,185.00,140.00,185.00,185.00,120,0,6TAB,12,12,,SUP002`,

  CUSTOMERS: `code,name,short_name,customer_type,phone,email,address,city,state,pincode,gst_number,drug_license_number,dl_expiry_date,credit_days,credit_limit,discount_percent,is_cash_customer,is_active,notes
CUS-001,Sharma Medical Store,Sharma,RETAILER,9825001111,sharma@email.com,Shop 5 Main Market,Surat,Gujarat,395001,24ABCDE1234F1Z5,GJ-DL-RET-001,31/12/2026,30,50000,5,FALSE,TRUE,
CUS-002,City Hospital,CityHosp,HOSPITAL,9825002222,city@hospital.com,Civil Road,Surat,Gujarat,395002,24FGHIJ5678K2Z6,GJ-DL-HOS-001,31/12/2026,45,200000,10,FALSE,TRUE,
CUS-003,Walk-in Patient,,PATIENT,9825003333,,,,,,,,,0,0,0,TRUE,TRUE,`,

  PURCHASES: `invoice_number,invoice_date,supplier_code,supplier_name,vendor_invoice_number,division_code,product_code,product_name,batch_no,expiry_date,qty,free_qty,purchase_rate,mrp,sales_rate,discount_percent,gst_percent,status
PI-2024-0001,23/04/2024,SUP001,Hospital Care,HC/2024/456,,PRD-0001,Dolo 650 MG Tab,DOBS4120,Jun-29,30,0,24.47,32.10,32.10,0,5,CONFIRMED
PI-2024-0001,23/04/2024,SUP001,Hospital Care,HC/2024/456,,PRD-0002,Azithromycin 500 Tab,AZ2024A,Mar-27,10,2,140.00,185.00,185.00,0,12,CONFIRMED
PI-2024-0002,24/04/2024,SUP002,MedPlus,,MIC-CARD,PRD-0001,Dolo 650 MG Tab,DOBS5001,Dec-29,50,5,24.80,32.10,32.10,2,5,CONFIRMED`,

  SALES: `invoice_number,invoice_date,customer_code,customer_name,patient_name,patient_phone,doctor_name,bill_type,rate_type,product_code,product_name,batch_no,qty,free_qty,mrp,sales_rate,discount_percent,gst_percent,status
SI-2024-0001,23/04/2024,CUS-001,Sharma Medical,,,,CASH_MEMO,SALES_RATE,PRD-0001,Dolo 650 MG Tab,DOBS4120,30,0,32.10,32.10,0,5,CONFIRMED
SI-2024-0001,23/04/2024,CUS-001,Sharma Medical,,,,CASH_MEMO,SALES_RATE,PRD-0002,Azithromycin 500 Tab,AZ2024A,5,0,185.00,185.00,0,12,CONFIRMED
SI-2024-0002,23/04/2024,,Walk-in,Ramesh Patel,9825001111,Dr. Krishnan,CASH_MEMO,SALES_RATE,PRD-0001,Dolo 650 MG Tab,DOBS4120,2,0,32.10,32.10,0,5,CONFIRMED`,

  SALES_RETURNS: `return_number,return_date,customer_code,customer_name,linked_invoice_number,return_reason,product_code,product_name,batch_no,return_qty,return_free_qty,sales_rate,status
SR-2024-001,25/04/2024,CUS-001,Sharma Medical,SI-2024-0001,EXPIRED,PRD-0001,Dolo 650 MG Tab,DOBS4120,5,0,32.10,CONFIRMED
SR-2024-002,26/04/2024,CUS-001,Sharma Medical,SI-2024-0001,DAMAGED,PRD-0002,Azithromycin 500 Tab,AZ2024A,2,0,185.00,CONFIRMED`,

  PURCHASE_RETURNS: `return_number,return_date,supplier_code,supplier_name,linked_invoice_number,return_reason,product_code,product_name,batch_no,expiry_date,return_qty,return_free_qty,purchase_rate,mrp,gst_percent,status
PR-2024-001,26/04/2024,SUP001,Hospital Care,PI-2024-0001,DAMAGED,PRD-0001,Dolo 650 MG Tab,DOBS4120,Jun-29,5,0,24.47,32.10,5,CONFIRMED
PR-2024-001,26/04/2024,SUP001,Hospital Care,PI-2024-0001,EXPIRED,PRD-0002,Azithromycin 500 Tab,AZ2024A,Mar-27,2,0,140.00,185.00,12,CONFIRMED`,

  PRESCRIPTIONS: `prescription_no,prescription_date,patient_name,patient_age,patient_phone,doctor_name,doctor_reg_number,sales_invoice_number,notes
RX/2024/001,23/04/2024,Ramesh Patel,45,9825001111,Dr. Krishnan,MCI12345,SI-2024-0002,
RX/2024/002,24/04/2024,Sunita Sharma,38,9825002222,Dr. Mehta,MCI67890,SI-2024-0003,Hypertension`
};

function sampleCsvForEntity(entityType) {
  return SAMPLES[String(entityType || "").toUpperCase()] || "";
}

module.exports = { sampleCsvForEntity, SAMPLES };
