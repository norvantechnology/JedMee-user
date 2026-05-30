import 'display_labels.dart';
import 'format.dart';
import 'product_stock.dart';

/// Entity hint for detail layout ordering.
enum RecordEntity {
  generic,
  customer,
  vendor,
  division,
  mfgCompany,
  product,
  productBatch,
  salesInvoice,
  purchaseInvoice,
  salesReturn,
  purchaseReturn,
  payment,
  order,
  user,
  catalog,
}

/// One row in a detail section.
class DetailField {
  const DetailField({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  final String label;
  final String value;
  final bool highlight;
}

class DetailSection {
  const DetailSection({required this.title, required this.fields});

  final String title;
  final List<DetailField> fields;
}

const _hiddenExact = {
  'id',
  'account_id',
  'created_by',
  'updated_by',
  'deleted_at',
  'password_hash',
  'refresh_token',
  // Internal / audit fields — never shown to end users
  're_tag_audit_log',
  'reTagAuditLog',
  'large_b2c_flag',
  'largB2cFlag',
  'largeB2cFlag',
};

/// Boolean fields that should only be shown when their value is "Yes" / true.
/// When the value is "No" / false, the field is hidden entirely.
const _hideBoolWhenFalse = {
  'is_walk_in_sale',
  'isWalkInSale',
  'is_interstate',
  'isInterstate',
  'is_half_scheme',
  'isHalfScheme',
};

const _hiddenWhenNamePresent = {
  'product_id': {'product_name', 'productName'},
  'vendor_id': {'vendor_name', 'vendorName'},
  'division_id': {'division_name', 'divisionName'},
  'customer_id': {'customer_name', 'customerName'},
  'mfg_company_id': {'mfg_company_name', 'mfgCompanyName'},
  'product_division_id': {'division_name', 'divisionName'},
};

const _fieldLabels = <String, String>{
  'product_name': 'Product',
  'productName': 'Product',
  'batch_no': 'Batch number',
  'batchNo': 'Batch number',
  'due_date': 'Due date',
  'dueDate': 'Due date',
  'confirmed_at': 'Confirmed at',
  'confirmedAt': 'Confirmed at',
  'division_label': 'Division label',
  'divisionLabel': 'Division label',
  'purchase_source': 'Purchase source',
  'purchaseSource': 'Purchase source',
  'itc_eligible': 'ITC eligible',
  'itcEligible': 'ITC eligible',
  'is_walk_in_sale': 'Walk-in sale',
  'isWalkInSale': 'Walk-in sale',
  'is_interstate': 'Interstate',
  'isInterstate': 'Interstate',
  'is_half_scheme': 'Half scheme',
  'isHalfScheme': 'Half scheme',
  'round_off': 'Round off',
  'roundOff': 'Round off',
  'subtotal': 'Subtotal',
  'total_discount': 'Total discount',
  'totalDiscount': 'Total discount',
  'total_tax': 'Total tax',
  'totalTax': 'Total tax',
  'taxable_amount': 'Taxable amount',
  'taxableAmount': 'Taxable amount',
  'tax_amount': 'Tax amount',
  'taxAmount': 'Tax amount',
  'global_discount_percent': 'Global discount %',
  'globalDiscountPercent': 'Global discount %',
  'vendor_invoice_number': 'Vendor invoice no.',
  'vendorInvoiceNumber': 'Vendor invoice no.',
  'return_status': 'Return status',
  'returnStatus': 'Return status',
  'payment_mode': 'Payment mode',
  'paymentMode': 'Payment mode',
  'division_mfg_name': 'Division mfg name',
  'divisionMfgName': 'Division mfg name',
  'purchase_source_type': 'Purchase source',
  'purchaseSourceType': 'Purchase source',
  'product_code': 'Product code',
  'productCode': 'Product code',
  'drug_name': 'Drug name',
  'drugName': 'Drug name',
  'barcode': 'Barcode',
  'expiry_date': 'Expiry date',
  'expiryDate': 'Expiry date',
  'dl_expiry_date': 'DL expiry date',
  'dlExpiryDate': 'DL expiry date',
  'mfg_date': 'Mfg date',
  'mfgDate': 'Mfg date',
  'mrp': 'MRP',
  'purchase_rate': 'Purchase rate',
  'purchaseRate': 'Purchase rate',
  'sales_rate': 'Sales rate',
  'salesRate': 'Sales rate',
  'retail_rate': 'Retail rate',
  'retailRate': 'Retail rate',
  'opening_stock': 'Opening stock',
  'openingStock': 'Opening stock',
  'loose_stock': 'Loose stock',
  'looseStock': 'Loose stock',
  'loose_unit_name': 'Loose unit',
  'looseUnitName': 'Loose unit',
  'division_name': 'Division',
  'divisionName': 'Division',
  'division_code': 'Division code',
  'divisionCode': 'Division code',
  'mfg_company_name': 'Manufacturer',
  'mfgCompanyName': 'Manufacturer',
  'mfg_short_name': 'Mfg short name',
  'firm_name': 'Business name',
  'firmName': 'Business name',
  'full_name': 'Name',
  'fullName': 'Name',
  'short_name': 'Short name',
  'shortName': 'Short name',
  'phone_number': 'Phone',
  'phoneNumber': 'Phone',
  'phone': 'Phone',
  'email': 'Email',
  'address': 'Address',
  'city': 'City',
  'state': 'State',
  'pincode': 'Pincode',
  'gst_number': 'GSTIN',
  'gstNumber': 'GSTIN',
  'drug_license_number': 'Drug license no.',
  'drugLicenseNumber': 'Drug license no.',
  'customer_type': 'Customer type',
  'customerType': 'Customer type',
  'vendor_type': 'Supplier type',
  'vendorType': 'Supplier type',
  'credit_days': 'Credit days',
  'creditDays': 'Credit days',
  'credit_limit': 'Credit limit',
  'creditLimit': 'Credit limit',
  'discount_percent': 'Discount %',
  'discountPercent': 'Discount %',
  'rack_number': 'Rack / shelf',
  'rackNumber': 'Rack / shelf',
  'rack_no': 'Rack number',
  'rackNo': 'Rack number',
  'main_company': 'Main company',
  'mainCompany': 'Main company',
  'is_cash_customer': 'Cash customer',
  'isCashCustomer': 'Cash customer',
  'is_active': 'Active',
  'isActive': 'Active',
  'notes': 'Notes',
  'code': 'Code',
  'name': 'Name',
  'invoice_number': 'Invoice no',
  'invoiceNumber': 'Invoice no',
  'invoice_date': 'Invoice date',
  'invoiceDate': 'Invoice date',
  'customer_name': 'Customer',
  'customerName': 'Customer',
  'vendor_name': 'Supplier',
  'vendorName': 'Supplier',
  'total_amount': 'Total amount',
  'totalAmount': 'Total amount',
  'amount_paid': 'Amount paid',
  'amountPaid': 'Amount paid',
  'balance_due': 'Balance due',
  'balanceDue': 'Balance due',
  'payment_status': 'Payment status',
  'paymentStatus': 'Payment status',
  'status': 'Status',
  'item_count': 'Items',
  'itemCount': 'Items',
  'order_no': 'Order no',
  'orderNo': 'Order no',
  'return_number': 'Return no',
  'returnNumber': 'Return no',
  'receipt_no': 'Receipt no',
  'receiptNo': 'Receipt no',
  'amount': 'Amount',
  'patient_name': 'Patient',
  'patientName': 'Patient',
  'created_at': 'Created',
  'createdAt': 'Created',
  'updated_at': 'Updated',
  'updatedAt': 'Updated',
  'packing': 'Packing',
  'conversion_unit': 'Conversion unit',
  'conversionUnit': 'Conversion unit',
  'stockable': 'Stockable',
  'is_hold': 'On hold',
  'isHold': 'On hold',
  'is_control': 'Control drug',
  'isControl': 'Control drug',
  'current_stock': 'Current stock',
  'currentStock': 'Current stock',
  'total_stock': 'Current stock',
  'totalStock': 'Current stock',
  'stock_billable_qty': 'Billable stock',
  'stockBillableQty': 'Billable stock',
  'stock_free_qty': 'Free stock',
  'stockFreeQty': 'Free stock',
  'health': 'Stock health',
  'health_label': 'Stock health',
  'healthLabel': 'Stock health',
};

const _currencyKeys = {
  'mrp',
  'purchase_rate',
  'purchaseRate',
  'sales_rate',
  'salesRate',
  'retail_rate',
  'retailRate',
  'total_amount',
  'totalAmount',
  'amount',
  'amount_paid',
  'amountPaid',
  'balance_due',
  'balanceDue',
  'credit_limit',
  'creditLimit',
  'net_rate',
  'netRate',
  'landing_cost',
  'landingCost',
  // Financial summary fields
  'round_off',
  'roundOff',
  'subtotal',
  'total_discount',
  'totalDiscount',
  'total_tax',
  'totalTax',
  'taxable_amount',
  'taxableAmount',
  'tax_amount',
  'taxAmount',
  'total_gst',
  'totalGst',
};

/// Date-only fields — show as "DD Mon YYYY" without time.
const _dateOnlyKeys = {
  'expiry_date',
  'expiryDate',
  'dl_expiry_date',
  'dlExpiryDate',
  'mfg_date',
  'mfgDate',
  'invoice_date',
  'invoiceDate',
  'due_date',
  'dueDate',
  'return_date',
  'returnDate',
  'payment_date',
  'paymentDate',
};

/// Datetime fields — show as "DD Mon YYYY, HH:MM AM/PM".
const _dateTimeKeys = {
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
  'confirmed_at',
  'confirmedAt',
  'placed_at',
  'placedAt',
};

/// Combined set for backward-compat checks.
const _dateKeys = {
  'expiry_date',
  'expiryDate',
  'dl_expiry_date',
  'dlExpiryDate',
  'mfg_date',
  'mfgDate',
  'invoice_date',
  'invoiceDate',
  'due_date',
  'dueDate',
  'return_date',
  'returnDate',
  'payment_date',
  'paymentDate',
  'created_at',
  'createdAt',
  'updated_at',
  'updatedAt',
  'confirmed_at',
  'confirmedAt',
  'placed_at',
  'placedAt',
};

const _boolKeys = {
  'stockable',
  'is_hold',
  'isHold',
  'is_control',
  'isControl',
  'is_discount_enabled',
  'isDiscountEnabled',
  'is_net',
  'isNet',
  'is_half_scheme',
  'isHalfScheme',
  'is_non_editable_free_qty',
  'isNonEditableFreeQty',
  'batch_low_stock',
  'batchLowStock',
  'mfg_stock_report_lock',
  'mfgStockReportLock',
  'is_cash_customer',
  'isCashCustomer',
  'is_active',
  'isActive',
};

RecordEntity detectRecordEntity(Map<String, dynamic> row) {
  if (row.containsKey('batch_no') || row.containsKey('batchNo')) {
    return RecordEntity.productBatch;
  }
  if ((row.containsKey('active_batch_count') || row.containsKey('activeBatchCount')) &&
      !row.containsKey('product_id') &&
      !row.containsKey('productId')) {
    return RecordEntity.product;
  }
  if (row.containsKey('return_number') ||
      row.containsKey('returnNumber') ||
      row.containsKey('return_no')) {
    if (row.containsKey('customer_id') ||
        row.containsKey('customerId') ||
        row.containsKey('customer_name') ||
        row.containsKey('customerName')) {
      return RecordEntity.salesReturn;
    }
    return RecordEntity.purchaseReturn;
  }
  if (row.containsKey('invoice_number') || row.containsKey('invoiceNumber')) {
    if (row.containsKey('vendor_name') ||
        row.containsKey('vendorId') ||
        row.containsKey('vendor_id') ||
        row.containsKey('vendor_invoice_number')) {
      return RecordEntity.purchaseInvoice;
    }
    return RecordEntity.salesInvoice;
  }
  if (row.containsKey('customer_type') || row.containsKey('customerType')) {
    return RecordEntity.customer;
  }
  if (row.containsKey('firm_name') || row.containsKey('firmName')) {
    return row.containsKey('credit_days') ? RecordEntity.vendor : RecordEntity.customer;
  }
  if (row.containsKey('division_code') || row.containsKey('divisionCode')) {
    return RecordEntity.division;
  }
  if (row.containsKey('mfg_company_name') && !row.containsKey('batch_no')) {
    if (row.containsKey('active_batch_count') ||
        row.containsKey('activeBatchCount') ||
        row.containsKey('drug_name') ||
        row.containsKey('drugName')) {
      return RecordEntity.product;
    }
    return RecordEntity.mfgCompany;
  }
  if (row.containsKey('patient_name') || row.containsKey('patientName')) {
    return RecordEntity.catalog;
  }
  if (row.containsKey('receipt_no') || row.containsKey('receiptNo')) {
    return RecordEntity.payment;
  }
  if (row.containsKey('order_no') ||
      row.containsKey('orderNo') ||
      row.containsKey('order_number') ||
      row.containsKey('orderNumber')) {
    return RecordEntity.order;
  }
  if (row.containsKey('full_name') || row.containsKey('fullName')) {
    return RecordEntity.user;
  }
  return RecordEntity.generic;
}

String humanizeKey(String key) {
  if (_fieldLabels.containsKey(key)) return _fieldLabels[key]!;
  return key
      .replaceAll('_', ' ')
      .replaceAllMapped(RegExp(r'([a-z])([A-Z])'), (m) => '${m[1]} ${m[2]}')
      .split(' ')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}')
      .join(' ');
}

bool _shouldHideField(String key, Map<String, dynamic> row) {
  if (_hiddenExact.contains(key)) return true;
  if (key.endsWith('_id') || key.endsWith('Id')) {
    final nameKeys = _hiddenWhenNamePresent[key];
    if (nameKeys != null) {
      for (final nk in nameKeys) {
        final v = row[nk];
        if (v != null && v.toString().trim().isNotEmpty) return true;
      }
    }
    if (key.endsWith('_id')) return true;
  }
  // Hide boolean fields that are "No"/false — only show when "Yes"/true
  if (_hideBoolWhenFalse.contains(key)) {
    final v = row[key];
    if (v == null) return true;
    final s = v.toString().toLowerCase();
    if (s == 'false' || s == 'no' || s == '0') return true;
  }
  // Hide division_label when it duplicates division_name value
  if (key == 'division_label' || key == 'divisionLabel') {
    final label = row[key]?.toString().trim() ?? '';
    final name = (row['division_name'] ?? row['divisionName'] ?? '').toString().trim();
    if (label.isEmpty || label == name) return true;
  }
  return false;
}

bool _isEmptyValue(dynamic value) {
  if (value == null) return true;
  final s = value.toString().trim();
  return s.isEmpty || s == 'null' || s == '—' || s == '---';
}

String formatFieldValue(String key, dynamic value) {
  if (_isEmptyValue(value)) return '—';
  final rawStr = value.toString().toLowerCase();
  if (rawStr == 'true' || rawStr == 'false') return displayBool(value);
  if (key == 'hsn_code' || key == 'hsnCode' || key == 'hsn') {
    final s = value.toString().trim();
    if (s.isEmpty || s.toUpperCase() == 'N/A') return 'HSN not set';
  }
  if (_boolKeys.contains(key) || _hideBoolWhenFalse.contains(key)) {
    return displayBool(value);
  }
  if (key == 'health' || key == 'health_label' || key == 'healthLabel') {
    return displayHealth(value?.toString());
  }
  if (_currencyKeys.contains(key)) return fmtCurrency(value);
  // Date-only fields: show "DD Mon YYYY"
  if (_dateOnlyKeys.contains(key)) return fmtDisplayDate(value);
  // Datetime fields: show "DD Mon YYYY, HH:MM AM/PM"
  if (_dateTimeKeys.contains(key)) {
    final dt = fmtDisplayDateTime(value);
    return dt.isNotEmpty ? dt : fmtDisplayDate(value);
  }
  if (key == 'status' ||
      key == 'payment_status' ||
      key == 'paymentStatus' ||
      key == 'return_status' ||
      key == 'returnStatus' ||
      key == 'bill_type' ||
      key == 'billType' ||
      key == 'rate_type' ||
      key == 'rateType' ||
      key == 'purchase_source' ||
      key == 'purchaseSource' ||
      key == 'purchase_source_type' ||
      key == 'purchaseSourceType') {
    return displayStatusLabel(value?.toString());
  }
  // Convert any remaining ALL_CAPS or SNAKE_CASE values to Title Case
  final s = value.toString().trim();
  if (s == s.toUpperCase() && s.contains('_')) {
    return displayStatusLabel(s);
  }
  return s;
}

List<String> _orderedKeysForEntity(RecordEntity entity) {
  switch (entity) {
    case RecordEntity.product:
      return [
        'name',
        'code',
        'drug_name',
        'drugName',
        'division_name',
        'divisionName',
        'division_code',
        'mfg_company_name',
        'mfgCompanyName',
        'supplier_name',
        'hsn_code',
        'hsnCode',
        'rack_location',
        'rackLocation',
        'packing',
        'bulk_pack',
        'case_pack',
        'units_per_strip',
        'conversion_unit',
        'sales_gst',
        'purchase_gst',
        'sales_scheme',
        'active_batch_count',
        'total_quantity',
        'stockable',
        'is_discount_enabled',
        'is_control',
        'is_otc',
        'low_stock_alert_enabled',
        'created_at',
      ];
    case RecordEntity.productBatch:
      return [
        'product_name',
        'productName',
        'batch_no',
        'batchNo',
        'product_code',
        'barcode',
        'drug_name',
        'expiry_date',
        'mfg_date',
        'total_stock',
        'stock_billable_qty',
        'stock_free_qty',
        'opening_stock',
        'loose_stock',
        'loose_unit_name',
        'mrp',
        'purchase_rate',
        'sales_rate',
        'retail_rate',
        'division_name',
        'division_code',
        'mfg_company_name',
        'mfg_short_name',
        'packing',
        'conversion_unit',
        'stockable',
        'is_hold',
        'is_control',
        'status',
        'created_at',
      ];
    case RecordEntity.customer:
      return [
        'name',
        'firm_name',
        'short_name',
        'code',
        'customer_type',
        'customerType',
        'phone_number',
        'email',
        'address',
        'city',
        'state',
        'pincode',
        'gst_number',
        'drug_license_number',
        'drugLicenseNumber',
        'dl_expiry_date',
        'dlExpiryDate',
        'is_cash_customer',
        'isCashCustomer',
        'credit_days',
        'creditDays',
        'credit_limit',
        'creditLimit',
        'discount_percent',
        'discountPercent',
        'notes',
        'is_active',
        'created_at',
      ];
    case RecordEntity.vendor:
      return [
        'name',
        'firm_name',
        'short_name',
        'code',
        'vendor_type',
        'vendorType',
        'credit_days',
        'creditDays',
        'rack_number',
        'rackNumber',
        'main_company',
        'mainCompany',
        'phone_number',
        'email',
        'address',
        'city',
        'state',
        'pincode',
        'gst_number',
        'notes',
        'is_active',
        'created_at',
      ];
    case RecordEntity.salesInvoice:
    case RecordEntity.purchaseInvoice:
      return [
        'invoice_number',
        'invoice_date',
        'due_date',
        'customer_name',
        'vendor_name',
        'division_name',
        'division_mfg_name',
        'vendor_invoice_number',
        'bill_type',
        'rate_type',
        'status',
        'payment_status',
        'item_count',
        'balance_due',
        'global_discount_percent',
        'itc_eligible',
        'purchase_source',
        'purchase_source_type',
        'notes',
        'confirmed_at',
        'created_at',
        'updated_at',
        // Financial summary
        'round_off',
        'subtotal',
        'total_discount',
        'total_tax',
        'total_gst',
        'taxable_amount',
        'tax_amount',
        'total_amount',
        'amount_paid',
      ];
    case RecordEntity.salesReturn:
    case RecordEntity.purchaseReturn:
      return [
        'return_number',
        'return_date',
        'customer_name',
        'vendor_name',
        'invoice_number',
        'status',
        'total_amount',
        'return_reason',
        'notes',
        'created_at',
      ];
    default:
      return [];
  }
}

String _sectionForKey(String key, RecordEntity entity) {
  if (entity == RecordEntity.productBatch) {
    if (['product_name', 'productName', 'batch_no', 'batchNo', 'product_code', 'barcode', 'drug_name']
        .contains(key)) {
      return 'Overview';
    }
    if (['expiry_date', 'mfg_date', 'opening_stock', 'loose_stock', 'loose_unit_name', 'current_stock']
        .contains(key)) {
      return 'Stock';
    }
    if (key.contains('rate') || key == 'mrp' || key.contains('discount') || key.contains('gst')) {
      return 'Pricing';
    }
    if (key.contains('division') || key.contains('mfg') || key.contains('vendor')) {
      return 'Relations';
    }
    if (key.startsWith('is_') || key == 'stockable' || key == 'status') return 'Flags';
  }
  // Invoice / purchase financial summary fields
  if (entity == RecordEntity.salesInvoice || entity == RecordEntity.purchaseInvoice) {
    if (const {
      'round_off', 'roundOff',
      'subtotal',
      'total_discount', 'totalDiscount',
      'total_tax', 'totalTax',
      'total_gst', 'totalGst',
      'taxable_amount', 'taxableAmount',
      'tax_amount', 'taxAmount',
      'total_amount', 'totalAmount',
      'amount_paid', 'amountPaid',
      'balance_due', 'balanceDue',
    }.contains(key)) {
      return 'Financial';
    }
    if (const {
      'confirmed_at', 'confirmedAt',
      'created_at', 'createdAt',
      'updated_at', 'updatedAt',
    }.contains(key)) {
      return 'Record';
    }
  }
  if (['phone_number', 'email', 'address', 'city', 'state', 'pincode'].contains(key)) {
    return 'Contact';
  }
  if (key.contains('credit') || key.contains('amount') || key.contains('gst')) {
    return 'Financial';
  }
  if (key == 'created_at' || key == 'updated_at' || key == 'confirmed_at' ||
      key == 'createdAt' || key == 'updatedAt' || key == 'confirmedAt') {
    return 'Record';
  }
  return 'Details';
}

List<DetailSection> buildDetailSections(Map<String, dynamic> row, {RecordEntity? entity}) {
  final type = entity ?? detectRecordEntity(row);
  final ordered = _orderedKeysForEntity(type);
  final used = <String>{};
  final sections = <String, List<DetailField>>{};

  void addField(String key) {
    if (_shouldHideField(key, row) || used.contains(key)) return;
    if (type == RecordEntity.productBatch &&
        const {'health', 'health_label', 'healthLabel', 'expiry_status', 'expiryStatus'}
            .contains(key)) {
      return;
    }
    final raw = row[key];
    if (_isEmptyValue(raw)) return;
    used.add(key);
    final sectionTitle = _sectionForKey(key, type);
    sections.putIfAbsent(sectionTitle, () => []).add(
          DetailField(
            label: humanizeKey(key),
            value: formatFieldValue(key, raw),
            highlight: key == 'total_amount' ||
                key == 'totalAmount' ||
                key == 'mrp' ||
                key == 'balance_due',
          ),
        );
  }

  for (final key in ordered) {
    if (row.containsKey(key)) addField(key);
  }

  final remaining = row.keys.toList()..sort();
  for (final key in remaining) {
    addField(key);
  }

  const sectionOrder = [
    'Overview',
    'Details',
    'Contact',
    'Financial',
    'Stock',
    'Pricing',
    'Relations',
    'Flags',
    'Record',
  ];

  final out = <DetailSection>[];
  for (final title in sectionOrder) {
    final fields = sections[title];
    if (fields != null && fields.isNotEmpty) {
      out.add(DetailSection(title: title, fields: fields));
    }
  }
  for (final entry in sections.entries) {
    if (!sectionOrder.contains(entry.key)) {
      out.add(DetailSection(title: entry.key, fields: entry.value));
    }
  }
  return out;
}

/// Subtitle for list cards — shows only the most useful secondary info.
/// Avoids raw ISO timestamps and redundant labels.
String listRowSubtitleFor(Map<String, dynamic> row) {
  final entity = detectRecordEntity(row);
  switch (entity) {
    case RecordEntity.product:
      return productMasterMetaLine(row);
    case RecordEntity.productBatch:
      return batchStockMetaLine(row);
    case RecordEntity.salesReturn:
    case RecordEntity.purchaseReturn:
      // Party name only — date is shown as meta on the right side
      final party = row['customer_name'] ??
          row['customerName'] ??
          row['vendor_name'] ??
          row['vendorName'];
      return party?.toString().trim() ?? '';
    case RecordEntity.salesInvoice:
    case RecordEntity.purchaseInvoice:
      // Party name only — date is shown as meta on the right side
      final invoiceParty = row['customer_name'] ??
          row['customerName'] ??
          row['vendor_name'] ??
          row['vendorName'];
      return invoiceParty?.toString().trim() ?? '';
    case RecordEntity.customer:
    case RecordEntity.vendor:
      // Phone is the most actionable info; city/GST adds clutter in list view
      final phone = row['phone_number'] ?? row['phoneNumber'] ?? row['phone'];
      if (phone != null && phone.toString().trim().isNotEmpty) {
        return phone.toString().trim();
      }
      // Fall back to city if no phone
      final city = row['city'];
      return city?.toString().trim() ?? '';
    case RecordEntity.division:
      // Show manufacturer name as context, fall back to code
      final mfg = row['mfg_company_name'] ?? row['mfgCompanyName'];
      if (mfg != null && mfg.toString().trim().isNotEmpty) {
        return mfg.toString().trim();
      }
      return (row['code'] ?? row['division_code'] ?? '').toString();
    case RecordEntity.mfgCompany:
      return (row['short_name'] ?? row['shortName'] ?? row['code'] ?? '').toString();
    default:
      final created = row['created_at'] ?? row['createdAt'];
      if (created != null) return fmtDisplayDate(created);
      return '';
  }
}

List<String>? statusChipsForRow(Map<String, dynamic> row) {
  final chips = <String>[];
  final entity = detectRecordEntity(row);
  final status = row['status']?.toString();
  final pay = row['payment_status'] ?? row['paymentStatus'];
  final health = row['health'] ?? row['health_label'] ?? row['healthLabel'];
  if (status != null && status.isNotEmpty) {
    if (entity == RecordEntity.salesInvoice ||
        entity == RecordEntity.purchaseInvoice) {
      if (status.toUpperCase() == 'DRAFT') chips.add(status);
    } else {
      chips.add(status);
    }
  }
  if (pay != null && pay.toString().isNotEmpty) {
    final st = (status ?? '').toString().toUpperCase();
    if (entity == RecordEntity.salesInvoice ||
        entity == RecordEntity.purchaseInvoice) {
      if (st != 'CANCELLED' && st != 'DRAFT') chips.add(pay.toString());
    } else {
      chips.add(pay.toString());
    }
  }
  if (health != null && health.toString().isNotEmpty) chips.add(health.toString());
  return chips.isEmpty ? null : chips;
}
