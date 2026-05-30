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
    final alerts        = widgetList(_data, ['alerts']);

    final salesKpi       = dashboardSalesKpi(kpis, isTodayPreset: _preset == 'TODAY');
    final salesLabel     = dashboardSalesKpiLabel(isTodayPreset: _preset == 'TODAY');
    // Purchases: use range total for period presets, today total for TODAY preset
    final purchaseKpi    = _preset == 'TODAY'
        ? (kpiValue(kpis, 'today_purchases') ?? 0)
        : (kpiValue(kpis, 'range_purchases') ?? kpiValue(kpis, 'today_purchases') ?? 0);
    // Receivables & Payables: total outstanding (balance sheet items, not date-filtered)
    final receivablesKpi = kpiValue(kpis, 'receivables');
    final payablesKpi    = kpiValue(kpis, 'payables');
    // Gross profit: period sales − period purchases (null when sales permission missing)
    final profitKpi      = kpiValue(kpis, 'gross_profit') ?? kpiValue(kpis, 'net_profit');
    final gstKpi         = kpiValue(kpis, 'gst_collected') ?? kpiValue(kpis, 'gst_payable');

    final topProducts   = widgetList(_data, ['top_products',  'topProducts']);
    final topCustomers  = widgetList(_data, ['top_customers', 'topCustomers']);
    final topVendors    = widgetList(_data, ['top_vendors', 'topVendors', 'top_suppliers', 'topSuppliers']);
    final topMfg        = widgetList(_data, ['top_mfg', 'topMfg', 'top_manufacturers', 'topManufacturers']);
    final paymentModes  = widgetList(_data, ['payment_modes',  'paymentModes']);
    final lowStock      = widgetList(_data, ['low_stock',      'lowStock']);
    final expiryAlerts  = widgetList(_data, ['expiry_alerts',  'expiryAlerts']);
    final divisionSales = widgetList(_data, ['division_sales', 'divisionSales']);
    final gstSummary    = _data?['widgets'] is Map
        ? (_data!['widgets'] as Map)['gst_summary']    ?? (_data!['widgets'] as Map)['gstSummary']
        : null;
    final profitSummary = _data?['widgets'] is Map
        ? (_data!['widgets'] as Map)['profit_summary'] ?? (_data!['widgets'] as Map)['profitSummary']
        : null;

    final hasAlerts   = alerts.isNotEmpty || lowStock.isNotEmpty || expiryAlerts.isNotEmpty;
    final hasInsights = topProducts.isNotEmpty  || topCustomers.isNotEmpty ||
                        topVendors.isNotEmpty   || topMfg.isNotEmpty       ||
                        paymentModes.isNotEmpty || divisionSales.isNotEmpty;
    final hasProfit   = profitSummary != null || profitKpi != null;
    final hasGst      = gstSummary != null;

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
    // Cash flow card: show whenever there are any sales or purchases in the period
    final hasCashFlow         = (salesKpi ?? 0) > 0 || (purchaseKpi ?? 0) > 0 || (receivablesKpi ?? 0) > 0 || (payablesKpi ?? 0) > 0;
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
    final topMfgData = widgetList(_data, ['top_manufacturers', 'topManufacturers']);
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

    // Always show new analytics sections — display empty/zero state when the
    // backend hasn't returned data yet so every section is always visible.
    const hasPendingOrders   = true;
    // MoM: only show when there is actual comparison data to avoid empty card
    final hasMom = momData != null &&
        ((pickNum(momData['current_period']) ?? 0) > 0 ||
         (pickNum(momData['last_month']) ?? 0) > 0 ||
         (pickNum(momData['same_month_last_year']) ?? 0) > 0);
    const hasOverdueAging    = true;
    final hasTopMfgData      = topMfgData.isNotEmpty;
    const hasInvoicePayStatus = true;
    const hasExpiryRisk      = true;
    const hasNonMovingVal    = true;
    const hasStockCoverage   = true;

    // Purchase-to-sales ratio (derived from existing KPIs)
    final salesVal    = (kpiValue(kpis, 'range_sales')    ?? kpiValue(kpis, 'today_sales')    ?? 0).toDouble();
    final purchaseVal = (kpiValue(kpis, 'range_purchases') ?? kpiValue(kpis, 'today_purchases') ?? 0).toDouble();
    final purchaseToSalesRatio = salesVal > 0 ? (purchaseVal / salesVal * 100).round() : null;

    final canSale = can(auth, 'SALES_INVOICES', 'ADD');

    return AppShell(
      title: 'Dashboard',
      bottomBar: AppBottomActionBar(
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
                message: resp.parseErrorMessage().isNotEmpty
                    ? resp.parseErrorMessage()
                    : 'No product found for barcode "$code"',
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
                          profit: profitKpi,
                          salesLabel: salesLabel,
                          receivables: receivablesKpi,
                          payables: payablesKpi,
                        ),

                        // ── Alerts — most urgent, shown first ────────────────────
                        if (hasAlerts) ...[
                          const SizedBox(height: _sectionGap),
                          _UnifiedAlertsCard(
                            alerts: alerts,
                            lowStock: lowStock,
                            expiryAlerts: expiryAlerts,
                          ),
                        ],

                        // ── Quick actions — big New Sale + grid ──────────────────
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

                        // ── Recent activity — moved up for daily use ─────────────
                        const SizedBox(height: _sectionGap),
                        _RecentTransactionsSection(
                          controller: _tabController,
                          recentItems: _recentItems,
                        ),

                        // ── Cash flow — daily check ──────────────────────────────
                        if (hasCashFlow) ...[
                          const SizedBox(height: _sectionGap),
                          const _DashSectionLabel(title: 'Cash flow', icon: AppIcons.wallet),
                          const SizedBox(height: _cardGap),
                          _CashFlowCard(
                            cashIn: salesKpi ?? 0,
                            cashOut: purchaseKpi ?? 0,
                            receivables: receivablesKpi ?? 0,
                            payables: payablesKpi ?? 0,
                          ),
                        ],

                        // ── Analytics ────────────────────────────────────────────
                        const SizedBox(height: _sectionGap),
                        const _DashSectionLabel(title: 'Analytics', icon: AppIcons.trendUp),
                        const SizedBox(height: _cardGap),
                        RepaintBoundary(
                          child: _SalesPurchaseChart(
                            salesData: salesTrend,
                            purchaseData: purchaseTrend,
                          ),
                        ),
                        if (hasProfit || hasGst) ...[
                          const SizedBox(height: _cardGap),
                          if (hasProfit && hasGst)
                            _DashSideBySide(children: [
                              _ProfitSummaryCard(
                                kpis: kpis,
                                summary: profitSummary is Map
                                    ? Map<String, dynamic>.from(profitSummary as Map) : null),
                              _GstSummaryCard(
                                kpis: kpis,
                                summary: gstSummary is Map
                                    ? Map<String, dynamic>.from(gstSummary as Map) : null),
                            ])
                          else if (hasProfit)
                            _ProfitSummaryCard(
                              kpis: kpis,
                              summary: profitSummary is Map
                                  ? Map<String, dynamic>.from(profitSummary as Map) : null)
                          else
                            _GstSummaryCard(
                              kpis: kpis,
                              summary: gstSummary is Map
                                  ? Map<String, dynamic>.from(gstSummary as Map) : null),
                        ],

                        // ── Performance (MoM + Collection) ───────────────────────
                        if (hasMom || hasInvoicePayStatus) ...[
                          const SizedBox(height: _sectionGap),
                          const _DashSectionLabel(title: 'Performance', icon: AppIcons.trendUp),
                          const SizedBox(height: _cardGap),
                          if (hasMom && hasInvoicePayStatus)
                            _DashSideBySide(children: [
                              _MomComparisonCard(data: momData ?? {}),
                              _CollectionEfficiencyCard(data: invoicePayStatusData ?? {}),
                            ])
                          else if (hasMom)
                            _MomComparisonCard(data: momData ?? {})
                          else
                            _CollectionEfficiencyCard(data: invoicePayStatusData ?? {}),
                        ],

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
                            receivables: receivablesKpi ?? 0,
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

                        // ── Overdue Aging — weekly/monthly check ─────────────────
                        if (hasOverdueAging) ...[
                          const SizedBox(height: _cardGap),
                          _OverdueAgingCard(data: overdueAgingData ?? {}),
                        ],

                        // ── Top Manufacturers ────────────────────────────────────
                        if (hasTopMfgData) ...[
                          const SizedBox(height: _cardGap),
                          _TopListCard(
                            title: 'Top manufacturers',
                            icon: AppIcons.company,
                            iconBg: const Color(0xFFF0F4FF),
                            iconColor: AppColors.primaryDark,
                            barColor: AppColors.primaryDark,
                            rows: topMfgData,
                            labelKey: const ['mfg_name', 'mfgName', 'name'],
                            valueExtractor: (r) => (pickNum(r['total'] ?? r['amount']) ?? 0).toDouble(),
                            onViewAll: () => context.go('/mfg-companies'),
                          ),
                        ],

                        // ── Expiry Risk + Non-Moving Value ───────────────────────
                        if (hasExpiryRisk || hasNonMovingVal) ...[
                          const SizedBox(height: _cardGap),
                          if (hasExpiryRisk && hasNonMovingVal)
                            _DashSideBySide(children: [
                              _ExpiryValueAtRiskCard(data: expiryRiskData ?? {}),
                              _NonMovingValueCard(data: nonMovingValData ?? {}),
                            ])
                          else if (hasExpiryRisk)
                            _ExpiryValueAtRiskCard(data: expiryRiskData ?? {})
                          else
                            _NonMovingValueCard(data: nonMovingValData ?? {}),
                        ],

                        // ── Stock Coverage Days ──────────────────────────────────
                        if (hasStockCoverage) ...[
                          const SizedBox(height: _cardGap),
                          _StockCoverageCard(rows: stockCoverageData),
                        ],

                        // ── Purchase-to-Sales Ratio ──────────────────────────────
                        const SizedBox(height: _cardGap),
                        _PurchaseToSalesRatioCard(
                          ratio: purchaseToSalesRatio ?? 0,
                          sales: salesVal,
                          purchases: purchaseVal,
                          grossProfit: (kpiValue(kpis, 'gross_profit') ?? 0).toDouble(),
                        ),

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
                            divisionSales: divisionSales,
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
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: _dashHeaderIcon,
          height: _dashHeaderIcon,
          decoration: BoxDecoration(
            color: AppColors.primaryLight,
            borderRadius: BorderRadius.circular(AppTheme.radiusSm),
          ),
          child: Icon(icon, size: 12, color: AppColors.primary),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            title.toUpperCase(),
            style: AppTypography.overline.copyWith(
              color: AppColors.textMuted,
              letterSpacing: 0.8,
              height: 1.2,
            ),
          ),
        ),
      ],
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
                  child: Text(
                    fmtCurrency(amount),
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
// Unified Alerts Card
// ═══════════════════════════════════════════════════════════════════════════════

class _UnifiedAlertsCard extends StatelessWidget {
  const _UnifiedAlertsCard({
    required this.alerts,
    required this.lowStock,
    required this.expiryAlerts,
  });
  final List<Map<String, dynamic>> alerts;
  final List<Map<String, dynamic>> lowStock;
  final List<Map<String, dynamic>> expiryAlerts;

  @override
  Widget build(BuildContext context) {
    final hasAlerts = alerts.isNotEmpty;
    final hasStock  = lowStock.isNotEmpty;
    final hasExpiry = expiryAlerts.isNotEmpty;

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
            if (hasStock)
              _AlertPill(
                label: '${lowStock.length} low stock',
                color: AppColors.warning,
                onTap: () => context.go('/products'),
              ),
            if (hasExpiry) ...[
              const SizedBox(width: 5),
              _AlertPill(
                label: '${expiryAlerts.length} expiring',
                color: AppColors.danger,
                onTap: () => context.go('/products'),
              ),
            ],
          ]),
        ),
        if (hasAlerts) ...[
          const Divider(height: 1, color: AppColors.border),
          ...alerts.take(4).map((a) => _CompactAlertRow(alert: a)),
        ],
        if (hasStock || hasExpiry) ...[
          if (hasAlerts) const Divider(height: 1, color: AppColors.border),
          if (hasStock)
            _StockSummaryRow(
              icon: AppIcons.stock,
              color: AppColors.warning,
              label: '${lowStock.length} products low on stock',
              detail: lowStock.take(2)
                  .map((r) => (r['product_name'] ?? r['productName'] ?? r['name'] ?? '').toString())
                  .where((s) => s.isNotEmpty).join(', '),
              onTap: () => context.go('/products'),
            ),
          if (hasExpiry)
            _StockSummaryRow(
              icon: AppIcons.alert,
              color: AppColors.danger,
              label: '${expiryAlerts.length} batches expiring soon',
              detail: expiryAlerts.take(2)
                  .map((r) => (r['product_name'] ?? r['productName'] ?? r['name'] ?? '').toString())
                  .where((s) => s.isNotEmpty).join(', '),
              onTap: () => context.go('/products'),
            ),
        ],
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
    if (badge.contains('low') || kind.contains('stock') || severity == 'orange') {
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
    if (retailer)
      actions.add(const _QuickActionData(label: 'My orders', icon: AppIcons.orders,
        color: AppColors.warning, route: '/my-orders', push: false));
    if (can(auth, 'REPORTS', 'VIEW'))
      actions.add(const _QuickActionData(label: 'Reports', icon: AppIcons.reports,
        color: AppColors.primaryDark, route: '/reports/day-book', push: false));
    // 6th action — ensures 2×3 grid with no orphan row
    actions.add(const _QuickActionData(label: 'Products', icon: AppIcons.products,
      color: Color(0xFF14B8A6), route: '/products', push: false));

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
    final salesPts    = _toSpots(salesData);
    final purchasePts = _toSpots(purchaseData);
    final hasSales    = salesPts.any((p) => p.y > 0);
    final hasPurchase = purchasePts.any((p) => p.y > 0);
    final hasData     = hasSales || hasPurchase;
    final allY        = [...salesPts, ...purchasePts].map((p) => p.y);
    final maxY        = allY.isEmpty ? 1.0 : allY.reduce((a, b) => a > b ? a : b);

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
                      touchTooltipData: LineTouchTooltipData(
                        getTooltipColor: (_) => AppColors.text,
                        tooltipRoundedRadius: AppTheme.radiusSm,
                        getTooltipItems: (spots) => spots.map((s) =>
                          LineTooltipItem(fmtCurrency(s.y),
                            AppTypography.badge.copyWith(color: Colors.white))).toList(),
                      ),
                    ),
                    lineBarsData: [
                      if (hasSales) LineChartBarData(
                        spots: salesPts, isCurved: true, color: AppColors.primary, barWidth: 2.5,
                        dotData: const FlDotData(show: false),
                        belowBarData: BarAreaData(show: true, gradient: LinearGradient(
                          begin: Alignment.topCenter, end: Alignment.bottomCenter,
                          colors: [AppColors.primary.withOpacity(0.12), AppColors.primary.withOpacity(0.0)],
                        )),
                      ),
                      if (hasPurchase) LineChartBarData(
                        spots: purchasePts, isCurved: true, color: AppColors.warning, barWidth: 2,
                        dashArray: [5, 3], dotData: const FlDotData(show: false),
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
      ]),
    );
  }

  static List<FlSpot> _toSpots(dynamic raw) {
    final rows = trendPoints(raw);
    if (rows.isEmpty) return [const FlSpot(0, 0), const FlSpot(1, 0)];
    return [for (var i = 0; i < rows.length; i++) FlSpot(i.toDouble(), trendY(rows[i]))];
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
    // Gross profit = period sales − period purchases (from backend calculation)
    final grossProfitRaw = kpiValue(kpis, 'gross_profit') ?? kpiValue(kpis, 'net_profit');
    final grossProfit    = (grossProfitRaw ?? 0).toDouble();
    // Revenue = period sales (range_sales for non-TODAY, today_sales for TODAY)
    final totalRevenue   = (kpiValue(kpis, 'range_sales') ?? kpiValue(kpis, 'today_sales') ?? 0).toDouble();
    // Period purchases (used as COGS proxy)
    final totalPurchases = (kpiValue(kpis, 'range_purchases') ?? kpiValue(kpis, 'today_purchases') ?? 0).toDouble();
    final totalCogs      = (kpiValue(kpis, 'total_cogs') ?? kpiValue(kpis, 'cogs') ?? totalPurchases).toDouble();
    final marginRaw      = summary?['profit_margin_pct'] ?? summary?['profitMarginPct'];
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
            'Purchases exceed sales this month',
            style: TextStyle(fontSize: 11, color: AppColors.textMuted),
          ),
        ],
        const SizedBox(height: AppSpacing.xs),
        _ProfitMetric(label: 'Revenue', value: fmtCurrency(totalRevenue), color: AppColors.primary),
        if (totalCogs > 0) ...[
          const SizedBox(height: 4),
          _ProfitMetric(label: 'Purchases', value: fmtCurrency(totalCogs), color: AppColors.textMuted),
        ],
        const SizedBox(height: 4),
        _ProfitMetric(
          label: 'Gross profit',
          value: grossProfitRaw != null ? fmtCurrency(grossProfit) : '—',
          color: grossProfitRaw != null
              ? (isPositive ? AppColors.success : AppColors.danger)
              : AppColors.textMuted,
        ),
      ]),
    );
  }
}

