import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';
import 'package:flutter/material.dart';

/// Currency catalogue mirroring frontend/src/utils/currency.js.
class CurrencyConfig {
  const CurrencyConfig({
    required this.code,
    required this.symbol,
    required this.locale,
    required this.decimals,
    required this.name,
  });

  final String code;
  final String symbol;
  final String locale;
  final int decimals;
  final String name;
}

const Map<String, CurrencyConfig> currencies = {
  'INR': CurrencyConfig(code: 'INR', symbol: '₹',    locale: 'en_IN', decimals: 2, name: 'Indian Rupee'),
  'USD': CurrencyConfig(code: 'USD', symbol: '\$',   locale: 'en_US', decimals: 2, name: 'US Dollar'),
  'EUR': CurrencyConfig(code: 'EUR', symbol: '€',    locale: 'en',    decimals: 2, name: 'Euro'),
  'GBP': CurrencyConfig(code: 'GBP', symbol: '£',    locale: 'en_GB', decimals: 2, name: 'British Pound'),
  'AED': CurrencyConfig(code: 'AED', symbol: 'د.إ',  locale: 'ar_AE', decimals: 2, name: 'UAE Dirham'),
  'CAD': CurrencyConfig(code: 'CAD', symbol: 'CA\$', locale: 'en_CA', decimals: 2, name: 'Canadian Dollar'),
  'AUD': CurrencyConfig(code: 'AUD', symbol: 'A\$',  locale: 'en_AU', decimals: 2, name: 'Australian Dollar'),
  'SGD': CurrencyConfig(code: 'SGD', symbol: 'S\$',  locale: 'en_SG', decimals: 2, name: 'Singapore Dollar'),
  'JPY': CurrencyConfig(code: 'JPY', symbol: '¥',    locale: 'ja_JP', decimals: 0, name: 'Japanese Yen'),
  'CNY': CurrencyConfig(code: 'CNY', symbol: '¥',    locale: 'zh_CN', decimals: 2, name: 'Chinese Yuan'),
  'SAR': CurrencyConfig(code: 'SAR', symbol: 'SR',   locale: 'ar_SA', decimals: 2, name: 'Saudi Riyal'),
  'MYR': CurrencyConfig(code: 'MYR', symbol: 'RM',   locale: 'ms_MY', decimals: 2, name: 'Malaysian Ringgit'),
  'NZD': CurrencyConfig(code: 'NZD', symbol: 'NZ\$', locale: 'en_NZ', decimals: 2, name: 'New Zealand Dollar'),
  'ZAR': CurrencyConfig(code: 'ZAR', symbol: 'R',    locale: 'en_ZA', decimals: 2, name: 'South African Rand'),
};

/// Ordered list for currency pickers.
final List<CurrencyConfig> currencyList = currencies.values.toList();

String _activeCurrency = 'INR';

void setActiveCurrency(String code) {
  _activeCurrency = currencies.containsKey(code) ? code : 'INR';
}

String getActiveCurrency() => _activeCurrency;

CurrencyConfig getCurrencyConfig([String? code]) {
  return currencies[code ?? _activeCurrency] ?? currencies['INR']!;
}

/// Return just the symbol for the active (or specified) currency.
/// getCurrencySymbol()        → "₹"
/// getCurrencySymbol("USD")   → "$"
String getCurrencySymbol([String? code]) => getCurrencyConfig(code).symbol;

/// Return the appropriate icon for the active (or specified) currency.
IconData currencyIconFor([String? code]) {
  final c = code ?? _activeCurrency;
  switch (c) {
    case 'INR':
      return Icons.currency_rupee;
    default:
      return Icons.account_balance_wallet_outlined;
  }
}

/// ISO date → YYYY-MM-DD (first 10 chars). Empty for null/empty input.
String ymd(dynamic value) {
  final trimmed = value?.toString() ?? '';
  if (trimmed.isEmpty) return '';
  return trimmed.length >= 10 ? trimmed.substring(0, 10) : trimmed;
}

/// User-friendly date, e.g. "9 May 2026" or "23 Jan 2023".
String fmtDisplayDate(dynamic value) {
  final raw = value?.toString() ?? '';
  if (raw.isEmpty) return '';
  try {
    final d = DateTime.parse(raw);
    return DateFormat('d MMM yyyy').format(d.toLocal());
  } catch (_) {
    final s = ymd(value);
    return s.isEmpty ? raw : s;
  }
}

/// User-friendly date and time in local timezone, e.g. "9 May 2026, 02:30 PM".
String fmtDisplayDateTime(dynamic value) {
  final raw = value?.toString() ?? '';
  if (raw.isEmpty) return '';
  try {
    final d = DateTime.parse(raw).toLocal();
    return DateFormat('d MMM yyyy, hh:mm a').format(d);
  } catch (_) {
    return fmtDisplayDate(value);
  }
}

/// Created/updated timestamps in list rows.
String fmtCreatedAt(dynamic value) => fmtDisplayDateTime(value);

/// Indian-grouped amount without symbol (e.g. 31,500.00 or 1,00,000.00).
/// Strips any non-breaking spaces (U+00A0) or regular spaces that some
/// versions of the intl package insert as grouping/decimal separators.
String _formatAmountCore(num n, CurrencyConfig cfg) {
  final String raw;
  if (cfg.code == 'INR') {
    raw = NumberFormat('#,##,##0.00', 'en_IN').format(n);
  } else {
    raw = NumberFormat('#,##0.00', cfg.locale).format(n);
  }
  // Remove any spaces (regular or non-breaking) that may appear before the
  // decimal separator due to locale quirks in certain intl versions.
  return raw.replaceAll('\u00a0', '').replaceAll(' ', '');
}

/// Format amount with currency symbol — no space before decimal (e.g. ₹31,500.00).
/// Returns "—" only when value is null/unparseable (0 displays as ₹0.00).
String fmtCurrency(dynamic value, [String? code]) {
  if (value == null) return '—';
  if (value is Map) {
    final inner = value['value'] ?? value['amount'] ?? value['total'] ?? value['total_amount'];
    return fmtCurrency(inner, code);
  }
  final num? parsed = value is num ? value : num.tryParse(value.toString());
  if (parsed == null) return '—';
  final n = parsed;
  if (!n.isFinite) return '—';

  final cfg = getCurrencyConfig(code);
  try {
    final amount = _formatAmountCore(n, cfg);
    return '${cfg.symbol}$amount';
  } catch (_) {
    return '${cfg.symbol}${n.toStringAsFixed(cfg.decimals)}';
  }
}

/// Alias for [fmtCurrency] — single entry point for currency display.
String formatCurrency(dynamic value, [String? code]) => fmtCurrency(value, code);

/// Two-decimal plain number string using active currency locale grouping.
String fmtMoney(dynamic value, [String? code]) {
  final num n = num.tryParse(value?.toString() ?? '') ?? double.nan;
  if (!n.isFinite) return '';

  final cfg = getCurrencyConfig(code);
  try {
    final formatter = NumberFormat.decimalPattern(cfg.locale)
      ..minimumFractionDigits = cfg.decimals
      ..maximumFractionDigits = cfg.decimals;
    return formatter.format(n);
  } catch (_) {
    return n.toStringAsFixed(cfg.decimals);
  }
}
