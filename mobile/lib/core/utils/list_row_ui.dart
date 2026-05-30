import 'api_data.dart';
import 'api_helpers.dart';
import 'format.dart';
import 'product_stock.dart';
import 'record_fields.dart';
import '../../features/shared/invoice_outstanding_utils.dart';

/// Resolved fields for a compact list row — one source of truth for all modules.
class ListRowViewModel {
  const ListRowViewModel({
    required this.title,
    this.subtitle,
    this.secondarySubtitle,
    this.meta,
    this.amount,
    this.status,
    this.secondaryStatus,
    this.showLeadingIcon = true,
  });

  final String title;
  final String? subtitle;
  /// Extra info line below subtitle (e.g. balance due, items count).
  final String? secondarySubtitle;
  /// Small line under amount (e.g. invoice date).
  final String? meta;
  final String? amount;
  /// Primary status badge (invoice status: DRAFT / CONFIRMED / CANCELLED).
  final String? status;
  /// Secondary status badge (payment status: PAID / UNPAID / PARTIAL).
  final String? secondaryStatus;
  final bool showLeadingIcon;
}

String _partyName(Map<String, dynamic> row) {
  for (final k in [
    'customer_name',
    'customerName',
    'vendor_name',
    'vendorName',
    'division_name',
    'divisionName',
    'retailer_name',
    'retailerName',
    'retailer_firm_name',
    'retailerFirmName',
    'wholesaler_name',
    'wholesalerName',
    'wholesaler_firm_name',
    'wholesalerFirmName',
  ]) {
    final v = row[k];
    if (v != null && v.toString().trim().isNotEmpty) return v.toString().trim();
  }
  return '';
}

String _firstNonEmpty(Map<String, dynamic> row, List<String> keys) {
  for (final k in keys) {
    final v = row[k];
    if (v != null && v.toString().trim().isNotEmpty && v.toString() != 'null') {
      return v.toString().trim();
    }
  }
  return '';
}

String _compactProductSubtitle(Map<String, dynamic> row) {
  final parts = <String>[];
  final code = _firstNonEmpty(row, ['code', 'product_code', 'productCode']);
  if (code.isNotEmpty) parts.add(code);
  final mfg = _firstNonEmpty(row, ['mfg_company_name', 'mfgCompanyName']);
  if (mfg.isNotEmpty) parts.add(mfg);
  // Batch count removed — stock status badge already conveys this
  return parts.join(' · ');
}

String _compactBatchSubtitle(Map<String, dynamic> row) {
  final parts = <String>[];
  final batch = _firstNonEmpty(row, ['batch_no', 'batchNo']);
  if (batch.isNotEmpty) parts.add(batch);
  final exp = fmtDisplayDate(row['expiry_date'] ?? row['expiryDate']);
  if (exp.isNotEmpty) parts.add(exp);
  return parts.join(' · ');
}

/// Primary title for any list row.
String listRowTitleFor(Map<String, dynamic> row) {
  final entity = detectRecordEntity(row);
  switch (entity) {
    case RecordEntity.salesInvoice:
    case RecordEntity.purchaseInvoice:
    case RecordEntity.salesReturn:
    case RecordEntity.purchaseReturn:
    case RecordEntity.order:
      return txnRowTitle(row);
    case RecordEntity.payment:
      return _firstNonEmpty(row, ['receipt_no', 'receiptNo']) != ''
          ? _firstNonEmpty(row, ['receipt_no', 'receiptNo'])
          : rowLabel(row);
    case RecordEntity.user:
      final name = _firstNonEmpty(row, ['full_name', 'fullName']);
      return name.isNotEmpty ? name : _firstNonEmpty(row, ['email']);
    case RecordEntity.product:
      return rowLabel(row, ['name', 'product_name', 'productName']);
    case RecordEntity.productBatch:
      return _firstNonEmpty(row, ['product_name', 'productName', 'drug_name', 'drugName']);
    default:
      return rowLabel(row);
  }
}

