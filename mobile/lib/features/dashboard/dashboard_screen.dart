import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/app_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_motion.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/access.dart';
import '../../core/utils/api_data.dart';
import '../../core/utils/barcode_lookup.dart';
import '../../core/utils/date.dart';
import '../../core/dashboard/dashboard_sales_target_store.dart';
import '../../core/utils/format.dart';
import '../../providers/app_providers.dart';
import '../../providers/auth_controller.dart';
import '../shared/invoice_outstanding_utils.dart';
import '../shared/ongoing_bills_controller.dart';
import '../../widgets/app_bottom_nav.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/barcode_scan_sheet.dart';
import '../../widgets/date_range_bar.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/responsive.dart';
import '../../widgets/skeleton_loader.dart';
import '../../widgets/snackbar.dart';
import '../../widgets/status_badge.dart';
import '../../widgets/transaction_list_tile.dart';

// ─── Layout constants ────────────────────────────────────────────────────────
const double _sectionGap = 16.0;
const double _cardGap    = 10.0;
const double _dashHeaderIcon = 24.0;

String _dashboardAccountId(dynamic auth) {
  final user = auth?.user;
  if (user is Map) {
    final id = user['account_id'] ?? user['accountId'];
    if (id != null) return id.toString();
  }
  return '';
}

