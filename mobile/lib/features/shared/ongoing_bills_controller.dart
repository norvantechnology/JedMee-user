import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/utils/api_helpers.dart';
import '../../providers/app_providers.dart';

/// One in-progress (DRAFT) bill on the parallel-billing rail.
///
/// Compact projection of a sales/purchase DRAFT — exactly the fields we need
/// to render a chip and route to the editor.
@immutable
class OngoingBill {
  const OngoingBill({
    required this.id,
    required this.invoiceNumber,
    required this.partyId,
    required this.partyName,
    required this.itemCount,
    required this.totalAmount,
    required this.createdById,
    required this.createdByName,
    this.updatedAt,
    this.notes,
  });

  final String id;
  final String invoiceNumber;
  final String partyId;
  final String partyName;
  final int itemCount;
  final double totalAmount;
  final String createdById;
  final String createdByName;
  final DateTime? updatedAt;
  final String? notes;

  /// Short label used on the chip — falls back gracefully when bill is new.
  String get shortLabel {
    if (partyName.trim().isNotEmpty) return partyName.trim();
    if (invoiceNumber.isNotEmpty) {
      final last = invoiceNumber.length > 6
          ? invoiceNumber.substring(invoiceNumber.length - 6)
          : invoiceNumber;
      return 'Bill $last';
    }
    return 'New bill';
  }

  factory OngoingBill.fromSalesJson(Map<String, dynamic> j) => OngoingBill(
        id: (j['id'] ?? '').toString(),
        invoiceNumber: (j['invoice_number'] ?? j['invoiceNumber'] ?? '').toString(),
        partyId: (j['customer_id'] ?? j['customerId'] ?? '').toString(),
        partyName: (j['customer_name'] ?? j['customerName'] ?? '').toString(),
        itemCount: (j['item_count'] ?? j['itemCount'] ?? 0) is num
            ? (j['item_count'] ?? j['itemCount']).toInt()
            : int.tryParse('${j['item_count'] ?? j['itemCount']}') ?? 0,
        totalAmount: _toDouble(j['total_amount'] ?? j['totalAmount']),
        createdById: (j['created_by_user_id'] ?? j['createdByUserId'] ?? '').toString(),
        createdByName: (j['created_by_name'] ?? j['createdByName'] ?? '').toString(),
        updatedAt: _toDate(j['updated_at'] ?? j['updatedAt']),
        notes: (j['notes'] ?? '').toString(),
      );

  factory OngoingBill.fromPurchaseJson(Map<String, dynamic> j) => OngoingBill(
        id: (j['id'] ?? '').toString(),
        invoiceNumber: (j['invoice_number'] ?? j['invoiceNumber'] ?? '').toString(),
        partyId: (j['vendor_id'] ?? j['vendorId'] ?? '').toString(),
        partyName: (j['vendor_name'] ?? j['vendorName'] ?? '').toString(),
        itemCount: (j['item_count'] ?? j['itemCount'] ?? 0) is num
            ? (j['item_count'] ?? j['itemCount']).toInt()
            : int.tryParse('${j['item_count'] ?? j['itemCount']}') ?? 0,
        totalAmount: _toDouble(j['total_amount'] ?? j['totalAmount']),
        createdById: (j['created_by_user_id'] ?? j['createdByUserId'] ?? '').toString(),
        createdByName: (j['created_by_name'] ?? j['createdByName'] ?? '').toString(),
        updatedAt: _toDate(j['updated_at'] ?? j['updatedAt']),
        notes: null,
      );
}

double _toDouble(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0;
}

DateTime? _toDate(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  return DateTime.tryParse(v.toString());
}

/// Snapshot for the rail.
@immutable
class OngoingBillsState {
  const OngoingBillsState({
    this.loading = false,
    this.bills = const [],
    this.activeId,
    this.error,
  });

  final bool loading;
  final List<OngoingBill> bills;
  final String? activeId;
  final String? error;