class _ProfitMetric extends StatelessWidget {
  const _ProfitMetric({required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
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
        Text(
          value,
          style: AppTypography.labelSemibold.copyWith(
            color: color,
            fontSize: 13,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
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
          _ProfitMetric(label: 'Collected', value: fmtCurrency(collected), color: AppColors.warning),
          const SizedBox(height: 4),
        ],
        if (payable > 0) ...[
          _ProfitMetric(label: 'Payable', value: fmtCurrency(payable), color: AppColors.danger),
          const SizedBox(height: 4),
        ],
        if (cgst > 0) ...[
          _ProfitMetric(label: 'CGST', value: fmtCurrency(cgst), color: AppColors.textMuted),
          const SizedBox(height: 4),
        ],
        if (sgst > 0) ...[
          _ProfitMetric(label: 'SGST', value: fmtCurrency(sgst), color: AppColors.textMuted),
          const SizedBox(height: 4),
        ],
        if (igst > 0)
          _ProfitMetric(label: 'IGST', value: fmtCurrency(igst), color: AppColors.textMuted),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Business Insights Grid — 2-column pairing
// ═══════════════════════════════════════════════════════════════════════════════

class _InsightsGrid extends StatelessWidget {
  const _InsightsGrid({
    required this.topProducts, required this.topCustomers,
    required this.topVendors,  required this.topMfg,
    required this.paymentModes, required this.divisionSales,
  });
  final List<Map<String, dynamic>> topProducts;
  final List<Map<String, dynamic>> topCustomers;
  final List<Map<String, dynamic>> topVendors;
  final List<Map<String, dynamic>> topMfg;
  final List<Map<String, dynamic>> paymentModes;
  final List<Map<String, dynamic>> divisionSales;

  Widget _pair(Widget left, Widget right) =>
      _DashSideBySide(children: [left, right]);

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];

    // Pair 1: products + customers
    if (topProducts.isNotEmpty && topCustomers.isNotEmpty) {
      rows.add(_pair(
        _TopListCard(title: 'Top products', icon: AppIcons.stock,
          iconBg: AppColors.primaryLight, iconColor: AppColors.primary,
          barColor: AppColors.primary, rows: topProducts,
          labelKey: const ['product_name', 'productName', 'name'],
          valueExtractor: (r) => (pickNum(r['total'] ?? r['amount']) ?? 0).toDouble(),
          subtitleExtractor: (r) { final q = r['qty_sold'] ?? r['qtySold'] ?? r['qty']; return q != null ? '$q units' : null; },
          onViewAll: () => context.go('/reports/inventory'), compact: true),
        _TopListCard(title: 'Top customers', icon: AppIcons.customers,
          iconBg: AppColors.successLight, iconColor: AppColors.success,
          barColor: AppColors.success, rows: topCustomers,
          labelKey: const ['customer_name', 'customerName', 'name'],
          valueExtractor: (r) => customerBilledAmount(r).toDouble(),
          subtitleExtractor: (r) { final d = pickNum(r['balance_due'] ?? r['balanceDue'] ?? r['outstanding']); return (d != null && d > 0) ? 'Due: ${fmtCurrency(d)}' : null; },
          onViewAll: () => context.go('/customers'), compact: true),
      ));
    } else if (topProducts.isNotEmpty) {
      rows.add(_TopListCard(title: 'Top selling products', icon: AppIcons.stock,
        iconBg: AppColors.primaryLight, iconColor: AppColors.primary,
        barColor: AppColors.primary, rows: topProducts,
        labelKey: const ['product_name', 'productName', 'name'],
        valueExtractor: (r) => (pickNum(r['total'] ?? r['amount']) ?? 0).toDouble(),
        subtitleExtractor: (r) { final q = r['qty_sold'] ?? r['qtySold'] ?? r['qty']; return q != null ? '$q units sold' : null; },
        onViewAll: () => context.go('/reports/inventory')));
    } else if (topCustomers.isNotEmpty) {
      rows.add(_TopListCard(title: 'Top customers', icon: AppIcons.customers,
        iconBg: AppColors.successLight, iconColor: AppColors.success,
        barColor: AppColors.success, rows: topCustomers,
        labelKey: const ['customer_name', 'customerName', 'name'],
        valueExtractor: (r) => customerBilledAmount(r).toDouble(),
        subtitleExtractor: (r) { final d = pickNum(r['balance_due'] ?? r['balanceDue'] ?? r['outstanding']); return (d != null && d > 0) ? 'Due: ${fmtCurrency(d)}' : null; },
        onViewAll: () => context.go('/customers')));
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
            labelKey: const ['mfg_company', 'mfgCompany', 'company_name', 'companyName', 'name'],
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
          labelKey: const ['mfg_company', 'mfgCompany', 'company_name', 'companyName', 'name'],
          valueExtractor: (r) => (pickNum(r['total'] ?? r['amount']) ?? 0).toDouble(),
          onViewAll: () => context.go('/mfg-companies')));
      }
    }

