class ExportColumn {
  const ExportColumn({required this.key, required this.label});

  final String key;
  final String label;
}

abstract final class ExportColumns {
  static List<ExportColumn> vendors() => const [
        ExportColumn(key: 'name', label: 'Name'),
        ExportColumn(key: 'code', label: 'Code'),
        ExportColumn(key: 'firm_name', label: 'Firm name'),
        ExportColumn(key: 'phone_number', label: 'Phone'),
        ExportColumn(key: 'email', label: 'Email'),
        ExportColumn(key: 'city', label: 'City'),
        ExportColumn(key: 'gst_number', label: 'GSTIN'),
      ];

  static List<ExportColumn> customers() => const [
        ExportColumn(key: 'name', label: 'Name'),
        ExportColumn(key: 'code', label: 'Code'),
        ExportColumn(key: 'firm_name', label: 'Firm name'),
        ExportColumn(key: 'customer_type', label: 'Type'),
        ExportColumn(key: 'phone_number', label: 'Phone'),
        ExportColumn(key: 'email', label: 'Email'),
        ExportColumn(key: 'city', label: 'City'),
        ExportColumn(key: 'gst_number', label: 'GSTIN'),
      ];

  static List<ExportColumn> products() => const [
        ExportColumn(key: 'name', label: 'Name'),
        ExportColumn(key: 'code', label: 'Code'),
        ExportColumn(key: 'drug_name', label: 'Drug name'),
        ExportColumn(key: 'division_name', label: 'Division'),
        ExportColumn(key: 'mfg_company_name', label: 'Manufacturer'),
        ExportColumn(key: 'hsn_code', label: 'HSN'),
        ExportColumn(key: 'rack_location', label: 'Rack'),
      ];

  static List<ExportColumn> genericMaster() => const [
        ExportColumn(key: 'name', label: 'Name'),
        ExportColumn(key: 'code', label: 'Code'),
        ExportColumn(key: 'short_name', label: 'Short name'),
        ExportColumn(key: 'phone_number', label: 'Phone'),
        ExportColumn(key: 'email', label: 'Email'),
        ExportColumn(key: 'city', label: 'City'),
      ];

  static List<ExportColumn> purchaseInvoices() => const [
        ExportColumn(key: 'invoice_number', label: 'Invoice no'),
        ExportColumn(key: 'invoice_date', label: 'Date'),
        ExportColumn(key: 'vendor_name', label: 'Supplier'),
        ExportColumn(key: 'status', label: 'Status'),
        ExportColumn(key: 'payment_status', label: 'Payment'),
        ExportColumn(key: 'total_amount', label: 'Total'),
        ExportColumn(key: 'balance_due', label: 'Balance due'),
      ];

  static List<ExportColumn> salesInvoices() => const [
        ExportColumn(key: 'invoice_number', label: 'Invoice no'),
        ExportColumn(key: 'invoice_date', label: 'Date'),
        ExportColumn(key: 'customer_name', label: 'Customer'),
        ExportColumn(key: 'status', label: 'Status'),
        ExportColumn(key: 'payment_status', label: 'Payment'),
        ExportColumn(key: 'total_amount', label: 'Total'),
        ExportColumn(key: 'balance_due', label: 'Balance due'),
      ];

  static List<ExportColumn> returns({String numberKey = 'return_number'}) => [
        ExportColumn(key: numberKey, label: 'Return no'),
        const ExportColumn(key: 'return_date', label: 'Date'),
        const ExportColumn(key: 'status', label: 'Status'),
        const ExportColumn(key: 'total_amount', label: 'Total'),
      ];
}
