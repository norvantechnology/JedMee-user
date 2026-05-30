import 'package:flutter/material.dart';

import '../core/app_icons.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_motion.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';

/// Premium search bar with animated focus state and clear button.
class AppSearchBar extends StatefulWidget {
  const AppSearchBar({
    super.key,
    required this.value,
    required this.onChanged,
    this.hint = 'Search…',
    this.onClear,
    this.compact = false,
    this.autofocus = false,
    this.onSubmitted,
    this.filled = false,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final String hint;
  final VoidCallback? onClear;
  final bool compact;
  final bool autofocus;
  final ValueChanged<String>? onSubmitted;
  final bool filled;

  @override
  State<AppSearchBar> createState() => _AppSearchBarState();
}

class _AppSearchBarState extends State<AppSearchBar> {
  late final TextEditingController _controller;
  final FocusNode _focus = FocusNode();
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.value);
    _focus.addListener(() {
      setState(() => _focused = _focus.hasFocus);
    });
  }

  @override
  void didUpdateWidget(covariant AppSearchBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != _controller.text) {
      _controller.text = widget.value;
      _controller.selection = TextSelection.collapsed(
        offset: widget.value.length,
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final height = widget.compact ? 40.0 : 44.0;

    final useFill = widget.filled;
    return AnimatedContainer(
      duration: AppMotion.fast,
      height: height,
      decoration: BoxDecoration(
        color: useFill
            ? (_focused ? AppColors.card : AppColors.surface2)
            : (_focused ? AppColors.card : AppColors.surface),
        borderRadius: BorderRadius.circular(
          useFill ? AppTheme.radiusSm : AppTheme.radiusMd,
        ),
        border: useFill
            ? null
            : Border.all(
                color: _focused ? AppColors.primary : AppColors.border,
                width: _focused ? 1.5 : 1,
              ),
        boxShadow: !useFill && _focused
            ? [
                BoxShadow(
                  color: AppColors.primary.withOpacity(0.08),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ]
            : null,
      ),
      child: TextField(
        controller: _controller,
        focusNode: _focus,
        autofocus: widget.autofocus,
        onChanged: widget.onChanged,
        onSubmitted: widget.onSubmitted,
        style: AppTypography.body,
        textAlignVertical: TextAlignVertical.center,
        decoration: InputDecoration(
          hintText: widget.hint,
          hintStyle: AppTypography.body.copyWith(
            color: AppColors.textPlaceholder,
          ),
          prefixIcon: Padding(
            padding: const EdgeInsets.only(left: 12, right: 8),
            child: Icon(
              AppIcons.search,
              size: 18,
              color: _focused ? AppColors.primary : AppColors.textMuted,
            ),
          ),
          prefixIconConstraints: const BoxConstraints(),
          suffixIcon: widget.value.isNotEmpty
              ? IconButton(
                  icon: const Icon(AppIcons.close, size: 16),
                  color: AppColors.textMuted,
                  padding: const EdgeInsets.all(8),
                  constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                  onPressed: () {
                    _controller.clear();
                    widget.onChanged('');
                    widget.onClear?.call();
                  },
                )
              : null,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          contentPadding: EdgeInsets.symmetric(
            horizontal: 14,
            vertical: widget.compact ? 9 : 11,
          ),
          isDense: true,
        ),
      ),
    );
  }
}
