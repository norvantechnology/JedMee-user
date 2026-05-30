final _uuidRe = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
);

bool looksLikeUuid(String id) => _uuidRe.hasMatch(id.trim());

String shortenUuid(String id) {
  final s = id.trim();
  if (s.length < 8) return s;
  return '${s.substring(0, 8)}…';
}

String displayId(dynamic id) {
  final s = id?.toString().trim() ?? '';
  if (s.isEmpty) return '—';
  if (looksLikeUuid(s)) return shortenUuid(s);
  return s;
}

/// First human-readable identifier on a list row (never a raw UUID when avoidable).
String displayIdFromRow(
  Map<String, dynamic> row, {
  List<String> keys = const [],
  String idPrefix = '',
}) {
  for (final key in keys) {
    final v = row[key];
    if (v == null) continue;
    final s = v.toString().trim();
    if (s.isEmpty || looksLikeUuid(s)) continue;
    return s;
  }
  final id = row['id']?.toString().trim() ?? '';
  if (id.isEmpty) return '—';
  if (looksLikeUuid(id)) {
    return idPrefix.isNotEmpty ? '$idPrefix${shortenUuid(id)}' : shortenUuid(id);
  }
  return idPrefix.isNotEmpty ? '$idPrefix$id' : id;
}
