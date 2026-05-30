import '../../core/utils/format.dart';

export '../../core/utils/row_fields.dart';

/// Field definitions mirroring web master modals.
class MasterFields {
  static const customer = [
    (key: 'name', label: 'Name', required: true),
    (key: 'code', label: 'Code', required: false),
    (key: 'shortName', label: 'Short name', required: false),
    (key: 'phoneNumber', label: 'Phone', required: false),
    (key: 'email', label: 'Email', required: false),
    (key: 'address', label: 'Address', required: false),
    (key: 'city', label: 'City', required: false),
    (key: 'state', label: 'State', required: false),
    (key: 'pincode', label: 'Pincode', required: false),
    (key: 'gstNumber', label: 'GSTIN', required: false),
    (key: 'drugLicenseNumber', label: 'Drug license number', required: false),
    (key: 'dlExpiryDate', label: 'DL expiry date', required: false),
    (key: 'customerType', label: 'Customer type', required: false),
    (key: 'creditDays', label: 'Credit days', required: false),
    (key: 'creditLimit', label: 'Credit limit', required: false),
    (key: 'discountPercent', label: 'Discount %', required: false),
    (key: 'notes', label: 'Notes', required: false),
  ];

  static const vendor = [
    (key: 'name', label: 'Supplier name', required: true),
    (key: 'code', label: 'Code', required: false),
    (key: 'shortName', label: 'Short name', required: false),
    (key: 'creditDays', label: 'Credit days', required: false),
    (key: 'phoneNumber', label: 'Phone', required: false),
    (key: 'email', label: 'Email', required: false),
    (key: 'address', label: 'Address', required: false),
    (key: 'city', label: 'City', required: false),
    (key: 'state', label: 'State', required: false),
    (key: 'pincode', label: 'Pincode', required: false),
    (key: 'gstNumber', label: 'GSTIN', required: false),
    (key: 'rackNumber', label: 'Rack / shelf', required: false),
    (key: 'mainCompany', label: 'Main company', required: false),
    (key: 'notes', label: 'Notes', required: false),
  ];

  static const division = [
    (key: 'name', label: 'Division name', required: true),
    (key: 'code', label: 'Code', required: false),
    (key: 'shortName', label: 'Short name', required: false),
    (key: 'phoneNumber', label: 'Phone', required: false),
    (key: 'email', label: 'Email', required: false),
    (key: 'address', label: 'Address', required: false),
    (key: 'gstNumber', label: 'GSTIN', required: false),
    (key: 'creditDays', label: 'Credit days', required: false),
    (key: 'notes', label: 'Notes', required: false),
  ];

  static const mfg = [
    (key: 'name', label: 'Manufacturer name', required: true),
    (key: 'code', label: 'Code', required: false),
    (key: 'shortName', label: 'Short name', required: false),
    (key: 'rackNo', label: 'Rack number', required: false),
    (key: 'notes', label: 'Notes', required: false),
  ];

  static const product = [
    (key: 'name', label: 'Product name', required: true),
    (key: 'code', label: 'Product code', required: false),
    (key: 'drugName', label: 'Drug / generic name', required: false),
  ];

  static const productBatch = [
    (key: 'productName', label: 'Product name', required: true),
    (key: 'batchNo', label: 'Batch number', required: true),
    (key: 'expiryDate', label: 'Expiry date', required: false),
    (key: 'mrp', label: 'MRP', required: false),
    (key: 'purchaseRate', label: 'Purchase rate', required: false),
    (key: 'salesRate', label: 'Sales rate', required: false),
    (key: 'openingStock', label: 'Opening stock', required: false),
  ];
}

Map<String, dynamic> vendorPayloadFromForm(Map<String, String> data) {
  num? numOrNull(String? s) {
    if (s == null || s.trim().isEmpty) return null;
    return num.tryParse(s.trim());
  }

  return {
    'name': data['name'],
    if (data['code']?.isNotEmpty == true) 'code': data['code'],
    if (data['shortName']?.isNotEmpty == true) 'shortName': data['shortName'],
    if (numOrNull(data['creditDays']) != null) 'creditDays': numOrNull(data['creditDays']),
    if (data['phoneNumber']?.isNotEmpty == true) 'phoneNumber': data['phoneNumber'],
    if (data['email']?.isNotEmpty == true) 'email': data['email'],
    if (data['address']?.isNotEmpty == true) 'address': data['address'],
    if (data['city']?.isNotEmpty == true) 'city': data['city'],
    if (data['state']?.isNotEmpty == true) 'state': data['state'],
    if (data['pincode']?.isNotEmpty == true) 'pincode': data['pincode'],
    if (data['gstNumber']?.isNotEmpty == true) 'gstNumber': data['gstNumber'],
    if (data['rackNumber']?.isNotEmpty == true) 'rackNumber': data['rackNumber'],
    if (data['mainCompany']?.isNotEmpty == true) 'mainCompany': data['mainCompany'],
    if (data['notes']?.isNotEmpty == true) 'notes': data['notes'],
  };
}

