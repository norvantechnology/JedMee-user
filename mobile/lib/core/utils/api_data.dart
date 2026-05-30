import 'api_helpers.dart';
import 'display_id.dart';
import 'format.dart';

/// Coerce API numeric fields that may arrive as String, int, or double.
double parseDouble(dynamic value, [double fallback = 0]) {
  return pickNum(value)?.toDouble() ?? fallback;
}

int parseInt(dynamic value, [int fallback = 0]) {
  return pickNum(value)?.toInt() ?? fallback;
}

/// Nested KPI block from dashboard summary: `{ "value": 123, ... }`.
num? pickNum(dynamic value) {
  if (value == null) return null;
  if (value is num) return value;
  if (value is Map) {
    final inner = value['value'] ?? value['amount'] ?? value['total'];
    if (inner is num) return inner;
    return num.tryParse(inner?.toString() ?? '');
  }
  return num.tryParse(value.toString());
}

/// Read KPI from dashboard `kpis` object (supports nested `.value`).
num? kpiValue(Map<String, dynamic>? kpis, String key) {
  if (kpis == null) return null;
  final block = kpis[key];
  return pickNum(block);
}

/// Widgets section from dashboard summary.
Map<String, dynamic> dashboardWidgets(Map<String, dynamic>? data) {
  if (data == null) return {};
  final w = data['widgets'];
  if (w is Map) return Map<String, dynamic>.from(w);
  return {};
}

/// List from dashboard widgets by snake_case or camelCase key.
List<Map<String, dynamic>> widgetList(
  Map<String, dynamic>? data,
  List<String> keys,
) {
  final widgets = dashboardWidgets(data);
  for (final key in keys) {
    final raw = widgets[key];
    if (raw is List) {
      return raw
          .whereType<Map>()
          .map(Map<String, dynamic>.from)
          .toList();
    }
  }
  return [];
}

/// Trend points for charts: accepts `sales_total`, `purchase_total`, `amount`, etc.
List<Map<String, dynamic>> trendPoints(dynamic raw) {
  if (raw is! List) return [];
  return raw.whereType<Map>().map(Map<String, dynamic>.from).toList();
}

double trendY(Map<String, dynamic> point) {
  return pickNum(
        point['sales_total'] ??
            point['salesTotal'] ??
            point['purchase_total'] ??
            point['purchaseTotal'] ??
            point['amount'] ??
            point['total'] ??
            point['value'],
      )?.toDouble() ??
      0;
}

/// Display label for invoice rows (API uses snake_case).
String invoiceRowTitle(Map<String, dynamic> row) {
  final inv = row['invoice_number'] ?? row['invoiceNumber'] ?? row['invoice_no'] ?? row['invoiceNo'];
  if (inv != null && inv.toString().trim().isNotEmpty) {
    final s = inv.toString().trim();
    if (!looksLikeUuid(s)) return s;
  }
  return rowLabel(row);
}

/// Human-readable order number — never full UUID in lists.
String orderRowTitle(Map<String, dynamic> row) {
  return displayIdFromRow(
    row,
    keys: const [
      'order_number',
      'orderNumber',
      'order_no',
      'orderNo',
      'reference_number',
      'referenceNumber',
      'display_id',
      'displayId',
      'sequence_number',
      'sequenceNumber',
    ],
    idPrefix: 'ORD-',
  );
}

/// Title for any transaction list row (invoice, order, return).
String txnRowTitle(Map<String, dynamic> row) {
  if (row.containsKey('order_no') ||
      row.containsKey('orderNo') ||
      row.containsKey('order_number') ||
      row.containsKey('orderNumber')) {
    return orderRowTitle(row);
  }
  if (row.containsKey('invoice_number') ||
      row.containsKey('invoiceNumber') ||
      row.containsKey('invoice_no')) {
    return invoiceRowTitle(row);
  }
  if (row.containsKey('return_number') ||
      row.containsKey('returnNumber') ||
      row.containsKey('return_no')) {
    return displayIdFromRow(
      row,
      keys: const ['return_number', 'returnNumber', 'return_no', 'returnNo'],
      idPrefix: 'RET-',
    );
  }
  return rowLabel(row);
}

String invoiceRowSubtitle(Map<String, dynamic> row) {
  final date = fmtDisplayDate(row['invoice_date'] ?? row['invoiceDate'] ?? row['date'] ?? row['created_at']);
  final party = row['customer_name'] ??
      row['customerName'] ??
      row['vendor_name'] ??
      row['vendorName'] ??
      row['division_name'] ??
      row['divisionName'];
  return [
    if (date.isNotEmpty) date,
    if (party != null && party.toString().trim().isNotEmpty) party.toString(),
  ].join(' · ');
}

dynamic invoiceRowAmount(Map<String, dynamic> row) {
  return row['total_amount'] ??
      row['totalAmount'] ??
      row['total_return_amount'] ??
      row['totalReturnAmount'] ??
      row['grand_total'] ??
      row['grandTotal'] ??
      row['total'] ??
      row['amount'];
}

/// Top-customer / party amount from dashboard widgets.
num customerBilledAmount(Map<String, dynamic> row) {
  return pickNum(row['billed'] ?? row['total'] ?? row['amount']) ?? 0;
}

/// Dashboard KPI: today's sales on TODAY preset, period sales otherwise.
num? dashboardSalesKpi(Map<String, dynamic>? kpis, {required bool isTodayPreset}) {
  if (kpis == null) return null;
  if (isTodayPreset) {
    return kpiValue(kpis, 'today_sales') ?? kpiValue(kpis, 'range_sales');
  }
  return kpiValue(kpis, 'range_sales') ?? kpiValue(kpis, 'today_sales');
}

String dashboardSalesKpiLabel({required bool isTodayPreset}) =>
    isTodayPreset ? "Today's sales" : 'Period sales';

String ymdFrom(dynamic value) {
  final s = value?.toString() ?? '';
  if (s.isEmpty) return '';
  return s.length >= 10 ? s.substring(0, 10) : s;
}