/// Side-by-side on wider screens; stacked on narrow phones to avoid truncation.
class _DashSideBySide extends StatelessWidget {
  const _DashSideBySide({required this.children, this.spacing = _cardGap});
  final List<Widget> children;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    if (Responsive.isNarrow(context) || children.length == 1) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) SizedBox(height: spacing),
            children[i],
          ],
        ],
      );
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) SizedBox(width: spacing),
          Expanded(child: children[i]),
        ],
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard Screen
// ═══════════════════════════════════════════════════════════════════════════════

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  String _dateFrom = '';
  String _dateTo   = todayYmdLocal();
  String _preset   = 'MONTH';
  bool   _loading  = true;
  Map<String, dynamic>? _data;
  late TabController _tabController;
  int _lastRecentTabIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tabController = TabController(length: 3, vsync: this);
    _lastRecentTabIndex = _tabController.index;
    _tabController.addListener(_onRecentTabChanged);
    _applyPreset('MONTH');
  }

  @override
  void activate() {
    super.activate();
    // When this route is shown again without dispose (e.g. nested nav), reload live data.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _load();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tabController.removeListener(_onRecentTabChanged);
    _tabController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      _load();
    }
  }

  void _onRecentTabChanged() {
    if (_tabController.indexIsChanging) return;
    if (_tabController.index == _lastRecentTabIndex) return;
    _lastRecentTabIndex = _tabController.index;
    _load();
  }

  void _applyPreset(String preset) {
    final now = DateTime.now();
    setState(() {
      _preset = preset;
      _dateTo = todayYmdLocal(now);
      switch (preset) {
        case 'TODAY':
          _dateFrom = _dateTo;
        case 'WEEK':
          // ISO week: Monday = weekday 1, Sunday = weekday 7
          // Subtract (weekday - 1) days to get to Monday
          final daysToMonday = now.weekday - 1; // 0 on Monday, 6 on Sunday
          _dateFrom = todayYmdLocal(now.subtract(Duration(days: daysToMonday)));
        case 'QUARTER':
          final qStart = ((now.month - 1) ~/ 3) * 3 + 1;
          _dateFrom = '${now.year}-${qStart.toString().padLeft(2, '0')}-01';
        case 'YEAR':
          _dateFrom = '${now.year}-01-01';
          _dateTo   = '${now.year}-12-31';
        default: // MONTH
          _dateFrom = '${now.year}-${now.month.toString().padLeft(2, '0')}-01';
      }
    });
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    // Always bypass cache — dashboard must reflect latest sales/stock after other screens.
    final resp =
        await ref.read(dashboardRepositoryProvider).refreshDashboardSummary({
      if (_dateFrom.isNotEmpty) 'dateFrom': _dateFrom,
      if (_dateTo.isNotEmpty) 'dateTo': _dateTo,
      if (_dateFrom.isNotEmpty &&
          _dateTo.isNotEmpty &&
          _dateFrom == _dateTo)
        'date': _dateFrom,
    });
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (resp.ok && resp.data is Map) {
        _data = Map<String, dynamic>.from(resp.data as Map);
      } else if (!resp.ok) {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
    });
  }

  List<Map<String, dynamic>> _recentItems(int index) {
    return switch (index) {
      1 => widgetList(_data, ['recent_purchases', 'recentPurchases']),
      2 => widgetList(_data, ['recent_returns',   'recentReturns']),
      _ => widgetList(_data, ['recent_sales',     'recentSales']),
    };
  }

  @override
  Widget build(BuildContext context) {
    final auth     = ref.watch(authControllerProvider).auth;
    final retailer = isRetailer(auth);
    final kpis     = _data?['kpis'] is Map
        ? Map<String, dynamic>.from(_data!['kpis'] as Map)
        : <String, dynamic>{};
    final widgets       = dashboardWidgets(_data);
    final salesTrend    = widgets['sales_trend_30d']    ?? widgets['salesTrend30d'];
    final purchaseTrend = widgets['purchase_trend_30d'] ?? widgets['purchaseTrend30d'];
    final criticalAlerts = widgetList(_data, ['alerts']);
    final expiryWatch   = widgetList(_data, ['expiry_watch', 'expiryWatch']);
    final purchaseDueToday = widgetList(_data, ['purchase_due_today', 'purchaseDueToday']);

    final salesKpi       = dashboardSalesKpi(kpis, isTodayPreset: _preset == 'TODAY');
    final salesLabel     = dashboardSalesKpiLabel(isTodayPreset: _preset == 'TODAY');
    // Purchases: use range total for period presets, today total for TODAY preset
    final purchaseKpi    = _preset == 'TODAY'
        ? (kpiValue(kpis, 'today_purchases') ?? 0)
        : (kpiValue(kpis, 'range_purchases') ?? kpiValue(kpis, 'today_purchases') ?? 0);
    // Receivables & Payables: total outstanding (balance sheet items, not date-filtered)
    final receivablesKpi = kpiValue(kpis, 'receivables');
    final payablesKpi    = kpiValue(kpis, 'payables');
    // Gross profit: align with displayed sales/purchases for the active preset
    final salesVal    = (salesKpi ?? 0).toDouble();
    final purchaseVal = (purchaseKpi ?? 0).toDouble();
    final profitKpi   = kpiValue(kpis, 'gross_profit') ?? kpiValue(kpis, 'net_profit');
    final displayProfit = profitKpi ??
        (salesVal != 0 || purchaseVal != 0 ? salesVal - purchaseVal : null);
    final gstKpi         = kpiValue(kpis, 'gst_collected') ?? kpiValue(kpis, 'gst_payable');

    final topProducts   = widgetListDeduped(
      _data,
      ['top_products', 'topProducts'],
      idKeys: ['product_id', 'productId'],
      nameKeys: ['product_name', 'productName', 'name'],
    );
    final topCustomers  = widgetListDeduped(
      _data,
      ['top_customers', 'topCustomers'],
      idKeys: ['customer_id', 'customerId'],
      nameKeys: ['customer_name', 'customerName', 'name'],
    );
    final topVendors    = widgetListDeduped(
      _data,
      ['top_vendors', 'topVendors', 'top_suppliers', 'topSuppliers'],
      idKeys: ['vendor_id', 'vendorId', 'supplier_id', 'supplierId'],
      nameKeys: ['vendor_name', 'vendorName', 'supplier_name', 'supplierName', 'name'],
    );
    // Single source: Business insights only (no standalone block).
    final topMfgRaw     = widgetListDeduped(
      _data,
      ['top_manufacturers', 'topManufacturers', 'top_mfg', 'topMfg'],
      idKeys: ['mfg_id', 'mfgId'],
      nameKeys: ['mfg_name', 'mfgName', 'mfg_company', 'mfgCompany', 'company_name', 'companyName', 'name'],
    );
    final topMfg        = topMfgRowsForDisplay(topMfgRaw);
    final paymentModes  = widgetList(_data, ['payment_modes',  'paymentModes']);
    final paymentModesPrev = widgetList(_data, ['payment_modes_prev', 'paymentModesPrev']);
    final salesByDow    = widgetList(_data, ['sales_by_dow', 'salesByDow']);
    final concentrationPct = customerConcentrationPct(topCustomers, salesVal);
    final lowStock      = widgetList(_data, ['low_stock',      'lowStock']);
    final expiryAlerts  = expiryWatch;
    final divisionSales = widgetList(_data, ['division_sales', 'divisionSales']);
    final gstSummary    = _data?['widgets'] is Map
        ? (_data!['widgets'] as Map)['gst_summary']    ?? (_data!['widgets'] as Map)['gstSummary']
        : null;

    final hasCriticalAlerts = criticalAlerts.isNotEmpty;
    final hasSalesByDow = salesByDow.any((r) => (pickNum(r['total']) ?? 0) > 0);
    final hasInsights = topProducts.isNotEmpty  || topCustomers.isNotEmpty ||
                        topVendors.isNotEmpty   || topMfg.isNotEmpty       ||
                        paymentModes.isNotEmpty || divisionSales.isNotEmpty;
    final hasGst      = gstSummary != null;
    final hasCashFlow = salesVal > 0 || purchaseVal > 0;

    // ── Extended analytics KPIs ────────────────────────────────────────────
    final invoiceCount    = kpiValue(kpis, 'invoice_count')    ?? kpiValue(kpis, 'sales_count')    ?? kpiValue(kpis, 'salesCount');
    final avgSale         = kpiValue(kpis, 'avg_sale')         ?? kpiValue(kpis, 'average_sale')   ?? kpiValue(kpis, 'avgSale');
    final totalProducts   = kpiValue(kpis, 'total_products')   ?? kpiValue(kpis, 'product_count')  ?? kpiValue(kpis, 'totalProducts');
    final lowStockCount   = kpiValue(kpis, 'low_stock_count')  ?? kpiValue(kpis, 'lowStockCount')  ?? lowStock.length.toDouble();
    final outOfStock      = kpiValue(kpis, 'out_of_stock')     ?? kpiValue(kpis, 'outOfStock')     ?? kpiValue(kpis, 'out_of_stock_count');
    final stockValue      = kpiValue(kpis, 'stock_value')      ?? kpiValue(kpis, 'stockValue')     ?? kpiValue(kpis, 'inventory_value');
    final salesReturns    = kpiValue(kpis, 'sales_returns')    ?? kpiValue(kpis, 'salesReturns')   ?? kpiValue(kpis, 'return_amount');
    final purchaseReturns = kpiValue(kpis, 'purchase_returns') ?? kpiValue(kpis, 'purchaseReturns');
    final expiryCount     = kpiValue(kpis, 'expiry_count')     ?? kpiValue(kpis, 'expiryCount')    ?? expiryAlerts.length.toDouble();
    final newCustomers    = kpiValue(kpis, 'new_customers')    ?? kpiValue(kpis, 'newCustomers');
    final avgOrderValue   = kpiValue(kpis, 'avg_order_value')  ?? kpiValue(kpis, 'avgOrderValue');
    final totalCustomers  = kpiValue(kpis, 'customer_count')   ?? kpiValue(kpis, 'totalCustomers');

    final hasStockHealth      = totalProducts != null || (lowStockCount ?? 0) > 0 || outOfStock != null || stockValue != null || expiryAlerts.isNotEmpty;
    final hasSalesPerf        = invoiceCount != null || avgSale != null || salesReturns != null || purchaseReturns != null;
    final hasCustomerInsights = newCustomers != null || avgOrderValue != null || totalCustomers != null;

    // ── New analytics data ─────────────────────────────────────────────────
    final pendingOrdersData = _data?['widgets']?['pending_orders'] is Map
        ? Map<String, dynamic>.from(_data!['widgets']['pending_orders'] as Map)
        : <String, dynamic>{};
    final momData = _data?['widgets']?['mom_comparison'] is Map
        ? Map<String, dynamic>.from(_data!['widgets']['mom_comparison'] as Map)
        : null;
    final overdueAgingData = _data?['widgets']?['overdue_aging'] is Map
        ? Map<String, dynamic>.from(_data!['widgets']['overdue_aging'] as Map)
        : null;
    final invoicePayStatusData = _data?['widgets']?['invoice_pay_status'] is Map
        ? Map<String, dynamic>.from(_data!['widgets']['invoice_pay_status'] as Map)
        : null;
    final expiryRiskData = _data?['widgets']?['expiry_value_at_risk'] is Map
        ? Map<String, dynamic>.from(_data!['widgets']['expiry_value_at_risk'] as Map)
        : null;
    final nonMovingValData = _data?['widgets']?['non_moving_value'] is Map
        ? Map<String, dynamic>.from(_data!['widgets']['non_moving_value'] as Map)
        : null;
    final stockCoverageData = widgetList(_data, ['stock_coverage', 'stockCoverage']);

    final hasPendingOrders = (pickNum(pendingOrdersData['incoming_count']) ?? 0) > 0 ||
        (pickNum(pendingOrdersData['my_count']) ?? 0) > 0;
    // MoM: only show when there is actual comparison data to avoid empty card
    final hasMom = momData != null &&
        ((pickNum(momData['current_period']) ?? 0) > 0 ||
         (pickNum(momData['last_month']) ?? 0) > 0 ||
         (pickNum(momData['same_month_last_year']) ?? 0) > 0);
    final hasOverdueAging = overdueAgingData != null &&
        ((pickNum(overdueAgingData['bucket_0_30']?['amount']) ?? 0) > 0 ||
         (pickNum(overdueAgingData['bucket_31_60']?['amount']) ?? 0) > 0 ||
         (pickNum(overdueAgingData['bucket_61_90']?['amount']) ?? 0) > 0 ||
         (pickNum(overdueAgingData['bucket_90_plus']?['amount']) ?? 0) > 0);
    final hasInvoicePayStatus = invoicePayStatusData != null &&
        (pickNum(invoicePayStatusData['total_invoices']) ?? 0) > 0;
    final effectiveInvoiceCount = invoiceCount ??
        pickNum(invoicePayStatusData?['total_invoices']);
    final effectiveAvgOrder = avgOrderValue ??
        ((salesVal > 0 &&
                effectiveInvoiceCount != null &&
                effectiveInvoiceCount > 0)
            ? salesVal / effectiveInvoiceCount
            : null);
    final showAvgOrderStrip = salesVal > 0 &&
        effectiveInvoiceCount != null &&
        effectiveInvoiceCount > 0 &&
        effectiveAvgOrder != null;
    final invoicePeriodLabel = switch (_preset) {
      'TODAY' => 'today',
      'WEEK' => 'this week',
      'MONTH' => 'this month',
      'QUARTER' => 'this quarter',
      _ => 'this period',
    };
    final hasExpiryRiskWidget = expiryRiskData != null;
    final hasExpiryRisk = hasExpiryRiskWidget &&
        ((pickNum(expiryRiskData?['value_30d']) ?? 0) > 0 ||
         (pickNum(expiryRiskData?['value_60d']) ?? 0) > 0 ||
         (pickNum(expiryRiskData?['value_90d']) ?? 0) > 0);
    final hasExpiryRiskClear = hasExpiryRiskWidget && !hasExpiryRisk;
    final nonMovingCount = pickNum(nonMovingValData?['count']) ?? 0;
    final nonMovingValue = pickNum(nonMovingValData?['value']) ?? 0;
    final hasNonMovingRisk = nonMovingValData != null &&
        (nonMovingCount > 0 || nonMovingValue > 0.001);
    final hasStockCoverageRows = stockCoverageData.isNotEmpty;
    final hasStockCoverageEmpty = !_loading &&
        _data != null &&
        !hasStockCoverageRows;
    final showStockHealthCompact = hasStockCoverageEmpty && !hasNonMovingRisk;
    final hasOverdueClear = overdueAgingData != null && !hasOverdueAging;
    final hasNonMovingClear =
        nonMovingValData != null && !hasNonMovingRisk;
    final hasAnyHealthIssue = hasExpiryRisk ||
        hasNonMovingRisk ||
        hasOverdueAging ||
        hasStockCoverageRows;
    final healthClearItems = <_HealthClearItem>[
      if (hasExpiryRiskClear)
        const _HealthClearItem(
          summary: 'No expiry risk',
          detail:
              'No batches expiring in the next 90 days with value at risk.',
        ),
      if (hasOverdueClear)
        const _HealthClearItem(
          summary: 'No overdue',
          detail:
              'All invoices are within due date. No overdue receivables.',
        ),
      if (hasNonMovingClear)
        const _HealthClearItem(
          summary: 'No non-moving stock',
          detail: 'No stock batches idle for 90+ days.',
        ),
      if (showStockHealthCompact)
        const _HealthClearItem(
          summary: 'Stock health good',
          detail:
              'No slow-moving stock flagged. Coverage metrics appear when sales history is available.',
        ),
    ];
    final showAllClearBundle =
        !_loading && _data != null && !hasAnyHealthIssue && healthClearItems.isNotEmpty;

    // Purchase-to-sales ratio (derived from displayed KPI values)
    final purchaseToSalesRatio = salesVal > 0 ? (purchaseVal / salesVal * 100).round() : null;

    final isTodayPreset = _preset == 'TODAY';
    final comparePeriodLabel =
        dashboardComparePeriodLabel(isTodayPreset: isTodayPreset);
    final salesDeltaPct = dashboardSalesDeltaPct(
      isTodayPreset: isTodayPreset,
      currentSales: salesVal,
      kpis: kpis,
      momData: momData,
    );
    final purchaseDeltaPct = dashboardPurchaseDeltaPct(
      isTodayPreset: isTodayPreset,
      currentPurchases: purchaseVal,
      kpis: kpis,
      momData: momData,
    );
    final profitDeltaPct = displayProfit != null
        ? dashboardProfitDeltaPct(
            isTodayPreset: isTodayPreset,
            currentProfit: displayProfit!,
            kpis: kpis,
            momData: momData,
          )
        : null;

    final canSale = can(auth, 'SALES_INVOICES', 'ADD');

    return AppShell(
      title: 'Dashboard',
      bottomBar: AppBottomActionBar(
        emphasizePrimary: false,
        primaryAction: BottomAction(
          icon: AppIcons.barcode,
          label: 'Scan & Sell',
          tooltip: 'Scan a barcode to start a new sale',
          onTap: () async {
            final code = await scanBarcode(context);
            if (code == null || code.isEmpty || !mounted) return;
            // Look up the batch so the editor pre-populates the product line.
            final resp = await ref.read(productBatchRepositoryProvider).findByBarcode(code);
            if (!mounted) return;
            final batch = batchFromBarcodeResponse(resp);
            if (batch == null) {
              showAppSnack(
                context,
                message: resp.ok
                    ? 'No product found for barcode "$code"'
                    : (resp.parseErrorMessage().isNotEmpty
                        ? resp.parseErrorMessage()
                        : 'No product found for barcode "$code"'),
                type: AppSnackType.error,
              );
              return;
            }
            // Clear any persisted active bill so the editor always opens a
            // fresh new bill pre-populated with the scanned product.
            ref.read(ongoingSalesBillsProvider.notifier).setActive(null);
            if (!mounted) return;
            context.push('/sales-billing/new', extra: batch);
          },
          enabled: canSale,
        ),
        leadingActions: [
          BottomAction(
            icon: AppIcons.invoice,
            label: 'New Sale',
            tooltip: 'New sale',
            onTap: canSale ? () => context.push('/sales-billing/new') : null,
            enabled: canSale,
          ),
        ],
        trailingActions: [
          BottomAction(
            icon: AppIcons.refresh,
            label: 'Refresh',
            tooltip: 'Reload dashboard with latest data',
            onTap: _load,
          ),
          BottomAction(
            icon: AppIcons.invoice,
            label: 'Bills',
            tooltip: 'View recent bills',
            onTap: () => context.go('/sales-billing'),
          ),
        ],
      ),
      child: _loading && _data == null
          ? const SkeletonDashboard()
          : Column(
              children: [
                // ── Sticky date filter (always visible, never scrolls away) ──────
                Container(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  padding: Responsive.pagePadding(context).copyWith(bottom: 8),
                  child: Column(children: [
                    _DashboardPresetBar(
                      activePreset: _preset,
                      onPresetSelected: _applyPreset,
                    ),
                    const SizedBox(height: 10),
                    DateRangeBar(
                      dateFrom: _dateFrom,
                      dateTo: _dateTo,
                      activePreset: _preset,
                      presets: const [],
                      onPresetSelected: _applyPreset,
                      onFromChanged: (v) { setState(() => _dateFrom = v); _load(); },
                      onToChanged:   (v) { setState(() => _dateTo   = v); _load(); },
                    ),
                  ]),
                ),
                // ── Scrollable dashboard content ───────────────────────────────
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _load,
                    color: AppColors.primary,
                    backgroundColor: AppColors.card,
                    strokeWidth: 2,
                    child: ListView(
                      padding: Responsive.pagePadding(context).copyWith(top: 4),
                      children: [
                        // ── Key metrics summary row (single source of truth) ─────
                        _KeyMetricsSummaryRow(
                          sales: salesKpi ?? 0,
                          purchases: purchaseKpi ?? 0,
                          profit: displayProfit,
                          salesLabel: salesLabel,
                          comparePeriodLabel: comparePeriodLabel,
                          salesDeltaPct: salesDeltaPct,
                          purchaseDeltaPct: purchaseDeltaPct,
                          profitDeltaPct: profitDeltaPct,
                          receivables: receivablesKpi,
                          payables: payablesKpi,
                        ),

                        if (showAvgOrderStrip) ...[
                          const SizedBox(height: _cardGap),
                          _AvgOrderValueStrip(
                            avgOrderValue: effectiveAvgOrder!,
                            invoiceCount: effectiveInvoiceCount!.toInt(),
                            periodLabel: invoicePeriodLabel,
                          ),
                        ],

                        // ── Alerts — problems visible in first scroll ────────────
                        if (hasCriticalAlerts) ...[
                          const SizedBox(height: _sectionGap),
                          _CriticalAlertsCard(
                            alerts: criticalAlerts,
                            lowStockCount: lowStock.length,
                            expiryCount7d: _expiryWithinDays(expiryWatch, 7).length,
                            purchaseDueCount: purchaseDueToday.length,
                          ),
                        ],

                        // ── Cash flow + collection — first-scroll answers ────────
                        if (hasCashFlow || hasInvoicePayStatus) ...[
                          SizedBox(
                            height: hasCriticalAlerts ? _sectionGap : _cardGap,
                          ),
                          if (hasCashFlow && hasInvoicePayStatus)
                            _DashSideBySide(children: [
                              _CashFlowCard(
                                cashIn: salesVal,
                                cashOut: purchaseVal,
                              ),
                              _CollectionEfficiencyCard(
                                data: invoicePayStatusData ?? {},
                              ),
                            ])
                          else if (hasCashFlow)
                            _CashFlowCard(
                              cashIn: salesVal,
                              cashOut: purchaseVal,
                            )
                          else
                            _CollectionEfficiencyCard(
                              data: invoicePayStatusData ?? {},
                            ),
                        ],

                        // ── Quick actions ────────────────────────────────────────
                        const SizedBox(height: _sectionGap),
                        const _DashSectionLabel(title: 'Quick actions', icon: AppIcons.zap),
                        const SizedBox(height: _cardGap),
                        if (canSale) ...[
                          _BigNewSaleButton(
                            onTap: () => context.push('/sales-billing/new'),
                          ),
                          const SizedBox(height: _cardGap),
                        ],
                        _QuickActionsGrid(
                          auth: auth,
                          retailer: retailer,
                          hideNewSale: canSale,
                        ),

                        // ── Charts (sales trend, MoM, GST) ─────────────────────
                        const SizedBox(height: _sectionGap),
                        const _DashSectionLabel(title: 'Analytics', icon: AppIcons.trendUp),
                        const SizedBox(height: _cardGap),
                        _MonthSalesTargetCard(
                          accountId: _dashboardAccountId(auth),
                          salesTrend: salesTrend,
                          periodSales: salesVal,
                        ),
                        const SizedBox(height: _cardGap),
                        RepaintBoundary(
                          child: _SalesPurchaseChart(
                            salesData: salesTrend,
                            purchaseData: purchaseTrend,
                          ),
                        ),
                        if (hasSalesByDow) ...[
                          const SizedBox(height: _cardGap),
                          _SalesByDayOfWeekCard(rows: salesByDow),
                        ],
                        if (hasMom) ...[
                          const SizedBox(height: _cardGap),
                          _MomComparisonCard(
                            data: momData ?? {},
                            dateFrom: _dateFrom,
                            dateTo: _dateTo,
                            preset: _preset,
                          ),
                        ],
                        if (hasGst) ...[
                          const SizedBox(height: _cardGap),
                          _GstSummaryCard(
                            kpis: kpis,
                            summary: gstSummary is Map
                                ? Map<String, dynamic>.from(gstSummary as Map)
                                : null,
                          ),
                        ],

                        // ── Business insights ────────────────────────────────────
                        if (hasInsights) ...[
                          const SizedBox(height: _sectionGap),
                          const _DashSectionLabel(title: 'Business insights', icon: AppIcons.reports),
                          const SizedBox(height: _cardGap),
                          _InsightsGrid(
                            topProducts:   topProducts,
                            topCustomers:  topCustomers,
                            topVendors:    topVendors,
                            topMfg:        topMfg,
                            paymentModes:  paymentModes,
                            paymentModesPrev: paymentModesPrev,
                            divisionSales: divisionSales,
                            concentrationPct: concentrationPct,
                          ),
                        ],

                        // ── Expiry at risk (only when non-zero) ──────────────────
                        if (hasExpiryRisk) ...[
                          const SizedBox(height: _cardGap),
                          if (hasNonMovingRisk)
                            _DashSideBySide(children: [
                              _ExpiryValueAtRiskCard(data: expiryRiskData ?? {}),
                              _NonMovingValueCard(data: nonMovingValData ?? {}),
                            ])
                          else
                            _ExpiryValueAtRiskCard(data: expiryRiskData ?? {}),
                        ],

                        // ── Recent activity ──────────────────────────────────────
                        const SizedBox(height: _sectionGap),
                        _RecentTransactionsSection(
                          controller: _tabController,
                          recentItems: _recentItems,
                        ),

                        // ── Inventory health — weekly check ──────────────────────
                        if (hasStockHealth) ...[
                          const SizedBox(height: _sectionGap),
                          const _DashSectionLabel(title: 'Inventory health', icon: AppIcons.stock),
                          const SizedBox(height: _cardGap),
                          _StockHealthCard(
                            totalProducts: totalProducts,
                            lowStockCount: lowStockCount ?? 0,
                            outOfStock: outOfStock,
                            expiryCount: expiryCount ?? 0,
                            stockValue: stockValue,
                            onTap: () => context.go('/products'),
                          ),
                        ],

                        // ── Sales performance ────────────────────────────────────
                        if (hasSalesPerf) ...[
                          const SizedBox(height: _cardGap),
                          _SalesPerformanceCard(
                            invoiceCount: invoiceCount,
                            avgSale: avgSale,
                            salesReturns: salesReturns,
                            purchaseReturns: purchaseReturns,
                            totalSales: salesKpi ?? 0,
                          ),
                        ],

                        // ── Customer insights ────────────────────────────────────
                        if (hasCustomerInsights) ...[
                          const SizedBox(height: _cardGap),
                          _CustomerInsightsCard(
                            totalCustomers: totalCustomers,
                            newCustomers: newCustomers,
                            avgOrderValue: avgOrderValue,
                            onTap: () => context.go('/customers'),
                          ),
                        ],

                        // ── Pending Orders ───────────────────────────────────────
                        if (hasPendingOrders) ...[
                          const SizedBox(height: _sectionGap),
                          const _DashSectionLabel(title: 'Pending orders', icon: AppIcons.orders),
                          const SizedBox(height: _cardGap),
                          _PendingOrdersCard(data: pendingOrdersData),
                        ],

                        // ── Overdue / expiry / stock — issues or bundled "all clear" ─
                        if (hasOverdueAging) ...[
                          const SizedBox(height: _cardGap),
                          _OverdueAgingCard(data: overdueAgingData ?? {}),
                        ],
                        if (showAllClearBundle) ...[
                          const SizedBox(height: _cardGap),
                          _DashboardAllClearCard(items: healthClearItems),
                        ] else if (hasStockCoverageRows ||
                            (hasNonMovingRisk && !hasExpiryRisk)) ...[
                          const SizedBox(height: _cardGap),
                          if (hasStockCoverageRows && hasNonMovingRisk)
                            _DashSideBySide(children: [
                              _StockCoverageCard(rows: stockCoverageData),
                              _NonMovingValueCard(data: nonMovingValData ?? {}),
                            ])
                          else if (hasStockCoverageRows)
                            _StockCoverageCard(rows: stockCoverageData)
                          else
                            _NonMovingValueCard(data: nonMovingValData ?? {}),
                        ],

                        // ── Purchase-to-Sales Ratio ──────────────────────────────
                        if (purchaseToSalesRatio != null) ...[
                          const SizedBox(height: _cardGap),
                          _PurchaseToSalesRatioCard(
                            ratio: purchaseToSalesRatio,
                          ),
                        ],

                        const SizedBox(height: AppSpacing.xl),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard Preset Bar — non-scrollable equal-width segmented control
// Fixes: filter tabs cut off on right side
// ═══════════════════════════════════════════════════════════════════════════════

class _DashboardPresetBar extends StatelessWidget {
  const _DashboardPresetBar({
    required this.activePreset,
    required this.onPresetSelected,
  });
  final String activePreset;
  final ValueChanged<String> onPresetSelected;

  static const _presets = [
    ('TODAY',   'Today'),
    ('WEEK',    'This week'),
    ('MONTH',   'This month'),
    ('QUARTER', 'This quarter'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F0F5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: _presets.map((p) {
          final isActive = activePreset == p.$1;
          return Expanded(
            child: GestureDetector(
              onTap: () => onPresetSelected(p.$1),
              child: AnimatedContainer(
                duration: AppMotion.fast,
                padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 2),
                decoration: BoxDecoration(
                  color: isActive ? Colors.white : Colors.transparent,
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: isActive
                      ? const [BoxShadow(
                          color: Color(0x14000000),
                          blurRadius: 3,
                          offset: Offset(0, 1),
                        )]
                      : null,
                ),
                child: Text(
                  p.$2,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: isActive ? FontWeight.w500 : FontWeight.w400,
                    color: isActive
                        ? AppColors.text
                        : AppColors.text.withOpacity(0.45),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Compact section label
// ═══════════════════════════════════════════════════════════════════════════════

class _DashSectionLabel extends StatelessWidget {
  const _DashSectionLabel({required this.title, required this.icon});
  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: 0.4,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Icon(icon, size: 11, color: AppColors.textMuted),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              title.toUpperCase(),
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.0,
                height: 1.2,
                color: AppColors.textMuted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Full-width tappable footer row for dashboard cards (min 48dp).
class _DashCardFooterLink extends StatelessWidget {
  const _DashCardFooterLink({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
        splashColor: AppColors.primary.withValues(alpha: 0.08),
        highlightColor: AppColors.primary.withValues(alpha: 0.05),
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: 48),
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: Text(
            label,
            style: AppTypography.secondary.copyWith(
              color: AppColors.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KPI Grid — 3 columns
//
// PERFORMANCE OPTIMIZATION:
// Previously each _KpiCard owned its own AnimationController (up to 6 controllers
// for 6 KPI cards). Each controller registers a vsync listener and allocates
// ~1–2 KB of animation state. With 6 cards that's 6 vsync registrations and
// 6 dispose calls on every dashboard rebuild.
//
// Now: a SINGLE AnimationController in _KpiGrid drives all cards via Interval
// curves. Each card's opacity/slide is derived from a sub-interval of the
// shared controller's 0.0–1.0 range. This reduces:
//   - AnimationController objects: 6 → 1
//   - vsync registrations: 6 → 1
//   - Dispose calls: 6 → 1
//   - Stagger timers (Future.delayed): 6 → 0 (replaced by Interval math)
// ═══════════════════════════════════════════════════════════════════════════════

class _KpiGrid extends StatefulWidget {
  const _KpiGrid({required this.children});
  final List<Widget> children;

  @override
  State<_KpiGrid> createState() => _KpiGridState();
}

class _KpiGridState extends State<_KpiGrid> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    // Single controller for all KPI card stagger animations.
    // Duration = slow (300 ms) + stagger per card × max cards.
    _ctrl = AnimationController(
      vsync: this,
      duration: AppMotion.slow + AppMotion.staggerFor(6),
    )..forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      const spacing = _cardGap;
      final cols = constraints.maxWidth < 300 ? 2 : 3;
      final itemWidth = (constraints.maxWidth - spacing * (cols - 1)) / cols;
      return Wrap(
        spacing: spacing,
        runSpacing: spacing,
        children: widget.children.asMap().entries.map((entry) {
          return SizedBox(
            width: itemWidth,
            child: _KpiCardAnimWrapper(
              controller: _ctrl,
              index: entry.key,
              totalCards: widget.children.length,
              child: entry.value,
            ),
          );
        }).toList(),
      );
    });
  }
}

/// Wraps a KPI card with staggered fade+slide animation driven by a shared
/// parent [AnimationController]. Uses [Interval] to derive each card's
/// animation window from the controller's 0.0–1.0 range.
class _KpiCardAnimWrapper extends StatelessWidget {
  const _KpiCardAnimWrapper({
    required this.controller,
    required this.index,
    required this.totalCards,
    required this.child,
  });

  final AnimationController controller;
  final int index;
  final int totalCards;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    // Each card occupies a proportional window of the total animation duration.
    // Card 0 starts at 0.0, card 1 at 1/n, card 2 at 2/n, etc.
    // Each card's window is wide enough to complete its own animation.
    final n = totalCards.clamp(1, 8).toDouble();
    final staggerFraction = 1.0 / (n + 1);
    final start = index * staggerFraction;
    final end   = (start + staggerFraction * 2).clamp(0.0, 1.0);

    final interval = Interval(start, end, curve: AppMotion.enter);

    final opacity = Tween<double>(begin: 0.0, end: 1.0)
        .animate(CurvedAnimation(parent: controller, curve: interval));
    final slide = Tween<Offset>(
      begin: const Offset(0, 0.06),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: controller, curve: interval));

    return FadeTransition(
      opacity: opacity,
      child: SlideTransition(
        position: slide,
        child: child,
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KPI Card — compact, FittedBox amount never truncates
// FIX: SizedBox(width: double.infinity) gives FittedBox the full card width
//      so it can scale down the amount text instead of clipping it.
//
// PERFORMANCE: Now a StatelessWidget — no AnimationController, no dispose.
// Animation is driven by the parent _KpiGrid's shared controller.
// ═══════════════════════════════════════════════════════════════════════════════

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.label,
    required this.amount,
    required this.icon,
    required this.accentColor,
    required this.index,
    this.onTap,
    this.subtitle,
  });
  final String label;
  final num amount;
  final IconData icon;
  final Color accentColor;
  final int index;
  final VoidCallback? onTap;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final hasValue = amount != 0;
    final color    = accentColor;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 80,
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(12),
          // FIX: uniform border color — non-uniform colors with borderRadius
          // throw "A borderRadius can only be given on borders with uniform colors"
          border: Border.all(color: const Color(0x14000000)),
          boxShadow: const [BoxShadow(color: Color(0x0D000000), blurRadius: 4, offset: Offset(0, 1))],
        ),
        child: Stack(children: [
          // Colored left accent — separate from border to avoid Flutter assertion
          Positioned(
            left: 0, top: 0, bottom: 0,
            child: Container(
              width: 3,
              decoration: BoxDecoration(
                color: color,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(12),
                  bottomLeft: Radius.circular(12),
                ),
              ),
            ),
          ),
          Padding(
          padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                width: 22, height: 22,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Icon(icon, size: 11, color: color),
              ),
              const Spacer(),
              Container(
                width: 7, height: 7,
                decoration: BoxDecoration(
                  color: hasValue ? color : AppColors.border,
                  shape: BoxShape.circle,
                ),
              ),
            ]),
            const SizedBox(height: 5),
            Text(
              label,
              style: const TextStyle(
                fontSize: 10, fontWeight: FontWeight.w500,
                color: AppColors.textMuted, letterSpacing: 0.2, height: 1.2,
              ),
              maxLines: 1, overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            // FIX: Row+Expanded gives FittedBox the full card width so
            // BoxFit.scaleDown can shrink the amount text to fit —
            // never "₹31,801...." truncation again.
            Row(children: [
              Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: DashboardAmountText(
                    amount,
                    style: TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w700,
                      color: hasValue ? AppColors.text : AppColors.textMuted,
                      height: 1.2, letterSpacing: -0.3,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
              ),
            ]),
          ]),
        ),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Avg order value strip (below KPI row)
// ═══════════════════════════════════════════════════════════════════════════════

class _AvgOrderValueStrip extends StatelessWidget {
  const _AvgOrderValueStrip({
    required this.avgOrderValue,
    required this.invoiceCount,
    required this.periodLabel,
  });
  final num avgOrderValue;
  final int invoiceCount;
  final String periodLabel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Text(
        'Avg. order value: ${fmtDashboardCurrency(avgOrderValue)} · '
        '$invoiceCount invoice${invoiceCount == 1 ? '' : 's'} $periodLabel',
        style: AppTypography.secondary.copyWith(
          color: AppColors.text2,
          fontSize: 12,
          height: 1.35,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }
}

List<Map<String, dynamic>> _expiryWithinDays(
  List<Map<String, dynamic>> batches,
  int maxDays,
) {
  final today = DateTime.now();
  final todayDate = DateTime(today.year, today.month, today.day);
  return batches.where((b) {
    final ymd = ymdFrom(b['expiry_date'] ?? b['expiryDate']);
    if (ymd.length < 10) return false;
    final exp = DateTime.tryParse('${ymd.substring(0, 10)}T00:00:00');
    if (exp == null) return false;
    final days = exp.difference(todayDate).inDays;
    return days >= 0 && days <= maxDays;
  }).toList();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Critical alerts card (below KPIs)
// ═══════════════════════════════════════════════════════════════════════════════

class _CriticalAlertsCard extends StatelessWidget {
  const _CriticalAlertsCard({
    required this.alerts,
    required this.lowStockCount,
    required this.expiryCount7d,
    required this.purchaseDueCount,
  });
  final List<Map<String, dynamic>> alerts;
  final int lowStockCount;
  final int expiryCount7d;
  final int purchaseDueCount;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: _dashHeaderIcon,
                height: _dashHeaderIcon,
                decoration: BoxDecoration(
                  color: AppColors.dangerLight,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: const Icon(AppIcons.alert, size: 12, color: AppColors.danger),
              ),
              const SizedBox(width: 8),
              const Expanded(child: Text('Alerts', style: AppTypography.cardTitle)),
              if (expiryCount7d > 0)
                _AlertPill(
                  label: '$expiryCount7d expiring',
                  color: AppColors.danger,
                  onTap: () => context.go('/products'),
                ),
              if (lowStockCount > 0) ...[
                const SizedBox(width: 5),
                _AlertPill(
                  label: '$lowStockCount low stock',
                  color: AppColors.warning,
                  onTap: () => context.go('/products'),
                ),
              ],
              if (purchaseDueCount > 0) ...[
                const SizedBox(width: 5),
                _AlertPill(
                  label: '$purchaseDueCount due today',
                  color: AppColors.warning,
                  onTap: () => context.go('/purchase-invoices'),
                ),
              ],
            ],
          ),
        ),
        const Divider(height: 1, color: AppColors.border),
        ...alerts.take(6).map((a) => _CompactAlertRow(alert: a)),
      ]),
    );
  }
}

class _AlertPill extends StatelessWidget {
  const _AlertPill({required this.label, required this.color, this.onTap});
  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(AppTheme.pillRadius),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Text(label,
          style: AppTypography.badgeSmall.copyWith(color: color, fontWeight: FontWeight.w600)),
      ),
    );
  }
}

class _CompactAlertRow extends StatelessWidget {
  const _CompactAlertRow({required this.alert});
  final Map<String, dynamic> alert;

  /// Colored left border: red = expiring soon, amber = low stock, grey = other
  Color _leftBorderColor() {
    final badge    = (alert['badge']    ?? '').toString().toLowerCase();
    final kind     = (alert['kind']     ?? '').toString().toLowerCase();
    final severity = (alert['severity'] ?? '').toString().toLowerCase();
    if (severity == 'red' || badge.contains('exp') || kind.contains('expir')) {
      return AppColors.danger;
    }
    if (badge.contains('low') ||
        kind.contains('stock') ||
        severity == 'orange' ||
        severity == 'amber') {
      return AppColors.warning;
    }
    return AppColors.border;
  }

  @override
  Widget build(BuildContext context) {
    final kind      = (alert['kind']     ?? '').toString().toUpperCase();
    final severity  = (alert['severity'] ?? '').toString();
    final isRed     = kind.contains('PAYABLE') || severity == 'red';
    final iconColor = isRed ? AppColors.alertRedIcon : AppColors.alertAmberIcon;
    final icon      = isRed ? AppIcons.overdue : AppIcons.alert;
    final borderColor = _leftBorderColor();

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(width: 3, color: borderColor),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 10, 12, 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Icon(icon, size: 16, color: iconColor),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          alert['title']?.toString() ?? 'Alert',
                          style: AppTypography.body.copyWith(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (alert['subtitle'] != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            alert['subtitle'].toString(),
                            style: AppTypography.secondary.copyWith(
                              color: AppColors.text2,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (alert['badge'] != null) ...[
                    const SizedBox(width: 8),
                    StatusBadge(status: alert['badge'].toString()),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StockSummaryRow extends StatelessWidget {
  const _StockSummaryRow({
    required this.icon,
    required this.color,
    required this.label,
    required this.detail,
    this.onTap,
  });
  final IconData icon;
  final Color color;
  final String label;
  final String detail;
  final VoidCallback? onTap;

@override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(children: [
          Container(width: 6, height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label,
              style: AppTypography.body.copyWith(fontWeight: FontWeight.w600, fontSize: 13)),
            if (detail.isNotEmpty)
              Text(detail,
                style: AppTypography.secondary, maxLines: 1, overflow: TextOverflow.ellipsis),
          ])),
          Icon(Icons.arrow_forward_ios_rounded, size: 12, color: AppColors.textFaint),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Quick Actions — 3-column 2-row grid (FIX: was 4-col causing orphan row)
// ═══════════════════════════════════════════════════════════════════════════════

class _QuickActionsGrid extends StatelessWidget {
  const _QuickActionsGrid({
    required this.auth,
    required this.retailer,
    this.hideNewSale = false,
  });
  final dynamic auth;
  final bool retailer;
  final bool hideNewSale;

  @override
  Widget build(BuildContext context) {
    final actions = <_QuickActionData>[];
    if (can(auth, 'SALES_INVOICES', 'ADD') && !hideNewSale)
      actions.add(const _QuickActionData(label: 'New sale', icon: AppIcons.invoice,
        color: AppColors.primary, route: '/sales-billing/new', push: true));
    if (can(auth, 'PURCHASE_INVOICES', 'ADD'))
      actions.add(const _QuickActionData(label: 'New purchase', icon: AppIcons.purchases,
        color: AppColors.primaryMid, route: '/purchase-invoices/new', push: true));
    if (can(auth, 'CUSTOMERS', 'VIEW'))
      actions.add(const _QuickActionData(label: 'Customers', icon: AppIcons.customers,
        color: AppColors.kpiReceivablesAccent, route: '/customers', push: false));
    if (can(auth, 'VENDORS', 'VIEW'))
      actions.add(const _QuickActionData(label: 'Suppliers', icon: AppIcons.supplier,
        color: AppColors.warning, route: '/vendors', push: false));
    if (retailer) {
      actions.add(const _QuickActionData(label: 'My orders', icon: AppIcons.orders,
        color: AppColors.warning, route: '/my-orders', push: false));
    } else if (can(auth, 'REPORTS', 'VIEW')) {
      actions.add(const _QuickActionData(label: 'Reports', icon: AppIcons.reports,
        color: AppColors.primaryDark, route: '/reports/day-book', push: false));
    }
    if (can(auth, 'REPORTS', 'VIEW')) {
      actions.add(const _QuickActionData(label: 'Ledger', icon: AppIcons.ledger,
        color: AppColors.primaryMid, route: '/reports/ledger', push: false));
    }
    actions.add(const _QuickActionData(label: 'Products', icon: AppIcons.products,
      color: const Color(0xFF14B8A6), route: '/products', push: false));
    // Pad to 3×N — no orphan row (New Sale is full-width above).
    if (actions.length % 3 != 0 &&
        can(auth, 'SALES_INVOICES', 'VIEW') &&
        !actions.any((a) => a.route == '/sales-returns')) {
      actions.add(const _QuickActionData(
        label: 'Returns',
        icon: AppIcons.salesReturns,
        color: AppColors.warning,
        route: '/sales-returns',
        push: false,
      ));
    }
    if (actions.length % 3 != 0 &&
        can(auth, 'REPORTS', 'VIEW') &&
        !actions.any((a) => a.route == '/reports/day-book')) {
      actions.add(const _QuickActionData(
        label: 'Day book',
        icon: AppIcons.dateRange,
        color: AppColors.primaryDark,
        route: '/reports/day-book',
        push: false,
      ));
    }

    if (actions.isEmpty) return const SizedBox.shrink();
    return LayoutBuilder(builder: (context, constraints) {
      // FIX: 3 columns instead of 4 — gives 2 full rows of 3, no orphan
      const spacing = _cardGap;
      const cols = 3;
      final itemWidth = (constraints.maxWidth - spacing * (cols - 1)) / cols;
      return Wrap(
        spacing: spacing, runSpacing: spacing,
        children: actions.map((a) => SizedBox(
          width: itemWidth,
          child: _QuickActionTile(
            label: a.label, icon: a.icon, color: a.color,
            onPressed: () => a.push ? context.push(a.route) : context.go(a.route),
          ),
        )).toList(),
      );
    });
  }
}

class _QuickActionData {
  const _QuickActionData({required this.label, required this.icon,
    required this.color, required this.route, required this.push});
  final String label;
  final IconData icon;
  final Color color;
  final String route;
  final bool push;
}

class _QuickActionTile extends StatefulWidget {
  const _QuickActionTile({required this.label, required this.icon,
    required this.color, required this.onPressed});
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onPressed;
  @override
  State<_QuickActionTile> createState() => _QuickActionTileState();
}

class _QuickActionTileState extends State<_QuickActionTile> {
  bool _pressed = false;
  @override
  Widget build(BuildContext context) {
    final color = widget.color;
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) { setState(() => _pressed = false); widget.onPressed(); },
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedContainer(
        duration: AppMotion.fast,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        decoration: BoxDecoration(
          color: _pressed ? AppColors.surface : AppColors.card,
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          border: Border.all(color: _pressed ? AppColors.borderStrong : AppColors.border),
          boxShadow: _pressed ? null : const [
            BoxShadow(color: Color(0x060F172A), blurRadius: 3, offset: Offset(0, 1)),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(widget.icon, size: 20, color: color),
          ),
          const SizedBox(height: 8),
          Text(
            widget.label,
            style: AppTypography.overline.copyWith(
              fontSize: 11,
              color: AppColors.text2,
              letterSpacing: 0.2,
              fontWeight: FontWeight.w600,
              height: 1.2,
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sales vs Purchase Trend Chart
// FIX: ClipRect prevents RIGHT OVERFLOWED BY 23 PIXELS error
// ═══════════════════════════════════════════════════════════════════════════════

class _SalesPurchaseChart extends StatelessWidget {
  const _SalesPurchaseChart({this.salesData, this.purchaseData});
  final dynamic salesData;
  final dynamic purchaseData;

  @override
  Widget build(BuildContext context) {
    final salesRows = trendPoints(salesData);
    final salesPts = _salesSpots(salesRows);
    final purchasePts = _purchaseSpots(salesRows, purchaseData);
    final dayFullLabels = [
      for (final r in salesRows)
        if (trendDayYmd(r).isNotEmpty) fmtDisplayDate(trendDayYmd(r)) else '',
    ];
    final hasSales = salesPts.any((p) => p.y > 0);
    final hasPurchase = purchasePts.any((p) => p.y > 0);
    final hasData = hasSales || hasPurchase;
    final allY = [...salesPts, ...purchasePts].map((p) => p.y);
    final maxY = allY.isEmpty ? 1.0 : allY.reduce((a, b) => a > b ? a : b);

    final narrow = Responsive.isNarrow(context);

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (narrow) ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: _dashHeaderIcon,
                height: _dashHeaderIcon,
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: const Icon(AppIcons.trendUp, size: 12, color: AppColors.primary),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Sales & purchase trend',
                  style: AppTypography.cardTitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          if (hasSales || hasPurchase) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (hasSales) _LegendDot(color: AppColors.primary, label: 'Sales'),
                if (hasPurchase) _LegendDot(color: AppColors.warning, label: 'Purchase'),
              ],
            ),
          ],
        ] else
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: _dashHeaderIcon,
                height: _dashHeaderIcon,
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: const Icon(AppIcons.trendUp, size: 12, color: AppColors.primary),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Sales & purchase trend',
                  style: AppTypography.cardTitle,
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
              ),
              if (hasSales) _LegendDot(color: AppColors.primary, label: 'Sales'),
              if (hasPurchase) ...[
                const SizedBox(width: 10),
                _LegendDot(color: AppColors.warning, label: 'Purchase'),
              ],
            ],
          ),
        const SizedBox(height: AppSpacing.sm),
        // Taller chart — easier to read on mobile
        SizedBox(
          height: Responsive.isNarrow(context) ? 190 : 220,
          child: ClipRect(
            child: hasData
                ? LineChart(LineChartData(
                    minY: 0, maxY: maxY * 1.15,
                    gridData: FlGridData(
                      drawVerticalLine: false,
                      horizontalInterval: maxY / 4,
                      getDrawingHorizontalLine: (_) => const FlLine(
                        color: AppColors.border, strokeWidth: 1, dashArray: [4, 4]),
                    ),
                    titlesData: const FlTitlesData(show: false),
                    borderData: FlBorderData(show: false),
                    lineTouchData: LineTouchData(
                      handleBuiltInTouches: true,
                      touchTooltipData: LineTouchTooltipData(
                        getTooltipColor: (_) => AppColors.text,
                        tooltipRoundedRadius: AppTheme.radiusSm,
                        tooltipPadding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                        getTooltipItems: (spots) => _chartTooltipItems(
                          spots: spots,
                          dayLabels: dayFullLabels,
                          hasPurchaseLine: hasPurchase,
                        ),
                      ),
                    ),
                    lineBarsData: [
                      if (hasSales) LineChartBarData(
                        spots: salesPts, isCurved: true, color: AppColors.primary, barWidth: 2.5,
                        dotData: FlDotData(
                          show: true,
                          getDotPainter: (_, __, ___, ____) => FlDotCirclePainter(
                            radius: 2,
                            color: AppColors.primary,
                            strokeWidth: 0,
                          ),
                        ),
                        belowBarData: BarAreaData(show: true, gradient: LinearGradient(
                          begin: Alignment.topCenter, end: Alignment.bottomCenter,
                          colors: [AppColors.primary.withOpacity(0.12), AppColors.primary.withOpacity(0.0)],
                        )),
                      ),
                      if (hasPurchase) LineChartBarData(
                        spots: purchasePts, isCurved: true, color: AppColors.warning, barWidth: 2,
                        dashArray: [5, 3],
                        dotData: FlDotData(
                          show: true,
                          getDotPainter: (_, __, ___, ____) => FlDotCirclePainter(
                            radius: 2,
                            color: AppColors.warning,
                            strokeWidth: 0,
                          ),
                        ),
                        belowBarData: BarAreaData(show: false),
                      ),
                    ],
                  ))
                : const InlineEmptyState(
                    title: 'No trend data',
                    message: 'Sales data will appear here',
                    icon: AppIcons.trendUp,
                    padding: EdgeInsets.symmetric(vertical: 20)),
          ),
        ),
        if (hasData) ...[
          const SizedBox(height: 6),
          Text(
            'Daily breakdown · tap any point for that date',
            style: AppTypography.caption.copyWith(
              fontSize: 10,
              color: AppColors.textFaint,
            ),
          ),
        ],
      ]),
    );
  }

  static List<FlSpot> _salesSpots(List<Map<String, dynamic>> rows) {
    if (rows.isEmpty) return [const FlSpot(0, 0), const FlSpot(1, 0)];
    return [
      for (var i = 0; i < rows.length; i++)
        FlSpot(i.toDouble(), trendY(rows[i])),
    ];
  }

  static List<FlSpot> _purchaseSpots(
    List<Map<String, dynamic>> salesRows,
    dynamic purchaseRaw,
  ) {
    if (salesRows.isEmpty) return _salesSpots(trendPoints(purchaseRaw));
    final byDay = <String, double>{
      for (final p in trendPoints(purchaseRaw))
        if (trendDayYmd(p).isNotEmpty) trendDayYmd(p): trendY(p),
    };
    return [
      for (var i = 0; i < salesRows.length; i++)
        FlSpot(i.toDouble(), byDay[trendDayYmd(salesRows[i])] ?? 0),
    ];
  }

  static List<LineTooltipItem> _chartTooltipItems({
    required List<LineBarSpot> spots,
    required List<String> dayLabels,
    required bool hasPurchaseLine,
  }) {
    if (spots.isEmpty) return [];

    final idx = spots.first.spotIndex;
    final dateLine = (idx >= 0 && idx < dayLabels.length && dayLabels[idx].isNotEmpty)
        ? dayLabels[idx]
        : 'Day ${idx + 1}';

    var sales = 0.0;
    var purchase = 0.0;
    for (final s in spots) {
      if (s.barIndex == 0) sales = s.y;
      if (s.barIndex == 1) purchase = s.y;
    }

    final tooltipStyle = AppTypography.badge.copyWith(
      color: Colors.white,
      fontSize: 11,
      height: 1.35,
    );

    final items = <LineTooltipItem>[
      LineTooltipItem(
        '$dateLine\nSales ${fmtCurrency(sales)}',
        tooltipStyle.copyWith(fontWeight: FontWeight.w700),
        textAlign: TextAlign.left,
      ),
    ];
    if (hasPurchaseLine) {
      items.add(
        LineTooltipItem(
          'Purchase ${fmtCurrency(purchase)}',
          tooltipStyle,
          textAlign: TextAlign.left,
        ),
      );
    }
    return items;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Month sales target — progress vs goal (local preference)
// ═══════════════════════════════════════════════════════════════════════════════

class _MonthSalesTargetCard extends StatefulWidget {
  const _MonthSalesTargetCard({
    required this.accountId,
    required this.salesTrend,
    required this.periodSales,
  });

  final String accountId;
  final dynamic salesTrend;
  final double periodSales;

  @override
  State<_MonthSalesTargetCard> createState() => _MonthSalesTargetCardState();
}

class _MonthSalesTargetCardState extends State<_MonthSalesTargetCard> {
  double? _target;
  bool _loadingTarget = true;

  String get _yearMonth => DashboardSalesTargetStore.yearMonthKey();

  double get _monthSales {
    final fromTrend = trendSalesTotalForMonth(
      trendPoints(widget.salesTrend),
      _yearMonth,
    );
    if (fromTrend > 0) return fromTrend;
    return widget.periodSales;
  }

  @override
  void initState() {
    super.initState();
    _loadTarget();
  }

  @override
  void didUpdateWidget(covariant _MonthSalesTargetCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.accountId != widget.accountId) _loadTarget();
  }

  Future<void> _loadTarget() async {
    setState(() => _loadingTarget = true);
    final t = await DashboardSalesTargetStore.read(widget.accountId, _yearMonth);
    if (!mounted) return;
    setState(() {
      _target = t;
      _loadingTarget = false;
    });
  }

  Future<void> _promptSetTarget() async {
    final ctrl = TextEditingController(
      text: _target != null && _target! > 0
          ? _target!.round().toString()
          : '',
    );
    final saved = await showDialog<double>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Monthly sales target'),
        content: TextField(
          controller: ctrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(
            labelText: 'Target amount (₹)',
            hintText: 'e.g. 4000000',
            prefixText: '₹ ',
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final raw = ctrl.text.replaceAll(',', '').trim();
              final v = double.tryParse(raw);
              if (v == null || v <= 0) {
                Navigator.pop(ctx, 0.0);
              } else {
                Navigator.pop(ctx, v);
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    ctrl.dispose();
    if (saved == null || !mounted) return;
    await DashboardSalesTargetStore.write(
      widget.accountId,
      _yearMonth,
      saved,
    );
    await _loadTarget();
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingTarget) {
      return const AppCard(
        padding: EdgeInsets.all(AppSpacing.sm),
        child: SizedBox(
          height: 48,
          child: Center(
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        ),
      );
    }

    final target = _target;
    final sales = _monthSales;
    final daysLeft = daysRemainingInMonth();
    final monthLabel = currentMonthYearLabel();

    if (target == null || target <= 0) {
      return AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        child: InkWell(
          onTap: _promptSetTarget,
          borderRadius: BorderRadius.circular(8),
          child: Row(
            children: [
              Container(
                width: _dashHeaderIcon,
                height: _dashHeaderIcon,
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Icon(AppIcons.target, size: 12, color: AppColors.primary),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Month target', style: AppTypography.cardTitle),
                    const SizedBox(height: 2),
                    Text(
                      'Set a monthly target →',
                      style: AppTypography.secondary.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              DashboardAmountText(
                sales,
                style: AppTypography.labelSemibold.copyWith(fontSize: 13),
              ),
            ],
          ),
        ),
      );
    }

    final progress = target > 0 ? (sales / target).clamp(0.0, 1.0) : 0.0;
    final pct = (progress * 100).round();
    final progressColor = pct >= 100
        ? AppColors.success
        : pct >= 70
            ? AppColors.primary
            : AppColors.warning;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: _dashHeaderIcon,
                height: _dashHeaderIcon,
                decoration: BoxDecoration(
                  color: progressColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Icon(AppIcons.target, size: 12, color: progressColor),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Month target · $monthLabel',
                  style: AppTypography.cardTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              GestureDetector(
                onTap: _promptSetTarget,
                child: Text(
                  'Edit',
                  style: AppTypography.secondary.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 4,
            runSpacing: 4,
            children: [
              DashboardAmountText(
                sales,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: AppColors.text,
                ),
              ),
              Text(
                'of',
                style: AppTypography.caption.copyWith(color: AppColors.textMuted),
              ),
              DashboardAmountText(
                target,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textMuted,
                ),
              ),
              Text(
                '· $pct% achieved',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: progressColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
              backgroundColor: AppColors.surface,
              valueColor: AlwaysStoppedAnimation<Color>(progressColor),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            daysLeft > 0
                ? '$daysLeft day${daysLeft == 1 ? '' : 's'} left in month'
                : 'Last day of month',
            style: AppTypography.caption.copyWith(
              fontSize: 10,
              color: AppColors.textFaint,
            ),
          ),
        ],
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 5),
        Text(label, style: AppTypography.secondary.copyWith(fontSize: 11)),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Profit Summary Card
// ═══════════════════════════════════════════════════════════════════════════════

class _ProfitSummaryCard extends StatelessWidget {
  const _ProfitSummaryCard({required this.kpis, this.summary});
  final Map<String, dynamic> kpis;
  final Map<String, dynamic>? summary;

  @override
  Widget build(BuildContext context) {
    // Gross profit = taxable revenue − COGS − returns (true gross profit from backend;
    // reconciles with Day Book). This is NOT sales − purchases (that is net cash flow).
    final grossProfitRaw = kpiValue(kpis, 'gross_profit') ?? kpiValue(kpis, 'net_profit');
    final grossProfit    = (grossProfitRaw ?? 0).toDouble();
    // Revenue basis for the gross profit (net taxable revenue), falling back to period sales.
    final totalRevenue   = (kpiField(kpis, 'gross_profit', 'revenue')
        ?? kpiValue(kpis, 'range_sales') ?? kpiValue(kpis, 'today_sales') ?? 0).toDouble();
    // Cost of goods actually sold (from backend); fall back to period purchases only if absent.
    final totalCogs      = (kpiField(kpis, 'gross_profit', 'cogs')
        ?? kpiValue(kpis, 'range_purchases') ?? kpiValue(kpis, 'today_purchases') ?? 0).toDouble();
    final backendMargin  = kpiField(kpis, 'gross_profit', 'margin_pct');
    final marginRaw      = backendMargin
        ?? summary?['profit_margin_pct'] ?? summary?['profitMarginPct'];
    // Margin = gross_profit / revenue * 100 (only when revenue > 0)
    final marginPct      = marginRaw != null
        ? (marginRaw is num ? marginRaw.toDouble() : double.tryParse(marginRaw.toString()) ?? 0.0)
        : (totalRevenue > 0 ? grossProfit / totalRevenue * 100 : 0.0);
    final isPositive = grossProfit >= 0;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
          Container(
            width: _dashHeaderIcon,
            height: _dashHeaderIcon,
            decoration: BoxDecoration(
              color: isPositive ? AppColors.successLight : AppColors.dangerLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            ),
            child: Icon(
              isPositive ? AppIcons.trendUp : AppIcons.trendDown,
              size: 12,
              color: isPositive ? AppColors.success : AppColors.danger,
            ),
          ),
          const SizedBox(width: 8),
          const Expanded(child: Text('Profit', style: AppTypography.cardTitle)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            decoration: BoxDecoration(
              color: isPositive ? AppColors.successLight : AppColors.dangerLight,
              borderRadius: BorderRadius.circular(AppTheme.pillRadius),
            ),
            child: Text(
              '${marginPct.toStringAsFixed(1)}%',
              style: AppTypography.badgeSmall.copyWith(
                color: isPositive ? AppColors.success : AppColors.danger,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ]),
        // Context line for negative profit — prevents user panic
        if (!isPositive) ...[
          const SizedBox(height: 4),
          const Text(
            'Cost of goods sold exceeds revenue',
            style: TextStyle(fontSize: 11, color: AppColors.textMuted),
          ),
        ],
        const SizedBox(height: AppSpacing.xs),
        _ProfitMetric(label: 'Revenue', amount: totalRevenue, color: AppColors.primary),
        if (totalCogs > 0) ...[
          const SizedBox(height: 4),
          _ProfitMetric(label: 'Cost of goods', amount: totalCogs, color: AppColors.textMuted),
        ],
        const SizedBox(height: 4),
        _ProfitMetric(
          label: 'Gross profit',
          amount: grossProfitRaw != null ? grossProfit : null,
          color: grossProfitRaw != null
              ? (isPositive ? AppColors.success : AppColors.danger)
              : AppColors.textMuted,
        ),
      ]),
    );
  }
}

class _ProfitMetric extends StatelessWidget {
  const _ProfitMetric({
    required this.label,
    required this.color,
    this.text,
    this.amount,
  }) : assert(text != null || amount != null);

  final String label;
  final Color color;
  final String? text;
  final dynamic amount;

  @override
  Widget build(BuildContext context) {
    final valueStyle = AppTypography.labelSemibold.copyWith(
      color: color,
      fontSize: 13,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Text(
            label,
            style: AppTypography.secondary,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(width: 10),
        if (amount != null)
          DashboardAmountText(
            amount,
            style: valueStyle,
            textAlign: TextAlign.end,
          )
        else
          Text(
            text!,
            style: valueStyle,
            textAlign: TextAlign.end,
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
          ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GST Summary Card
// ═══════════════════════════════════════════════════════════════════════════════

class _GstSummaryCard extends StatelessWidget {
  const _GstSummaryCard({this.summary, required this.kpis});
  final Map<String, dynamic>? summary;
  final Map<String, dynamic> kpis;

  @override
  Widget build(BuildContext context) {
    final collected = (kpiValue(kpis, 'gst_collected') ?? 0).toDouble();
    final payable   = (kpiValue(kpis, 'gst_payable')   ?? 0).toDouble();
    final cgst = (kpiValue(kpis, 'cgst') ?? (summary?['cgst'] is num ? summary!['cgst'] : 0)).toDouble();
    final sgst = (kpiValue(kpis, 'sgst') ?? (summary?['sgst'] is num ? summary!['sgst'] : 0)).toDouble();
    final igst = (kpiValue(kpis, 'igst') ?? (summary?['igst'] is num ? summary!['igst'] : 0)).toDouble();

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 24, height: 24,
            decoration: BoxDecoration(color: AppColors.warningLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm)),
            child: const Icon(AppIcons.gstin, size: 12, color: AppColors.warning)),
          const SizedBox(width: 7),
          const Expanded(child: Text('GST', style: AppTypography.cardTitle)),
          GestureDetector(
            onTap: () => context.go('/reports/gst-r1'),
            child: Text('View →',
              style: AppTypography.secondary.copyWith(
                color: AppColors.primary, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: AppSpacing.xs),
        if (collected > 0) ...[
          _ProfitMetric(label: 'Collected', amount: collected, color: AppColors.warning),
          const SizedBox(height: 4),
        ],
        if (payable > 0) ...[
          _ProfitMetric(label: 'Payable', amount: payable, color: AppColors.danger),
          const SizedBox(height: 4),
        ],
        if (cgst > 0) ...[
          _ProfitMetric(label: 'CGST', amount: cgst, color: AppColors.textMuted),
          const SizedBox(height: 4),
        ],
        if (sgst > 0) ...[
          _ProfitMetric(label: 'SGST', amount: sgst, color: AppColors.textMuted),
          const SizedBox(height: 4),
        ],
        if (igst > 0)
          _ProfitMetric(label: 'IGST', amount: igst, color: AppColors.textMuted),
      ]),
    );
  }
}

// ── Top-list display helpers ───────────────────────────────────────────────────

const _topListNamePlaceholders = {'—', '_', '-', 'null', 'undefined'};

bool isMeaningfulTopListName(String? value) {
  if (value == null) return false;
  final s = value.trim();
  if (s.isEmpty) return false;
  if (_topListNamePlaceholders.contains(s)) return false;
  if (_topListNamePlaceholders.contains(s.toLowerCase())) return false;
  return true;
}

/// Names containing test/demo/sample — show muted styling in insights.
bool isTestLikeTopListName(String? value) {
  if (value == null) return false;
  final lower = value.trim().toLowerCase();
  if (lower.isEmpty) return false;
  return lower.contains('test') ||
      lower.contains('demo') ||
      lower.contains('sample');
}

({String name, bool isUnnamed}) topListDisplayName(
  Map<String, dynamic> row,
  List<String> labelKeys, {
  String? unnamedFallback,
}) {
  for (final k in labelKeys) {
    final v = row[k];
    if (isMeaningfulTopListName(v?.toString())) {
      return (name: v.toString().trim(), isUnnamed: false);
    }
  }
  if (unnamedFallback != null) {
    return (name: unnamedFallback, isUnnamed: true);
  }
  return (name: '—', isUnnamed: false);
}

bool topListRowHasMeaningfulName(
  Map<String, dynamic> row,
  List<String> labelKeys,
) {
  return topListDisplayName(row, labelKeys).isUnnamed == false;
}

/// Hide a lone manufacturer row with no real name (adds confusion).
List<Map<String, dynamic>> topMfgRowsForDisplay(
  List<Map<String, dynamic>> rows,
) {
  if (rows.isEmpty) return rows;
  const labelKeys = [
    'mfg_name',
    'mfgName',
    'mfg_company',
    'mfgCompany',
    'company_name',
    'companyName',
    'name',
  ];
  if (rows.length == 1 && !topListRowHasMeaningfulName(rows.first, labelKeys)) {
    return [];
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Business Insights Grid — 2-column pairing
// ═══════════════════════════════════════════════════════════════════════════════

class _InsightsGrid extends StatelessWidget {
  const _InsightsGrid({
    required this.topProducts, required this.topCustomers,
    required this.topVendors,  required this.topMfg,
    required this.paymentModes, required this.paymentModesPrev,
    required this.divisionSales,
    this.concentrationPct,
  });
  final List<Map<String, dynamic>> topProducts;
  final List<Map<String, dynamic>> topCustomers;
  final List<Map<String, dynamic>> topVendors;
  final List<Map<String, dynamic>> topMfg;
  final List<Map<String, dynamic>> paymentModes;
  final List<Map<String, dynamic>> paymentModesPrev;
  final List<Map<String, dynamic>> divisionSales;
  final int? concentrationPct;

  Widget _topCustomersColumn(BuildContext context, {required bool compact}) {
    final topName = topCustomers.isNotEmpty
        ? topListDisplayName(
            topCustomers.first,
            const ['customer_name', 'customerName', 'name'],
          ).name
        : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _TopListCard(
          title: 'Top customers',
          icon: AppIcons.customers,
          iconBg: AppColors.successLight,
          iconColor: AppColors.success,
          barColor: AppColors.success,
          rows: topCustomers,
          labelKey: const ['customer_name', 'customerName', 'name'],
          valueExtractor: (r) => customerBilledAmount(r).toDouble(),
          subtitleExtractor: (r) {
            final d =
                pickNum(r['balance_due'] ?? r['balanceDue'] ?? r['outstanding']);
            return (d != null && d > 0) ? 'Due: ${fmtCurrency(d)}' : null;
          },
          onViewAll: () => context.go('/customers'),
          compact: compact,
        ),
        if (concentrationPct != null) ...[
          const SizedBox(height: 6),
          _CustomerConcentrationBanner(
            customerName: topName,
            pct: concentrationPct!,
          ),
        ],
      ],
    );
  }

  Widget _pair(Widget left, Widget right) =>
      _DashSideBySide(children: [left, right]);

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];

    // Pair 1: products + customers
    if (topProducts.isNotEmpty && topCustomers.isNotEmpty) {
      rows.add(_pair(
        _TopProductsCard(rows: topProducts, compact: true),
        _topCustomersColumn(context, compact: true),
      ));
    } else if (topProducts.isNotEmpty) {
      rows.add(_TopProductsCard(rows: topProducts));
    } else if (topCustomers.isNotEmpty) {
      rows.add(_topCustomersColumn(context, compact: false));
    }

    // Pair 2: vendors + mfg
    if (topVendors.isNotEmpty || topMfg.isNotEmpty) {
      if (rows.isNotEmpty) rows.add(const SizedBox(height: _cardGap));
      if (topVendors.isNotEmpty && topMfg.isNotEmpty) {
        rows.add(_pair(
          _TopListCard(title: 'Top suppliers', icon: AppIcons.supplier,
            iconBg: AppColors.warningLight, iconColor: AppColors.warning,
            barColor: AppColors.warning, rows: topVendors,
            labelKey: const ['vendor_name', 'vendorName', 'supplier_name', 'supplierName', 'name'],
            valueExtractor: (r) => (pickNum(r['total'] ?? r['purchase_total'] ?? r['amount']) ?? 0).toDouble(),
            subtitleExtractor: (r) { final i = r['invoice_count'] ?? r['invoiceCount']; return i != null ? '$i invoices' : null; },
            onViewAll: () => context.go('/vendors'), compact: true),
          _TopListCard(title: 'Top manufacturers', icon: AppIcons.company,
            iconBg: const Color(0xFFF0F4FF), iconColor: AppColors.primaryDark,
            barColor: AppColors.primaryDark, rows: topMfg,
            labelKey: const ['mfg_name', 'mfgName', 'mfg_company', 'mfgCompany', 'company_name', 'companyName', 'name'],
            unnamedFallback: 'Unnamed manufacturer',
            valueExtractor: (r) => (pickNum(r['total'] ?? r['amount']) ?? 0).toDouble(),
            onViewAll: () => context.go('/mfg-companies'), compact: true),
        ));
      } else if (topVendors.isNotEmpty) {
        rows.add(_TopListCard(title: 'Top suppliers', icon: AppIcons.supplier,
          iconBg: AppColors.warningLight, iconColor: AppColors.warning,
          barColor: AppColors.warning, rows: topVendors,
          labelKey: const ['vendor_name', 'vendorName', 'supplier_name', 'supplierName', 'name'],
          valueExtractor: (r) => (pickNum(r['total'] ?? r['purchase_total'] ?? r['amount']) ?? 0).toDouble(),
          subtitleExtractor: (r) { final i = r['invoice_count'] ?? r['invoiceCount']; return i != null ? '$i invoices' : null; },
          onViewAll: () => context.go('/vendors')));
      } else {
        rows.add(_TopListCard(title: 'Top manufacturers', icon: AppIcons.company,
          iconBg: const Color(0xFFF0F4FF), iconColor: AppColors.primaryDark,
          barColor: AppColors.primaryDark, rows: topMfg,
          labelKey: const ['mfg_name', 'mfgName', 'mfg_company', 'mfgCompany', 'company_name', 'companyName', 'name'],
          unnamedFallback: 'Unnamed manufacturer',
          valueExtractor: (r) => (pickNum(r['total'] ?? r['amount']) ?? 0).toDouble(),
          onViewAll: () => context.go('/mfg-companies')));
      }
    }

    // Pair 3: payment modes + division sales
    if (paymentModes.isNotEmpty || divisionSales.isNotEmpty) {
      if (rows.isNotEmpty) rows.add(const SizedBox(height: _cardGap));
      if (paymentModes.isNotEmpty && divisionSales.isNotEmpty) {
        rows.add(_pair(
          _PaymentModesCard(rows: paymentModes, prevRows: paymentModesPrev),
          _DivisionSalesCard(rows: divisionSales),
        ));
      } else if (paymentModes.isNotEmpty) {
        rows.add(_PaymentModesCard(rows: paymentModes, prevRows: paymentModesPrev));
      } else {
        rows.add(_DivisionSalesCard(rows: divisionSales));
      }
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Top products — toggle by sales value vs quantity sold
// ═══════════════════════════════════════════════════════════════════════════════

enum _TopProductMetric { value, quantity }

class _TopProductsCard extends StatefulWidget {
  const _TopProductsCard({required this.rows, this.compact = false});
  final List<Map<String, dynamic>> rows;
  final bool compact;

  @override
  State<_TopProductsCard> createState() => _TopProductsCardState();
}

class _TopProductsCardState extends State<_TopProductsCard> {
  _TopProductMetric _metric = _TopProductMetric.value;

  List<Map<String, dynamic>> get _sorted {
    final copy = List<Map<String, dynamic>>.from(widget.rows);
    copy.sort((a, b) {
      if (_metric == _TopProductMetric.quantity) {
        final qa = pickNum(a['qty_sold'] ?? a['qtySold'] ?? a['qty']) ?? 0;
        final qb = pickNum(b['qty_sold'] ?? b['qtySold'] ?? b['qty']) ?? 0;
        return qb.compareTo(qa);
      }
      final va = pickNum(a['total'] ?? a['amount']) ?? 0;
      final vb = pickNum(b['total'] ?? b['amount']) ?? 0;
      return vb.compareTo(va);
    });
    return copy;
  }

  double _barValue(Map<String, dynamic> r) {
    if (_metric == _TopProductMetric.quantity) {
      return (pickNum(r['qty_sold'] ?? r['qtySold'] ?? r['qty']) ?? 0).toDouble();
    }
    return (pickNum(r['total'] ?? r['amount']) ?? 0).toDouble();
  }

  String? _subtitle(Map<String, dynamic> r) {
    if (_metric == _TopProductMetric.quantity) {
      final t = pickNum(r['total'] ?? r['amount']);
      return t != null && t > 0 ? fmtDashboardCurrency(t) : null;
    }
    final q = pickNum(r['qty_sold'] ?? r['qtySold'] ?? r['qty']);
    return q != null ? '${q.toStringAsFixed(q == q.roundToDouble() ? 0 : 1)} units' : null;
  }

  String _valueLabel(Map<String, dynamic> r) {
    if (_metric == _TopProductMetric.quantity) {
      final q = pickNum(r['qty_sold'] ?? r['qtySold'] ?? r['qty']) ?? 0;
      return q == q.roundToDouble() ? '${q.toInt()}' : q.toStringAsFixed(1);
    }
    return fmtDashboardCurrency(pickNum(r['total'] ?? r['amount']) ?? 0);
  }

  @override
  Widget build(BuildContext context) {
    return _TopListCard(
      title: 'Top products',
      icon: AppIcons.stock,
      iconBg: AppColors.primaryLight,
      iconColor: AppColors.primary,
      barColor: AppColors.primary,
      rows: _sorted,
      labelKey: const ['product_name', 'productName', 'name'],
      valueExtractor: _barValue,
      valueLabelBuilder: _valueLabel,
      subtitleExtractor: _subtitle,
      onViewAll: () => context.go('/reports/inventory'),
      compact: widget.compact,
      headerTrailing: _TopProductMetricToggle(
        metric: _metric,
        onChanged: (m) => setState(() => _metric = m),
      ),
    );
  }
}

class _TopProductMetricToggle extends StatelessWidget {
  const _TopProductMetricToggle({
    required this.metric,
    required this.onChanged,
  });
  final _TopProductMetric metric;
  final ValueChanged<_TopProductMetric> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget chip(String label, _TopProductMetric m) {
      final active = metric == m;
      return GestureDetector(
        onTap: () => onChanged(m),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: active ? AppColors.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(AppTheme.pillRadius),
            border: Border.all(
              color: active ? AppColors.primary : AppColors.border,
            ),
          ),
          child: Text(
            label,
            style: AppTypography.badgeSmall.copyWith(
              color: active ? Colors.white : AppColors.text2,
              fontWeight: FontWeight.w600,
              fontSize: 10,
            ),
          ),
        ),
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        chip('By value', _TopProductMetric.value),
        const SizedBox(width: 4),
        chip('By qty', _TopProductMetric.quantity),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Generic Top-N List Card
// FIX: compact mode uses 12px font + fixed 68px amount width so names
//      show at least 6-8 characters instead of "d...", "ra...", "et..."
// ═══════════════════════════════════════════════════════════════════════════════

class _TopListCard extends StatelessWidget {
  const _TopListCard({
    required this.title, required this.icon, required this.iconBg,
    required this.iconColor, required this.barColor, required this.rows,
    required this.labelKey, required this.valueExtractor,
    this.subtitleExtractor,
    this.valueLabelBuilder,
    this.unnamedFallback,
    this.onViewAll,
    this.headerTrailing,
    this.maxItems = 5,
    this.compact = false,
  });
  final String title;
  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final Color barColor;
  final List<Map<String, dynamic>> rows;
  final List<String> labelKey;
  final double Function(Map<String, dynamic>) valueExtractor;
  final String? Function(Map<String, dynamic>)? subtitleExtractor;
  final String Function(Map<String, dynamic>)? valueLabelBuilder;
  final String? unnamedFallback;
  final VoidCallback? onViewAll;
  final Widget? headerTrailing;
  final int maxItems;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final capped = rows.length > maxItems ? rows.sublist(0, maxItems) : rows;
    if (capped.length == 1) {
      return _buildSingleStatCard(context, capped.first);
    }
    final maxVal = capped.map(valueExtractor).fold(1.0, (a, b) => a > b ? a : b);

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
          Container(
            width: _dashHeaderIcon,
            height: _dashHeaderIcon,
            decoration: BoxDecoration(
              color: iconBg,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            ),
            child: Icon(icon, size: 12, color: iconColor),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              title,
              style: AppTypography.cardTitle,
              overflow: TextOverflow.ellipsis,
              maxLines: compact ? 2 : 1,
            ),
          ),
          if (headerTrailing != null) ...[
            headerTrailing!,
            const SizedBox(width: 6),
          ],
          if (onViewAll != null)
            GestureDetector(
              onTap: onViewAll,
              child: Padding(
                padding: const EdgeInsets.only(left: 6),
                child: Text(
                  'All →',
                  style: AppTypography.secondary.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ]),
        const SizedBox(height: AppSpacing.sm),
        ...capped.asMap().entries.map((entry) {
          final i = entry.key;
          final r = entry.value;
          final named = topListDisplayName(
            r,
            labelKey,
            unnamedFallback: unnamedFallback,
          );
          final name = named.name;
          final isUnnamed = named.isUnnamed;
          final isTestLike = !isUnnamed && isTestLikeTopListName(name);
          final val      = valueExtractor(r);
          final pct      = maxVal > 0 ? val / maxVal : 0.0;
          final subtitle = subtitleExtractor?.call(r);
          final amountStyle = AppTypography.labelSemibold.copyWith(
            fontSize: compact ? 12 : 13,
            fontFeatures: const [FontFeature.tabularFigures()],
          );

          final barWidth = val > 0 ? pct.clamp(0.1, 1.0) : 0.0;
          final barAlpha = i == 0 ? 0.2 : 0.12;

          return Padding(
            padding: EdgeInsets.only(bottom: compact ? 6 : 8),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: Stack(
                children: [
                  Positioned.fill(
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: FractionallySizedBox(
                        widthFactor: barWidth,
                        heightFactor: 1,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: barColor.withValues(alpha: barAlpha),
                          ),
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: compact ? 7 : 9,
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: 20,
                          child: Text(
                            '${i + 1}',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: i == 0 ? barColor : AppColors.textMuted,
                              fontFeatures: const [
                                FontFeature.tabularFigures(),
                              ],
                            ),
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                isTestLike ? '$name (test data)' : name,
                                style: (compact
                                        ? AppTypography.body
                                            .copyWith(fontSize: 12)
                                        : AppTypography.body)
                                    .copyWith(
                                  fontWeight: FontWeight.w500,
                                  fontStyle: isUnnamed
                                      ? FontStyle.italic
                                      : FontStyle.normal,
                                  color: isUnnamed || isTestLike
                                      ? AppColors.textMuted
                                      : null,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (subtitle != null) ...[
                                const SizedBox(height: 2),
                                Text(
                                  subtitle,
                                  style: AppTypography.caption.copyWith(
                                    fontSize: 10,
                                    color: AppColors.textFaint,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        _topListValueLabel(
                          row: r,
                          val: val,
                          style: amountStyle.copyWith(
                            fontWeight: FontWeight.w700,
                            color: i == 0 ? barColor : AppColors.text,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ]),
    );
  }

  Widget _buildSingleStatCard(BuildContext context, Map<String, dynamic> row) {
    final named = topListDisplayName(
      row,
      labelKey,
      unnamedFallback: unnamedFallback,
    );
    final val = valueExtractor(row);
    final testLike = !named.isUnnamed && isTestLikeTopListName(named.name);
    final singularLabel = title.replaceFirst(RegExp(r's$'), '');
    final displayName =
        testLike ? '${named.name} (test data)' : named.name;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: _dashHeaderIcon,
                height: _dashHeaderIcon,
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Icon(icon, size: 12, color: iconColor),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(singularLabel, style: AppTypography.cardTitle),
              ),
              if (onViewAll != null)
                GestureDetector(
                  onTap: onViewAll,
                  child: Text(
                    'All →',
                    style: AppTypography.secondary.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 0,
            runSpacing: 4,
            children: [
              Text(
                '$singularLabel: ',
                style: AppTypography.body.copyWith(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                displayName,
                style: AppTypography.body.copyWith(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  fontStyle: named.isUnnamed ? FontStyle.italic : null,
                  color: named.isUnnamed || testLike
                      ? AppColors.textMuted
                      : AppColors.text,
                ),
              ),
              Text(
                ' · ',
                style: AppTypography.body.copyWith(
                  fontSize: 13,
                  color: AppColors.textMuted,
                ),
              ),
              _topListValueLabel(
                row: row,
                val: val,
                style: AppTypography.labelSemibold.copyWith(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: barColor,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _topListValueLabel({
    required Map<String, dynamic> row,
    required double val,
    required TextStyle style,
  }) {
    if (valueLabelBuilder != null) {
      return Text(
        valueLabelBuilder!(row),
        style: style,
        textAlign: TextAlign.end,
        overflow: TextOverflow.ellipsis,
        maxLines: 1,
      );
    }
    return DashboardAmountText(
      val,
      style: style,
      textAlign: TextAlign.end,
      overflow: TextOverflow.ellipsis,
      maxLines: 1,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Division Sales Card
// ═══════════════════════════════════════════════════════════════════════════════

class _DivisionSalesCard extends StatelessWidget {
  const _DivisionSalesCard({required this.rows});
  final List<Map<String, dynamic>> rows;

  @override
  Widget build(BuildContext context) {
    final total = rows.fold<double>(
      0, (s, r) => s + (pickNum(r['total'] ?? r['amount']) ?? 0).toDouble());

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 22, height: 22,
            decoration: BoxDecoration(color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm)),
            child: const Icon(AppIcons.divisions, size: 11, color: AppColors.primary)),
          const SizedBox(width: 6),
          const Expanded(child: Text('Division sales', style: AppTypography.cardTitle)),
          DashboardAmountText(total, style: AppTypography.labelSemibold.copyWith(fontSize: 13)),
        ]),
        const SizedBox(height: AppSpacing.xs),
        ...rows.take(5).map((r) {
          final name = (r['division_name'] ?? r['divisionName'] ?? r['name'] ?? '—').toString();
          final amt  = (pickNum(r['total'] ?? r['amount']) ?? 0).toDouble();
          final pct  = total > 0 ? amt / total : 0.0;
          return Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Row(children: [
              Expanded(child: Text(name, style: AppTypography.body, overflow: TextOverflow.ellipsis)),
              const SizedBox(width: AppSpacing.xs),
              SizedBox(width: 60, child: ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(value: pct.clamp(0.0, 1.0), minHeight: 4,
                  backgroundColor: AppColors.surface,
                  valueColor: const AlwaysStoppedAnimation<Color>(AppColors.primary)),
              )),
              const SizedBox(width: AppSpacing.xs),
              SizedBox(width: 64, child: DashboardAmountText(amt,
                style: AppTypography.labelSemibold.copyWith(fontSize: 12),
                textAlign: TextAlign.end, overflow: TextOverflow.ellipsis)),
            ]),
          );
        }),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Customer concentration risk
// ═══════════════════════════════════════════════════════════════════════════════

class _CustomerConcentrationBanner extends StatelessWidget {
  const _CustomerConcentrationBanner({
    required this.pct,
    this.customerName,
  });
  final int pct;
  final String? customerName;

  @override
  Widget build(BuildContext context) {
    final name = customerName?.trim();
    final message = name != null && name.isNotEmpty
        ? '$name represents $pct% of revenue'
        : 'Top customer represents $pct% of revenue';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.warning_amber_rounded,
              size: 16, color: AppColors.warning),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: AppTypography.body.copyWith(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.warningDark,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sales by day of week (Mon–Sun)
// ═══════════════════════════════════════════════════════════════════════════════

class _SalesByDayOfWeekCard extends StatelessWidget {
  const _SalesByDayOfWeekCard({required this.rows});
  final List<Map<String, dynamic>> rows;

  static const _labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  @override
  Widget build(BuildContext context) {
    final totals = salesByIsoWeekday(rows);
    final maxVal = totals.fold<double>(0, (a, b) => a > b ? a : b);
    final peakIdx = maxVal > 0
        ? totals.indexWhere((v) => v == maxVal)
        : -1;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: _dashHeaderIcon,
                height: _dashHeaderIcon,
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: const Icon(AppIcons.dateRange,
                    size: 12, color: AppColors.primary),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('Sales by day', style: AppTypography.cardTitle),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          SizedBox(
            height: 88,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(7, (i) {
                final val = totals[i];
                final isPeak = i == peakIdx && maxVal > 0;
                final barH = maxVal > 0
                    ? (val / maxVal * 56).clamp(val > 0 ? 6.0 : 4.0, 56.0)
                    : 4.0;
                final barColor =
                    isPeak ? AppColors.primary : AppColors.primary.withValues(alpha: 0.35);
                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(left: i == 0 ? 0 : 3),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        if (val > 0)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 3),
                            child: Text(
                              fmtDashboardCurrency(val),
                              style: AppTypography.caption.copyWith(
                                fontSize: 8,
                                color: isPeak
                                    ? AppColors.primary
                                    : AppColors.textMuted,
                                fontWeight: isPeak
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                            ),
                          ),
                        Container(
                          height: barH,
                          decoration: BoxDecoration(
                            color: barColor,
                            borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(3),
                            ),
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          _labels[i],
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight:
                                isPeak ? FontWeight.w700 : FontWeight.w500,
                            color: isPeak
                                ? AppColors.primary
                                : AppColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Payment Modes Card
// ═══════════════════════════════════════════════════════════════════════════════

class _PaymentModesCard extends StatelessWidget {
  const _PaymentModesCard({
    required this.rows,
    this.prevRows = const [],
  });
  final List<Map<String, dynamic>> rows;
  final List<Map<String, dynamic>> prevRows;

  static Color _modeColor(String mode) {
    switch (mode.toUpperCase()) {
      case 'UPI':    return AppColors.success;
      case 'CARD':   return AppColors.warning;
      case 'CREDIT': return AppColors.primaryMid;
      case 'CHEQUE': return AppColors.warningDark;
      case 'CASH':   return AppColors.primary;
      default:       return AppColors.textMuted;
    }
  }

  static String _modeLabel(String mode) {
    final key = mode.trim().toUpperCase();
    switch (key) {
      case 'UPI':
        return 'UPI';
      case 'CARD':
        return 'Card';
      case 'CASH':
        return 'Cash';
      case 'CREDIT':
        return 'Credit';
      case 'CHEQUE':
        return 'Cheque';
      case 'NEFT':
      case 'RTGS':
      case 'IMPS':
        return key;
      case 'BANK':
      case 'BANK_TRANSFER':
        return 'Bank transfer';
      default:
        if (key.isEmpty) return '—';
        return key[0].toUpperCase() + key.substring(1).toLowerCase();
    }
  }

  static IconData _modeIcon(String mode) {
    switch (mode.toUpperCase()) {
      case 'CARD':
        return Icons.credit_card_outlined;
      case 'CASH':
        return Icons.payments_outlined;
      case 'UPI':
        return Icons.phone_android_outlined;
      case 'CHEQUE':
        return Icons.receipt_long_outlined;
      case 'CREDIT':
        return Icons.account_balance_wallet_outlined;
      default:
        return Icons.payment_outlined;
    }
  }

  static String _trendGlyph(String trend) {
    switch (trend) {
      case 'up':
        return '▲';
      case 'down':
        return '▼';
      default:
        return '—';
    }
  }

  static Color _trendColor(String trend) {
    switch (trend) {
      case 'up':
        return AppColors.success;
      case 'down':
        return AppColors.danger;
      default:
        return AppColors.textMuted;
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = rows.fold<double>(0, (s, r) => s + (pickNum(r['total']) ?? 0).toDouble());
    final prevTotal = paymentModesTotal(prevRows);

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
          Container(
            width: _dashHeaderIcon,
            height: _dashHeaderIcon,
            decoration: BoxDecoration(
              color: AppColors.warningLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            ),
            child: const Icon(AppIcons.payment, size: 12, color: AppColors.warning),
          ),
          const SizedBox(width: 8),
          const Expanded(child: Text('Payment modes', style: AppTypography.cardTitle)),
          DashboardAmountText(
            total,
            style: AppTypography.labelSemibold.copyWith(
              fontSize: 13,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ]),
        const SizedBox(height: AppSpacing.sm),
        if (total > 0) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: SizedBox(height: 6, child: Row(
              children: rows.map((r) {
                final mode = (r['mode'] ?? '').toString();
                final amt  = (pickNum(r['total']) ?? 0).toDouble();
                final pct  = total > 0 ? amt / total : 0.0;
                return Expanded(flex: (pct * 1000).round(),
                  child: Container(color: _modeColor(mode)));
              }).toList(),
            )),
          ),
          const SizedBox(height: AppSpacing.xs),
          if (prevRows.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(
                'vs last month',
                style: AppTypography.caption.copyWith(
                  fontSize: 10,
                  color: AppColors.textFaint,
                ),
              ),
            ),
        ],
        ...rows.map((r) {
          final modeRaw = (r['mode'] ?? '').toString();
          final label = _modeLabel(modeRaw);
          final amt   = (pickNum(r['total']) ?? 0).toDouble();
          final pct   = total > 0 ? amt / total : 0.0;
          final color = _modeColor(modeRaw);
          final prevAmt = paymentModeAmount(prevRows, modeRaw);
          final trend = paymentModeShareTrend(
            currentAmount: amt,
            previousAmount: prevAmt,
            currentPeriodTotal: total,
            previousPeriodTotal: prevTotal,
          );
          final trendGlyph = _trendGlyph(trend);
          final trendColor = _trendColor(trend);
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Icon(_modeIcon(modeRaw), size: 18, color: color),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: Text(
                    label,
                    style: AppTypography.body.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (prevRows.isNotEmpty) ...[
                  Text(
                    trendGlyph,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: trendColor,
                      height: 1,
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                SizedBox(
                  width: 46,
                  child: Text(
                    '${(pct * 100).toStringAsFixed(1)}%',
                    style: AppTypography.secondary.copyWith(fontSize: 11),
                    textAlign: TextAlign.end,
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 92,
                  child: DashboardAmountText(
                    amt,
                    style: AppTypography.labelSemibold.copyWith(
                      fontSize: 12,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                    textAlign: TextAlign.end,
                    overflow: TextOverflow.ellipsis,
                    maxLines: 1,
                  ),
                ),
              ],
            ),
          );
        }),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Recent Transactions Section
// ═══════════════════════════════════════════════════════════════════════════════

class _RecentTransactionsSection extends StatelessWidget {
  const _RecentTransactionsSection({required this.controller, required this.recentItems});
  final TabController controller;
  final List<Map<String, dynamic>> Function(int) recentItems;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
            Container(
              width: _dashHeaderIcon,
              height: _dashHeaderIcon,
              decoration: BoxDecoration(
                color: AppColors.primaryLight,
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              ),
              child: const Icon(AppIcons.history, size: 12, color: AppColors.primary),
            ),
            const SizedBox(width: 8),
            const Text('Recent activity', style: AppTypography.cardTitle),
          ]),
        ),
        const SizedBox(height: AppSpacing.xxs),
        TabBar(
          controller: controller,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
          tabs: const [Tab(text: 'Sales'), Tab(text: 'Purchases'), Tab(text: 'Returns')],
        ),
        const Divider(height: 1, color: AppColors.border),
        AnimatedBuilder(
          animation: controller,
          builder: (_, __) => _RecentList(items: recentItems(controller.index)),
        ),
      ]),
    );
  }
}

class _RecentList extends StatelessWidget {
  const _RecentList({required this.items});
  final List<Map<String, dynamic>> items;

  /// Returns true when the row has an outstanding/unpaid balance (confirmed only).
  static bool _isUnpaid(Map<String, dynamic> row) {
    final invoiceStatus = (row['status'] ?? '').toString().toUpperCase();
    if (invoiceStatus == 'DRAFT' || invoiceStatus == 'CANCELLED') return false;
    final status = (row['payment_status'] ?? row['paymentStatus'] ??
        row['pay_status'] ?? '').toString().toLowerCase();
    final balance = invoiceOutstandingDue(row);
    if (balance > 0.001) return true;
    return status == 'unpaid' || status == 'partial';
  }

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const InlineEmptyState(
        title: 'Nothing recent yet',
        message: 'Transactions will appear here',
        icon: AppIcons.invoice,
        padding: EdgeInsets.symmetric(vertical: 24),
      );
    }
    // Sort: unpaid / outstanding bills first, then the rest in original order
    final sorted = [...items]..sort((a, b) {
      final aUnpaid = _isUnpaid(a) ? 0 : 1;
      final bUnpaid = _isUnpaid(b) ? 0 : 1;
      return aUnpaid.compareTo(bUnpaid);
    });
    final capped = sorted.length > 8 ? sorted.sublist(0, 8) : sorted;
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: capped.length,
      itemBuilder: (_, i) => TransactionListTile(row: capped[i], onTap: () {}),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stock Health Card
// ═══════════════════════════════════════════════════════════════════════════════

class _StockHealthCard extends StatelessWidget {
  const _StockHealthCard({
    this.totalProducts,
    required this.lowStockCount,
    this.outOfStock,
    required this.expiryCount,
    this.stockValue,
    this.onTap,
  });
  final num? totalProducts;
  final num lowStockCount;
  final num? outOfStock;
  final num expiryCount;
  final num? stockValue;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 22, height: 22,
            decoration: BoxDecoration(color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm)),
            child: const Icon(AppIcons.stock, size: 11, color: AppColors.primary)),
          const SizedBox(width: 6),
          const Expanded(child: Text('Inventory health', style: AppTypography.cardTitle)),
          if (stockValue != null)
            DashboardAmountText(stockValue!,
              style: AppTypography.labelSemibold.copyWith(fontSize: 13, color: AppColors.primary)),
        ]),
        const SizedBox(height: AppSpacing.sm),
        Row(children: [
          if (totalProducts != null)
            Expanded(child: _StockMetric(
              label: 'Total products',
              value: totalProducts!.toInt().toString(),
              color: AppColors.primary,
            )),
          Expanded(child: _StockMetric(
            label: 'Low stock',
            value: lowStockCount.toInt().toString(),
            color: lowStockCount > 0 ? AppColors.warning : AppColors.textMuted,
          )),
          if (outOfStock != null)
            Expanded(child: _StockMetric(
              label: 'Out of stock',
              value: outOfStock!.toInt().toString(),
              color: outOfStock! > 0 ? AppColors.danger : AppColors.textMuted,
            )),
          Expanded(child: _StockMetric(
            label: 'Expiring',
            value: expiryCount.toInt().toString(),
            color: expiryCount > 0 ? AppColors.warning : AppColors.textMuted,
          )),
        ]),
        if (onTap != null) ...[
          const SizedBox(height: AppSpacing.xs),
          GestureDetector(
            onTap: onTap,
            child: const Row(children: [
              Spacer(),
              Text('View products →',
                style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: AppColors.primary)),
            ]),
          ),
        ],
      ]),
    );
  }
}

class _StockMetric extends StatelessWidget {
  const _StockMetric({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(value,
        style: TextStyle(
          fontSize: 20, fontWeight: FontWeight.w700,
          color: color, height: 1.1,
          fontFeatures: const [FontFeature.tabularFigures()],
        )),
      const SizedBox(height: 2),
      Text(label,
        style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
        maxLines: 1, overflow: TextOverflow.ellipsis),
    ]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sales Performance Card
// ═══════════════════════════════════════════════════════════════════════════════

class _SalesPerformanceCard extends StatelessWidget {
  const _SalesPerformanceCard({
    this.invoiceCount,
    this.avgSale,
    this.salesReturns,
    this.purchaseReturns,
    required this.totalSales,
  });
  final num? invoiceCount;
  final num? avgSale;
  final num? salesReturns;
  final num? purchaseReturns;
  final num totalSales;

  @override
  Widget build(BuildContext context) {
    final returnRate = (salesReturns != null && totalSales > 0)
        ? (salesReturns! / totalSales * 100)
        : null;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 22, height: 22,
            decoration: BoxDecoration(color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm)),
            child: const Icon(AppIcons.invoice, size: 11, color: AppColors.primary)),
          const SizedBox(width: 6),
          const Expanded(child: Text('Sales performance', style: AppTypography.cardTitle)),
        ]),
        const SizedBox(height: AppSpacing.xs),
        if (invoiceCount != null)
          _ProfitMetric(
            label: 'Invoices issued',
            text: invoiceCount!.toInt().toString(),
            color: AppColors.primary,
          ),
        if (avgSale != null) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Avg. sale value',
            amount: avgSale,
            color: AppColors.primaryMid,
          ),
        ],
        if (salesReturns != null && salesReturns! > 0) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Sales returns',
            amount: salesReturns,
            color: AppColors.danger,
          ),
        ],
        if (purchaseReturns != null && purchaseReturns! > 0) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Purchase returns',
            amount: purchaseReturns,
            color: AppColors.warning,
          ),
        ],
        if (returnRate != null) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Return rate',
            text: '${returnRate.toStringAsFixed(1)}%',
            color: returnRate > 5 ? AppColors.danger : AppColors.success,
          ),
        ],
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cash Flow Card
// ═══════════════════════════════════════════════════════════════════════════════

class _CashFlowCard extends StatelessWidget {
  const _CashFlowCard({
    required this.cashIn,
    required this.cashOut,
  });
  final num cashIn;
  final num cashOut;

  @override
  Widget build(BuildContext context) {
    final cashInVal = cashIn.toDouble();
    final cashOutVal = cashOut.toDouble();
    // Cash in = 100% width; cash out = (out ÷ in) × 100%.
    final barBaseline = cashInVal > 0 ? cashInVal : 1.0;
    final netFlow = cashInVal - cashOutVal;
    final isPositive = netFlow >= 0;
    final netColor = isPositive ? AppColors.success : AppColors.danger;
    final netMarginPct =
        cashInVal > 0 ? (netFlow / cashInVal) * 100 : null;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: _dashHeaderIcon,
                height: _dashHeaderIcon,
                decoration: BoxDecoration(
                  color: isPositive
                      ? AppColors.successLight
                      : AppColors.dangerLight,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Icon(
                  isPositive ? AppIcons.trendUp : AppIcons.trendDown,
                  size: 12,
                  color: netColor,
                ),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('Cash flow', style: AppTypography.cardTitle),
              ),
              if (netMarginPct != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: netColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(AppTheme.pillRadius),
                    border: Border.all(color: netColor.withValues(alpha: 0.25)),
                  ),
                  child: Text(
                    isPositive
                        ? 'Net positive · ${netMarginPct.abs().toStringAsFixed(1)}%'
                        : 'Net negative · ${netMarginPct.toStringAsFixed(1)}%',
                    style: AppTypography.badgeSmall.copyWith(
                      color: netColor,
                      fontWeight: FontWeight.w700,
                      fontSize: 10,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          _CashFlowProgressRow(
            label: 'Cash in',
            subtitle: 'Sales',
            amount: cashInVal,
            baseline: barBaseline,
            fillFullWidth: true,
            color: AppColors.success,
          ),
          const SizedBox(height: 10),
          _CashFlowProgressRow(
            label: 'Cash out',
            subtitle: 'Purchases',
            amount: cashOutVal,
            baseline: barBaseline,
            color: AppColors.danger,
          ),
          const SizedBox(height: 12),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: 10),
          Text(
            'Net cash flow',
            style: AppTypography.caption.copyWith(
              color: AppColors.textMuted,
              fontWeight: FontWeight.w600,
              fontSize: 11,
            ),
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: DashboardAmountText(
              netFlow,
              prefix: isPositive && netFlow != 0 ? '+' : '',
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: netColor,
                height: 1.1,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CashFlowProgressRow extends StatelessWidget {
  const _CashFlowProgressRow({
    required this.label,
    required this.subtitle,
    required this.amount,
    required this.baseline,
    required this.color,
    this.fillFullWidth = false,
  });
  final String label;
  final String subtitle;
  final double amount;
  final double baseline;
  final Color color;
  final bool fillFullWidth;

  @override
  Widget build(BuildContext context) {
    final pct = baseline > 0 ? (amount / baseline).clamp(0.0, 1.0) : 0.0;
    final barWidth = fillFullWidth && amount > 0
        ? 1.0
        : amount > 0
            ? pct
            : 0.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: color,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: AppTypography.caption.copyWith(
                      color: AppColors.textFaint,
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
            DashboardAmountText(
              amount,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: color,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: SizedBox(
            height: 8,
            width: double.infinity,
            child: Stack(
              children: [
                Container(color: AppColors.surface),
                FractionallySizedBox(
                  widthFactor: barWidth,
                  alignment: Alignment.centerLeft,
                  child: Container(color: color),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Customer Insights Card
// ═══════════════════════════════════════════════════════════════════════════════

class _CustomerInsightsCard extends StatelessWidget {
  const _CustomerInsightsCard({
    this.totalCustomers,
    this.newCustomers,
    this.avgOrderValue,
    this.onTap,
    // Kept for hot-reload compatibility (shown in key metrics row now).
    this.receivables,
  });
  final num? totalCustomers;
  final num? newCustomers;
  final num? avgOrderValue;
  final VoidCallback? onTap;
  final num? receivables;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 22, height: 22,
            decoration: BoxDecoration(color: AppColors.successLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm)),
            child: const Icon(AppIcons.customers, size: 11, color: AppColors.success)),
          const SizedBox(width: 6),
          const Expanded(child: Text('Customer insights', style: AppTypography.cardTitle)),
          if (onTap != null)
            GestureDetector(
              onTap: onTap,
              child: Text('View →',
                style: AppTypography.secondary.copyWith(
                  color: AppColors.primary, fontWeight: FontWeight.w600)),
            ),
        ]),
        const SizedBox(height: AppSpacing.xs),
        if (totalCustomers != null)
          _ProfitMetric(
            label: 'Total customers',
            text: totalCustomers!.toInt().toString(),
            color: AppColors.text,
          ),
        if (newCustomers != null) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'New this period',
            text: newCustomers!.toInt().toString(),
            color: AppColors.success,
          ),
        ],
        if (avgOrderValue != null) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Avg. order value',
            amount: avgOrderValue,
            color: AppColors.primaryMid,
          ),
        ],
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pending Orders Card
// ═══════════════════════════════════════════════════════════════════════════════

class _PendingOrdersCard extends StatelessWidget {
  const _PendingOrdersCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final incomingCount = (pickNum(data['incoming_count']) ?? 0).toInt();
    final incomingValue = (pickNum(data['incoming_value']) ?? 0).toDouble();
    final myCount       = (pickNum(data['my_count'])       ?? 0).toInt();
    final myValue       = (pickNum(data['my_value'])       ?? 0).toDouble();

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 22, height: 22,
            decoration: BoxDecoration(color: AppColors.warningLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm)),
            child: const Icon(AppIcons.orders, size: 11, color: AppColors.warning)),
          const SizedBox(width: 6),
          const Expanded(child: Text('Pending orders', style: AppTypography.cardTitle)),
          GestureDetector(
            onTap: () => context.go('/orders'),
            child: Text('View →',
              style: AppTypography.secondary.copyWith(
                color: AppColors.primary, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: AppSpacing.sm),
        if (incomingCount == 0 && myCount == 0)
          // Collapsed single-line empty state — saves screen real estate
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.xs),
            child: Row(children: [
              const Icon(Icons.check_circle_outline_rounded,
                size: 14, color: AppColors.success),
              const SizedBox(width: 6),
              Text('No pending orders',
                style: AppTypography.secondary.copyWith(color: AppColors.textMuted)),
            ]),
          )
        else
          Row(children: [
            if (incomingCount > 0)
              Expanded(child: _OrderBannerTile(
                label: 'Incoming',
                count: incomingCount,
                value: incomingValue,
                color: AppColors.primary,
                onTap: () => context.go('/orders'),
              )),
            if (incomingCount > 0 && myCount > 0)
              const SizedBox(width: _cardGap),
            if (myCount > 0)
              Expanded(child: _OrderBannerTile(
                label: 'My pending',
                count: myCount,
                value: myValue,
                color: AppColors.warning,
                onTap: () => context.go('/my-orders'),
              )),
          ]),
      ]),
    );
  }
}

class _OrderBannerTile extends StatelessWidget {
  const _OrderBannerTile({
    required this.label,
    required this.count,
    required this.value,
    required this.color,
    this.onTap,
  });
  final String label;
  final int count;
  final double value;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.06),
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(count.toString(),
            style: TextStyle(
              fontSize: 22, fontWeight: FontWeight.w700,
              color: color, height: 1.1,
              fontFeatures: const [FontFeature.tabularFigures()],
            )),
          const SizedBox(height: 2),
          Text(label, style: AppTypography.secondary),
          const SizedBox(height: 4),
          DashboardAmountText(value,
            style: AppTypography.labelSemibold.copyWith(fontSize: 12, color: color)),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Month compare — 3-bar visual (last year · last month · this period)
// ═══════════════════════════════════════════════════════════════════════════════

const double _momBarMaxHeight = 72;
const double _momBarMinHeight = 4;

class _MomComparisonCard extends StatelessWidget {
  const _MomComparisonCard({
    required this.data,
    required this.dateFrom,
    required this.dateTo,
    required this.preset,
  });
  final Map<String, dynamic> data;
  final String dateFrom;
  final String dateTo;
  final String preset;

  @override
  Widget build(BuildContext context) {
    final thisPeriod = (pickNum(data['current_period']) ?? 0).toDouble();
    final lastMonth = (pickNum(data['last_month']) ?? 0).toDouble();
    final lastYear = (pickNum(data['same_month_last_year']) ?? 0).toDouble();
    final periodLabels = momCompareColumnLabels(
      dateFromYmd: dateFrom,
      dateToYmd: dateTo,
      preset: preset,
    );
    final momDeltaPct = data['mom_delta_pct'] is num
        ? (data['mom_delta_pct'] as num).toDouble()
        : deltaPctFromValues(thisPeriod, lastMonth);
    final yoyDeltaPct = data['yoy_delta_pct'] is num
        ? (data['yoy_delta_pct'] as num).toDouble()
        : deltaPctFromValues(thisPeriod, lastYear);
    final barMax = [thisPeriod, lastMonth, lastYear, 1.0].reduce((a, b) => a > b ? a : b);

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: _dashHeaderIcon,
                height: _dashHeaderIcon,
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: const Icon(AppIcons.dateRange, size: 12, color: AppColors.primary),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Sales compare',
                  style: AppTypography.cardTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          if (thisPeriod == 0 && lastMonth == 0 && lastYear == 0)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'No comparison data yet. Sales will appear here once recorded.',
                style: TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            )
          else ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                _MomBarColumn(
                  periodLabel: periodLabels[0],
                  value: lastYear,
                  maxValue: barMax,
                ),
                const SizedBox(width: 6),
                _MomBarColumn(
                  periodLabel: periodLabels[1],
                  value: lastMonth,
                  maxValue: barMax,
                ),
                const SizedBox(width: 6),
                _MomBarColumn(
                  periodLabel: periodLabels[2],
                  value: thisPeriod,
                  maxValue: barMax,
                  highlight: true,
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (lastMonth <= 0 &&
                lastYear <= 0 &&
                thisPeriod > 0)
              const Text(
                'First data this period',
                style: _MomCompareDeltaLine.firstDataStyle,
              )
            else ...[
              _MomCompareDeltaLine(
                current: thisPeriod,
                previous: lastMonth,
                deltaPct: momDeltaPct,
                compareLabel: periodLabels[1],
              ),
              const SizedBox(height: 4),
              _MomCompareDeltaLine(
                current: thisPeriod,
                previous: lastYear,
                deltaPct: yoyDeltaPct,
                compareLabel: periodLabels[0],
              ),
            ],
          ],
          _DashCardFooterLink(
            label: 'Day Book →',
            onTap: () => context.go('/reports/day-book'),
          ),
        ],
      ),
    );
  }
}

/// Sales-compare footnote: full % vs [compareLabel], or first-data copy when prior is zero.
class _MomCompareDeltaLine extends StatelessWidget {
  const _MomCompareDeltaLine({
    required this.current,
    required this.previous,
    required this.compareLabel,
    this.deltaPct,
  });

  final double current;
  final double previous;
  final String compareLabel;
  final double? deltaPct;

  static const firstDataStyle = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w600,
    color: AppColors.success,
    height: 1.25,
  );

  @override
  Widget build(BuildContext context) {
    if (current <= 0 && previous <= 0) {
      return const SizedBox.shrink();
    }
    if (previous <= 0 && current > 0) {
      return const Text('First data this period', style: firstDataStyle);
    }
    return _MetricComparisonLine(
      deltaPct: deltaPct,
      periodLabel: 'vs $compareLabel',
      invertColors: false,
    );
  }
}

class _MomBarColumn extends StatelessWidget {
  const _MomBarColumn({
    required this.periodLabel,
    required this.value,
    required this.maxValue,
    this.highlight = false,
  });
  final String periodLabel;
  final double value;
  final double maxValue;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final scale = maxValue > 0 ? value / maxValue : 0.0;
    final barHeight = value > 0
        ? (_momBarMaxHeight * scale).clamp(6.0, _momBarMaxHeight)
        : _momBarMinHeight;
    final barColor = highlight
        ? AppColors.primary
        : value > 0
            ? AppColors.border
            : AppColors.textFaint.withValues(alpha: 0.45);
    final amountColor =
        highlight ? AppColors.primary : AppColors.textMuted;

    return Expanded(
      child: Column(
        children: [
          Text(
            periodLabel,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: highlight ? AppColors.text : AppColors.textMuted,
              height: 1.2,
              letterSpacing: 0.1,
            ),
          ),
          const SizedBox(height: 6),
          DashboardAmountText(
            value,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: amountColor,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: _momBarMaxHeight,
            width: double.infinity,
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Container(
                width: double.infinity,
                margin: const EdgeInsets.symmetric(horizontal: 3),
                height: barHeight,
                decoration: BoxDecoration(
                  color: barColor,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                  boxShadow: highlight
                      ? [
                          BoxShadow(
                            color: AppColors.primary.withValues(alpha: 0.25),
                            blurRadius: 4,
                            offset: const Offset(0, 1),
                          ),
                        ]
                      : null,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Collection Efficiency Card
// ═══════════════════════════════════════════════════════════════════════════════

class _CollectionEfficiencyCard extends StatelessWidget {
  const _CollectionEfficiencyCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final paid = (pickNum(data['paid']) ?? 0).toInt();
    final partial = (pickNum(data['partial']) ?? 0).toInt();
    final unpaid = (pickNum(data['unpaid']) ?? 0).toInt();
    final totalInvoices = (pickNum(data['total_invoices']) ?? 0).toInt();
    final totalBilled = (pickNum(data['total_billed']) ?? 0).toDouble();
    final totalCollected = (pickNum(data['total_collected']) ?? 0).toDouble();
    final collectionPct = (pickNum(data['collection_pct']) ?? 0).toDouble();
    final outstanding =
        (totalBilled - totalCollected).clamp(0, double.infinity).toDouble();

    final collectedInvoices = paid + partial;
    final isGood = collectionPct >= 80;
    final isMid = collectionPct >= 50;
    final pctColor =
        isGood ? AppColors.success : isMid ? AppColors.warning : AppColors.danger;

    final headline = totalInvoices > 0
        ? '$collectedInvoices of $totalInvoices invoices collected'
        : 'No invoices in this period';

    final statusChips = <Widget>[
      if (partial > 0)
        _CollectionStatusChip(
          label: '$partial partial',
          color: AppColors.warning,
        ),
      if (unpaid > 0)
        _CollectionStatusChip(
          label: '$unpaid unpaid',
          color: AppColors.danger,
        ),
    ];

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: _dashHeaderIcon,
                height: _dashHeaderIcon,
                decoration: BoxDecoration(
                  color: isGood
                      ? AppColors.successLight
                      : AppColors.warningLight,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Icon(
                  AppIcons.payment,
                  size: 12,
                  color: isGood ? AppColors.success : AppColors.warning,
                ),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Collection',
                  style: AppTypography.cardTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: pctColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(AppTheme.pillRadius),
                ),
                child: Text(
                  '${collectionPct.toStringAsFixed(1)}%',
                  style: AppTypography.badgeSmall.copyWith(
                    color: pctColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            headline,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.text,
              height: 1.3,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (collectionPct / 100).clamp(0.0, 1.0),
              minHeight: 6,
              backgroundColor: AppColors.surface,
              valueColor: AlwaysStoppedAnimation<Color>(pctColor),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          _CollectionMoneyFlow(
            billed: totalBilled,
            collected: totalCollected,
            outstanding: outstanding,
          ),
          if (statusChips.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(spacing: 6, runSpacing: 6, children: statusChips),
          ],
          _DashCardFooterLink(
            label: 'Payments →',
            onTap: () => context.go('/customer-payments'),
          ),
        ],
      ),
    );
  }
}

class _CollectionMoneyFlow extends StatelessWidget {
  const _CollectionMoneyFlow({
    required this.billed,
    required this.collected,
    required this.outstanding,
  });
  final double billed;
  final double collected;
  final double outstanding;

  @override
  Widget build(BuildContext context) {
    Widget step(String label, double amount, Color color) {
      return Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: AppTypography.caption.copyWith(
                color: AppColors.textMuted,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 3),
            DashboardAmountText(
              amount,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: color,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      );
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        step('Billed', billed, AppColors.text),
        const Padding(
          padding: EdgeInsets.only(top: 14, left: 2, right: 2),
          child: Icon(Icons.arrow_forward, size: 12, color: AppColors.textFaint),
        ),
        step('Collected', collected, AppColors.success),
        const Padding(
          padding: EdgeInsets.only(top: 14, left: 2, right: 2),
          child: Icon(Icons.arrow_forward, size: 12, color: AppColors.textFaint),
        ),
        step(
          'Outstanding',
          outstanding,
          outstanding > 0 ? AppColors.warning : AppColors.textMuted,
        ),
      ],
    );
  }
}

class _CollectionStatusChip extends StatelessWidget {
  const _CollectionStatusChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppTheme.pillRadius),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        label,
        style: AppTypography.badgeSmall.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
          fontSize: 10,
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bundled "all clear" — collapses empty expiry / overdue / stock cards
// ═══════════════════════════════════════════════════════════════════════════════

class _HealthClearItem {
  const _HealthClearItem({required this.summary, required this.detail});
  final String summary;
  final String detail;
}

class _DashboardAllClearCard extends StatefulWidget {
  const _DashboardAllClearCard({required this.items});
  final List<_HealthClearItem> items;

  @override
  State<_DashboardAllClearCard> createState() => _DashboardAllClearCardState();
}

class _DashboardAllClearCardState extends State<_DashboardAllClearCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final summary = widget.items.map((i) => i.summary).join(' · ');

    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Material(
            color: AppColors.success.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: () => setState(() => _expanded = !_expanded),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.check_circle_outline,
                      size: 18,
                      color: AppColors.success,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '✓ $summary',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.success,
                          height: 1.35,
                        ),
                      ),
                    ),
                    Icon(
                      _expanded ? Icons.expand_less : Icons.expand_more,
                      size: 20,
                      color: AppColors.success,
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (_expanded) ...[
            const Divider(height: 1, color: AppColors.border),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var i = 0; i < widget.items.length; i++) ...[
                    if (i > 0) const SizedBox(height: 8),
                    _AllClearDetailRow(item: widget.items[i]),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AllClearDetailRow extends StatelessWidget {
  const _AllClearDetailRow({required this.item});
  final _HealthClearItem item;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 2),
          child: Icon(Icons.check, size: 14, color: AppColors.success),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.summary,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.text,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                item.detail,
                style: AppTypography.caption.copyWith(
                  color: AppColors.textMuted,
                  fontSize: 11,
                  height: 1.3,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Overdue Aging Card
// ═══════════════════════════════════════════════════════════════════════════════

class _OverdueAgingCard extends StatelessWidget {
  const _OverdueAgingCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    Map<String, dynamic> _bucket(String key) =>
        data[key] is Map ? Map<String, dynamic>.from(data[key] as Map) : <String, dynamic>{};

    final b0_30   = _bucket('bucket_0_30');
    final b31_60  = _bucket('bucket_31_60');
    final b61_90  = _bucket('bucket_61_90');
    final b90plus = _bucket('bucket_90_plus');

    final totalAging = (pickNum(b0_30['amount'])   ?? 0).toDouble()
        + (pickNum(b31_60['amount'])  ?? 0).toDouble()
        + (pickNum(b61_90['amount'])  ?? 0).toDouble()
        + (pickNum(b90plus['amount']) ?? 0).toDouble();

    final buckets = [
      (label: '0–30 days',  d: b0_30,   color: AppColors.warning),
      (label: '31–60 days', d: b31_60,  color: AppColors.warningDark),
      (label: '61–90 days', d: b61_90,  color: AppColors.danger),
      (label: '90+ days',   d: b90plus, color: AppColors.dangerDark),
    ];

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 22, height: 22,
            decoration: BoxDecoration(color: AppColors.dangerLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm)),
            child: const Icon(AppIcons.overdue, size: 11, color: AppColors.danger)),
          const SizedBox(width: 6),
          const Expanded(child: Text('Overdue aging', style: AppTypography.cardTitle)),
          GestureDetector(
            onTap: () => context.go('/reports/ledger?tab=customer'),
            child: Text('Ledger →',
              style: AppTypography.secondary.copyWith(
                color: AppColors.primary, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: AppSpacing.xs),
        if (totalAging == 0)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text(
              'No overdue receivables. All invoices are within due date.',
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ),
        if (totalAging > 0) ...buckets.map((b) {
          final amt   = (pickNum(b.d['amount']) ?? 0).toDouble();
          final count = (pickNum(b.d['count'])  ?? 0).toInt();
          final pct   = totalAging > 0 ? amt / totalAging : 0.0;
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(b.label, style: AppTypography.secondary)),
                Text('$count inv', style: AppTypography.secondary),
                const SizedBox(width: 8),
                DashboardAmountText(amt,
                  style: AppTypography.labelSemibold.copyWith(fontSize: 12, color: b.color)),
              ]),
              const SizedBox(height: 3),
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: pct.clamp(0.0, 1.0),
                  minHeight: 4,
                  backgroundColor: AppColors.surface,
                  valueColor: AlwaysStoppedAnimation<Color>(b.color),
                ),
              ),
            ]),
          );
        }),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Expiry value at risk — full card only when ₹ at risk; compact OK line otherwise
// ═══════════════════════════════════════════════════════════════════════════════

class _ExpiryValueAtRiskCard extends StatelessWidget {
  const _ExpiryValueAtRiskCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final v30 = (pickNum(data['value_30d']) ?? 0).toDouble();
    final v60 = (pickNum(data['value_60d']) ?? 0).toDouble();
    final v90 = (pickNum(data['value_90d']) ?? 0).toDouble();
    final b30 = (pickNum(data['batches_30d']) ?? 0).toInt();
    final b60 = (pickNum(data['batches_60d']) ?? 0).toInt();

    final rows = <Widget>[];
    if (v30 > 0) {
      rows.add(_ExpiryRiskRow(
        label: 'Within 30 days',
        value: v30,
        batches: b30,
        color: AppColors.danger,
      ));
    }
    if (v60 > 0) {
      if (rows.isNotEmpty) rows.add(const SizedBox(height: 4));
      rows.add(_ExpiryRiskRow(
        label: 'Within 60 days',
        value: v60,
        batches: b60,
        color: AppColors.warning,
      ));
    }
    if (v90 > 0) {
      if (rows.isNotEmpty) rows.add(const SizedBox(height: 4));
      rows.add(_ExpiryRiskRow(
        label: 'Within 90 days',
        value: v90,
        batches: 0,
        color: AppColors.textMuted,
      ));
    }

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: AppColors.dangerLight,
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              ),
              child: const Icon(AppIcons.expiry, size: 11, color: AppColors.danger),
            ),
            const SizedBox(width: 6),
            const Expanded(
              child: Text(
                'Expiry value at risk',
                style: AppTypography.cardTitle,
              ),
            ),
            GestureDetector(
              onTap: () => context.go('/quality-master'),
              child: Text(
                'Batches →',
                style: AppTypography.secondary.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ]),
          if (rows.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            ...rows,
          ],
        ],
      ),
    );
  }
}

