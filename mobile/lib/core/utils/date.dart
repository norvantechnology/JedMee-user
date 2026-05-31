import 'package:intl/intl.dart';

import 'timezone.dart';

/// Local calendar date as `YYYY-MM-DD` (device / screen timezone).
String todayYmdLocal([DateTime? dt]) => todayYmdInScreenZone(dt);

/// Add [days] to a `YYYY-MM-DD` string (returns empty if invalid).
String addDaysYmd(String ymd, int days) {
  final dt = parseApiDate(ymd);
  if (dt == null) return '';
  return todayYmdLocal(dt.add(Duration(days: days)));
}

/// Date parsing helpers for API payloads.
DateTime? parseApiDate(dynamic value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  final s = value.toString().trim();
  if (s.isEmpty) return null;
  return DateTime.tryParse(s);
}

String? isoDateOnly(dynamic value) {
  final dt = parseApiDate(value);
  if (dt == null) return null;
  final y = dt.year.toString().padLeft(4, '0');
  final m = dt.month.toString().padLeft(2, '0');
  final d = dt.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

String _monthYearLabel(DateTime d) => DateFormat('MMM yyyy').format(d);

/// Calendar days left in [from]'s month (including today).
int daysRemainingInMonth([DateTime? from]) {
  final n = from ?? DateTime.now();
  final lastDay = DateTime(n.year, n.month + 1, 0).day;
  return (lastDay - n.day).clamp(0, 31);
}

/// Display label for the active calendar month, e.g. "May 2026".
String currentMonthYearLabel([DateTime? from]) {
  final n = from ?? DateTime.now();
  return DateFormat('MMMM yyyy').format(n);
}

/// Column headers for dashboard sales-compare bars (left → right):
/// same month last year · previous calendar month · active period.
List<String> momCompareColumnLabels({
  required String dateToYmd,
  required String dateFromYmd,
  required String preset,
}) {
  final end = parseApiDate(dateToYmd) ?? DateTime.now();
  final start = parseApiDate(dateFromYmd) ?? end;

  final lastYearLabel = _monthYearLabel(DateTime(end.year - 1, end.month));
  final lastMonthLabel = _monthYearLabel(DateTime(end.year, end.month - 1));

  final String currentLabel;
  switch (preset) {
    case 'TODAY':
      currentLabel = DateFormat('d MMM yyyy').format(end);
    case 'WEEK':
      if (start.year == end.year && start.month == end.month) {
        currentLabel =
            '${start.day}–${end.day} ${DateFormat('MMM yyyy').format(end)}';
      } else {
        currentLabel =
            '${DateFormat('d MMM').format(start)} – ${DateFormat('d MMM yyyy').format(end)}';
      }
    case 'QUARTER':
      final q = ((end.month - 1) ~/ 3) + 1;
      currentLabel = 'Q$q ${end.year}';
    case 'YEAR':
      currentLabel = '${end.year}';
    default:
      if (dateFromYmd.isNotEmpty &&
          dateFromYmd != dateToYmd &&
          (start.year != end.year || start.month != end.month)) {
        currentLabel =
            '${DateFormat('d MMM').format(start)} – ${DateFormat('d MMM yyyy').format(end)}';
      } else {
        currentLabel = _monthYearLabel(end);
      }
  }

  return [lastYearLabel, lastMonthLabel, currentLabel];
}