    // Pair 3: payment modes + division sales
    if (paymentModes.isNotEmpty || divisionSales.isNotEmpty) {
      if (rows.isNotEmpty) rows.add(const SizedBox(height: _cardGap));
      if (paymentModes.isNotEmpty && divisionSales.isNotEmpty) {
        rows.add(_pair(_PaymentModesCard(rows: paymentModes), _DivisionSalesCard(rows: divisionSales)));
      } else if (paymentModes.isNotEmpty) {
        rows.add(_PaymentModesCard(rows: paymentModes));
      } else {
        rows.add(_DivisionSalesCard(rows: divisionSales));
      }
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows);
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
    this.subtitleExtractor, this.onViewAll, this.maxItems = 5, this.compact = false,
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
  final VoidCallback? onViewAll;
  final int maxItems;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final capped = rows.length > maxItems ? rows.sublist(0, maxItems) : rows;
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
          String name = '—';
          for (final k in labelKey) {
            final v = r[k];
            if (v != null && v.toString().trim().isNotEmpty) {
              name = v.toString().trim();
              break;
            }
          }
          final val      = valueExtractor(r);
          final pct      = maxVal > 0 ? val / maxVal : 0.0;
          final subtitle = subtitleExtractor?.call(r);
          final amountStyle = AppTypography.labelSemibold.copyWith(
            fontSize: compact ? 12 : 13,
            fontFeatures: const [FontFeature.tabularFigures()],
          );

