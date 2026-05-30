import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

import '../core/app_icons.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_motion.dart';
import '../core/theme/app_typography.dart';

/// Persistent top banner that shows when the device is offline.
/// Turns green briefly when connection is restored, then auto-dismisses.
///
/// Wrap any screen body with this widget:
/// ```dart
/// NetworkBanner(child: myContent)
/// ```
class NetworkBanner extends StatefulWidget {
  const NetworkBanner({super.key, required this.child});

  final Widget child;

  @override
  State<NetworkBanner> createState() => _NetworkBannerState();
}

class _NetworkBannerState extends State<NetworkBanner>
    with SingleTickerProviderStateMixin {
  late StreamSubscription<List<ConnectivityResult>> _sub;
  bool _isOffline = false;
  bool _justReconnected = false;
  Timer? _reconnectTimer;

  late AnimationController _controller;
  late Animation<double> _heightFactor;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: AppMotion.fast,
    );
    _heightFactor = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeInOut,
    );

    // Check initial connectivity.
    Connectivity().checkConnectivity().then(_handleResult);

    // Listen for changes.
    _sub = Connectivity()
        .onConnectivityChanged
        .listen(_handleResult);
  }

  @override
  void dispose() {
    _sub.cancel();
    _reconnectTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _handleResult(List<ConnectivityResult> results) {
    final hasConnection = results.any(
      (r) => r != ConnectivityResult.none,
    );

    if (!hasConnection) {
      _reconnectTimer?.cancel();
      setState(() {
        _isOffline = true;
        _justReconnected = false;
      });
      _controller.forward();
    } else if (_isOffline) {
      // Was offline, now reconnected.
      setState(() {
        _isOffline = false;
        _justReconnected = true;
      });
      // Auto-dismiss "Connected" banner after 2.5 seconds.
      _reconnectTimer = Timer(const Duration(milliseconds: 2500), () {
        if (mounted) {
          setState(() => _justReconnected = false);
          _controller.reverse();
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Animated banner
        SizeTransition(
          sizeFactor: _heightFactor,
          axisAlignment: -1,
          child: AnimatedContainer(
            duration: AppMotion.fast,
            color: _justReconnected
                ? AppColors.success
                : const Color(0xFFF59E0B), // amber-500
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: SafeArea(
              bottom: false,
              top: false,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    _justReconnected
                        ? AppIcons.wifi
                        : AppIcons.wifiOff,
                    size: 16,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _justReconnected
                        ? 'Connection restored'
                        : 'No internet connection',
                    style: AppTypography.secondary.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        // Page content
        Expanded(child: widget.child),
      ],
    );
  }
}

/// Provider-free connectivity check for disabling network-dependent buttons.
class ConnectivityGuard extends StatefulWidget {
  const ConnectivityGuard({
    super.key,
    required this.builder,
  });

  final Widget Function(BuildContext context, bool isOnline) builder;

  @override
  State<ConnectivityGuard> createState() => _ConnectivityGuardState();
}

class _ConnectivityGuardState extends State<ConnectivityGuard> {
  late StreamSubscription<List<ConnectivityResult>> _sub;
  bool _isOnline = true;

  @override
  void initState() {
    super.initState();
    Connectivity().checkConnectivity().then((results) {
      if (mounted) {
        setState(() {
          _isOnline = results.any((r) => r != ConnectivityResult.none);
        });
      }
    });
    _sub = Connectivity().onConnectivityChanged.listen((results) {
      if (mounted) {
        setState(() {
          _isOnline = results.any((r) => r != ConnectivityResult.none);
        });
      }
    });
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, _isOnline);
}