/// User-facing labels for API / database enum values.
/// Never show raw database values in the UI — always map through this function.
String displayStatusLabel(String? raw) {
  if (raw == null || raw.trim().isEmpty) return '—';
  final key = raw.toUpperCase().replaceAll(' ', '_').replaceAll('-', '_');
  const map = {
    // Transaction statuses
    'CONFIRMED': 'Confirmed',
    'DRAFT': 'Draft',
    'CANCELLED': 'Cancelled',
    'PENDING': 'Pending',
    // Payment statuses
    'PAID': 'Paid',
    'UNPAID': 'Unpaid',
    'PARTIAL': 'Partial',
    'PARTIALLY_PAID': 'Partially paid',
    // Order statuses
    'ACCEPTED': 'Accepted',
    'DISPATCHED': 'Dispatched',
    'DELIVERED': 'Delivered',
    'REJECTED': 'Rejected',
    // Entity statuses
    'ACTIVE': 'Active',
    'INACTIVE': 'Inactive',
    'APPROVED': 'Approved',
    'BLOCKED': 'Blocked',
    // Inventory / expiry statuses
    'NEAR_EXP': 'Expiring soon',
    'NEAR_EXPIRY': 'Expiring soon',
    'NO_STOCK': 'Out of stock',
    'LOW_STOCK': 'Low stock',
    'IN_STOCK': 'In stock',
    'SAFE': 'In stock',
    'EXPIRED': 'Expired',
    'HEALTHY': 'In stock',
    // Boolean-like values — never show raw true/false
    'TRUE': 'Yes',
    'FALSE': 'No',
    '1': 'Yes',
    '0': 'No',
    // Invoice types
    'B2B': 'B2B',
    'B2C': 'B2C',
    'CASH_MEMO': 'Cash memo',
    'TAX_INVOICE': 'Tax invoice',
    'CREDIT_NOTE': 'Credit note',
    // Transaction types
    'CREDIT': 'Credit',
    'DEBIT': 'Debit',
    // Customer types
    'RETAIL': 'Retail',
    'WHOLESALE': 'Wholesale',
    // Rate types
    'SALES_RATE': 'Sales rate',
    'MRP': 'MRP',
    'PURCHASE_RATE': 'Purchase rate',
    'RETAIL_RATE': 'Retail rate',
    // Purchase source types
    'DIVISION': 'Division',
    'VENDOR': 'Vendor',
    'SUPPLIER': 'Supplier',
    // Return statuses
    'NOT_SET': 'Not set',
    'RETURNED': 'Returned',
    'PARTIAL_RETURN': 'Partial return',
    // N/A variants
    'N/A': 'Not set',
    'NA': 'Not set',
    'NONE': 'Not set',
    'NULL': '—',
  };
  if (map.containsKey(key)) return map[key]!;
  // Convert SNAKE_CASE or ALL_CAPS to Title Case
  return key
      .toLowerCase()
      .split('_')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}

String displayBool(dynamic value) {
  if (value == null) return '—';
  final s = value.toString().toLowerCase();
  if (s == 'true' || s == '1' || s == 'yes') return 'Yes';
  if (s == 'false' || s == '0' || s == 'no') return 'No';
  return value.toString();
}

String displayHealth(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  final key = raw.toUpperCase();
  if (key.contains('NEAR')) return 'Expiring soon';
  if (key.contains('NO_STOCK') || key == 'NO STOCK') return 'Out of stock';
  if (key.contains('LOW')) return 'Low stock';
  if (key.contains('EXPIRED')) return 'Expired';
  return displayStatusLabel(raw);
}

bool isTruthyDisplayValue(String? raw) {
  final s = raw?.toLowerCase() ?? '';
  return s == 'true' || s == '1' || s == 'yes';
}
