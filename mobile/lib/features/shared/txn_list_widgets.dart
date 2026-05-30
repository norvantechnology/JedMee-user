import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_icons.dart';
import '../../core/export/csv_export.dart';
import '../../widgets/csv_import_sheet.dart';
import '../../widgets/snackbar.dart';
import '../../core/performance/list_scroll.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/date.dart';
import '../../core/utils/format.dart';
import '../../core/utils/list_filter_utils.dart';
import '../../providers/branch_provider.dart';
import '../../widgets/branch_selector.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/filter_bottom_sheet.dart';
import '../../widgets/list_page_header.dart';
import '../../widgets/list_results_bar.dart';
import '../../widgets/list_toolbar.dart';
import '../../widgets/skeleton_loader.dart';
import '../../widgets/transaction_list_tile.dart';

// Microcopy constants — single source of truth for empty/filter messages.
const _kEmptyFilterMessage = 'No results found. Try adjusting your filters.';

typedef TxnLoadFn = Future<({List<Map<String, dynamic>> rows, String? error})> Function(
  String search,
  String? status,
);

/// Extended load function with date range support.
typedef TxnLoadFnEx = Future<({List<Map<String, dynamic>> rows, String? error})> Function(
  String search,
  String? status,
  String? dateFrom,
  String? dateTo,
);

// ─── Filters ──────────────────────────────────────────────────────────────────

/// Search + status filters for transaction list pages.
class TxnFilters extends StatelessWidget {
  const TxnFilters({
    super.key,
    required this.search,
    required this.status,
    required this.statuses,
    required this.onSearch,
    required this.onStatus,
    this.searchHint,
    this.headerActions,
    this.footer,
  });

  final String search;
  final String? status;
  final List<String> statuses;
  final ValueChanged<String> onSearch;
  final ValueChanged<String?> onStatus;
  final String? searchHint;
  final List<Widget>? headerActions;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return ListPageHeader(
      search: search,
      onSearchChanged: onSearch,
      searchHint: searchHint ?? 'Search…',
      statusFilter: status,
      onStatusChanged: onStatus,
      statusOptions: statuses,
      compactSearch: true,
      actions: headerActions,
      footer: footer,
    );
  }
}

// ─── Date range filter bar ────────────────────────────────────────────────────

/// Unified date range bar: calendar icon | "From → To" label | clear icon.
/// Uses [showDateRangePicker] so both start and end dates are selected in one
/// interaction — no need to tap twice.
class _TxnDateRangeBar extends StatelessWidget {
  const _TxnDateRangeBar({
    required this.dateFrom,
    required this.dateTo,
    required this.onFromChanged,
    required this.onToChanged,
    required this.onClear,
  });

  final String dateFrom;
  final String dateTo;
  final ValueChanged<String> onFromChanged;
  final ValueChanged<String> onToChanged;
  final VoidCallback onClear;

  String _formatDate(String iso) {
    if (iso.isEmpty) return '';
    return fmtDisplayDate(iso);
  }

  String get _rangeLabel {
    final from = _formatDate(dateFrom);
    final to = _formatDate(dateTo);
    if (from.isEmpty && to.isEmpty) return '';
    if (from.isNotEmpty && to.isNotEmpty) return '$from → $to';
    if (from.isNotEmpty) return 'From $from';
    return 'To $to';
  }

