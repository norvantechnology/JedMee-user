import 'export_columns.dart';

typedef CsvColumn = ExportColumn;

/// Minimal CSV export — web uses download; mobile shows success toast after build.
abstract final class CsvExport {
  static Future<void> download({
    required String filename,
    required List<ExportColumn> columns,
    required List<Map<String, dynamic>> rows,
  }) async {
    // Stub: full file share can be added via share_plus later.
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
}