          return Padding(
            padding: EdgeInsets.only(bottom: compact ? 8 : AppSpacing.sm),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 18,
                  child: Text(
                    '${i + 1}',
                    style: AppTypography.secondary.copyWith(
                      fontWeight: FontWeight.w700,
                      fontSize: 11,
                      color: i == 0 ? barColor : AppColors.textMuted,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              name,
                              style: compact
                                  ? AppTypography.body.copyWith(fontSize: 12)
                                  : AppTypography.body,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            fmtCurrency(val),
                            style: amountStyle,
                            textAlign: TextAlign.end,
                            overflow: TextOverflow.ellipsis,
                            maxLines: 1,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(3),
                        child: LinearProgressIndicator(
                          value: pct.clamp(0.0, 1.0),
                          minHeight: compact ? 3 : 4,
                          backgroundColor: AppColors.surface,
                          valueColor: AlwaysStoppedAnimation<Color>(
                            i == 0 ? barColor : barColor.withOpacity(0.5),
                          ),
                        ),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 3),
                        Text(subtitle, style: AppTypography.secondary),
                      ],
                    ],
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
          Text(fmtCurrency(total), style: AppTypography.labelSemibold.copyWith(fontSize: 13)),
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
              SizedBox(width: 64, child: Text(fmtCurrency(amt),
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
// Payment Modes Card
// ═══════════════════════════════════════════════════════════════════════════════

class _PaymentModesCard extends StatelessWidget {
  const _PaymentModesCard({required this.rows});
  final List<Map<String, dynamic>> rows;

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

  @override
  Widget build(BuildContext context) {
    final total = rows.fold<double>(0, (s, r) => s + (pickNum(r['total']) ?? 0).toDouble());

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
          Text(
            fmtCurrency(total),
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
        ],
        ...rows.map((r) {
          final mode  = (r['mode'] ?? '—').toString();
          final amt   = (pickNum(r['total']) ?? 0).toDouble();
          final pct   = total > 0 ? amt / total : 0.0;
          final color = _modeColor(mode);
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: Text(
                    mode,
                    style: AppTypography.body,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
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
                  child: Text(
                    fmtCurrency(amt),
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
            Text(fmtCurrency(stockValue!),
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
            value: invoiceCount!.toInt().toString(),
            color: AppColors.primary,
          ),
        if (avgSale != null) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Avg. sale value',
            value: fmtCurrency(avgSale!),
            color: AppColors.primaryMid,
          ),
        ],
        if (salesReturns != null && salesReturns! > 0) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Sales returns',
            value: fmtCurrency(salesReturns!),
            color: AppColors.danger,
          ),
        ],
        if (purchaseReturns != null && purchaseReturns! > 0) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Purchase returns',
            value: fmtCurrency(purchaseReturns!),
            color: AppColors.warning,
          ),
        ],
        if (returnRate != null) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Return rate',
            value: '${returnRate.toStringAsFixed(1)}%',
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
    required this.receivables,
    required this.payables,
  });
  final num cashIn;
  final num cashOut;
  final num receivables;
  final num payables;

