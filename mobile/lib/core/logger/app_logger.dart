import 'package:flutter/foundation.dart';
import 'package:logger/logger.dart';

/// App-wide logger. In release builds only warnings and errors are emitted.
/// Usage:
///   AppLogger.d('debug message');
///   AppLogger.i('info message');
///   AppLogger.w('warning message');
///   AppLogger.e('error message', error: e, stackTrace: st);
class AppLogger {
  AppLogger._();

  static final Logger _logger = Logger(
    level: kReleaseMode ? Level.warning : Level.trace,
    printer: PrettyPrinter(
      methodCount: kReleaseMode ? 0 : 2,
      errorMethodCount: 8,
      lineLength: 100,
      colors: !kReleaseMode,
      printEmojis: !kReleaseMode,
      dateTimeFormat: DateTimeFormat.onlyTimeAndSinceStart,
    ),
    output: kReleaseMode ? _SilentOutput() : ConsoleOutput(),
  );

  static void v(String message) => _logger.t(message);
  static void d(String message) => _logger.d(message);
  static void i(String message) => _logger.i(message);
  static void w(String message, {Object? error, StackTrace? stackTrace}) =>
      _logger.w(message, error: error, stackTrace: stackTrace);
  static void e(String message, {Object? error, StackTrace? stackTrace}) =>
      _logger.e(message, error: error, stackTrace: stackTrace);

  /// Log an uncaught error (used by global error boundary).
  static void fatal(String message, {Object? error, StackTrace? stackTrace}) =>
      _logger.f(message, error: error, stackTrace: stackTrace);
}

/// Silent output for release builds — no logs emitted to console.
class _SilentOutput extends LogOutput {
  @override
  void output(OutputEvent event) {
    // Intentionally empty — no output in release mode.
  }
}