  Future<void> _pickRange(BuildContext context) async {
    // Build initial range — fall back to today when not set
    final now = DateTime.now();
    final start = DateTime.tryParse(dateFrom) ?? now;
    final end = DateTime.tryParse(dateTo) ?? start;

    final picked = await showDateRangePicker(
      context: context,
      initialDateRange: DateTimeRange(
        start: start,
        end: end.isBefore(start) ? start : end,
      ),
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      // Use compact builder so it fits on mobile screens
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx),
        child: child!,
      ),
    );
    if (picked != null) {
      onFromChanged(todayYmdLocal(picked.start));
      onToChanged(todayYmdLocal(picked.end));
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasFilter = dateFrom.isNotEmpty || dateTo.isNotEmpty;
    final label = _rangeLabel;

    return GestureDetector(
      onTap: () => _pickRange(context),
      child: Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: hasFilter
              ? AppColors.primary.withOpacity(0.06)
              : AppColors.surface2,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: hasFilter
                ? AppColors.primary.withOpacity(0.25)
                : AppColors.border,
            width: 0.5,
          ),
        ),
        child: Row(
          children: [
            Icon(
              AppIcons.date,
              size: 14,
              color: hasFilter ? AppColors.primary : AppColors.textMuted,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label.isNotEmpty ? label : 'Select date range',
                style: AppTypography.secondary.copyWith(
                  fontSize: 13,
                  fontWeight: hasFilter ? FontWeight.w500 : FontWeight.w400,
                  color: hasFilter ? AppColors.primaryDark : AppColors.textMuted,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (hasFilter) ...[
              const SizedBox(width: 6),
              GestureDetector(
                onTap: onClear,
                behavior: HitTestBehavior.opaque,
                child: const Icon(
                  AppIcons.close,
                  size: 14,
                  color: AppColors.textMuted,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ─── List body ────────────────────────────────────────────────────────────────

/// Transaction list with pull-to-refresh and consistent empty/error states.
class TxnListBody extends StatelessWidget {
  const TxnListBody({
    super.key,
    required this.loading,
    required this.error,
    required this.rows,
    required this.onRefresh,
    required this.onTap,
    this.rowBuilder,
    this.emptyTitle = 'No records found',
    this.emptyMessage,
    this.emptyActionLabel,
    this.onEmptyAction,
  });

  final bool loading;
  final String? error;
  final List<Map<String, dynamic>> rows;
  final Future<void> Function() onRefresh;
  final void Function(Map<String, dynamic> row) onTap;

  /// Optional custom row builder. When provided, replaces [TransactionListTile].
  final Widget Function(Map<String, dynamic> row)? rowBuilder;

  final String emptyTitle;
  final String? emptyMessage;
  final String? emptyActionLabel;
  final VoidCallback? onEmptyAction;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const SkeletonListPage();
    }
    if (error != null) {
      return EmptyState(
        title: 'Could not load',
        message: error,
        icon: AppIcons.wifiOff,
        actionLabel: 'Try again',
        onAction: onRefresh,
      );
    }
    if (rows.isEmpty) {
      return EmptyState(
        title: emptyTitle,
        message: emptyMessage ?? _kEmptyFilterMessage,
        icon: AppIcons.invoice,
        actionLabel: emptyActionLabel,
        onAction: onEmptyAction,
      );
    }
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.builder(
        padding: ListScroll.listPadding(),
        physics: ListScroll.physics,
        cacheExtent: ListScroll.cacheExtent,
        keyboardDismissBehavior: ListScroll.keyboardDismiss,
        itemCount: rows.length,
        itemBuilder: (_, i) {
          final row = rows[i];
          if (rowBuilder != null) return rowBuilder!(row);
          return TransactionListTile(
            key: ValueKey(row['id'] ?? i),
            row: row,
            onTap: () => onTap(row),
          );
        },
      ),
    );
  }
}

// ─── Full transaction list page ───────────────────────────────────────────────

/// Full transaction list page: header filters + list body (shared state).
class TxnListPage extends ConsumerStatefulWidget {
  const TxnListPage({
    super.key,
    required this.load,
    required this.onRowTap,
    required this.statusFilters,
    this.rowBuilder,
    this.searchHint,
    this.emptyTitle = 'No records found',
    this.emptyMessage,
    this.emptyActionLabel,
    this.onEmptyAction,
    this.showDateFilter = false,
    this.extraFilters,
    this.importEntityType,
    this.exportColumns,
    this.exportFilename = 'export',
    this.enableAdvancedFilters = false,
    this.filterModuleTitle = 'Records',
    this.showPaymentFilter = false,
    this.showBillTypeFilter = false,
    this.partyOptions = const [],
    this.partyFilterLabel = 'Customer',
    this.useBranchFilter = false,
    this.extraQueryParams,
    this.exportInHeader = false,
    this.hideToolbar = false,
    /// When true, hides the filter icon button from the search bar header.
    /// Use when the filter sheet is accessible from a bottom action bar instead.
    this.hideFilterButton = false,
  });

  final TxnLoadFn load;
  final void Function(Map<String, dynamic> row, Future<void> Function() refresh) onRowTap;

  /// Optional custom row builder. When provided, replaces [TransactionListTile].
  /// Receives the row data and a [refresh] callback.
  final Widget Function(Map<String, dynamic> row, Future<void> Function() refresh)? rowBuilder;
  final List<String> statusFilters;
  final String? searchHint;
  final String emptyTitle;
  final String? emptyMessage;
  final String? emptyActionLabel;
  final VoidCallback? onEmptyAction;
  final bool showDateFilter;
  final Widget? extraFilters;
  final String? importEntityType;
  final List<CsvColumn>? exportColumns;
  final String exportFilename;
  final bool enableAdvancedFilters;
  final String filterModuleTitle;
  final bool showPaymentFilter;
  final bool showBillTypeFilter;
  final List<({String id, String label})> partyOptions;
  final String partyFilterLabel;
  final bool useBranchFilter;
  final Map<String, dynamic> Function()? extraQueryParams;
  /// When true, export button appears as compact icon in header instead of footer toolbar.
  final bool exportInHeader;

  /// When true, the Import/Export toolbar is hidden from the footer.
  /// Use this when Import/Export are surfaced in a bottom action bar instead.
  final bool hideToolbar;

  /// When true, hides the filter icon button from the search bar header.
  /// Use when the filter sheet is accessible from a bottom action bar instead.
  final bool hideFilterButton;

  @override
  ConsumerState<TxnListPage> createState() => TxnListPageState();
}

class TxnListPageState extends ConsumerState<TxnListPage> {
  String _search = '';
  String? _status;
  String _dateFrom = '';
  String _dateTo = '';
  ListFilterState _advFilter = ListFilterState();
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _rows = [];
  List<Map<String, dynamic>> _rawRows = [];

  /// Exposes the current filtered rows to parent screens (e.g. for "Select All").
  List<Map<String, dynamic>> get rows => List.unmodifiable(_rows);

  @override
  void initState() {
    super.initState();
    if (widget.useBranchFilter) {
      Future.microtask(() => ref.read(branchControllerProvider.notifier).load());
    }
    refresh();
  }

  Future<void> refresh() => _fetch();

  /// Advances the status filter by [delta] steps (+1 = next tab, -1 = previous tab).
  /// Wraps the full option list: [null (All), ...statusFilters].
  void _swipeToTab(int delta) {
    if (widget.statusFilters.isEmpty) return;
    final options = <String?>[null, ...widget.statusFilters];
    final currentIndex = options.indexOf(_status);
    final nextIndex = (currentIndex + delta).clamp(0, options.length - 1);
    if (nextIndex == currentIndex) return;
    HapticFeedback.selectionClick();
    setState(() => _status = options[nextIndex]);
    _fetch();
  }

  /// Opens the advanced filter sheet programmatically (e.g. from a bottom action bar).
  Future<void> openFilterSheet() => _openFilterSheet();

  /// Opens the CSV import sheet programmatically (e.g. from a bottom action bar).
  Future<void> triggerImport() async {
    if (widget.importEntityType == null || !mounted) return;
    final done = await showCsvImportSheet(
      context,
      entityType: widget.importEntityType!,
    );
    if (done == true) refresh();
  }

  /// Triggers a CSV export programmatically (e.g. from a bottom action bar).
  Future<void> triggerExport() async {
    if (widget.exportColumns == null || !mounted) return;
    try {
      await CsvExport.download(
        filename: widget.exportFilename,
        columns: widget.exportColumns!,
        rows: _rows,
      );
      if (mounted) {
        showAppSnack(context, message: 'Export downloaded', type: AppSnackType.success);
      }
    } catch (e) {
      if (mounted) {
        showAppSnack(
          context,
          message: e.toString().replaceFirst('Bad state: ', ''),
          type: AppSnackType.error,
        );
      }
    }
  }

  void _applyLocalFilters() {
    var f = _advFilter.copy();
    if (_dateFrom.isNotEmpty) f.dateFrom = _dateFrom;
    if (_dateTo.isNotEmpty) f.dateTo = _dateTo;
    if (_status != null) f.status = _status;
    setState(() => _rows = applyListFilters(_rawRows, f));
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    if (widget.useBranchFilter && !ref.read(branchControllerProvider).loaded) {
      await ref.read(branchControllerProvider.notifier).load();
    }
    final result = await widget.load(_search, _status);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _rawRows = result.rows;
      _error = result.error;
    });
    _applyLocalFilters();
  }

  Future<void> _openFilterSheet() async {
    final updated = await showListFilterSheet(
      context: context,
      moduleTitle: widget.filterModuleTitle,
      initial: _advFilter.copy(),
      // Always show date range in filter sheet (whether showDateFilter is true or false)
      showDateRange: true,
      showPaymentStatus: widget.showPaymentFilter,
      showBillType: widget.showBillTypeFilter,
      parties: widget.partyOptions,
      partyLabel: widget.partyFilterLabel,
    );
    if (updated == null || !mounted) return;
    setState(() {
      _advFilter = updated;
      if (!widget.showDateFilter) {
        _dateFrom = updated.dateFrom;
        _dateTo = updated.dateTo;
      }
    });
    _applyLocalFilters();
  }

  int get _activeFilterCount {
    return _advFilter.activeCount(
      countDates: !widget.showDateFilter,
      countStatus: false,
    );
  }

  @override
  Widget build(BuildContext context) {
    // Build the footer: Import/Export toolbar + branch filter + date range.
    // When hideToolbar=true the toolbar is surfaced in the bottom action bar,
    // so it no longer contributes to the footer presence check.
    final toolbarVisible = widget.exportColumns != null &&
        !widget.exportInHeader &&
        !widget.hideToolbar;
    final hasFooter = widget.extraFilters != null ||
        widget.showDateFilter ||
        widget.useBranchFilter ||
        toolbarVisible;

    return Column(
      children: [
        TxnFilters(
          search: _search,
          status: _status,
          statuses: widget.statusFilters,
          searchHint: widget.searchHint,
          onSearch: (v) {
            setState(() => _search = v);
            _fetch();
          },
          onStatus: (v) {
            setState(() => _status = v);
            _fetch();
          },
          headerActions: [
            if (widget.enableAdvancedFilters && !widget.hideFilterButton)
              FilterIconButton(
                activeCount: _activeFilterCount,
                onPressed: _openFilterSheet,
              ),
            // Export as compact icon button in header when exportInHeader=true
            if (widget.exportInHeader && widget.exportColumns != null)
              _ExportHeaderBtn(
                enabled: _rows.isNotEmpty,
                onExport: () => CsvExport.download(
                  filename: widget.exportFilename,
                  columns: widget.exportColumns!,
                  rows: _rows,
                ),
              ),
          ],
          footer: hasFooter
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Import/Export toolbar row — hidden when surfaced in bottom bar
                    if (toolbarVisible) ...[
                      ListToolbar(
                        importEntityType: widget.importEntityType,
                        onImportComplete: refresh,
                        exportEnabled: _rows.isNotEmpty,
                        onExport: () => CsvExport.download(
                          filename: widget.exportFilename,
                          columns: widget.exportColumns!,
                          rows: _rows,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                    ],
                    if (widget.useBranchFilter)
                      BranchFilterChip(onChanged: _fetch),
                    if (widget.useBranchFilter &&
                        (widget.extraFilters != null || widget.showDateFilter))
                      const SizedBox(height: AppSpacing.sm),
                    if (widget.extraFilters != null) widget.extraFilters!,
                    if (widget.showDateFilter) ...[
                      if (widget.extraFilters != null)
                        const SizedBox(height: AppSpacing.sm),
                      _TxnDateRangeBar(
                        dateFrom: _dateFrom,
                        dateTo: _dateTo,
                        onFromChanged: (v) {
                          setState(() => _dateFrom = v);
                          _applyLocalFilters();
                        },
                        onToChanged: (v) {
                          setState(() => _dateTo = v);
                          _applyLocalFilters();
                        },
                        onClear: () {
                          setState(() {
                            _dateFrom = '';
                            _dateTo = '';
                          });
                          _applyLocalFilters();
                        },
                      ),
                    ],
                  ],
                )
              : null,
        ),

        if (!_loading && _error == null)
          ListResultsBar(
            count: _rows.length,
            onClearFilters: (_status != null ||
                    _dateFrom.isNotEmpty ||
                    _dateTo.isNotEmpty ||
                    _activeFilterCount > 0)
                ? () {
                    setState(() {
                      _status = null;
                      _dateFrom = '';
                      _dateTo = '';
                      _advFilter = ListFilterState();
                    });
                    _fetch();
                  }
                : null,
            clearLabel: 'Clear all',
          ),

        // Active filter chips — individual removable chips for each active filter
        if (!_loading && _error == null && _activeFilterCount > 0)
          _ActiveFilterChips(
            filter: _advFilter,
            partyOptions: widget.partyOptions,
            partyLabel: widget.partyFilterLabel,
            onRemovePaymentStatus: () {
              setState(() => _advFilter = _advFilter.copyWith(paymentStatus: null));
              _applyLocalFilters();
            },
            onRemoveParty: () {
              setState(() => _advFilter = _advFilter.copyWith(partyId: null));
              _applyLocalFilters();
            },
            onRemoveBillType: () {
              setState(() => _advFilter = _advFilter.copyWith(billType: null));
              _applyLocalFilters();
            },
            onRemoveSort: () {
              setState(() => _advFilter = _advFilter.copyWith(sortBy: 'date_desc'));
              _applyLocalFilters();
            },
          ),

        Expanded(
          // GestureDetector on the list body (not the header) so horizontal
          // swipes cycle through status tabs without conflicting with the
          // AppFilterChipsBar horizontal scroll or the ListView vertical scroll.
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onHorizontalDragEnd: (details) {
              const kVelocityThreshold = 300.0;
              final v = details.primaryVelocity ?? 0;
              if (v < -kVelocityThreshold) {
                _swipeToTab(1);  // swipe left  → next tab
              } else if (v > kVelocityThreshold) {
                _swipeToTab(-1); // swipe right → previous tab
              }
            },
            child: TxnListBody(
              loading: _loading,
              error: _error,
              rows: _rows,
              onRefresh: _fetch,
              rowBuilder: widget.rowBuilder != null
                  ? (row) => widget.rowBuilder!(row, _fetch)
                  : null,
              emptyTitle: widget.emptyTitle,
              emptyMessage: widget.emptyMessage,
              emptyActionLabel: widget.emptyActionLabel,
              onEmptyAction: widget.onEmptyAction,
              onTap: (row) => widget.onRowTap(row, _fetch),
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Active filter chips ──────────────────────────────────────────────────────

/// Horizontal row of removable chips showing each active advanced filter.
class _ActiveFilterChips extends StatelessWidget {
  const _ActiveFilterChips({
    required this.filter,
    required this.partyOptions,
    required this.partyLabel,
    required this.onRemovePaymentStatus,
    required this.onRemoveParty,
    required this.onRemoveBillType,
    required this.onRemoveSort,
  });

  final ListFilterState filter;
  final List<({String id, String label})> partyOptions;
  final String partyLabel;
  final VoidCallback onRemovePaymentStatus;
  final VoidCallback onRemoveParty;
  final VoidCallback onRemoveBillType;
  final VoidCallback onRemoveSort;

  String _sortLabel(String sortBy) => switch (sortBy) {
        'amount_desc' => 'Amount ↓',
        'amount_asc' => 'Amount ↑',
        'party_asc' => 'Name A–Z',
        'party_desc' => 'Name Z–A',
        'date_asc' => 'Date ↑',
        _ => '',
      };

  @override
  Widget build(BuildContext context) {
    final chips = <Widget>[];

    if (filter.paymentStatus != null) {
      chips.add(_RemovableChip(
        label: filter.paymentStatus!,
        onRemove: onRemovePaymentStatus,
      ));
    }

    if (filter.partyId != null && filter.partyId!.isNotEmpty) {
      final match =
          partyOptions.where((p) => p.id == filter.partyId).firstOrNull;
      chips.add(_RemovableChip(
        label: match?.label ?? partyLabel,
        onRemove: onRemoveParty,
      ));
    }

    if (filter.billType != null) {
      chips.add(_RemovableChip(
        label: filter.billType!,
        onRemove: onRemoveBillType,
      ));
    }

    if (filter.sortBy != 'date_desc') {
      final sl = _sortLabel(filter.sortBy);
      if (sl.isNotEmpty) {
        chips.add(_RemovableChip(
          label: 'Sort: $sl',
          onRemove: onRemoveSort,
          isSort: true,
        ));
      }
    }

    if (chips.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        0,
        AppSpacing.md,
        AppSpacing.xs,
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (var i = 0; i < chips.length; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              chips[i],
            ],
          ],
        ),
      ),
    );
  }
}

class _RemovableChip extends StatelessWidget {
  const _RemovableChip({
    required this.label,
    required this.onRemove,
    this.isSort = false,
  });

  final String label;
  final VoidCallback onRemove;
  final bool isSort;

  @override
  Widget build(BuildContext context) {
    final color = isSort
        ? const Color(0xFF6366F1) // primaryMid
        : const Color(0xFF4F46E5); // primary
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 4, 6, 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: color.withOpacity(0.25), width: 0.75),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w500,
              color: color,
              height: 1.2,
            ),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onRemove,
            behavior: HitTestBehavior.opaque,
            child: Icon(
              AppIcons.close,
              size: 13,
              color: color.withOpacity(0.7),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Export header button ─────────────────────────────────────────────────────

/// Compact icon-only export button for the list header.
class _ExportHeaderBtn extends StatelessWidget {
  const _ExportHeaderBtn({
    required this.enabled,
    required this.onExport,
  });

  final bool enabled;
  final Future<void> Function() onExport;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Export',
      child: IconButton(
        icon: Icon(
          AppIcons.download,
          size: 20,
          color: enabled ? AppColors.primary : AppColors.textFaint,
        ),
        onPressed: enabled
            ? () async {
                try {
                  await onExport();
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Export downloaded')),
                    );
                  }
                } catch (_) {}
              }
            : null,
        splashRadius: 20,
        padding: EdgeInsets.zero,
        constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
      ),
    );
  }
}
