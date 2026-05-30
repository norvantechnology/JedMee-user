import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_elevation.dart';
import '../core/theme/app_motion.dart';
import '../core/theme/app_theme.dart';

/// Shared list row card — shadow only, no border (premium mobile lists).
class ListCardSurface extends StatefulWidget {
  const ListCardSurface({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.padding,
    this.minHeight,
    this.compact = false,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final EdgeInsets? padding;
  final double? minHeight;
  final bool compact;

  @override
  State<ListCardSurface> createState() => _ListCardSurfaceState();
}

class _ListCardSurfaceState extends State<ListCardSurface> {
  bool _pressed = false;
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final elevated = _hovered || _pressed;

    return RepaintBoundary(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: MouseRegion(
          onEnter: (_) => setState(() => _hovered = true),
          onExit: (_) => setState(() => _hovered = false),
          child: GestureDetector(
            onTapDown: (widget.onTap != null || widget.onLongPress != null) ? (_) => setState(() => _pressed = true) : null,
            onTapUp: (widget.onTap != null || widget.onLongPress != null) ? (_) => setState(() => _pressed = false) : null,
            onTapCancel: (widget.onTap != null || widget.onLongPress != null) ? () => setState(() => _pressed = false) : null,
            child: AnimatedContainer(
              duration: AppMotion.fast,
              curve: AppMotion.standard,
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(AppTheme.layoutCardRadius),
                boxShadow: elevated ? AppElevation.cardHover : AppElevation.card,
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: widget.onTap,
                  onLongPress: widget.onLongPress,
                  borderRadius: BorderRadius.circular(AppTheme.layoutCardRadius),
                  splashColor: AppColors.primary.withOpacity(0.06),
                  highlightColor: AppColors.primary.withOpacity(0.03),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: widget.minHeight ?? (widget.compact ? 56 : 64),
                    ),
                    child: Padding(
                      padding: widget.padding ?? EdgeInsets.zero,
                      child: widget.child,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
