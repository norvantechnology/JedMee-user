import 'api_data.dart';
import 'api_helpers.dart';
import 'list_sort.dart';

import '../../widgets/filter_bottom_sheet.dart';

/// Client-side filters for transaction lists.
List<Map<String, dynamic>> applyListFilters(
  List<Map<String, dynamic>> rows,
  ListFilterState f,
) {
  var out = rows;

  if (f.dateFrom.isNotEmpty || f.dateTo.isNotEmpty) {
    out = out.where((r) {
      final dateStr = ymdFrom(
        r['invoice_date'] ??
            r['invoiceDate'] ??
            r['order_date'] ??
            r['orderDate'] ??
            r['created_at'] ??
            r['createdAt'] ??
            r['date'],
      );
      if (dateStr.isEmpty) return true;
      if (f.dateFrom.isNotEmpty && dateStr.compareTo(f.dateFrom) < 0) {
        return false;
      }
      if (f.dateTo.isNotEmpty && dateStr.compareTo(f.dateTo) > 0) return false;
      return true;
    }).toList();
  }

  if (f.status != null) {
    out = out
        .where((r) =>
            (r['status'] ?? '').toString().toUpperCase() == f.status!.toUpperCase())
        .toList();
  }

  if (f.paymentStatus != null) {
    out = out
        .where((r) =>
            (r['payment_status'] ?? r['paymentStatus'] ?? '')
                .toString()
                .toUpperCase() ==
            f.paymentStatus!.toUpperCase())
        .toList();
  }

  if (f.partyId != null && f.partyId!.isNotEmpty) {
    out = out.where((r) {
      final cid = (r['customer_id'] ?? r['customerId'] ?? '').toString();
      final vid = (r['vendor_id'] ?? r['vendorId'] ?? '').toString();
      return cid == f.partyId || vid == f.partyId;
    }).toList();
  }

  if (f.billType != null) {
    out = out
        .where((r) =>
            (r['bill_type'] ?? r['billType'] ?? r['invoice_type'] ?? '')
                .toString()
                .toUpperCase() ==
            f.billType!.toUpperCase())
        .toList();
  }

  switch (f.sortBy) {
    case 'amount_desc':
      out = [...out]..sort((a, b) {
          final av = (pickNum(invoiceRowAmount(a)) ?? 0).toDouble();
          final bv = (pickNum(invoiceRowAmount(b)) ?? 0).toDouble();
          return bv.compareTo(av);
        });
    case 'amount_asc':
      out = [...out]..sort((a, b) {
          final av = (pickNum(invoiceRowAmount(a)) ?? 0).toDouble();
          final bv = (pickNum(invoiceRowAmount(b)) ?? 0).toDouble();
          return av.compareTo(bv);
        });
    case 'party_asc':
      out = [...out]..sort((a, b) {
          final al = rowLabel(a).toLowerCase();
          final bl = rowLabel(b).toLowerCase();
          return al.compareTo(bl);
        });
    case 'party_desc':
      out = [...out]..sort((a, b) {
          final al = rowLabel(a).toLowerCase();
          final bl = rowLabel(b).toLowerCase();
          return bl.compareTo(al);
        });
    case 'date_asc':
      out = [...out]..sort((a, b) {
          final ad = sortTimestampFromRow(a);
          final bd = sortTimestampFromRow(b);
          if (ad != null && bd != null) return ad.compareTo(bd);
          if (ad != null) return -1;
          if (bd != null) return 1;
          return 0;
        });
    case 'date_desc':
    default:
      out = sortRowsByCreatedAtDesc(out);
  }

  return out;
}
