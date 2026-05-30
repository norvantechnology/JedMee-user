import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_theme.dart';
import '../theme/app_typography.dart';

/// Shown instead of Flutter's red error screen when an uncaught error occurs.
/// Provides a friendly message, retry button, and support link.
class ErrorScreen extends StatelessWidget {
  const ErrorScreen({
    super.key,
    this.error,
    this.onRetry,
  });

  final Object? error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: AppColors.bg,
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 400),
                padding: const EdgeInsets.all(AppSpacing.xl),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius:
                      BorderRadius.circular(AppTheme.layoutCardRadius),
                  border: Border.all(color: AppColors.border),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x0A0F172A),
                      blurRadius: 24,
                      offset: Offset(0, 8),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Icon
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: AppColors.dangerLight,
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusXl),
                        border: Border.all(color: AppColors.alertRedBorder),
                      ),
                      child: const Icon(
                        Icons.error_outline_rounded,
                        size: 36,
                        color: AppColors.danger,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),

                    // Title
                    Text(
                      'Something went wrong',
                      textAlign: TextAlign.center,
                      style: AppTypography.sectionTitle,
                    ),
                    const SizedBox(height: AppSpacing.xs),

                    // Message
                    Text(
                      'An unexpected error occurred. Please try again.\n'
                      'If the problem persists, contact support.',
                      textAlign: TextAlign.center,
                      style: AppTypography.secondary.copyWith(height: 1.5),
                    ),
                    const SizedBox(height: AppSpacing.lg),

                    // Retry button
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: FilledButton.icon(
                        onPressed: onRetry,
                        icon: const Icon(Icons.refresh_rounded, size: 18),
                        label: const Text('Try again'),
                        style: FilledButton.styleFrom(
                          shape: RoundedRectangleBorder(
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusMd),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),

                    // Contact support link
                    TextButton.icon(
                      onPressed: () => _launchSupport(),
                      icon: const Icon(Icons.support_agent_outlined, size: 16),
                      label: const Text('Contact support'),
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _launchSupport() async {
    final uri = Uri.parse('mailto:support@jedmee.com?subject=App%20Error');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }
}