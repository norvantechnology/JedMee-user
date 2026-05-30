import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/app_icons.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_typography.dart';

/// A single bulk action shown in the [BulkSelectBar].
class BulkAction {
  const BulkAction({
    required this.label,
    required this.icon,
    required this.onTap,
    this.color,
    this.enabled = true,
    this.destructive = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final Color? color;
  final bool enabled;
  final bool destructive;
}

/// Professional bulk-select bottom bar.
///
/// Replaces the normal [AppBottomActionBar] when the user enters multi-select
/// mode (long-press on any list tile).
///
/// Layout:
/// ┌─────────────────────────────────────────────────────────────┐
/// │  ✕ Cancel   [●  N selected]   Select all / Deselect all    │  ← top strip
/// ├─────────────────────────────────────────────────────────────┤
/// │   [Action 1]    [Action 2]    [Action 3]                   │  ← action row
/// └─────────────────────────────────────────────────────────────┘
class BulkSelectBar extends StatefulWidget {
  const BulkSelectBar({
    super.key,
    required this.selectedCount,
    required this.totalCount,
    required this.onCancel,
    required this.onSelectAll,
    required this.onDeselectAll,
    required this.actions,
  });

  final int selectedCount;
  final int totalCount;
  final VoidCallback onCancel;
  final VoidCallback onSelectAll;
  final VoidCallback onDeselectAll;
  final List<BulkAction> actions;

  @override
  State<BulkSelectBar> createState() => _BulkSelectBarState();
}

class _BulkSelectBarState extends State<BulkSelectBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<Offset> _slide;
  late final Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 280),
    );
    _slide = Tween<Offset>(
      begin: const Offset(0, 1),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  bool get _allSelected =>
      widget.totalCount > 0 && widget.selectedCount >= widget.totalCount;

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final screenWidth = MediaQuery.sizeOf(context).width;
    final isNarrow = screenWidth < 360;

    return SlideTransition(
      position: _slide,
      child: FadeTransition(
        opacity: _fade,
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.card,
            border: const Border(
              top: BorderSide(color: Color(0xFFE2E2EE), width: 0.8),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.12),
                blurRadius: 28,
                offset: const Offset(0, -8),
              ),
              BoxShadow(
                color: AppColors.primary.withOpacity(0.04),
                blurRadius: 12,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── Top strip: cancel | count badge | select-all ──────────────
              _TopStrip(
                selectedCount: widget.selectedCount,
                totalCount: widget.totalCount,
                allSelected: _allSelected,
                isNarrow: isNarrow,
                onCancel: widget.onCancel,
                onToggleAll: _allSelected
                    ? widget.onDeselectAll
                    : widget.onSelectAll,
              ),

              // ── Action buttons row ─────────────────────────────────────────
              if (widget.actions.isNotEmpty)
                _ActionsRow(
                  actions: widget.actions,
                  selectedCount: widget.selectedCount,
                  bottomInset: bottomInset,
                  isNarrow: isNarrow,
                ),

              if (widget.actions.isEmpty)
                SizedBox(height: bottomInset + 8),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Top strip ────────────────────────────────────────────────────────────────

class _TopStrip extends StatelessWidget {
  const _TopStrip({
    required this.selectedCount,
    required this.totalCount,
    required this.allSelected,
    required this.isNarrow,
    required this.onCancel,
    required this.onToggleAll,
  });

  final int selectedCount;
  final int totalCount;
  final bool allSelected;
  final bool isNarrow;
  final VoidCallback onCancel;
  final VoidCallback onToggleAll;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.primary.withOpacity(0.07),
            AppColors.primary.withOpacity(0.03),
          ],
        ),
        border: const Border(
          bottom: BorderSide(color: Color(0xFFE8E8F0), width: 0.5),
        ),
      ),
      child: Row(
        children: [
          // Cancel button
          _TapTarget(
            onTap: () {
              HapticFeedback.selectionClick();
              onCancel();
            },
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: AppColors.textMuted.withOpacity(0.10),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    AppIcons.close,
                    size: 12,
                    color: AppColors.textMuted,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  'Cancel',
                  style: AppTypography.label.copyWith(
                    color: AppColors.textMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),

          const Spacer(),

          // Count badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF6C63FF), Color(0xFF4F46E5)],
              ),
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withOpacity(0.30),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 5),
                Text(
                  '$selectedCount${isNarrow ? '' : ' selected'}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    height: 1.2,
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(width: 10),

          // Select all / Deselect all
          _TapTarget(
            onTap: () {
              HapticFeedback.selectionClick();
              onToggleAll();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: allSelected
                    ? AppColors.primary.withOpacity(0.10)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: AppColors.primary.withOpacity(allSelected ? 0.30 : 0.18),
                  width: 0.8,
                ),
              ),
              child: Text(
                allSelected
                    ? (isNarrow ? 'None' : 'Deselect all')
                    : (isNarrow ? 'All' : 'Select all'),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                  height: 1.2,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Actions row ──────────────────────────────────────────────────────────────

class _ActionsRow extends StatelessWidget {
  const _ActionsRow({
    required this.actions,
    required this.selectedCount,
    required this.bottomInset,
    required this.isNarrow,
  });

  final List<BulkAction> actions;
  final int selectedCount;
  final double bottomInset;
  final bool isNarrow;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 64 + bottomInset,
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Row(
        children: actions.map((action) {
          final enabled = action.enabled && selectedCount > 0;
          final color = action.destructive
              ? const Color(0xFFEF4444)
              : (action.color ?? AppColors.primary);
          return Expanded(
            child: _ActionButton(
              action: action,
              color: color,
              enabled: enabled,
              isNarrow: isNarrow,
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ─── Individual action button ─────────────────────────────────────────────────

class _ActionButton extends StatefulWidget {
  const _ActionButton({
    required this.action,
    required this.color,
    required this.enabled,
    required this.isNarrow,
  });

  final BulkAction action;
  final Color color;
  final bool enabled;
  final bool isNarrow;

  @override
  State<_ActionButton> createState() => _ActionButtonState();
}

class _ActionButtonState extends State<_ActionButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 80),
      reverseDuration: const Duration(milliseconds: 200),
    );
    _scale = Tween<double>(begin: 1.0, end: 0.88)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) {
          if (!widget.enabled) return;
          _ctrl.forward();
          HapticFeedback.selectionClick();
        },
        onTapUp: (_) {
          _ctrl.reverse();
          if (widget.enabled) widget.action.onTap();
        },
        onTapCancel: () => _ctrl.reverse(),
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 150),
          opacity: widget.enabled ? 1.0 : 0.28,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Icon container
              Container(
                width: widget.isNarrow ? 38 : 44,
                height: widget.isNarrow ? 30 : 34,
                decoration: BoxDecoration(
                  color: widget.color.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: widget.color.withOpacity(0.18),
                    width: 0.8,
                  ),
                ),
                child: Icon(
                  widget.action.icon,
                  size: widget.isNarrow ? 16 : 18,
                  color: widget.color,
                ),
              ),
              const SizedBox(height: 5),
              // Label
              Text(
                widget.action.label,
                style: TextStyle(
                  fontSize: widget.isNarrow ? 10 : 11,
                  fontWeight: FontWeight.w600,
                  color: widget.color,
                  height: 1.1,
                  letterSpacing: 0.1,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Tap target helper ────────────────────────────────────────────────────────

class _TapTarget extends StatelessWidget {
  const _TapTarget({required this.child, required this.onTap});

  final Widget child;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: child,
      ),
    );
  }
}