import 'package:flutter/material.dart';

import 'app_toast.dart';

// Legacy type alias — kept for call-site compatibility.
// All new code should use [AppToastType] from app_toast.dart directly.
enum AppSnackType { success, error, info, warning }

/// Show a floating toast notification.
///
/// Delegates to [showAppToast] which applies the spec's top-entry animation:
///   OPEN:  translateY(-20px) + opacity(0) → translateY(0) + opacity(1)
///          240ms, easeOpen cubic-bezier(0.32, 0.72, 0, 1)
///   AUTO-DISMISS after 3000ms
///   CLOSE: translateY(0) → translateY(-16px) + opacity(0)
///          180ms, easeClose cubic-bezier(0.4, 0, 1, 0.6)
///
/// The old [ScaffoldMessenger.showSnackBar] path is no longer used.
/// This wrapper is kept for backward compatibility with existing call sites.
void showAppSnack(
  BuildContext context, {
  required String message,
  AppSnackType type = AppSnackType.info,
  String? actionLabel,
  VoidCallback? onAction,
  // [duration] is ignored — auto-dismiss is always 3 s per spec §4.
  // Kept in signature to avoid breaking existing call sites.
  Duration duration = const Duration(seconds: 3),
}) {
  final toastType = switch (type) {
    AppSnackType.success => AppToastType.success,
    AppSnackType.error   => AppToastType.error,
    AppSnackType.warning => AppToastType.warning,
    AppSnackType.info    => AppToastType.info,
  };

  showAppToast(
    context,
    message: message,
    type: toastType,
    actionLabel: actionLabel,
    onAction: onAction,
  );
}