  @override
  Widget build(BuildContext context) {
    final total      = cashIn + cashOut;
    final inPct      = total > 0 ? cashIn / total : 0.5;
    final netFlow    = cashIn - cashOut;
    final isPositive = netFlow >= 0;
    final netColor   = isPositive ? AppColors.success : AppColors.danger;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Header row
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
              color: netColor,
            ),
          ),
          const SizedBox(width: 8),
          const Expanded(child: Text('Cash flow', style: AppTypography.cardTitle)),
        ]),
        const SizedBox(height: AppSpacing.sm),

        // ── Net flow — big prominent number ──────────────────────────────────
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                '${isPositive ? '+' : ''}${fmtCurrency(netFlow)}',
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: netColor,
                  height: 1.1,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: netColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(AppTheme.pillRadius),
            ),
            child: Text(
              isPositive ? 'Net positive' : 'Net negative',
              style: AppTypography.badgeSmall.copyWith(
                color: netColor,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ]),
        const SizedBox(height: AppSpacing.sm),

        // ── Cash in / out bar — proportional to actual values ─────────────────
        if (total > 0) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: SizedBox(height: 8, child: Row(children: [
              // Green segment: cashIn fraction of total (no opacity — full saturation)
              Expanded(
                flex: (inPct * 1000).round().clamp(1, 999),
                child: Container(color: AppColors.success),
              ),
              // Red segment: cashOut fraction — fully opaque so visual ratio is accurate
              Expanded(
                flex: ((1 - inPct) * 1000).round().clamp(1, 999),
                child: Container(color: AppColors.danger),
              ),
            ])),
          ),
          const SizedBox(height: AppSpacing.xs),
          Row(children: [
            _LegendDot(color: AppColors.success, label: 'Cash in'),
            const SizedBox(width: AppSpacing.sm),
            _LegendDot(color: AppColors.danger, label: 'Cash out'),
          ]),
          const SizedBox(height: AppSpacing.xs),
        ],

        // ── Supporting detail ─────────────────────────────────────────────────
        _ProfitMetric(label: 'Cash in (sales)', value: fmtCurrency(cashIn), color: AppColors.success),
        const SizedBox(height: 4),
        _ProfitMetric(label: 'Cash out (purchases)', value: fmtCurrency(cashOut), color: AppColors.danger),
        if (receivables > 0) ...[
          const SizedBox(height: 4),
          _ProfitMetric(label: 'Receivables', value: fmtCurrency(receivables), color: AppColors.warning),
        ],
        if (payables > 0) ...[
          const SizedBox(height: 4),
          _ProfitMetric(label: 'Payables', value: fmtCurrency(payables), color: AppColors.dangerMid),
        ],
      ]),
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
    required this.receivables,
    this.onTap,
  });
  final num? totalCustomers;
  final num? newCustomers;
  final num? avgOrderValue;
  final num receivables;
  final VoidCallback? onTap;

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
            value: totalCustomers!.toInt().toString(),
            color: AppColors.text,
          ),
        if (newCustomers != null) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'New this period',
            value: newCustomers!.toInt().toString(),
            color: AppColors.success,
          ),
        ],
        if (avgOrderValue != null) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Avg. order value',
            value: fmtCurrency(avgOrderValue!),
            color: AppColors.primaryMid,
          ),
        ],
        if (receivables > 0) ...[
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Outstanding dues',
            value: fmtCurrency(receivables),
            color: AppColors.warning,
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
          Text(fmtCurrency(value),
            style: AppTypography.labelSemibold.copyWith(fontSize: 12, color: color)),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Month-over-Month Comparison Card
// ═══════════════════════════════════════════════════════════════════════════════

class _MomComparisonCard extends StatelessWidget {
  const _MomComparisonCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final currentPeriod     = (pickNum(data['current_period'])       ?? 0).toDouble();
    final lastMonth         = (pickNum(data['last_month'])           ?? 0).toDouble();
    final sameMonthLastYear = (pickNum(data['same_month_last_year']) ?? 0).toDouble();
    final momDeltaPct       = data['mom_delta_pct'] is num ? (data['mom_delta_pct'] as num).toDouble() : null;
    final yoyDeltaPct       = data['yoy_delta_pct'] is num ? (data['yoy_delta_pct'] as num).toDouble() : null;

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
              color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            ),
            child: const Icon(AppIcons.dateRange, size: 12, color: AppColors.primary),
          ),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Month compare',
              style: AppTypography.cardTitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ]),
        const SizedBox(height: AppSpacing.sm),
        if (currentPeriod == 0 && lastMonth == 0 && sameMonthLastYear == 0)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text(
              'No comparison data yet. Sales will appear here once recorded.',
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          )
        else ...[
        _MomRow(label: 'Current period',       value: currentPeriod,     delta: null),
        const SizedBox(height: 6),
        _MomRow(label: 'Last month',           value: lastMonth,         delta: momDeltaPct),
        const SizedBox(height: 6),
        _MomRow(label: 'Same month last yr', value: sameMonthLastYear, delta: yoyDeltaPct),
        const SizedBox(height: AppSpacing.xs),
        GestureDetector(
          onTap: () => context.go('/reports/day-book'),
          child: Text(
            'Day Book →',
            style: AppTypography.secondary.copyWith(
              color: AppColors.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        ],
      ]),
    );
  }
}

