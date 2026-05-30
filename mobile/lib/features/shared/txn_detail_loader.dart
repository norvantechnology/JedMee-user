import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_response.dart';
import '../../core/utils/api_helpers.dart';
import '../../providers/app_providers.dart';

enum TxnDetailKind { salesInvoice, purchaseInvoice, salesReturn, purchaseReturn }

Future<({Map<String, dynamic>? row, List<Map<String, dynamic>> items, String? error})>
    loadTxnDetail(
  WidgetRef ref,
  TxnDetailKind kind,
  Object id,
) async {
  ApiResponse resp;
  switch (kind) {
    case TxnDetailKind.salesInvoice:
      resp = await ref.read(salesRepositoryProvider).getSalesInvoice(id);
      break;
    case TxnDetailKind.purchaseInvoice:
      resp = await ref.read(purchaseRepositoryProvider).getPurchaseInvoice(id);
      break;
    case TxnDetailKind.salesReturn:
      resp = await ref.read(salesRepositoryProvider).getSalesReturn(id);
      break;
    case TxnDetailKind.purchaseReturn:
      resp = await ref.read(purchaseRepositoryProvider).getPurchaseReturn(id);
      break;
  }
  if (!resp.ok) {
    return (
      row: null,
      items: <Map<String, dynamic>>[],
      error: resp.parseErrorMessage(),
    );
  }
  final map = extractDataMap(resp) ?? {};
  final invoice = map['invoice'] is Map
      ? Map<String, dynamic>.from(map['invoice'] as Map)
      : map;
  final rawItems = map['items'] ?? invoice['items'];
  final items = rawItems is List
      ? rawItems.whereType<Map>().map(Map<String, dynamic>.from).toList()
      : <Map<String, dynamic>>[];
  return (row: invoice, items: items, error: null);
}
