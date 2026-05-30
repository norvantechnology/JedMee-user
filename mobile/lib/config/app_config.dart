/// Runtime configuration from `--dart-define` flags.
abstract final class AppConfig {
  /// Live API (AWS API Gateway dev stage). Override for local backend:
  /// `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000`
  static const String _defaultApiBaseUrl =
      'https://rwti7dknsj.execute-api.eu-north-1.amazonaws.com/dev';

  /// API base URL. Override at build/run time via [API_BASE_URL].
  ///
  /// On Android emulator, use `http://10.0.2.2:4000` to reach host `localhost`.
  static String getApiBaseUrl() {
    const raw = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: _defaultApiBaseUrl,
    );
    return raw.replaceAll(RegExp(r'/+$'), '');
  }

  static const String appDocumentTitle = 'JedMee';
  static const String appStorageNs = 'jedmee';
  static const String legacyStoragePrefix = 'medico';
}
