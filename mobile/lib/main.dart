import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/cache/api_cache.dart';
import 'core/errors/error_screen.dart';
import 'core/logger/app_logger.dart';
import 'core/notifications/fcm_bootstrap.dart';
import 'core/performance/perf_monitor.dart';
import 'core/theme/app_colors.dart';
import 'core/utils/format.dart';

// Top-level so the original binding zone is reused on every retry call.
// ensureInitialized() is idempotent but the zone it records is fixed at the
// first call — all subsequent runApp() calls must happen in that same zone.
Zone? _appZone;

// Guard against re-entrant error-screen calls (e.g. zone-mismatch loop).
bool _showingError = false;

void main() {
  // Retry path: _appZone is already set from the first launch.
  // Run directly in the original zone so the binding zone-check passes.
  if (_appZone != null) {
    _appZone!.run(() {
      _showingError = false;
      runApp(const ProviderScope(child: JedMeeApp()));
    });
    return;
  }

  // First launch: create the guarded zone and record it.
  runZonedGuarded(
    () async {
      _appZone = Zone.current;
      WidgetsFlutterBinding.ensureInitialized();

      // ── PERFORMANCE: Tune image cache before any images are loaded ──────────
      // Increase image cache to 150 MB (default is 100 MB) for smoother
      // rendering of repeated assets (logos, icons, product images).
      PaintingBinding.instance.imageCache.maximumSizeBytes = 150 << 20; // 150 MB
      // Allow up to 1000 image cache entries (default 1000, explicit for clarity).
      PaintingBinding.instance.imageCache.maximumSize = 1000;

      // ── PERFORMANCE: Font fetching strategy ────────────────────────────────
      // On mobile: disable runtime fetching — the font is cached after first use,
      // eliminating 200–800 ms of startup jank on subsequent launches.
      // On web: allow runtime fetching — fonts cannot be cached to disk in the
      // browser sandbox, so they must be fetched from Google's CDN each session.
      // To fully eliminate web fetching, bundle TTF files in assets/fonts/ (see pubspec).
      GoogleFonts.config.allowRuntimeFetching = kIsWeb;

      // ── PERFORMANCE: Parallelize Firebase init + SharedPreferences read ──────
      // Running these concurrently saves ~100–300 ms on cold start vs sequential.
      final initFutures = <Future>[
        // Firebase + FCM on Android/iOS (no-op stub on web).
        initPushNotifications(),
        // Currency preference — needed before first fmtCurrency() call.
        _initCurrency(),
      ];
      await Future.wait(initFutures);

      // Replace Flutter's red error screen with a friendly error screen.
      FlutterError.onError = (FlutterErrorDetails details) {
        AppLogger.fatal(
          'Flutter framework error',
          error: details.exception,
          stackTrace: details.stack,
        );
        // In debug mode, also print to console for developer visibility.
        FlutterError.presentError(details);
      };

      // Configure system UI overlay once at startup — not inside build().
      SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
        systemNavigationBarColor: AppColors.bg,
        systemNavigationBarIconBrightness: Brightness.dark,
      ));

      // PERFORMANCE: Start the cache eviction timer to prevent unbounded
      // memory growth from stale API responses. Runs every 5 minutes.
      ApiCache.instance.startEvictionTimer();

      // Mark startup complete for DevTools timeline analysis.
      PerfMonitor.mark('app_startup_complete');

      _showingError = false;
      runApp(const ProviderScope(child: JedMeeApp()));
    },
    (Object error, StackTrace stack) {
      // Catch all uncaught async errors (e.g. Future errors not caught by try/catch).
      AppLogger.fatal(
        'Uncaught async error',
        error: error,
        stackTrace: stack,
      );

      // CanvasKit shader warm-up error: the browser has cached stale SPIR-V
      // shader data from a previous build. The renderer falls back to software
      // rendering for ink-sparkle effects; the rest of the app is unaffected.
      // Showing ErrorScreen here would replace the entire app for a cosmetic
      // issue. Instruct the user to hard-refresh (Ctrl+Shift+R) to clear the
      // stale cache. See: flutter/engine shader_data.dart fromBytes().
      if (error is FormatException && error.message == 'Invalid Shader Data') {
        return;
      }

      // Prevent re-entrant calls — a bad runApp can itself emit a zone-mismatch
      // warning that would otherwise trigger this handler again infinitely.
      if (_showingError) return;
      _showingError = true;
      // Run in the same zone where ensureInitialized was called so Flutter's
      // binding zone-check does not fire a second time.
      (_appZone ?? Zone.current).run(() {
        runApp(
          ErrorScreen(
            error: error,
            // Defer past the current gesture event to avoid the GestureBinding
            // lock assertion ("!locked is not true").
            onRetry: () => Future.microtask(main),
          ),
        );
      });
    },
  );
}

/// Reads the stored currency preference and applies it before the first
/// fmtCurrency() call. PERFORMANCE: Runs in parallel with Firebase init.
Future<void> _initCurrency() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString('jedmee_currency') ?? 'INR';
    setActiveCurrency(stored);
  } catch (_) {
    // Non-fatal — defaults to INR.
  }
}
