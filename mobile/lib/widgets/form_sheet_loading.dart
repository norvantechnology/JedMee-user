import 'package:flutter/material.dart';

import '../core/theme/app_spacing.dart';

/// Centered loading state for full editor / form sheets.
class FormSheetLoadingBody extends StatelessWidget {
  const FormSheetLoadingBody({super.key, this.message = 'Loading…'});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: AppSpacing.sm),
          Text(message),
        ],
      ),
    );
  }
}

/// Inline loading row for form bottom sheets.
class FormSheetLoading extends StatelessWidget {
  const FormSheetLoading({super.key, this.label = 'Loading…'});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(label),
        ],
      ),
    );
  }
}
