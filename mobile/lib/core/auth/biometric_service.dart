import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

import '../logger/app_logger.dart';

/// Wraps local_auth for biometric authentication.
/// Note: local_auth has no web implementation — all methods return false on web.
class BiometricService {
  BiometricService._();

  static final LocalAuthentication _auth = LocalAuthentication();

  /// Returns true if the device supports biometrics and has enrolled credentials.
  static Future<bool> isAvailable() async {
    // local_auth is not supported on web — avoid MissingPluginException.
    if (kIsWeb) return false;
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final isDeviceSupported = await _auth.isDeviceSupported();
      if (!canCheck || !isDeviceSupported) return false;

      final available = await _auth.getAvailableBiometrics();
      return available.isNotEmpty;
    } on PlatformException catch (e) {
      AppLogger.w('Biometric availability check failed', error: e);
      return false;
    } catch (e) {
      // MissingPluginException implements Exception (not PlatformException) and
      // is thrown on platforms where the plugin has no implementation.
      AppLogger.w('Biometric not supported on this platform', error: e);
      return false;
    }
  }

  /// Prompts the user for biometric authentication.
  /// Returns true if authentication succeeded.
  static Future<bool> authenticate({
    String reason = 'Authenticate to sign in to JedMee',
  }) async {
    // local_auth is not supported on web — avoid MissingPluginException.
    if (kIsWeb) return false;
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: false, // Allow PIN/pattern fallback.
          stickyAuth: true,
        ),
      );
    } on PlatformException catch (e) {
      AppLogger.w('Biometric authentication failed', error: e);
      return false;
    } catch (e) {
      // MissingPluginException on unsupported platforms.
      AppLogger.w('Biometric authentication not supported on this platform', error: e);
      return false;
    }
  }
}