Map<String, dynamic> customerPayloadFromMap(Map<String, dynamic> data) {
  return customerPayloadFromForm(
    data.map((k, v) => MapEntry(k, v?.toString() ?? '')),
  );
}

Map<String, dynamic> customerPayloadFromForm(Map<String, String> data) {
  num? numOrNull(String? s) {
    if (s == null || s.trim().isEmpty) return null;
    return num.tryParse(s.trim());
  }

  return {
    'name': data['name'],
    if (data['code']?.isNotEmpty == true) 'code': data['code'],
    if (data['shortName']?.isNotEmpty == true) 'shortName': data['shortName'],
    if (data['phoneNumber']?.isNotEmpty == true) 'phoneNumber': data['phoneNumber'],
    if (data['email']?.isNotEmpty == true) 'email': data['email'],
    if (data['address']?.isNotEmpty == true) 'address': data['address'],
    if (data['city']?.isNotEmpty == true) 'city': data['city'],
    if (data['state']?.isNotEmpty == true) 'state': data['state'],
    if (data['pincode']?.isNotEmpty == true) 'pincode': data['pincode'],
    if (data['gstNumber']?.isNotEmpty == true) 'gstNumber': data['gstNumber'],
    if (data['drugLicenseNumber']?.isNotEmpty == true)
      'drugLicenseNumber': data['drugLicenseNumber'],
    if (data['dlExpiryDate']?.isNotEmpty == true) 'dlExpiryDate': data['dlExpiryDate'],
    if (data['customerType']?.isNotEmpty == true)
      'customerType': data['customerType']!.toUpperCase(),
    if (numOrNull(data['creditDays']) != null) 'creditDays': numOrNull(data['creditDays']),
    if (numOrNull(data['creditLimit']) != null) 'creditLimit': numOrNull(data['creditLimit']),
    if (numOrNull(data['discountPercent']) != null)
      'discountPercent': numOrNull(data['discountPercent']),
    if (data['notes']?.isNotEmpty == true) 'notes': data['notes'],
  };
}

Map<String, dynamic> divisionPayloadFromForm(Map<String, String> data) {
  num? numOrNull(String? s) {
    if (s == null || s.trim().isEmpty) return null;
    return num.tryParse(s.trim());
  }

  return {
    'name': data['name'],
    if (data['code']?.isNotEmpty == true) 'code': data['code']!.toUpperCase(),
    if (data['shortName']?.isNotEmpty == true) 'shortName': data['shortName'],
    if (data['phoneNumber']?.isNotEmpty == true) 'phoneNumber': data['phoneNumber'],
    if (data['email']?.isNotEmpty == true) 'email': data['email'],
    if (data['address']?.isNotEmpty == true) 'address': data['address'],
    if (data['gstNumber']?.isNotEmpty == true) 'gstNumber': data['gstNumber'],
    if (numOrNull(data['creditDays']) != null) 'creditDays': numOrNull(data['creditDays']),
    if (data['notes']?.isNotEmpty == true) 'notes': data['notes'],
  };
}

Map<String, dynamic> mfgPayloadFromForm(Map<String, String> data) {
  return {
    'name': data['name'],
    if (data['code']?.isNotEmpty == true) 'code': data['code'],
    if (data['shortName']?.isNotEmpty == true) 'shortName': data['shortName'],
    if (data['rackNo']?.isNotEmpty == true) 'rackNo': data['rackNo'],
    if (data['notes']?.isNotEmpty == true) 'notes': data['notes'],
  };
}

Map<String, String> rowToFormInitial(
  Map<String, dynamic> row,
  List<({String key, String label, bool required})> fields,
) {
  final out = <String, String>{};
  for (final f in fields) {
    final snake = f.key.replaceAllMapped(
      RegExp(r'[A-Z]'),
      (m) => '_${m[0]!.toLowerCase()}',
    );
    final v = row[f.key] ?? row[snake];
    if (v != null) out[f.key] = v.toString();
    if (f.key == 'expiryDate' && (out['expiryDate'] == null || out['expiryDate']!.isEmpty)) {
      final exp = row['expiry_date'];
      if (exp != null) out['expiryDate'] = ymd(exp);
    }
    if (f.key == 'dlExpiryDate' && (out['dlExpiryDate'] == null || out['dlExpiryDate']!.isEmpty)) {
      final exp = row['dl_expiry_date'];
      if (exp != null) out['dlExpiryDate'] = ymd(exp);
    }
    if (f.key == 'openingStock' && (out['openingStock'] == null || out['openingStock']!.isEmpty)) {
      final st = row['opening_stock'];
      if (st != null) out['openingStock'] = st.toString();
    }
  }
  if (out['name'] == null || out['name']!.isEmpty) {
    out['name'] = (row['name'] ?? row['firm_name'] ?? '').toString();
  }
  return out;
}