/// Single compact subtitle line — no duplicate labels, most useful info only.
String listRowSubtitleForCompact(Map<String, dynamic> row) {
  final entity = detectRecordEntity(row);
  switch (entity) {
    case RecordEntity.product:
      return _compactProductSubtitle(row);
    case RecordEntity.productBatch:
      return _compactBatchSubtitle(row);
    case RecordEntity.salesInvoice:
    case RecordEntity.purchaseInvoice:
      // Party name + items count for quick at-a-glance info
      final party = _partyName(row);
      final rawCount = row['item_count'] ?? row['itemCount'];
      if (rawCount != null) {
        final count = int.tryParse(rawCount.toString()) ?? 0;
        if (count > 0) {
          return party.isNotEmpty
              ? '$party · $count item${count == 1 ? '' : 's'}'
              : '$count item${count == 1 ? '' : 's'}';
        }
      }
      return party;
    case RecordEntity.salesReturn:
    case RecordEntity.purchaseReturn:
      // Party name only — date is shown as meta on the right side
      return _partyName(row);
    case RecordEntity.customer:
    case RecordEntity.vendor:
      // Phone is the most actionable contact info; skip city/GST to reduce clutter
      return _firstNonEmpty(row, ['phone_number', 'phoneNumber', 'phone']);
    case RecordEntity.division:
      // Show manufacturer name if available, otherwise code
      final mfg = _firstNonEmpty(row, ['mfg_company_name', 'mfgCompanyName']);
      if (mfg.isNotEmpty) return mfg;
      return _firstNonEmpty(row, ['code', 'division_code']);
    case RecordEntity.mfgCompany:
      return _firstNonEmpty(row, ['short_name', 'shortName', 'code']);
    case RecordEntity.payment:
      return _partyName(row);
    case RecordEntity.order:
      // Party name + item count for quick at-a-glance info
      final party = _partyName(row);
      final rawCount = row['item_count'] ?? row['itemCount'];
      if (rawCount != null) {
        final count = int.tryParse(rawCount.toString()) ?? 0;
        if (count > 0) {
          return party.isNotEmpty
              ? '$party · $count item${count == 1 ? '' : 's'}'
              : '$count item${count == 1 ? '' : 's'}';
        }
      }
      return party;
    case RecordEntity.user:
      return _firstNonEmpty(row, ['email']);
    default:
      final created = row['created_at'] ?? row['createdAt'];
      if (created != null) return fmtDisplayDate(created);
      return '';
  }
}

/// Extra info line below subtitle — balance due for invoices, product names for orders.
String? listRowSecondarySubtitleFor(Map<String, dynamic> row) {
  final entity = detectRecordEntity(row);

  if (entity == RecordEntity.salesInvoice ||
      entity == RecordEntity.purchaseInvoice) {
    final due = invoiceOutstandingDue(row);
    if (due > 0.001) return 'Balance: ${fmtCurrency(due)}';
  }

  if (entity == RecordEntity.order) {
    final items = row['items'];
    if (items is List && items.isNotEmpty) {
      final names = items
          .whereType<Map>()
          .map((it) =>
              (it['product_name'] ?? it['productName'] ?? '').toString().trim())
          .where((n) => n.isNotEmpty)
          .take(3)
          .toList();
      if (names.isNotEmpty) {
        final extra = items.length > 3 ? ' +${items.length - 3} more' : '';
        return names.join(', ') + extra;
      }
    }
  }

  return null;
}

/// Compact date shown above the amount on the right side.
String? listRowMetaFor(Map<String, dynamic> row) {
  final entity = detectRecordEntity(row);
  switch (entity) {
    case RecordEntity.salesInvoice:
    case RecordEntity.purchaseInvoice:
      return fmtDisplayDate(row['invoice_date'] ?? row['invoiceDate']);
    case RecordEntity.salesReturn:
    case RecordEntity.purchaseReturn:
      return fmtDisplayDate(row['return_date'] ?? row['returnDate']);
    case RecordEntity.payment:
      return fmtDisplayDate(row['payment_date'] ?? row['paymentDate']);
    case RecordEntity.order:
      return fmtDisplayDate(row['placed_at'] ?? row['placedAt'] ?? row['order_date']);
    case RecordEntity.productBatch:
      // Show expiry date as meta for batch rows
      final exp = fmtDisplayDate(row['expiry_date'] ?? row['expiryDate']);
      return exp.isNotEmpty ? 'Exp $exp' : null;
    default:
      return null;
  }
}