  OngoingBillsState copyWith({
    bool? loading,
    List<OngoingBill>? bills,
    String? activeId,
    String? error,
    bool clearActive = false,
    bool clearError = false,
  }) {
    return OngoingBillsState(
      loading: loading ?? this.loading,
      bills: bills ?? this.bills,
      activeId: clearActive ? null : (activeId ?? this.activeId),
      error: clearError ? null : (error ?? this.error),
    );
  }

  OngoingBill? get activeBill {
    final id = activeId;
    if (id == null || id.isEmpty) return null;
    for (final b in bills) {
      if (b.id == id) return b;
    }
    return null;
  }
}

enum BillModule { sales, purchase }

class OngoingBillsController extends StateNotifier<OngoingBillsState> {
  OngoingBillsController(this._ref, this.module)
      : _prefsKey =
            module == BillModule.sales ? 'sales_active_draft' : 'purchase_active_draft',
        super(const OngoingBillsState(loading: true)) {
    refresh();
  }

  final Ref _ref;
  final BillModule module;
  final String _prefsKey;

  /// Pulls the latest DRAFT list from the backend. Cheap and idempotent —
  /// callers should refresh after creating, saving, confirming or cancelling
  /// a bill so the rail stays in sync.
  Future<void> refresh({String? selectAfter}) async {
    if (!mounted) return;
    state = state.copyWith(loading: true, clearError: true);
    try {
      final resp = module == BillModule.sales
          ? await _ref
              .read(salesRepositoryProvider)
              .listOngoingSalesInvoices({'limit': '30'})
          : await _ref
              .read(purchaseRepositoryProvider)
              .listOngoingPurchaseInvoices({'limit': '30'});
      if (!mounted) return;
      if (!resp.ok) {
        state = state.copyWith(loading: false, error: resp.parseErrorMessage());
        return;
      }
      final rows = listFromResponse(resp).rows;
      final bills = rows
          .map((r) => module == BillModule.sales
              ? OngoingBill.fromSalesJson(r)
              : OngoingBill.fromPurchaseJson(r))
          .where((b) => b.id.isNotEmpty)
          .toList();

      // Default selection: explicit override → previously-active id (if still
      // present). If the rail has been emptied, clear selection.
      // NOTE: We intentionally do NOT auto-select the first bill when there is
      // no previously active bill. Auto-selecting the first draft would
      // incorrectly highlight an existing bill when the user is creating a
      // brand-new invoice, making it appear as if that draft is being edited.
      String? nextActive = selectAfter;
      if (nextActive == null || nextActive.isEmpty) {
        final prevId = state.activeId ?? await _readPersisted();
        if (!mounted) return;
        if (prevId != null && bills.any((b) => b.id == prevId)) {
          nextActive = prevId;
        }
        // No fallback to bills.first — let the user choose which draft to resume.
      }
      if (!mounted) return;
      state = state.copyWith(
        loading: false,
        bills: bills,
        activeId: nextActive,
        clearActive: bills.isEmpty,
      );
      await _persistActive(nextActive);
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(loading: false, error: e.toString());
    }
  }

  Future<void> setActive(String? id) async {
    if (!mounted) return;
    state = state.copyWith(activeId: id, clearActive: id == null);
    await _persistActive(id);
  }

  Future<String?> _readPersisted() async {
    try {
      final p = await SharedPreferences.getInstance();
      final v = p.getString(_prefsKey);
      return (v == null || v.isEmpty) ? null : v;
    } catch (_) {
      return null;
    }
  }

  Future<void> _persistActive(String? id) async {
    try {
      final p = await SharedPreferences.getInstance();
      if (id == null || id.isEmpty) {
        await p.remove(_prefsKey);
      } else {
        await p.setString(_prefsKey, id);
      }
    } catch (_) {
      // Persistence is best-effort — UI state still holds the active id.
    }
  }
}

final ongoingSalesBillsProvider =
    StateNotifierProvider<OngoingBillsController, OngoingBillsState>(
  (ref) => OngoingBillsController(ref, BillModule.sales),
);

final ongoingPurchaseBillsProvider =
    StateNotifierProvider<OngoingBillsController, OngoingBillsState>(
  (ref) => OngoingBillsController(ref, BillModule.purchase),
);
