import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';

/// Lightweight performance monitoring utility for production-grade Flutter apps.
///
/// USAGE:
///   // Time a synchronous block:
///   final result = PerfMonitor.time('dashboard_build', () => buildDashboard());
///
///   // Time an async operation:
///   final data = await PerfMonitor.timeAsync('api_fetch', () => api.get('/products'));
///
///   // Mark a frame boundary (visible in DevTools timeline):
///   PerfMonitor.mark('screen_ready');
///
/// In debug mode, timings are printed to the console and posted to the
/// DevTools timeline. In release mode, all calls are no-ops (zero overhead).
abstract final class PerfMonitor {
  /// Times a synchronous operation and logs its duration.
  /// Returns the result of [fn].
  static T time<T>(String label, T Function() fn) {
    if (!kDebugMode) return fn();
    final sw = Stopwatch()..start();
    try {
      return fn();
    } finally {
      sw.stop();
      _log(label, sw.elapsedMilliseconds);
    }
  }

  /// Times an asynchronous operation and logs its duration.
  /// Returns the result of [fn].
  static Future<T> timeAsync<T>(String label, Future<T> Function() fn) async {
    if (!kDebugMode) return fn();
    final sw = Stopwatch()..start();
    try {
      return await fn();
    } finally {
      sw.stop();
      _log(label, sw.elapsedMilliseconds);
    }
  }

  /// Posts a named marker to the DevTools timeline.
  /// Useful for marking key app lifecycle events (e.g. "first_frame_ready").
  static void mark(String name) {
    if (!kDebugMode) return;
    developer.Timeline.instantSync(name);
    debugPrint('[PerfMonitor] ⚑ $name');
  }

  /// Starts a named timeline task. Call [endTask] with the returned token.
  static developer.TimelineTask startTask(String name) {
    final task = developer.TimelineTask()..start(name);
    return task;
  }

  /// Ends a timeline task started with [startTask].
  static void endTask(developer.TimelineTask task) {
    task.finish();
  }

  static void _log(String label, int ms) {
    final emoji = ms < 16 ? '🟢' : ms < 100 ? '🟡' : '🔴';
    debugPrint('[PerfMonitor] $emoji $label: ${ms}ms');
    developer.Timeline.instantSync('$label (${ms}ms)');
  }
}