class _MomRow extends StatelessWidget {
  const _MomRow({required this.label, required this.value, this.delta});
  final String label;
  final double value;
  final double? delta;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Text(
            label,
            style: AppTypography.secondary.copyWith(fontSize: 12),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(width: 8),
        Text(
          fmtCurrency(value),
          style: AppTypography.labelSemibold.copyWith(
            fontSize: 12,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
          textAlign: TextAlign.end,
        ),
        if (delta != null) ...[
          const SizedBox(width: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
            decoration: BoxDecoration(
              color: delta! >= 0 ? AppColors.successLight : AppColors.dangerLight,
              borderRadius: BorderRadius.circular(AppTheme.pillRadius),
            ),
            child: Text(
              '${delta! >= 0 ? '▲' : '▼'} ${delta!.abs().toStringAsFixed(1)}%',
              style: AppTypography.badgeSmall.copyWith(
                color: delta! >= 0 ? AppColors.success : AppColors.danger,
                fontWeight: FontWeight.w600,
                fontSize: 10,
              ),
            ),
          ),
        ],
      ],
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
    final paid           = (pickNum(data['paid'])            ?? 0).toInt();
    final partial        = (pickNum(data['partial'])         ?? 0).toInt();
    final unpaid         = (pickNum(data['unpaid'])          ?? 0).toInt();
    final totalBilled    = (pickNum(data['total_billed'])    ?? 0).toDouble();
    final totalCollected = (pickNum(data['total_collected']) ?? 0).toDouble();
    final collectionPct  = (pickNum(data['collection_pct']) ?? 0).toDouble();

    final isGood   = collectionPct >= 80;
    final isMid    = collectionPct >= 50;
    final pctColor = isGood ? AppColors.success : isMid ? AppColors.warning : AppColors.danger;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Header: shortened title + badge only — avoids overflow in half-width layout
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
          Container(
            width: _dashHeaderIcon,
            height: _dashHeaderIcon,
            decoration: BoxDecoration(
              color: isGood ? AppColors.successLight : AppColors.warningLight,
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
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: pctColor.withOpacity(0.1),
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
        ]),
        const SizedBox(height: AppSpacing.xs),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: (collectionPct / 100).clamp(0.0, 1.0),
            minHeight: 6,
            backgroundColor: AppColors.surface,
            valueColor: AlwaysStoppedAnimation<Color>(pctColor),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Row(children: [
          _CollStat(label: 'Paid',    count: paid,    color: AppColors.success),
          const SizedBox(width: 4),
          _CollStat(label: 'Partial', count: partial, color: AppColors.warning),
          const SizedBox(width: 4),
          _CollStat(label: 'Unpaid',  count: unpaid,  color: AppColors.danger),
        ]),
        const SizedBox(height: AppSpacing.xs),
        _ProfitMetric(label: 'Billed',    value: fmtCurrency(totalBilled),    color: AppColors.text),
        const SizedBox(height: 4),
        _ProfitMetric(label: 'Collected', value: fmtCurrency(totalCollected), color: AppColors.success),
        const SizedBox(height: AppSpacing.xs),
        GestureDetector(
          onTap: () => context.go('/customer-payments'),
          child: Text('Payments →',
            style: AppTypography.secondary.copyWith(
              color: AppColors.primary, fontWeight: FontWeight.w600)),
        ),
      ]),
    );
  }
}

