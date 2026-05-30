import 'api_helpers.dart';

/// Extract report table rows from common report API shapes.
List<Map<String, dynamic>> extractReportRows(dynamic data) => extractList(data);

Map<String, dynamic>? extractReportTotals(dynamic data) {
  if (data is Map) {
    final totals = data['totals'] ?? data['summary'];
    if (totals is Map) return Map<String, dynamic>.from(totals);
  }
  return null;
}

Map<String, double> customerLedgerSummary(Map<String, dynamic>? summary) =>
    _ledgerSummary(summary);

Map<String, double> vendorLedgerSummary(Map<String, dynamic>? summary) =>
    _ledgerSummary(summary);

Map<String, double> _ledgerSummary(Map<String, dynamic>? summary) {
  if (summary == null) {
    return {'net': 0, 'due': 0, 'debit': 0, 'credit': 0};
  }
  double pick(String snake, String camel) {
    final v = summary[snake] ?? summary[camel];
    if (v is num) return v.toDouble();
    return double.tryParse(v?.toString() ?? '') ?? 0;
  }

  return {
    'net': pick('opening_balance', 'openingBalance'),
    'due': pick('closing_balance', 'closingBalance'),
    'debit': pick('total_debit', 'totalDebit'),
    'credit': pick('total_credit', 'totalCredit'),
  };
}

String ledgerEntryLabel(Map<String, dynamic> row) {
  final particular = row['particular'] ??
      row['description'] ??
      row['narration'] ??
      row['reference'] ??
      row['type'];
  if (particular != null && particular.toString().trim().isNotEmpty) {
    return particular.toString().trim();
  }
  final inv = row['invoice_number'] ?? row['invoiceNumber'];
  if (inv != null && inv.toString().trim().isNotEmpty) {
    return inv.toString().trim();
  }
  return (row['entry_type'] ?? row['entryType'] ?? 'Entry').toString();
}
