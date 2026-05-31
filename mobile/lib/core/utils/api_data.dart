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

/// `delta_pct` / `deltaPct` on a nested KPI block.
double? kpiDeltaPct(Map<String, dynamic>? kpis, String key) {
  if (kpis == null) return null;
  final block = kpis[key];
  if (block is! Map) return null;
  final d = block['delta_pct'] ?? block['deltaPct'];
  return d is num ? d.toDouble() : double.tryParse(d?.toString() ?? '');
}

/// `prev_value` / `prevValue` on a nested KPI block.
num? kpiPrevValue(Map<String, dynamic>? kpis, String key) {
  if (kpis == null) return null;
  final block = kpis[key];
  if (block is! Map) return null;
  return pickNum(block['prev_value'] ?? block['prevValue']);
}

/// Percent change vs a prior amount.
/// When [previous] is 0 and [current] > 0, returns 100 (new activity vs none).
double? deltaPctFromValues(num current, num? previous) {
  if (previous == null) return null;
  if (previous == 0) {
    if (current > 0) return 100;
    return null;
  }
  return ((current - previous) / previous.abs()) * 100;
}

String dashboardComparePeriodLabel({required bool isTodayPreset}) =>
    isTodayPreset ? 'vs yesterday' : 'vs last month';

/// Sales change for dashboard header (API delta or computed from prior period).
double? dashboardSalesDeltaPct({
  required bool isTodayPreset,
  required num currentSales,
  required Map<String, dynamic>? kpis,
  required Map<String, dynamic>? momData,
}) {
  if (isTodayPreset) {
    return kpiDeltaPct(kpis, 'today_sales') ??
        deltaPctFromValues(currentSales, kpiPrevValue(kpis, 'today_sales'));
  }
  final fromApi = momData?['mom_delta_pct'] ?? momData?['momDeltaPct'];
  if (fromApi is num) return fromApi.toDouble();
  return deltaPctFromValues(currentSales, pickNum(momData?['last_month']));
}

/// Purchase change for dashboard header.
double? dashboardPurchaseDeltaPct({
  required bool isTodayPreset,
  required num currentPurchases,
  required Map<String, dynamic>? kpis,
  required Map<String, dynamic>? momData,
}) {
  if (isTodayPreset) {
    return kpiDeltaPct(kpis, 'today_purchases') ??
        deltaPctFromValues(
          currentPurchases,
          kpiPrevValue(kpis, 'today_purchases'),
        );
  }
  final fromApi =
      momData?['purchase_mom_delta_pct'] ?? momData?['purchaseMomDeltaPct'];
  if (fromApi is num) return fromApi.toDouble();
  return deltaPctFromValues(
    currentPurchases,
    pickNum(momData?['last_month_purchases']),
  );
}

/// Gross profit change for dashboard header.
double? dashboardProfitDeltaPct({
  required bool isTodayPreset,
  required num currentProfit,
  required Map<String, dynamic>? kpis,
  required Map<String, dynamic>? momData,
}) {
  if (isTodayPreset) {
    return profitChangeDeltaPct(
      currentProfit: currentProfit,
      priorSales: kpiPrevValue(kpis, 'today_sales'),
      priorPurchases: kpiPrevValue(kpis, 'today_purchases'),
    );
  }
  return profitChangeDeltaPct(
    currentProfit: currentProfit,
    priorSales: pickNum(momData?['last_month']),
    priorPurchases: pickNum(momData?['last_month_purchases']),
  );
}

