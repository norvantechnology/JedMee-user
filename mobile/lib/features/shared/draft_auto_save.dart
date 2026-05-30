import 'dart:async';

import 'package:flutter/foundation.dart';

/// Debounced auto-save for draft invoices (mirrors web `useDraftAutoSave`).
class DraftAutoSave {
  DraftAutoSave({
    this.debounceMs = 1200,
    required this.onSave,
  });

  final int debounceMs;
  final Future<void> Function({bool updateUi}) onSave;

  Timer? _timer;
  bool _saving = false;

  bool get isSaving => _saving;

  void schedule() {
    _timer?.cancel();
    _timer = Timer(Duration(milliseconds: debounceMs), () async {
      if (_saving) return;
      _saving = true;
      try {
        await onSave();
      } catch (e, st) {
        if (kDebugMode) {
          debugPrint('DraftAutoSave failed: $e\n$st');
        }
      } finally {
        _saving = false;
      }
    });
  }

  void cancel() {
    _timer?.cancel();
    _timer = null;
  }

  void dispose() => cancel();
}

/// Legacy name used by invoice editor screens.
typedef DraftAutoSaveScheduler = DraftAutoSave;

bool isDraftInvoiceStatus(dynamic rowOrStatus) {
  if (rowOrStatus is String) {
    final s = rowOrStatus.toUpperCase();
    return s.isEmpty || s == 'DRAFT';
  }
  if (rowOrStatus is Map) {
    final s = (rowOrStatus['status'] ?? '').toString().toUpperCase();
    return s.isEmpty || s == 'DRAFT';
  }
  return true;
}

bool salesItemsReadyForAutoSave({
  required String? customerId,
  required List<Map<String, dynamic>> items,
}) {
  if (customerId == null || customerId.isEmpty) return false;
  return items.any((it) {
    final pid = (it['productId'] ?? it['product_id'])?.toString() ?? '';
    final bid = (it['batchId'] ?? it['batch_id'])?.toString() ?? '';
    return pid.isNotEmpty && bid.isNotEmpty;
  });
}

bool purchaseItemsReadyForAutoSave({
  required String? vendorId,
  required String? divisionId,
  required bool isRetailer,
  required List<Map<String, dynamic>> items,
}) {
  if (isRetailer) {
    if (vendorId == null || vendorId.isEmpty) return false;
  } else {
    if (divisionId == null || divisionId.isEmpty) return false;
  }
  return items.any((it) {
    final pid = (it['productId'] ?? it['product_id'])?.toString() ?? '';
    final isNew = it['isNewBatch'] == true || it['is_new_batch'] == true;
    final bid = (it['batchId'] ?? it['batch_id'])?.toString() ?? '';
    return pid.isNotEmpty && (isNew || bid.isNotEmpty);
  });
}
