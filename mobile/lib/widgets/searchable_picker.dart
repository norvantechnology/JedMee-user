import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';

/// A single item in a [SearchablePickerField].
class SearchablePickerItem {
  const SearchablePickerItem({required this.value, required this.label});

  final String value;
  final String label;
}

/// Inline expandable picker — no modal; options scroll below the field.
///
/// Works inside [ListView] forms (sales/purchase invoices, master data, etc.).
class SearchablePickerField extends StatefulWidget {
  const SearchablePickerField({
    super.key,
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
    this.hint,
    this.enabled = true,
    this.errorText,
    this.displayLabel,
    this.compact = false,
    this.maxListHeight = 168,
    this.initiallyExpanded = false,
    this.emptyMessage,
  });

  final String label;
  final String? value;
  final List<SearchablePickerItem> items;
  final ValueChanged<String?> onChanged;
  final String? hint;
  final bool enabled;
  final String? errorText;

  /// Shown when [value] is set but not found in [items] (e.g. after barcode scan).
  final String? displayLabel;
  final bool compact;
  final double maxListHeight;

  /// Opens the option list on first build (e.g. after "Add manually").
  final bool initiallyExpanded;

  /// Custom message shown when [items] is empty (e.g. "No customers found").
  /// Defaults to a generic message when null.
  final String? emptyMessage;

  @override
  State<SearchablePickerField> createState() => _SearchablePickerFieldState();
}

