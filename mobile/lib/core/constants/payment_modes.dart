/// Payment modes aligned with backend enums.
const List<String> kCustomerPaymentModes = [
  'CASH',
  'UPI',
  'CARD',
  'CHEQUE',
  'NEFT',
  'OTHER',
];

String formatPaymentModeLabel(String? mode) {
  final m = (mode ?? '').toUpperCase();
  if (m.isEmpty || m == 'CREDIT') return 'Credit';
  switch (m) {
    case 'CASH':
      return 'Cash';
    case 'UPI':
      return 'UPI';
    case 'CARD':
      return 'Card';
    case 'CHEQUE':
      return 'Cheque';
    case 'NEFT':
      return 'NEFT';
    case 'OTHER':
      return 'Other';
    default:
      return m;
  }
}

/// Default pay-now for walk-in / counter sales on mobile when wired into billing UI.
bool defaultCollectPaymentNow({
  required bool isRetailer,
  required bool isWalkIn,
  required bool isCashCustomer,
}) {
  if (isRetailer && isWalkIn) return true;
  if (isCashCustomer) return true;
  return false;
}
