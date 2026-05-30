import 'date.dart';

/// Expiry status for batch rows — LIVE / SOON / EXPIRED.
enum ExpiryStatus { live, soon, expired, unknown }

/// UI urgency for expiry badges.
enum ProductExpiryUrgency { expired, soon, safe }

ProductExpiryUrgency productExpiryUrgencyFor(Map<String, dynamic> row, {int soonDays = 90}) {
  return switch (expiryStatusFor(row, soonDays: soonDays)) {
    ExpiryStatus.expired => ProductExpiryUrgency.expired,
    ExpiryStatus.soon => ProductExpiryUrgency.soon,
    _ => ProductExpiryUrgency.safe,
  };
}

ExpiryStatus expiryStatusFor(Map<String, dynamic> row, {int soonDays = 90}) {
  final raw = row['expiry_date'] ?? row['expiryDate'];
  final dt = parseApiDate(raw);
  if (dt == null) return ExpiryStatus.unknown;
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final exp = DateTime(dt.year, dt.month, dt.day);
  if (exp.isBefore(today)) return ExpiryStatus.expired;
  if (exp.difference(today).inDays <= soonDays) return ExpiryStatus.soon;
  return ExpiryStatus.live;
}

String expiryStatusLabel(ExpiryStatus s) => switch (s) {
      ExpiryStatus.live => 'LIVE',
      ExpiryStatus.soon => 'SOON',
      ExpiryStatus.expired => 'EXPIRED',
      ExpiryStatus.unknown => '',
    };

/// Alias used by list tiles and detail sheets.
ProductExpiryUrgency? productExpiryUrgency(Map<String, dynamic> row, {int soonDays = 90}) {
  final status = expiryStatusFor(row, soonDays: soonDays);
  return switch (status) {
    ExpiryStatus.expired => ProductExpiryUrgency.expired,
    ExpiryStatus.soon => ProductExpiryUrgency.soon,
    ExpiryStatus.live => ProductExpiryUrgency.safe,
    ExpiryStatus.unknown => null,
  };
}

bool showExpiryBadgeOnList(ProductExpiryUrgency urgency) =>
    urgency != ProductExpiryUrgency.safe;

String expiryBadgeLabel(ProductExpiryUrgency urgency) => switch (urgency) {
      ProductExpiryUrgency.expired => 'Expired',
      ProductExpiryUrgency.soon => 'Expiring',
      ProductExpiryUrgency.safe => 'OK',
    };