class _SearchablePickerFieldState extends State<SearchablePickerField> {
  bool _expanded = false;
  String _search = '';
  final _fieldKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _expanded = widget.initiallyExpanded && widget.enabled;
    if (_expanded) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollIntoView());
    }
  }

  @override
  void didUpdateWidget(covariant SearchablePickerField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initiallyExpanded &&
        !oldWidget.initiallyExpanded &&
        widget.enabled &&
        !_expanded) {
      setState(() => _expanded = true);
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollIntoView());
    }
  }

  String? get _displayText {
    if (widget.value == null || widget.value!.isEmpty) return null;
    for (final e in widget.items) {
      if (e.value == widget.value) return e.label;
    }
    return widget.displayLabel?.trim().isNotEmpty == true ? widget.displayLabel : null;
  }

  List<SearchablePickerItem> get _filtered {
    final q = _search.trim().toLowerCase();
    if (q.isEmpty) return widget.items;
    return widget.items.where((e) => e.label.toLowerCase().contains(q)).toList();
  }

  void _scrollIntoView() {
    final ctx = _fieldKey.currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(
      ctx,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      alignment: 0.2,
    );
  }

  void _toggle() {
    if (!widget.enabled) return;
    setState(() {
      _expanded = !_expanded;
      if (!_expanded) _search = '';
    });
    if (_expanded) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollIntoView());
    }
  }

  void _select(String? v) {
    setState(() {
      _expanded = false;
      _search = '';
    });
    widget.onChanged(v);
  }

  @override
  Widget build(BuildContext context) {
    final display = _displayText;
    final hasValue = display != null;
    final hasError = widget.errorText != null;
    final filtered = _filtered;
    final minH = widget.compact ? 40.0 : 44.0;
    final vPad = widget.compact ? 10.0 : 12.0;
    final showSearch = widget.items.length > 4;

    // Wrap in Opacity when disabled for clear visual distinction
    final content = Column(
      key: _fieldKey,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(widget.label, style: AppTypography.inputLabel),
        const SizedBox(height: 4),
        Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(AppTheme.radiusSm),
          child: InkWell(
            onTap: _toggle,
            borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            child: Container(
              constraints: BoxConstraints(minHeight: minH),
              padding: EdgeInsets.symmetric(horizontal: 12, vertical: vPad),
              decoration: BoxDecoration(
                color: widget.enabled
                    ? AppColors.card
                    : AppColors.text.withOpacity(0.04),
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                border: Border.all(
                  color: hasError
                      ? AppColors.danger
                      : _expanded
                          ? AppColors.primaryMid
                          : AppColors.border,
                  width: hasError || _expanded ? 1.5 : 1,
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      hasValue ? display : (widget.hint ?? 'Select…'),
                      style: (widget.compact ? AppTypography.caption : AppTypography.body)
                          .copyWith(
                        color: hasValue
                            ? (widget.enabled
                                ? AppColors.text
                                : AppColors.text.withOpacity(0.35))
                            : AppColors.textPlaceholder,
                        fontWeight: hasValue ? FontWeight.w500 : FontWeight.w400,
                      ),
                      overflow: TextOverflow.ellipsis,
                      maxLines: 1,
                    ),
                  ),
                  if (widget.items.isNotEmpty && !hasValue && !widget.compact)
                    Padding(
                      padding: const EdgeInsets.only(right: 2),
                      child: Text(
                        '${widget.items.length}',
                        style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                      ),
                    ),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    color: widget.enabled ? AppColors.textMuted : AppColors.border,
                    size: 20,
                  ),
                ],
              ),
            ),
          ),
        ),
        if (_expanded && widget.enabled) ...[
          const SizedBox(height: 4),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (showSearch)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 6, 8, 4),
                    child: TextField(
                      autofocus: widget.items.length > 12,
                      onChanged: (v) => setState(() => _search = v),
                      style: AppTypography.caption,
                      decoration: InputDecoration(
                        isDense: true,
                        hintText: 'Filter…',
                        hintStyle: AppTypography.caption,
                        prefixIcon: const Icon(Icons.search, size: 16),
                        prefixIconConstraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                          borderSide: const BorderSide(color: AppColors.border),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                          borderSide: const BorderSide(color: AppColors.border),
                        ),
                      ),
                    ),
                  ),
                if (widget.items.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.search_off_rounded,
                          size: 28,
                          color: AppColors.textFaint,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          widget.emptyMessage ?? 'No options available',
                          style: AppTypography.caption.copyWith(
                            color: AppColors.textMuted,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  )
                else if (filtered.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.search_off_rounded,
                          size: 28,
                          color: AppColors.textFaint,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'No results for "$_search"',
                          style: AppTypography.caption.copyWith(
                            color: AppColors.textMuted,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  )
                else
                  ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: widget.maxListHeight),
                    child: NotificationListener<ScrollNotification>(
                      onNotification: (notification) {
                        // Keep scroll inside the option list (parent ListView won't steal it).
                        if (notification is ScrollUpdateNotification ||
                            notification is OverscrollNotification) {
                          return true;
                        }
                        return false;
                      },
                      child: ListView.builder(
                        shrinkWrap: true,
                        primary: false,
                        padding: EdgeInsets.zero,
                        itemCount: filtered.length,
                        physics: const ClampingScrollPhysics(),
                        itemBuilder: (_, i) {
                          final item = filtered[i];
                          final selected = item.value == widget.value;
                          return Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (i > 0)
                                const Divider(height: 1, indent: 10, endIndent: 10),
                              Material(
                                color: selected ? AppColors.primarySubtle : Colors.transparent,
                                child: InkWell(
                                  onTap: () => _select(item.value),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            item.label,
                                            style: AppTypography.caption.copyWith(
                                              fontWeight:
                                                  selected ? FontWeight.w600 : FontWeight.w400,
                                              color: selected
                                                  ? AppColors.primaryDark
                                                  : AppColors.text,
                                            ),
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                        if (selected)
                                          const Icon(
                                            Icons.check_rounded,
                                            size: 16,
                                            color: AppColors.primary,
                                          ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
                  ),
                if (hasValue)
                  InkWell(
                    onTap: () => _select(null),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Center(
                        child: Text(
                          'Clear selection',
                          style: AppTypography.caption.copyWith(color: AppColors.danger),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
        if (hasError) ...[
            const SizedBox(height: 4),
            Text(
              widget.errorText!,
              style: AppTypography.helperText.copyWith(color: AppColors.danger),
            ),
          ],
        ],
      );
  
      if (!widget.enabled) {
        return Opacity(opacity: 0.50, child: content);
      }
      return content;
    }
  }
