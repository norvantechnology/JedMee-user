import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/performance/list_scroll.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_motion.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_theme.dart';

/// Human-readable filter label (e.g. CONFIRMED → Confirmed).
String filterChipLabel(String value) {
  const custom = <String, String>{
    'TODAY': 'Today',
    'WEEK': 'This week',
    'MONTH': 'This month',
    'QUARTER': 'This quarter',
    'CUSTOMER': 'Customer',
    'SUPPLIER': 'Supplier',
  };
  final customLabel = custom[value.toUpperCase()];
  if (customLabel != null) return customLabel;
  if (value.toUpperCase() == 'ALL') return 'All';
  return value
      .toLowerCase()
      .split('_')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}

/// Horizontally scrollable status filter bar — full labels, no truncation.
///
/// Swipe left/right on the bar itself to cycle through tabs. For screens where
/// the swipe area should cover the full list body, wrap the body separately
/// with a [GestureDetector] that calls [onSelected] with the adjacent option.
class AppFilterChipsBar extends StatelessWidget {
  const AppFilterChipsBar({
    super.key,
    required this.selected,
    required this.onSelected,
    this.options = const [],
    this.showAll = true,
    this.allLabel = 'All',
  });

  final String? selected;
  final ValueChanged<String?> onSelected;
  final List<String> options;
  final bool showAll;
  final String allLabel;

  /// Advances the selection by [delta] (+1 = next, -1 = previous) and calls
  /// [onSelected]. No-ops when already at the boundary.
  void _swipe(int delta) {
    final opts = <String?>[
      if (showAll) null,
      ...options,
    ];
    if (opts.length < 2) return;
    final idx = opts.indexOf(selected);
    final next = (idx + delta).clamp(0, opts.length - 1);
    if (next == idx) return;
    HapticFeedback.selectionClick();
    onSelected(opts[next]);
  }

  @override
  Widget build(BuildContext context) {
    final items = <({String? value, String label})>[
      if (showAll) (value: null, label: allLabel),
      for (final o in options) (value: o, label: filterChipLabel(o)),
    ];

    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onHorizontalDragEnd: (details) {
        const kVelocityThreshold = 300.0;
        final v = details.primaryVelocity ?? 0;
        if (v < -kVelocityThreshold) {
          _swipe(1);   // swipe left  → next tab
        } else if (v > kVelocityThreshold) {
          _swipe(-1);  // swipe right → previous tab
        }
      },
      child: Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: AppColors.surface2,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Stack(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            physics: ListScroll.physics,
            padding: const EdgeInsets.symmetric(
              horizontal: 4,
              vertical: 2,
            ),
            child: Row(
              children: [
                for (var i = 0; i < items.length; i++) ...[
                  if (i > 0) const SizedBox(width: 6),
                  _FilterChipTab(
                    label: items[i].label,
                    selected: selected == items[i].value,
                    onTap: () => onSelected(items[i].value),
                  ),
                ],
                const SizedBox(width: AppSpacing.lg),
              ],
            ),
          ),
          Positioned(
            right: 0,
            top: 0,
            bottom: 0,
            child: IgnorePointer(
              child: Container(
                width: 32,
                decoration: BoxDecoration(
                  borderRadius: const BorderRadius.horizontal(
                    right: Radius.circular(AppTheme.radiusMd),
                  ),
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [
                      AppColors.surface.withOpacity(0),
                      AppColors.surface,
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    ),  // Container
    );  // GestureDetector
  }
}

class _FilterChipTab extends StatefulWidget {
  const _FilterChipTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_FilterChipTab> createState() => _FilterChipTabState();
}

class _FilterChipTabState extends State<_FilterChipTab> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: widget.onTap,
          borderRadius: BorderRadius.circular(8),
          splashColor: AppColors.primary.withOpacity(0.08),
          highlightColor: AppColors.primary.withOpacity(0.04),
          child: AnimatedContainer(
            duration: AppMotion.fast,
            curve: AppMotion.standard,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: widget.selected
                  ? AppColors.card
                  : _hovered
                      ? AppColors.surface2.withOpacity(0.6)
                      : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              boxShadow: widget.selected
                  ? const [
                      BoxShadow(
                        color: Color(0x14000000),
                        blurRadius: 4,
                        offset: Offset(0, 1),
                      ),
                    ]
                  : null,
            ),
            child: Text(
              widget.label,
              softWrap: false,
              style: TextStyle(
                fontSize: 13,
                fontWeight: widget.selected ? FontWeight.w500 : FontWeight.w400,
                color: widget.selected
                    ? AppColors.primary
                    : AppColors.text.withOpacity(0.45),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
