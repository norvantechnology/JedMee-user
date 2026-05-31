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

/// Parses currency-bearing values (same rules as [fmtCurrency]).
num? parseCurrencyValue(dynamic value) {
  if (value == null) return null;
  if (value is Map) {
    return parseCurrencyValue(
      value['value'] ??
          value['amount'] ??
          value['total'] ??
          value['total_amount'],
    );
  }
  if (value is num) return value.isFinite ? value : null;
  return num.tryParse(value.toString());
}

/// Indian (2-2-3) grouped amount without symbol — e.g. 32,04,665.10 or 1,42,500.00.
/// Uses [NumberFormat] pattern `#,##,##0.00` with locale `en_IN` for INR.
/// Strips non-breaking spaces some intl versions insert as separators.
String _formatAmountCore(num n, CurrencyConfig cfg) {
  final String raw;
  if (cfg.code == 'INR') {
    raw = NumberFormat('#,##,##0.00', 'en_IN').format(n);
  } else {
    raw = NumberFormat('#,##0.00', cfg.locale).format(n);
  }
  return raw.replaceAll('\u00a0', '').replaceAll(' ', '');
}

/// Full currency with symbol — Indian grouping + paise (e.g. ₹32,04,665.10).
///
/// Use on list rows, detail sheets, modals, invoices, and financial tables.
/// Never abbreviate (no ₹32L) outside dashboard summary cards.
String fmtCurrency(dynamic value, [String? code]) {
  if (value == null) return '—';
  if (value is Map) {
    final inner = value['value'] ?? value['amount'] ?? value['total'] ?? value['total_amount'];
    return fmtCurrency(inner, code);
  }
  final num? parsed = value is num ? value : num.tryParse(value.toString());
  if (parsed == null || !parsed.isFinite) return '—';

  final cfg = getCurrencyConfig(code);
  try {
    return '${cfg.symbol}${_formatAmountCore(parsed, cfg)}';
  } catch (_) {
    return '${cfg.symbol}${parsed.toStringAsFixed(cfg.decimals)}';
  }
}

/// Alias — full Indian-format currency for detail UI.
String fmtCurrencyDetail(dynamic value, [String? code]) => fmtCurrency(value, code);

/// Alias for [fmtCurrency].
String formatCurrency(dynamic value, [String? code]) => fmtCurrency(value, code);

/// Amount without symbol — same grouping as [fmtCurrency] (tables, PDF cells).
String fmtAmount(dynamic value, [String? code]) {
  final n = parseCurrencyValue(value);
  if (n == null) return '—';
  return _formatAmountCore(n, getCurrencyConfig(code));
}

/// Dashboard amounts — same full Indian grouping as [fmtCurrency] (e.g. ₹32,04,665.10).
///
/// No L/Cr abbreviations; use on all dashboard KPI and chart labels.
String fmtDashboardCurrency(dynamic value, [String? code]) =>
    fmtCurrency(value, code);

/// Whether dashboard display differs from full [fmtCurrency] (tooltip warranted).
bool dashboardAmountHasExactDetail(dynamic value, [String? code]) => false;

/// Dashboard currency text (full Indian format).
class DashboardAmountText extends StatelessWidget {
  const DashboardAmountText(
    this.value, {
    super.key,
    this.style,
    this.prefix = '',
    this.suffix = '',
    this.textAlign,
    this.maxLines = 1,
    this.overflow = TextOverflow.ellipsis,
  });

  final dynamic value;
  final TextStyle? style;
  final String prefix;
  final String suffix;
  final TextAlign? textAlign;
  final int? maxLines;
  final TextOverflow? overflow;

  @override
  Widget build(BuildContext context) {
    final n = parseCurrencyValue(value);
    if (n == null) {
      return Text(
        '—',
        style: style,
        textAlign: textAlign,
        maxLines: maxLines,
        overflow: overflow,
      );
    }
    return Text(
      '$prefix${fmtDashboardCurrency(n)}$suffix',
      style: style,
      textAlign: textAlign,
      maxLines: maxLines,
      overflow: overflow,
    );
  }
}

/// Plain grouped number (no symbol) — prefer [fmtAmount] for INR money columns.
String fmtMoney(dynamic value, [String? code]) => fmtAmount(value, code);

/// True when [fmtCurrency] used international (3-digit) grouping instead of Indian.
bool usesInternationalInrGrouping(num value) {
  final formatted = fmtCurrency(value, 'INR');
  final digits = formatted.replaceAll(RegExp(r'[^\d]'), '');
  if (digits.length < 5) return false;
  // International millions: 1,420,500 — Indian lakh: 14,20,500 (same digit count,
  // distinguish via comma pattern after ₹).
  final body = formatted.replaceFirst('₹', '');
  final commas = ','.allMatches(body).length;
  if (value >= 100000 && commas == 2) {
    // Indian lakh+ has 2 commas; international million+ often has 2 as well —
    // check first group length (Indian first group is 1–3 digits from the right).
    final parts = body.split('.').first.split(',');
    if (parts.length >= 2 && parts[parts.length - 2].length == 2) {
      return false; // e.g. 14,20,500
    }
    if (parts.length >= 2 && parts[0].length <= 3 && parts[1].length == 3) {
      return true; // e.g. 1,420,500
    }
  }
  return false;
}