class _ExpiryRiskRow extends StatelessWidget {
  const _ExpiryRiskRow({
    required this.label,
    required this.value,
    required this.batches,
    required this.color,
  });
  final String label;
  final double value;
  final int batches;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Container(width: 7, height: 7,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
      const SizedBox(width: 6),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: AppTypography.secondary),
        if (batches > 0)
          Text('$batches batches',
            style: AppTypography.secondary.copyWith(fontSize: 10, color: AppColors.textFaint)),
      ])),
      DashboardAmountText(value,
        style: AppTypography.labelSemibold.copyWith(fontSize: 12, color: color)),
    ]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Non-Moving Stock Value Card
// ═══════════════════════════════════════════════════════════════════════════════

class _NonMovingValueCard extends StatelessWidget {
  const _NonMovingValueCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final count = (pickNum(data['count']) ?? 0).toInt();
    final value = (pickNum(data['value']) ?? 0).toDouble();

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 22, height: 22,
            decoration: BoxDecoration(color: AppColors.warningLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm)),
            child: const Icon(AppIcons.packageOos, size: 11, color: AppColors.warning)),
          const SizedBox(width: 6),
          const Expanded(child: Text('Non-moving stock', style: AppTypography.cardTitle)),
          GestureDetector(
            onTap: () => context.go('/reports/inventory?tab=non-moving'),
            child: Text('Report →',
              style: AppTypography.secondary.copyWith(
                color: AppColors.primary, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: AppSpacing.sm),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: DashboardAmountText(value,
            style: const TextStyle(
              fontSize: 22, fontWeight: FontWeight.w700,
              color: AppColors.warning, height: 1.1,
              fontFeatures: [FontFeature.tabularFigures()],
            )),
        ),
        const SizedBox(height: 4),
        Text('$count batches not sold in 90+ days',
          style: AppTypography.secondary),
        const SizedBox(height: 4),
        Text('Capital locked in slow-moving inventory.',
          style: AppTypography.secondary.copyWith(
            fontSize: 10, color: AppColors.textFaint)),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stock Coverage Days Card
// ═══════════════════════════════════════════════════════════════════════════════

class _StockCoverageCard extends StatelessWidget {
  const _StockCoverageCard({required this.rows});
  final List<Map<String, dynamic>> rows;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 22, height: 22,
            decoration: BoxDecoration(color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm)),
            child: const Icon(AppIcons.stock, size: 11, color: AppColors.primary)),
          const SizedBox(width: 6),
          const Expanded(child: Text('Stock coverage days', style: AppTypography.cardTitle)),
          GestureDetector(
            onTap: () => context.go('/products'),
            child: Text('Products →',
              style: AppTypography.secondary.copyWith(
                color: AppColors.primary, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: AppSpacing.xs),
        ...rows.take(6).map((r) {
          final name     = (r['product_name'] ?? '—').toString();
          final stock    = (pickNum(r['total_stock']) ?? 0).toDouble();
          final days     = (pickNum(r['coverage_days']) ?? 0).toInt();
          final dayColor = days <= 7 ? AppColors.danger
              : days <= 30 ? AppColors.warning
              : AppColors.success;
          return Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Row(children: [
              Expanded(child: Text(name, style: AppTypography.body,
                overflow: TextOverflow.ellipsis, maxLines: 1)),
              const SizedBox(width: 8),
              Text('${stock.toInt()} units',
                style: AppTypography.secondary.copyWith(fontSize: 11)),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: dayColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(AppTheme.pillRadius),
                  border: Border.all(color: dayColor.withOpacity(0.3)),
                ),
                child: Text('${days}d',
                  style: AppTypography.badgeSmall.copyWith(
                    color: dayColor, fontWeight: FontWeight.w600)),
              ),
            ]),
          );
        }),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Purchase-to-Sales Ratio Card
