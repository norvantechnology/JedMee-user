import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme/app_colors.dart';

// ─── Data model ───────────────────────────────────────────────────────────────

class BottomAction {
  const BottomAction({
    required this.icon,
    required this.onTap,
    this.label,
    this.tooltip,
    this.color,
    this.badge,
    this.enabled = true,
  });

  final IconData icon;
  final VoidCallback? onTap;
  final String? label;
  final String? tooltip;
  final Color? color;
  final int? badge;
  final bool enabled;
}

// ─── Main widget ──────────────────────────────────────────────────────────────

/// Context-aware bottom action bar with:
/// • Frosted-glass surface (BackdropFilter blur 20px)
/// • Spring-bounce tap feedback on all buttons
/// • mediumImpact haptic on primary CTA, selectionClick on secondary
/// • 44dp minimum tap targets (WCAG 2.5.5)
class AppBottomActionBar extends StatelessWidget {
  const AppBottomActionBar({
    super.key,
    required this.primaryAction,
    this.leadingActions = const [],
    this.trailingActions = const [],
  }) : assert(
          leadingActions.length <= 2 && trailingActions.length <= 2,
          'Max 2 leading and 2 trailing actions',
        );

  final BottomAction primaryAction;
  final List<BottomAction> leadingActions;
  final List<BottomAction> trailingActions;

  List<BottomAction> get _allActions => [
        ...leadingActions.take(2),
        primaryAction,
        ...trailingActions.take(2),
      ];

  static String _resolveLabel(BottomAction action) {
    if (action.label != null && action.label!.isNotEmpty) return action.label!;
    if (action.tooltip != null && action.tooltip!.isNotEmpty) {
      final words = action.tooltip!.split(' ');
      if (words.length >= 2 &&
          (words[0] == 'New' || words[0] == 'Add' || words[0] == 'Record')) {
        return '${words[0]} ${words[1]}';
      }
      return words[0];
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final actions = _allActions;

    return ClipRect(
      child: BackdropFilter(
        // Frosted-glass: blur content behind the bar for depth.
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.card.withOpacity(0.88),
            border: const Border(
              top: BorderSide(color: Color(0xFFE8E8EE), width: 0.5),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.06),
                blurRadius: 20,
                offset: const Offset(0, -4),
              ),
            ],
          ),
          padding: EdgeInsets.only(bottom: bottomInset),
          child: SizedBox(
            height: 60,
            child: Row(
              children: actions.map((action) {
                final isPrimary = identical(action, primaryAction);
                return Expanded(
                  child: _BarButton(
                    action: action,
                    label: _resolveLabel(action),
                    isPrimary: isPrimary,
                  ),
                );
              }).toList(),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Uniform bar button ───────────────────────────────────────────────────────

class _BarButton extends StatefulWidget {
  const _BarButton({
    required this.action,
    required this.label,
    required this.isPrimary,
  });

  final BottomAction action;
  final String label;
  final bool isPrimary;

  @override
  State<_BarButton> createState() => _BarButtonState();
}

class _BarButtonState extends State<_BarButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      // Press: fast compress (80ms)
      duration: const Duration(milliseconds: 80),
      // Release: spring back with elastic overshoot (240ms)
      reverseDuration: const Duration(milliseconds: 240),
    );
    // Forward: 1.0 → 0.94 (compress on press)
    // Reverse: 0.94 → 1.0 with ElasticOutCurve (spring bounce on release)
    _scale = Tween<double>(begin: 1.0, end: 0.94).animate(
      CurvedAnimation(
        parent: _ctrl,
        curve: Curves.easeIn,
        reverseCurve: const ElasticOutCurve(0.25),
      ),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _down(TapDownDetails _) {
    if (!widget.action.enabled) return;
    _ctrl.forward();
    // Primary CTA gets stronger haptic (creation/destructive action convention)
    if (widget.isPrimary) {
      HapticFeedback.mediumImpact();
    } else {
      HapticFeedback.selectionClick();
    }
  }

  void _up(TapUpDetails _) {
    _ctrl.reverse();
    if (widget.action.enabled) widget.action.onTap?.call();
  }

  void _cancel() => _ctrl.reverse();

  @override
  Widget build(BuildContext context) {
    final enabled = widget.action.enabled && widget.action.onTap != null;
    final isPrimary = widget.isPrimary;

    Widget iconArea;
    if (isPrimary) {
      // Same size as secondary items but with a distinct purple tint — not oversized
      const primaryColor = Color(0xFF6C63FF);
      iconArea = Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: primaryColor.withOpacity(0.12),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(widget.action.icon, size: 17, color: primaryColor),
      );
    } else {
      final iconColor = widget.action.color ?? const Color(0xFF8B8FA8);
      Widget icon = Icon(widget.action.icon, size: 22, color: iconColor);

      if (widget.action.badge != null && widget.action.badge! > 0) {
        icon = Stack(
          clipBehavior: Clip.none,
          children: [
            icon,
            Positioned(
              top: -3,
              right: -3,
              child: Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Color(0xFFEF4444),
                  shape: BoxShape.circle,
                ),
              ),
            ),
          ],
        );
      }
      iconArea = icon;
    }

    // Primary label uses the same purple as the icon tint — slightly bolder
    final labelColor =
        isPrimary ? const Color(0xFF6C63FF) : const Color(0xFF8B8FA8);
    final labelWeight = isPrimary ? FontWeight.w600 : FontWeight.w500;

    return ScaleTransition(
      scale: _scale,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: _down,
        onTapUp: _up,
        onTapCancel: _cancel,
        child: Tooltip(
          message: widget.action.tooltip ?? '',
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 150),
            opacity: enabled ? 1.0 : 0.30,
            // SizedBox ensures minimum 44dp tap target height (WCAG 2.5.5).
            // Width is handled by the Expanded in the parent Row.
            child: SizedBox(
              height: 60,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  iconArea,
                  const SizedBox(height: 4),
                  if (widget.label.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: Text(
                        widget.label,
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: labelWeight,
                          color: labelColor,
                          height: 1.1,
                          letterSpacing: 0.1,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}