/// Right-side amount when applicable.
String? listRowAmountFor(Map<String, dynamic> row) {
  final entity = detectRecordEntity(row);
  switch (entity) {
    case RecordEntity.salesInvoice:
    case RecordEntity.purchaseInvoice:
    case RecordEntity.salesReturn:
    case RecordEntity.purchaseReturn:
      return fmtCurrency(invoiceRowAmount(row));
    case RecordEntity.payment:
      final amt = row['amount'] ?? row['payment_amount'] ?? row['paymentAmount'];
      return amt != null ? fmtCurrency(amt) : null;
    case RecordEntity.order:
      final amt = row['total_amount'] ?? row['totalAmount'] ?? row['amount'];
      return amt != null ? fmtCurrency(amt) : null;
    case RecordEntity.product:
      return formatStockQty(productTotalQuantity(row));
    case RecordEntity.productBatch:
      return formatStockQty(batchTotalStock(row));
    default:
      final amt = row['amount'] ?? row['total'] ?? row['balance'];
      return amt != null ? fmtCurrency(amt) : null;
  }
}

String? listRowAmountLabelFor(Map<String, dynamic> row) {
  return switch (detectRecordEntity(row)) {
    RecordEntity.product || RecordEntity.productBatch => 'Qty',
    _ => null,
  };
}

/// Primary status badge — invoice/record status (DRAFT / CONFIRMED / CANCELLED).
/// Payment status is shown separately via [listRowSecondaryStatusFor].
String? listRowStatusFor(
  Map<String, dynamic> row, {
  String? override,
}) {
  if (override != null && override.trim().isNotEmpty) return override;

  if (row['is_blocked'] == true || row['isBlocked'] == true) return 'BLOCKED';
  if (row['is_active'] == false || row['isActive'] == false) return 'INACTIVE';

  final entity = detectRecordEntity(row);
  if (entity == RecordEntity.product) return productListStatusChip(row);
  if (entity == RecordEntity.productBatch) return batchListStatusChip(row);

  // For invoices/returns: always show invoice status as primary badge
  final status = row['status']?.toString();
  if (status != null && status.isNotEmpty) return status;

  // Fallback: payment status if no invoice status
  final pay = (row['payment_status'] ?? row['paymentStatus'])?.toString();
  if (pay != null && pay.isNotEmpty) return pay;

  return null;
}

/// Secondary status badge — payment status for invoices (PAID / UNPAID / PARTIAL).
String? listRowSecondaryStatusFor(Map<String, dynamic> row) {
  final entity = detectRecordEntity(row);
  if (entity == RecordEntity.salesInvoice ||
      entity == RecordEntity.purchaseInvoice ||
      entity == RecordEntity.salesReturn ||
      entity == RecordEntity.purchaseReturn) {
    final pay = (row['payment_status'] ?? row['paymentStatus'])?.toString();
    if (pay != null && pay.isNotEmpty) return pay;
  }
  return null;
}

bool listRowShowLeadingIcon(Map<String, dynamic> row) {
  return switch (detectRecordEntity(row)) {
    RecordEntity.salesInvoice ||
    RecordEntity.purchaseInvoice ||
    RecordEntity.salesReturn ||
    RecordEntity.purchaseReturn ||
    RecordEntity.payment =>
      false,
    _ => true,
  };
}

ListRowViewModel presentListRow(
  Map<String, dynamic> row, {
  String? title,
  String? subtitle,
  String? status,
}) {
  return ListRowViewModel(
    title: title ?? listRowTitleFor(row),
    subtitle: subtitle ?? listRowSubtitleForCompact(row),
    secondarySubtitle: listRowSecondarySubtitleFor(row),
    meta: listRowMetaFor(row),
    amount: listRowAmountFor(row),
    status: listRowStatusFor(row, override: status),
    secondaryStatus: listRowSecondaryStatusFor(row),
    showLeadingIcon: listRowShowLeadingIcon(row),
  );
}
