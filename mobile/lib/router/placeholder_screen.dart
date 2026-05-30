import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../widgets/app_shell.dart';

/// Temporary screen until the feature module is restored.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({
    super.key,
    required this.title,
    this.useShell = true,
  });

  final String title;
  final bool useShell;

  @override
  Widget build(BuildContext context) {
    final body = Center(
      child: Text(
        '$title\n(coming soon)',
        textAlign: TextAlign.center,
        style: const TextStyle(color: AppColors.text3),
      ),
    );
    if (!useShell) return Scaffold(backgroundColor: AppColors.bg, body: body);
    return AppShell(title: title, child: body);
  }
}
