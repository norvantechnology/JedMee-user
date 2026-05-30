import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/utils/format.dart';

/// SharedPreferences key — mirrors web's `jedmee_currency` localStorage key.
const _kCurrencyKey = 'jedmee_currency';

/// Riverpod provider for the active currency code.
///
/// Architecture mirrors web's CurrencyContext (frontend/src/context/CurrencyContext.jsx):
///  - Reads initial value from SharedPreferences on first access.
///  - Calls [setActiveCurrency()] to keep the module-level store in sync so
///    all [fmtCurrency()] calls across the app automatically use the correct symbol.
///  - Exposes [setCurrency()] to change and persist the preference.
///
/// Usage:
///   // Read active code
///   final code = ref.watch(currencyProvider);
///
///   // Read symbol
///   final symbol = getCurrencySymbol(ref.watch(currencyProvider));
///
///   // Change currency
///   ref.read(currencyProvider.notifier).setCurrency('USD');
class CurrencyNotifier extends StateNotifier<String> {
  CurrencyNotifier() : super('INR') {
    _load();
  }

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_kCurrencyKey) ?? 'INR';
      final safe = currencies.containsKey(stored) ? stored : 'INR';
      setActiveCurrency(safe);
      if (mounted) state = safe;
    } catch (_) {
      // Keep default INR on any storage error.
    }
  }

  /// Change the active currency and persist the preference.
  Future<void> setCurrency(String code) async {
    final safe = currencies.containsKey(code) ? code : 'INR';
    setActiveCurrency(safe);
    state = safe;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kCurrencyKey, safe);
    } catch (_) {
      // Persistence failure is non-fatal — in-memory state is already updated.
    }
  }
}

final currencyProvider =
    StateNotifierProvider<CurrencyNotifier, String>((ref) {
  return CurrencyNotifier();
});