// ═══════════════════════════════════════════════════════════════════════════════

class _PurchaseToSalesRatioCard extends StatelessWidget {
  const _PurchaseToSalesRatioCard({
    required this.ratio,
    // Kept for hot-reload compatibility (KPIs shown in key metrics row).
    this.sales,
    this.purchases,
    this.profit,
  });
  final int ratio;
  final num? sales;
  final num? purchases;
  final num? profit;

  @override
  Widget build(BuildContext context) {
    final barColor = ratio < 70
        ? AppColors.success
        : ratio <= 85
            ? AppColors.warning
            : AppColors.danger;
    final marginBadge = ratio < 70
        ? 'Healthy margin'
        : ratio <= 85
            ? 'Moderate margin'
            : 'Tight margin';

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: _dashHeaderIcon,
                height: _dashHeaderIcon,
                decoration: BoxDecoration(
                  color: barColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                ),
                child: Icon(AppIcons.trendUp, size: 12, color: barColor),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Purchase / sales',
                  style: AppTypography.cardTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: barColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppTheme.pillRadius),
                  border: Border.all(color: barColor.withValues(alpha: 0.3)),
                ),
                child: Text(
                  marginBadge,
                  style: AppTypography.badgeSmall.copyWith(
                    color: barColor,
                    fontWeight: FontWeight.w700,
                    fontSize: 10,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              GestureDetector(
                onTap: () => context.go('/reports/day-book'),
                child: Text(
                  'Day Book →',
                  style: AppTypography.secondary.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                    fontSize: 11,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            '₹$ratio spent per ₹100 sold',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.text,
              height: 1.25,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: (ratio / 100).clamp(0.0, 1.0),
              minHeight: 4,
              backgroundColor: AppColors.surface,
              valueColor: AlwaysStoppedAnimation<Color>(barColor),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Industry benchmark: under 70% is healthy',
            style: AppTypography.caption.copyWith(
              fontSize: 10,
              color: AppColors.textFaint,
              height: 1.3,
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Key metrics — profit hero on top, sales + purchases compact below with ▲▼ %
// ═══════════════════════════════════════════════════════════════════════════════

class _KeyMetricsSummaryRow extends StatelessWidget {
  const _KeyMetricsSummaryRow({
    required this.sales,
    required this.purchases,
    required this.profit,
    required this.salesLabel,
    required this.comparePeriodLabel,
    this.salesDeltaPct,
    this.purchaseDeltaPct,
    this.profitDeltaPct,
    this.receivables,
    this.payables,
  });
  final num sales;
  final num purchases;
  final num? profit;
  final String salesLabel;
  final String comparePeriodLabel;
  final double? salesDeltaPct;
  final double? purchaseDeltaPct;
  final double? profitDeltaPct;
  final num? receivables;
  final num? payables;

  @override
  Widget build(BuildContext context) {
    final hasProfit = profit != null;
    final profitVal = profit ?? 0;
    final profitPositive = profitVal >= 0;
    final profitColor =
        profitPositive ? AppColors.success : AppColors.danger;
    final hasReceivables = (receivables ?? 0) > 0;
    final hasPayables = (payables ?? 0) > 0;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D000000),
            blurRadius: 4,
            offset: Offset(0, 1),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (hasProfit) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              decoration: BoxDecoration(
                color: profitColor.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: profitColor.withValues(alpha: 0.2)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Gross profit',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textMuted,
                      letterSpacing: 0.2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: DashboardAmountText(
                      profitVal,
                      prefix: profitPositive && profitVal != 0 ? '+' : '',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: profitColor,
                        height: 1.05,
                        letterSpacing: -0.5,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  _MetricComparisonLine(
                    deltaPct: profitDeltaPct,
                    periodLabel: comparePeriodLabel,
                    invertColors: false,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
          ],
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _CompactSummaryMetric(
                  label: salesLabel,
                  value: sales,
                  color: AppColors.primary,
                  deltaPct: salesDeltaPct,
                  compareHint: comparePeriodLabel,
                  invertDeltaColors: false,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _CompactSummaryMetric(
                  label: 'Purchases',
                  value: purchases,
                  color: AppColors.primaryMid,
                  deltaPct: purchaseDeltaPct,
                  compareHint: comparePeriodLabel,
                  invertDeltaColors: true,
                ),
              ),
            ],
          ),
          if (hasReceivables || hasPayables) ...[
            const SizedBox(height: 10),
            const Divider(height: 1, color: AppColors.border),
            const SizedBox(height: 10),
            Wrap(
              spacing: 16,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (hasReceivables)
                  _SummaryChip(
                    label: 'Receivables',
                    amount: receivables!,
                    color: AppColors.kpiReceivablesAccent,
                  ),
                if (hasPayables)
                  _SummaryChip(
                    label: 'Payables',
                    amount: payables!,
                    color: AppColors.kpiPayablesAccent,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Inline comparison under a metric: `▲ 12% vs last month` (green = better).
class _MetricComparisonLine extends StatelessWidget {
  const _MetricComparisonLine({
    required this.periodLabel,
    this.deltaPct,
    this.invertColors = false,
  });
  final double? deltaPct;
  final String periodLabel;
  final bool invertColors;

  @override
  Widget build(BuildContext context) {
    if (deltaPct == null) {
      return Text(
        'No $periodLabel data yet',
        style: AppTypography.caption.copyWith(
          color: AppColors.textFaint,
          fontSize: 11,
          fontWeight: FontWeight.w500,
        ),
      );
    }

    final up = deltaPct! >= 0;
    final positive = invertColors ? !up : up;
    final color = positive ? AppColors.success : AppColors.danger;
    final pctText = deltaPct!.abs() >= 100
        ? deltaPct!.abs().round().toString()
        : deltaPct!.abs().toStringAsFixed(1);

    return Text(
      '${up ? '▲' : '▼'} $pctText% $periodLabel',
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: color,
        height: 1.25,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
  }
}

class _CompactSummaryMetric extends StatelessWidget {
  const _CompactSummaryMetric({
    required this.label,
    required this.value,
    required this.color,
    this.deltaPct,
    this.compareHint,
    this.invertDeltaColors = false,
  });
  final String label;
  final num value;
  final Color color;
  final double? deltaPct;
  final String? compareHint;
  final bool invertDeltaColors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: AppColors.textMuted,
              height: 1.25,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: DashboardAmountText(
              value,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: color,
                height: 1.1,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
          const SizedBox(height: 6),
          _MetricComparisonLine(
            deltaPct: deltaPct,
            periodLabel: compareHint ?? 'vs last month',
            invertColors: invertDeltaColors,
          ),
        ],
      ),
    );
  }
}

class _SummaryChip extends StatelessWidget {
    const _SummaryChip({
      required this.label,
      required this.amount,
      required this.color,
    });
    final String label;
    final num amount;
    final Color color;

    @override
    Widget build(BuildContext context) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.textMuted,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(width: 4),
          DashboardAmountText(
            amount,
            style: TextStyle(
              fontSize: 11,
              color: color,
              fontWeight: FontWeight.w600,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      );
    }
  }

// ═══════════════════════════════════════════════════════════════════════════════
// Big New Sale Button — prominent CTA at the top of Quick Actions
// ═══════════════════════════════════════════════════════════════════════════════

class _BigNewSaleButton extends StatefulWidget {
    const _BigNewSaleButton({required this.onTap});
    final VoidCallback onTap;
  
    @override
    State<_BigNewSaleButton> createState() => _BigNewSaleButtonState();
  }
  
class _BigNewSaleButtonState extends State<_BigNewSaleButton> {
    bool _pressed = false;
  
    @override
    Widget build(BuildContext context) {
      return GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) { setState(() => _pressed = false); widget.onTap(); },
        onTapCancel: () => setState(() => _pressed = false),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 80),
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 15),
          decoration: BoxDecoration(
            color: _pressed ? AppColors.primaryDark : AppColors.primary,
            borderRadius: BorderRadius.circular(12),
            boxShadow: _pressed ? null : [
              BoxShadow(
                color: AppColors.primary.withOpacity(0.35),
                blurRadius: 8,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Icon(AppIcons.invoice, size: 18, color: Colors.white),
            const SizedBox(width: 8),
            const Text(
              'New Sale',
              style: TextStyle(
                fontSize: 16, fontWeight: FontWeight.w700,
                color: Colors.white, letterSpacing: 0.2,
              ),
            ),
          ]),
        ),
      );
    }
  }