class _CollStat extends StatelessWidget {
  const _CollStat({required this.label, required this.count, required this.color});
  final String label;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(child: Container(
      padding: const EdgeInsets.symmetric(vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.06),
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
      ),
      child: Column(children: [
        Text(count.toString(),
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: color)),
        Text(label, style: AppTypography.secondary.copyWith(fontSize: 10)),
      ]),
    ));
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
                Text(fmtCurrency(amt),
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
// Expiry Value at Risk Card
// ═══════════════════════════════════════════════════════════════════════════════

class _ExpiryValueAtRiskCard extends StatelessWidget {
  const _ExpiryValueAtRiskCard({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final v30  = (pickNum(data['value_30d']) ?? 0).toDouble();
    final v60  = (pickNum(data['value_60d']) ?? 0).toDouble();
    final v90  = (pickNum(data['value_90d']) ?? 0).toDouble();
    final b30  = (pickNum(data['batches_30d']) ?? 0).toInt();
    final b60  = (pickNum(data['batches_60d']) ?? 0).toInt();

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 22, height: 22,
            decoration: BoxDecoration(color: AppColors.dangerLight,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm)),
            child: const Icon(AppIcons.expiry, size: 11, color: AppColors.danger)),
          const SizedBox(width: 6),
          const Expanded(child: Text('Expiry value at risk', style: AppTypography.cardTitle)),
          GestureDetector(
            onTap: () => context.go('/quality-master'),
            child: Text('Batches →',
              style: AppTypography.secondary.copyWith(
                color: AppColors.primary, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: AppSpacing.xs),
        _ExpiryRiskRow(label: 'Within 30 days', value: v30, batches: b30, color: AppColors.danger),
        const SizedBox(height: 4),
        _ExpiryRiskRow(label: 'Within 60 days', value: v60, batches: b60, color: AppColors.warning),
        const SizedBox(height: 4),
        _ExpiryRiskRow(label: 'Within 90 days', value: v90, batches: 0,   color: AppColors.textMuted),
      ]),
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
      Text(fmtCurrency(value),
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
          child: Text(fmtCurrency(value),
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
        if (rows.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text(
              'No stock coverage data available yet.',
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
          ),
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
    required this.sales,
    required this.purchases,
    required this.grossProfit,
  });
  final int ratio;
  final double sales;
  final double purchases;
  final double grossProfit;

  @override
  Widget build(BuildContext context) {
    final noData   = sales == 0 && purchases == 0;
    final isHigh   = ratio > 90;
    final isLow    = ratio < 50;
    final barColor = noData
        ? AppColors.textMuted
        : isHigh ? AppColors.danger : isLow ? AppColors.success : AppColors.warning;
    final label    = noData
        ? 'No sales data yet'
        : isHigh ? '⚠ High cost ratio'
        : isLow  ? '✓ Healthy margin'
        : 'Moderate margin';

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 22, height: 22,
            decoration: BoxDecoration(
              color: barColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(AppTheme.radiusSm)),
            child: Icon(AppIcons.trendUp, size: 11, color: barColor)),
          const SizedBox(width: 6),
          const Expanded(child: Text('Purchase / sales ratio', style: AppTypography.cardTitle)),
          GestureDetector(
            onTap: () => context.go('/reports/day-book'),
            child: Text('Day Book →',
              style: AppTypography.secondary.copyWith(
                color: AppColors.primary, fontWeight: FontWeight.w600)),
          ),
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: barColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(AppTheme.pillRadius)),
            child: Text(noData ? '—' : '$ratio%',
              style: AppTypography.badgeSmall.copyWith(
                color: barColor, fontWeight: FontWeight.w700)),
          ),
        ]),
        const SizedBox(height: AppSpacing.xs),
        if (noData)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              'Record sales and purchases to see your cost ratio.',
              style: AppTypography.secondary,
            ),
          )
        else ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (ratio / 100).clamp(0.0, 1.0),
              minHeight: 8,
              backgroundColor: AppColors.surface,
              valueColor: AlwaysStoppedAnimation<Color>(barColor),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'For every ₹100 sold, ₹$ratio was spent on purchases. $label.',
            style: AppTypography.secondary,
          ),
          if (isHigh) ...[
            const SizedBox(height: 4),
            GestureDetector(
              onTap: () => context.go('/reports/day-book'),
              child: Text(
                'View Report →',
                style: AppTypography.secondary.copyWith(
                  color: AppColors.primary, fontWeight: FontWeight.w600),
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.xs),
          _ProfitMetric(label: 'Sales',        value: fmtCurrency(sales),       color: AppColors.primary),
          const SizedBox(height: 4),
          _ProfitMetric(label: 'Purchases',    value: fmtCurrency(purchases),   color: AppColors.textMuted),
          const SizedBox(height: 4),
          _ProfitMetric(
            label: 'Gross profit',
            value: fmtCurrency(grossProfit),
            color: grossProfit >= 0 ? AppColors.success : AppColors.danger,
          ),
          ],
        ]),
      );
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // Key Metrics Summary Row — 3 big numbers at the top of the dashboard
  // Shows Sales / Purchases / Gross Profit in a single glanceable card.
  // ═══════════════════════════════════════════════════════════════════════════════
  
  class _KeyMetricsSummaryRow extends StatelessWidget {
    const _KeyMetricsSummaryRow({
      required this.sales,
      required this.purchases,
      required this.profit,
      required this.salesLabel,
      this.receivables,
      this.payables,
    });
    final num sales;
    final num purchases;
    final num? profit;
    final String salesLabel;
    final num? receivables;
    final num? payables;
  
    @override
    Widget build(BuildContext context) {
      final hasProfit = profit != null;
      final profitPositive = (profit ?? 0) >= 0;
      final hasReceivables = (receivables ?? 0) > 0;
      final hasPayables    = (payables    ?? 0) > 0;
  
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
          boxShadow: const [BoxShadow(color: Color(0x0D000000), blurRadius: 4, offset: Offset(0, 1))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // ── Primary row: Sales / Purchases / Gross Profit ──────────────────
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SummaryMetric(
                  label: salesLabel,
                  value: sales,
                  color: AppColors.primary,
                ),
                _SummaryDivider(),
                _SummaryMetric(
                  label: 'Purchases',
                  value: purchases,
                  color: AppColors.primaryMid,
                ),
                if (hasProfit) ...[
                  _SummaryDivider(),
                  _SummaryMetric(
                    label: 'Gross profit',
                    value: profit!,
                    color: profitPositive ? AppColors.success : AppColors.danger,
                    prefix: profitPositive ? '+' : '',
                  ),
                ],
              ],
            ),
          ),
          // ── Secondary row: Receivables & Payables (only when non-zero) ─────
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
                    value: fmtCurrency(receivables!),
                    color: AppColors.kpiReceivablesAccent,
                  ),
                if (hasPayables)
                  _SummaryChip(
                    label: 'Payables',
                    value: fmtCurrency(payables!),
                    color: AppColors.kpiPayablesAccent,
                  ),
              ],
            ),
          ],
        ]),
      );
    }
  }
  
  class _SummaryMetric extends StatelessWidget {
    const _SummaryMetric({
      required this.label,
      required this.value,
      required this.color,
      this.prefix = '',
    });
    final String label;
    final num value;
    final Color color;
    final String prefix;
  
    @override
    Widget build(BuildContext context) {
      return Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              label,
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: AppColors.textMuted,
                letterSpacing: 0.2,
                height: 1.3,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                '$prefix${fmtCurrency(value)}',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: color,
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

  class _SummaryChip extends StatelessWidget {
    const _SummaryChip({
      required this.label,
      required this.value,
      required this.color,
    });
    final String label;
    final String value;
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
          Text(
            value,
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
  
  class _SummaryDivider extends StatelessWidget {
    @override
    Widget build(BuildContext context) {
      return Container(
        width: 1,
        margin: const EdgeInsets.symmetric(horizontal: 8),
        color: AppColors.border,
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