/// Profit % change from sales/purchase current vs prior pairs.
double? profitChangeDeltaPct({
  required num currentProfit,
  required num? priorSales,
  required num? priorPurchases,
}) {
  if (priorSales == null) return null;
  final prevProfit = priorSales - (priorPurchases ?? 0);
  return deltaPctFromValues(currentProfit, prevProfit);
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

/// Dashboard widget list with duplicate rows removed (same id or display name).
List<Map<String, dynamic>> widgetListDeduped(
  Map<String, dynamic>? data,
  List<String> keys, {
  List<String> idKeys = const ['id'],
  List<String> nameKeys = const [
    'name',
    'mfg_name',
    'mfgName',
    'product_name',
    'productName',
    'customer_name',
    'customerName',
    'vendor_name',
    'vendorName',
  ],
}) {
  return dedupeRows(widgetList(data, keys), idKeys: idKeys, nameKeys: nameKeys);
}

/// Removes duplicate map rows by id fields, then by normalized display name.
List<Map<String, dynamic>> dedupeRows(
  List<Map<String, dynamic>> rows, {
  List<String> idKeys = const ['id'],
  List<String> nameKeys = const ['name'],
}) {
  final seen = <String>{};
  final out = <Map<String, dynamic>>[];

  for (final row in rows) {
    var key = '';
    for (final k in idKeys) {
      final v = row[k];
      if (v != null && v.toString().trim().isNotEmpty) {
        key = 'id:${v.toString().trim()}';
        break;
      }
    }
    if (key.isEmpty) {
      for (final k in nameKeys) {
        final v = row[k];
        if (v != null && v.toString().trim().isNotEmpty) {
          key = 'name:${v.toString().trim().toLowerCase()}';
          break;
        }
      }
    }
    if (key.isNotEmpty) {
      if (seen.contains(key)) continue;
      seen.add(key);
    }
    out.add(row);
  }
  return out;
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

/// ISO date (YYYY-MM-DD) for a daily trend point.
String trendDayYmd(Map<String, dynamic> point) {
  final raw = point['day'] ??
      point['date'] ??
      point['invoice_date'] ??
      point['invoiceDate'];
  if (raw == null) return '';
  final s = raw.toString();
  return s.length >= 10 ? s.substring(0, 10) : s;
}

/// Short chart label, e.g. "12 May".
String trendDayChartLabel(Map<String, dynamic> point) {
  final ymd = trendDayYmd(point);
  if (ymd.isEmpty) return '';
  try {
    final d = DateTime.parse(ymd);
    return '${d.day} ${_monthShort(d.month)}';
  } catch (_) {
    return ymd;
  }
}

String _monthShort(int month) {
  const names = [
    '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return month >= 1 && month <= 12 ? names[month] : '';
}

/// Sum [sales_total] for trend points in the given calendar month (YYYY-MM).
double trendSalesTotalForMonth(List<Map<String, dynamic>> points, String yearMonth) {
  var sum = 0.0;
  for (final p in points) {
    final d = trendDayYmd(p);
    if (d.startsWith(yearMonth)) {
      sum += pickNum(p['sales_total'] ?? p['salesTotal'] ?? p['amount'])?.toDouble() ?? 0;
    }
  }
  return sum;
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
  final party = row['customer_name'] ??
      row['customerName'] ??
      row['vendor_name'] ??
      row['vendorName'] ??
      row['division_name'] ??
      row['divisionName'];
  final parts = <String>[];
  if (party != null && party.toString().trim().isNotEmpty) {
    parts.add(party.toString().trim());
  }
  final rawCount = row['item_count'] ?? row['itemCount'];
  if (rawCount != null) {
    final count = int.tryParse(rawCount.toString()) ?? 0;
    if (count > 0) parts.add('$count item${count == 1 ? '' : 's'}');
  }
  return parts.join(' · ');
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

/// Top customer's share of period sales (0–100). Null if not computable.
int? customerConcentrationPct(
  List<Map<String, dynamic>> topCustomers,
  num periodSales, {
  double thresholdPct = 40,
}) {
  if (topCustomers.isEmpty || periodSales <= 0) return null;
  final billed = customerBilledAmount(topCustomers.first).toDouble();
  if (billed <= 0) return null;
  final pct = (billed / periodSales.toDouble() * 100).round();
  return pct >= thresholdPct ? pct : null;
}

/// Payment-mode share trend vs prior month: `up`, `down`, or `stable`.
String paymentModeShareTrend({
  required num currentAmount,
  required num previousAmount,
  required num currentPeriodTotal,
  required num previousPeriodTotal,
  double shareDeltaThreshold = 0.02,
}) {
  final curShare =
      currentPeriodTotal > 0 ? currentAmount / currentPeriodTotal : 0.0;
  final prevShare =
      previousPeriodTotal > 0 ? previousAmount / previousPeriodTotal : 0.0;
  if (previousPeriodTotal <= 0 && currentAmount > 0) return 'up';
  if (currentPeriodTotal <= 0 && previousAmount > 0) return 'down';
  final delta = curShare - prevShare;
  if (delta.abs() < shareDeltaThreshold) return 'stable';
  return delta > 0 ? 'up' : 'down';
}

num paymentModesTotal(List<Map<String, dynamic>> rows) {
  return rows.fold<num>(
    0,
    (s, r) => s + (pickNum(r['total']) ?? 0),
  );
}

num paymentModeAmount(List<Map<String, dynamic>> rows, String mode) {
  final key = mode.trim().toUpperCase();
  for (final r in rows) {
    if ((r['mode'] ?? '').toString().trim().toUpperCase() == key) {
      return pickNum(r['total']) ?? 0;
    }
  }
  return 0;
}

/// ISO weekday totals Mon=1 … Sun=7 for chart display.
List<double> salesByIsoWeekday(List<Map<String, dynamic>> rows) {
  final totals = List<double>.filled(7, 0);
  for (final r in rows) {
    final dow = pickNum(r['dow'])?.toInt();
    if (dow == null || dow < 1 || dow > 7) continue;
    totals[dow - 1] = (pickNum(r['total']) ?? 0).toDouble();
  }
  return totals;
}
