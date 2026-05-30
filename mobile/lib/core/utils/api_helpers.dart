import '../api/api_response.dart';
import 'display_id.dart';
import 'format.dart';
import 'record_fields.dart';

/// Keys used by JedMee backend list handlers under `{ ok, data: { … } }`.
/// Order matters when multiple keys exist — prefer explicit entity arrays first.
const _listDataKeys = [
  'items',
  'rows',
  'list',
  'results',
  'customers',
  'vendors',
  'divisions',
  'products',
  'batches',
  'product_batches',
  'companies',
  'mfgCompanies',
  'mfg_companies',
  'manufacturers',
  'supplierProducts',
  'supplier_products',
  'vendorManufacturers',
  'vendor_manufacturers',
  'users',
  'roles',
  'invoices',
  'sales_invoices',
  'purchase_invoices',
  'sales_returns',
  'purchase_returns',
  'orders',
  'payments',
  'customer_payments',
  'vendor_payments',
  'division_payments',
  'prescriptions',
  'notifications',
  'catalog',
  'entries',
  'lines',
  'stockists',
  'suppliers',
  'resources',
  'data',
];

/// Extract list rows from common API response shapes.
List<Map<String, dynamic>> extractList(dynamic data) {
  if (data is List) {
    return data
        .whereType<Map>()
        .map(Map<String, dynamic>.from)
        .toList();
  }
  if (data is Map) {
    final map = Map<String, dynamic>.from(data);
    for (final key in _listDataKeys) {
      final v = map[key];
      if (v is List) {
        return v
            .whereType<Map>()
            .map(Map<String, dynamic>.from)
            .toList();
      }
    }
  }
  return [];
}

int extractTotal(dynamic data, [int fallback = 0]) {
  if (data is Map) {
    final t = data['total'] ?? data['count'] ?? data['totalCount'];
    if (t is num) return t.toInt();
  }
  return fallback;
}

Map<String, dynamic>? extractDataMap(ApiResponse resp) {
  final d = resp.data;
  if (d is Map<String, dynamic>) return d;
  if (d is Map) return Map<String, dynamic>.from(d);
  return null;
}

String rowLabel(Map<String, dynamic> row, [List<String> keys = const []]) {
  for (final k in [
    ...keys,
    'name',
    'full_name',
    'fullName',
    'firm_name',
    'firmName',
    'business_name',
    'businessName',
    'invoice_number',
    'invoiceNumber',
    'invoice_no',
    'invoiceNo',
    'order_no',
    'orderNo',
    'order_number',
    'orderNumber',
    'customer_name',
    'customerName',
    'vendor_name',
    'vendorName',
    'product_name',
    'productName',
    'return_number',
    'returnNumber',
    'patient_name',
    'patientName',
    'receipt_no',
    'receiptNo',
    'title',
    'email',
  ]) {
    final v = row[k];
    if (v != null && v.toString().trim().isNotEmpty) return v.toString();
  }
  final id = row['id']?.toString().trim();
  if (id != null && id.isNotEmpty) {
    if (looksLikeUuid(id)) return shortenUuid(id);
    return id;
  }
  return '—';
}

({List<Map<String, dynamic>> rows, String? error}) listFromResponse(
  dynamic resp, {
  String Function(dynamic)? parseError,
}) {
  if (resp is! ApiResponse) {
    return (rows: [], error: 'Invalid response');
  }
  if (!resp.ok) {
    return (rows: [], error: resp.parseErrorMessage());
  }
  return (rows: extractList(resp.data), error: null);
}

String rowSubtitle(Map<String, dynamic> row) {
  final smart = listRowSubtitleFor(row);
  if (smart.isNotEmpty) return smart;
  const _dateFields = {
    'invoice_date', 'invoiceDate', 'payment_date', 'paymentDate',
    'created_at', 'createdAt', 'updated_at', 'updatedAt',
  };
  for (final k in [
    'email',
    'phone',
    'phone_number',
    'phoneNumber',
    'code',
    'gst_number',
    'gstNumber',
    'status',
    'invoice_date',
    'invoiceDate',
    'payment_date',
    'paymentDate',
    'created_at',
    'createdAt',
  ]) {
    final v = row[k];
    if (v != null && v.toString().trim().isNotEmpty) {
      if (_dateFields.contains(k)) return fmtDisplayDate(v);
      return v.toString();
    }
  }
  return '';
}
