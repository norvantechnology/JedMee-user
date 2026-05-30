import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/app_icons.dart';
import '../../core/export/export_columns.dart';
import '../../core/print/invoice_print_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/access.dart';
import '../../core/utils/api_data.dart';
import '../../core/utils/api_helpers.dart';
import '../../core/utils/barcode_lookup.dart';
import '../../core/utils/date.dart';
import '../../core/utils/format.dart';
import '../../core/utils/record_fields.dart';
import '../../providers/app_providers.dart';
import '../../providers/auth_controller.dart';
import '../../providers/branch_provider.dart';
import '../../core/pdf/pdf_service.dart';
import '../../widgets/app_bottom_nav.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/bulk_select_bar.dart';
import '../../core/theme/modal_animation_tokens.dart';
import '../../widgets/app_animated_modal.dart';
import '../../widgets/app_bottom_sheet.dart';
import '../../widgets/confirm_dialog.dart';
import '../../widgets/data_list_tile.dart';
import '../../widgets/barcode_scan_sheet.dart';
import '../../widgets/responsive.dart';
import '../../widgets/snackbar.dart';
import '../shared/master_ui.dart';
import '../shared/invoice_confirm_payment_dialog.dart';
import '../shared/invoice_payment_helpers.dart';
import '../shared/ongoing_bills_controller.dart';
import '../shared/ongoing_bills_rail.dart';
import '../shared/permission_gate.dart';
import '../shared/txn_detail_loader.dart';
import '../shared/txn_detail_ui.dart';
import '../shared/txn_list_widgets.dart';

const _kSalesPaymentModes = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'NEFT', 'OTHER'];

class SalesBillingScreen extends ConsumerStatefulWidget {
  const SalesBillingScreen({super.key});

  @override
  ConsumerState<SalesBillingScreen> createState() => _SalesBillingScreenState();
}

class _SalesBillingScreenState extends ConsumerState<SalesBillingScreen> {
  final _listKey = GlobalKey<TxnListPageState>();
  List<({String id, String label})> _customers = [];

  // ── Bulk selection ──────────────────────────────────────────────────────────
  bool _selectionMode = false;
  final Set<String> _selectedIds = {};

  void _enterSelectionMode(String id) {
    setState(() {
      _selectionMode = true;
      _selectedIds.add(id);
    });
    HapticFeedback.mediumImpact();
  }

  void _exitSelectionMode() {
    setState(() {
      _selectionMode = false;
      _selectedIds.clear();
    });
  }

  void _toggleSelection(String id) {
    setState(() {
      if (_selectedIds.contains(id)) {
        _selectedIds.remove(id);
        if (_selectedIds.isEmpty) _selectionMode = false;
      } else {
        _selectedIds.add(id);
      }
    });
  }

  Future<void> _bulkCancel(BuildContext context) async {
    if (_selectedIds.isEmpty) return;
    final count = _selectedIds.length;
    final ok = await showConfirmDialog(
      context,
      title: 'Cancel $count invoice${count == 1 ? '' : 's'}?',
      message: 'This will cancel the selected invoices.',
      destructive: true,
    );
    if (ok != true || !context.mounted) return;
    final ids = _selectedIds.toList();
    _exitSelectionMode();
    final resp = await ref.read(salesRepositoryProvider).bulkCancelSalesInvoices(ids);
    if (!mounted) return;
    if (resp.ok) {
      showAppSnack(context, message: '$count invoice${count == 1 ? '' : 's'} cancelled', type: AppSnackType.success);
      _listKey.currentState?.refresh();
      ref.read(ongoingSalesBillsProvider.notifier).refresh();
    } else {
      showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
    }
  }

  Future<void> _bulkPrint(BuildContext context) async {
    if (_selectedIds.isEmpty) return;
    final count = _selectedIds.length;
    final ids = _selectedIds.toList();
    showAppSnack(context, message: 'Printing $count invoice${count == 1 ? '' : 's'}…');
    final resp = await ref.read(salesRepositoryProvider).bulkPrintSalesInvoices(ids);
    if (!mounted) return;
    if (resp.ok) {
      showAppSnack(context, message: '$count invoice${count == 1 ? '' : 's'} sent to print', type: AppSnackType.success);
    } else {
      showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
    }
  }

  Future<void> _bulkEmail(BuildContext context) async {
    if (_selectedIds.isEmpty) return;
    final count = _selectedIds.length;
    final ok = await showConfirmDialog(
      context,
      title: 'Send $count invoice${count == 1 ? '' : 's'} by email?',
      message: 'Emails will be sent to the respective customers.',
      destructive: false,
    );
    if (ok != true || !context.mounted) return;
    final ids = _selectedIds.toList();
    final resp = await ref.read(salesRepositoryProvider).sendSalesInvoicesByEmail({'ids': ids});
    if (!mounted) return;
    if (resp.ok) {
      showAppSnack(context, message: 'Email${count == 1 ? '' : 's'} sent successfully', type: AppSnackType.success);
    } else {
      showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
    }
  }

  Future<void> _bulkCompletePayment(BuildContext context) async {
    if (_selectedIds.isEmpty) return;
    final ids = _selectedIds.toList();
    final count = ids.length;

    // Show payment details dialog
    final result = await _showBulkPaymentDialog(context, count);
    if (result == null || !context.mounted) return;

    final exitMode = _exitSelectionMode;
    exitMode();

    await withSavingOverlay(context, () async {
      final resp = await ref.read(paymentRepositoryProvider).bulkSettleCustomerPayments({
        'invoiceIds': ids,
        'paymentDate': result['paymentDate'],
        'paymentMode': result['paymentMode'],
        'notes': 'Bulk payment settled from sales invoices',
      });
      if (!context.mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context,
            message: '$count payment${count == 1 ? '' : 's'} completed',
            type: AppSnackType.success);
        _listKey.currentState?.refresh();
        ref.read(ongoingSalesBillsProvider.notifier).refresh();
      } else {
        showAppSnack(context,
            message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  Future<Map<String, String>?> _showBulkPaymentDialog(BuildContext context, int count) async {
    String paymentDate = todayYmdLocal();
    String paymentMode = 'CASH';

    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return showGeneralDialog<Map<String, String>>(
      context: context,
      barrierDismissible: true,
      barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
      barrierColor: Colors.black.withOpacity(ModalAnimationTokens.backdropOpacity),
      transitionDuration: reduceMotion
          ? ModalAnimationTokens.durationReducedMotion
          : ModalAnimationTokens.durationOpen,
      pageBuilder: (ctx, animation, secondaryAnimation) => StatefulBuilder(
        builder: (ctx, setDialogState) => Center(child: AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.primary.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(AppIcons.payment, size: 20, color: AppColors.primary),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Complete $count Payment${count == 1 ? '' : 's'}',
                  style: AppTypography.sectionTitle,
                ),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Payment date',
                style: AppTypography.inputLabel,
              ),
              const SizedBox(height: 6),
              GestureDetector(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: DateTime.now(),
                    firstDate: DateTime(2020),
                    lastDate: DateTime.now().add(const Duration(days: 1)),
                  );
                  if (picked != null) {
                    setDialogState(() {
                      paymentDate = todayYmdLocal(picked);
                    });
                  }
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.border, width: 0.8),
                    borderRadius: BorderRadius.circular(8),
                    color: AppColors.card,
                  ),
                  child: Row(
                    children: [
                      Icon(AppIcons.date, size: 16, color: AppColors.textMuted),
                      const SizedBox(width: 8),
                      Text(paymentDate, style: AppTypography.body),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text('Payment mode', style: AppTypography.inputLabel),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.border, width: 0.8),
                  borderRadius: BorderRadius.circular(8),
                  color: AppColors.card,
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: paymentMode,
                    isExpanded: true,
                    style: AppTypography.body,
                    items: const ['CASH', 'UPI', 'CARD', 'CHEQUE', 'NEFT', 'OTHER']
                        .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                        .toList(),
                    onChanged: (v) => setDialogState(() => paymentMode = v ?? 'CASH'),
                  ),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text('Cancel', style: TextStyle(color: AppColors.textMuted)),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: () => Navigator.pop(ctx, {
                'paymentDate': paymentDate,
                'paymentMode': paymentMode,
              }),
              child: const Text('Complete'),
            ),
          ],
        )),
      ),
      transitionBuilder: (ctx, animation, secondaryAnimation, child) =>
          AppAnimatedModal(type: AppModalType.center, animation: animation, child: child),
    );
  }

  Future<void> _bulkConfirm(BuildContext context) async {
    if (_selectedIds.isEmpty) return;
    final count = _selectedIds.length;
    final prefs = await showBulkConfirmPaymentDialog(
      context,
      count: count,
      isSales: true,
    );
    if (prefs == null || !context.mounted) return;
    final ids = _selectedIds.toList();
    _exitSelectionMode();
    final resp = await ref.read(salesRepositoryProvider).bulkConfirmSalesInvoices({
      'ids': ids,
      ...bulkConfirmPaymentBody(prefs),
    });
    if (!mounted) return;
    if (resp.ok) {
      showAppSnack(context, message: '$count invoice${count == 1 ? '' : 's'} confirmed', type: AppSnackType.success);
      _listKey.currentState?.refresh();
      ref.read(ongoingSalesBillsProvider.notifier).refresh();
    } else {
      showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
    }
  }

  @override
  void initState() {
    super.initState();
    _loadCustomers();
    // Clear any persisted activeId so no chip appears highlighted when the
    // listing screen first loads (or is resumed from the navigation stack).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(ongoingSalesBillsProvider.notifier).setActive(null);
      }
    });
  }

  Future<void> _loadCustomers() async {
    final resp = await ref.read(customerRepositoryProvider).list();
    if (!mounted) return;
    final raw = resp.data;
    List<dynamic> items = [];
    if (raw is Map) {
      items = (raw['data'] ?? raw['customers'] ?? raw['items'] ?? []) as List;
    } else if (raw is List) {
      items = raw;
    }
    final customers = items
        .whereType<Map>()
        .map((m) {
          final map = Map<String, dynamic>.from(m);
          final id = map['id']?.toString() ?? '';
          final name = (map['name'] ??
                  map['firm_name'] ??
                  map['firmName'] ??
                  map['full_name'] ??
                  map['fullName'] ??
                  '')
              .toString()
              .trim();
          return (id: id, label: name);
        })
        .where((c) => c.id.isNotEmpty && c.label.isNotEmpty)
        .toList();
    if (mounted) setState(() => _customers = customers);
  }

  Future<void> _openEditor({String? id, Map<String, dynamic>? initialBatch}) async {
    // Always clear the active bill before navigating so the rail never
    // auto-highlights a draft when we return to the listing screen.
    ref.read(ongoingSalesBillsProvider.notifier).setActive(null);
    await context.push<bool>(
      id == null ? '/sales-billing/new' : '/sales-billing/edit/$id',
      extra: initialBatch,
    );
    // Always refresh the list when returning from the editor — the user may
    // have saved, confirmed, or cancelled a draft even without an explicit
    // "changed" signal (e.g. auto-save, back-navigation after edits).
    if (mounted) {
      _listKey.currentState?.refresh();
      await ref.read(ongoingSalesBillsProvider.notifier).setActive(null);
      ref.read(ongoingSalesBillsProvider.notifier).refresh();
    }
  }

  Future<void> _switchToBill(OngoingBill bill) async {
    await _openEditor(id: bill.id);
  }

  /// Scan a barcode from the listing screen — always opens a NEW bill
  /// pre-populated with the scanned product. Never opens an existing draft.
  Future<void> _scanAndAddToActive() async {
    final code = await scanBarcode(context);
    if (code == null || code.isEmpty || !mounted) return;
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
    // Always open a new bill from the listing screen scan button.
    await _openEditor(initialBatch: batch);
  }

  Future<void> _showDetail(Map<String, dynamic> row, Future<void> Function() refresh) async {
    final id = row['id'];
    if (id == null) return;

    final detail = await withDetailLoading(context, () async {
      final resp = await ref.read(salesRepositoryProvider).getSalesInvoice(id);
      return parseSalesInvoiceDetail(resp);
    });
    if (!mounted) return;

    final header = mergeInvoiceHeader(row, detail?.header);
    final items = detail?.items ?? const [];
    final auth = ref.read(authControllerProvider).auth;
    final status = (header['status'] ?? row['status'] ?? '').toString().toUpperCase();
    final balanceDue = parseBalanceDue(header);
    final hasBalance = balanceDue > 0.001;

    showTxnInvoiceDetail(
      context,
      title: invoiceRowTitle(header),
      row: header,
      entity: RecordEntity.salesInvoice,
      status: status,
      lineItems: items,
      canEdit: status == 'DRAFT' && can(auth, 'SALES_INVOICES', 'UPDATE'),
      canConfirm: status == 'DRAFT' && can(auth, 'SALES_INVOICES', 'CONFIRM'),
      canCancel: (status == 'DRAFT' || status == 'CONFIRMED') && can(auth, 'SALES_INVOICES', 'CANCEL'),
      canDelete: status == 'DRAFT' && can(auth, 'SALES_INVOICES', 'DELETE'),
      canRecordPayment: hasBalance && can(auth, 'CUSTOMER_PAYMENTS', 'ADD'),
      canSendEmail: can(auth, 'SALES_INVOICES', 'VIEW'),
      canPrint: status == 'CONFIRMED' && can(auth, 'SALES_INVOICES', 'VIEW'),
      onShare: status == 'CONFIRMED' && can(auth, 'SALES_INVOICES', 'VIEW')
          ? () async {
              final pdf = PdfService(ref.read(salesRepositoryProvider));
              await pdf.shareSalesInvoicePdf(
                id,
                invoiceNo: (header['invoice_number'] ?? header['invoiceNumber'])?.toString(),
              );
            }
          : null,
      onDownloadPdf: status == 'CONFIRMED' && can(auth, 'SALES_INVOICES', 'VIEW')
          ? () async {
              final pdf = PdfService(ref.read(salesRepositoryProvider));
              await pdf.shareSalesInvoicePdf(
                id,
                invoiceNo: (header['invoice_number'] ?? header['invoiceNumber'])?.toString(),
              );
            }
          : null,
      onMarkPaid: hasBalance && can(auth, 'CUSTOMER_PAYMENTS', 'ADD')
          ? () => _showPaymentSheet(header, refresh)
          : null,
      canCreateReturn: status == 'CONFIRMED' && can(auth, 'SALES_RETURNS', 'ADD'),
      onEdit: () => _openEditor(id: header['id']?.toString() ?? id.toString()),
      onConfirm: () async {
        final total = parseDouble(
          header['total_amount'] ?? header['totalAmount'] ?? header['grand_total'],
        );
        final customerId =
            (header['customer_id'] ?? header['customerId'] ?? '').toString();
        final prefs = await showInvoiceConfirmPaymentDialog(
          context,
          isSales: true,
          totalAmount: total > 0 ? total : parseBalanceDue(header),
          initial: defaultSalesPaymentPrefs(
            isRetailer: isRetailer(auth),
          ),
          title: 'Confirm bill?',
          subtitle: 'Stock will go out.',
        );
        if (prefs == null || !mounted) return;
        final err = await confirmInvoiceWithPayment(
          ref: ref,
          isSales: true,
          invoiceId: id.toString(),
          prefs: prefs,
          totalAmount: total > 0 ? total : parseBalanceDue(header),
          customerId: customerId,
        );
        if (!mounted) return;
        if (err == null) {
          showAppSnack(context, message: 'Bill confirmed', type: AppSnackType.success);
          refresh();
          ref.read(ongoingSalesBillsProvider.notifier).refresh();
        } else {
          showAppSnack(context, message: err, type: AppSnackType.error);
        }
      },
      onCancel: () async {
        final resp = await ref.read(salesRepositoryProvider).cancelSalesInvoice(id);
        if (!mounted) return;
        if (resp.ok) {
          showAppSnack(context, message: 'Invoice cancelled', type: AppSnackType.success);
          refresh();
          ref.read(ongoingSalesBillsProvider.notifier).refresh();
        } else {
          showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
        }
      },
      onDelete: () async {
        // Hard-delete the DRAFT sales invoice from the database.
        final resp = await ref.read(salesRepositoryProvider).deleteSalesInvoice(id);
        if (!mounted) return;
        if (resp.ok) {
          showAppSnack(context, message: 'Draft deleted', type: AppSnackType.success);
          refresh();
          ref.read(ongoingSalesBillsProvider.notifier).refresh();
        } else {
          showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
        }
      },
      onRecordPayment: () async {
        await _showPaymentSheet(header, refresh);
      },
      onSendEmail: () async {
        final resp = await ref
            .read(salesRepositoryProvider)
            .sendSalesInvoicesByEmail({'ids': [id]});
        if (!mounted) return;
        if (resp.ok) {
          showAppSnack(context, message: 'Email sent', type: AppSnackType.success);
        } else {
          showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
        }
      },
      onPrint: () async {
        final err = await InvoicePrintService(ref.read(salesRepositoryProvider))
            .printSalesInvoice(id);
        if (!mounted) return;
        if (err != null) {
          showAppSnack(context, message: err, type: AppSnackType.error);
        }
      },
      onCreateReturn: () {
        showAppSnack(
          context,
          message: 'Open Sales Returns and tap + to create a return from this invoice.',
        );
        context.go('/sales-returns');
      },
    );
  }

  Future<void> _showPaymentSheet(
    Map<String, dynamic> row,
    Future<void> Function() refresh,
  ) async {
    final balanceDue =
        (row['balance_due'] ?? row['balanceDue'] as num?)?.toDouble() ?? 0.0;
    final customerId =
        (row['customer_id'] ?? row['customerId'] ?? '').toString();

    final result = await showAppBottomSheet<Map<String, dynamic>>(
      context: context,
      builder: (_) => _SalesPaymentSheet(
        invoiceId: row['id']!.toString(),
        invoiceNumber: (row['invoice_number'] ?? row['invoiceNumber'] ?? '').toString(),
        balanceDue: balanceDue,
        customerId: customerId,
      ),
    );
    if (result == null || !mounted) return;

    final resp = await ref.read(paymentRepositoryProvider).createCustomerPayment(result);
    if (!mounted) return;
    if (resp.ok) {
      showAppSnack(context, message: 'Payment recorded', type: AppSnackType.success);
      refresh();
    } else {
      showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).auth;
    final canAdd = can(auth, 'SALES_INVOICES', 'ADD');

    final authState = ref.watch(authControllerProvider).auth;
    final canConfirm = can(authState, 'SALES_INVOICES', 'CONFIRM');
    final canCancel = can(authState, 'SALES_INVOICES', 'CANCEL');
    final canView = can(authState, 'SALES_INVOICES', 'VIEW');
    final canPayment = can(authState, 'CUSTOMER_PAYMENTS', 'ADD');
    final totalCount = _listKey.currentState?.rows.length ?? 0;

    return PermissionGate(
      resource: 'SALES_INVOICES',
      action: 'VIEW',
      title: 'Sales & Billing',
      child: AppShell(
        title: _selectionMode ? '${_selectedIds.length} selected' : 'Sales & Billing',
        bottomBar: _selectionMode
            ? BulkSelectBar(
                selectedCount: _selectedIds.length,
                totalCount: totalCount,
                onCancel: _exitSelectionMode,
                onSelectAll: () => setState(() {
                  _selectedIds
                    ..clear()
                    ..addAll((_listKey.currentState?.rows ?? [])
                        .map((r) => r['id'].toString()));
                }),
                onDeselectAll: () => setState(() => _selectedIds.clear()),
                actions: [
                  if (canConfirm)
                    BulkAction(
                      label: 'Confirm',
                      icon: AppIcons.confirm,
                      color: AppColors.success,
                      onTap: () => _bulkConfirm(context),
                    ),
                  if (canPayment)
                    BulkAction(
                      label: 'Payment',
                      icon: AppIcons.payment,
                      color: const Color(0xFF059669),
                      onTap: () => _bulkCompletePayment(context),
                    ),
                  if (canView)
                    BulkAction(
                      label: 'Print',
                      icon: AppIcons.print,
                      onTap: () => _bulkPrint(context),
                    ),
                  if (canView)
                    BulkAction(
                      label: 'Email',
                      icon: AppIcons.email,
                      onTap: () => _bulkEmail(context),
                    ),
                  if (canCancel)
                    BulkAction(
                      label: 'Cancel',
                      icon: AppIcons.close,
                      destructive: true,
                      onTap: () => _bulkCancel(context),
                    ),
                ],
              )
            : AppBottomActionBar(
          primaryAction: BottomAction(
            icon: AppIcons.add,
            label: 'New Sale',
            tooltip: 'Create new sales invoice',
            onTap: canAdd ? _openEditor : null,
            enabled: canAdd,
          ),
          leadingActions: [
            BottomAction(
              icon: AppIcons.barcode,
              tooltip: 'Scan barcode into active bill',
              onTap: canAdd ? _scanAndAddToActive : null,
              enabled: canAdd,
            ),
            BottomAction(
              icon: AppIcons.importFile,
              tooltip: 'Import invoices (CSV)',
              onTap: () => _listKey.currentState?.triggerImport(),
            ),
          ],
          trailingActions: [
            BottomAction(
              icon: AppIcons.filter,
              tooltip: 'Filter invoices',
              onTap: () => _listKey.currentState?.openFilterSheet(),
            ),
            BottomAction(
              icon: AppIcons.download,
              tooltip: 'Export invoices (CSV)',
              onTap: () => _listKey.currentState?.triggerExport(),
            ),
          ],
        ),
        child: Column(
          children: [
            if (canAdd)
              OngoingBillsRail(
                module: BillModule.sales,
                onTapBill: _switchToBill,
                onCreateNew: _openEditor,
              ),
            Expanded(child: _buildList(canAdd)),
          ],
        ),
      ),
    );
  }

  Widget _buildList(bool canAdd) {
    return TxnListPage(
      key: _listKey,
      searchHint: 'Search sales invoices…',
      emptyTitle: 'No sales invoices',
      emptyMessage: 'Create your first invoice to start tracking sales.',
      emptyActionLabel: canAdd ? 'Create your first invoice' : null,
      onEmptyAction: canAdd ? _openEditor : null,
      statusFilters: const ['DRAFT', 'CONFIRMED', 'CANCELLED'],
      showDateFilter: false,
      enableAdvancedFilters: true,
      hideFilterButton: true,
      filterModuleTitle: 'Sales & Billing',
      showPaymentFilter: true,
      showBillTypeFilter: true,
      useBranchFilter: false,
      partyOptions: _customers,
      partyFilterLabel: 'Customer',
      importEntityType: 'SALES',
      exportColumns: ExportColumns.salesInvoices(),
      exportFilename: 'sales-invoices',
      hideToolbar: true, // Import/Export moved to bottom action bar
      load: (search, status) async {
        final branch = ref.read(branchControllerProvider);
        final resp = await ref.read(salesRepositoryProvider).listSalesInvoices({
          if (search.isNotEmpty) 'search': search,
          if (status != null) 'status': status,
          ...branchQueryParams(branch),
        });
        return listFromResponse(resp);
      },
      onRowTap: _showDetail,
      rowBuilder: (row, refresh) {
        final id = row['id'].toString();
        return DataListTile(
          row: row,
          isSelected: _selectionMode ? _selectedIds.contains(id) : null,
          onSelect: () => _toggleSelection(id),
          onLongPress: () => _enterSelectionMode(id),
          onTap: _selectionMode
              ? () => _toggleSelection(id)
              : () => _showDetail(row, refresh),
        );
      },
    );
  }
}

// ─── Sales payment sheet ──────────────────────────────────────────────────────

class _SalesPaymentSheet extends StatefulWidget {
  const _SalesPaymentSheet({
    required this.invoiceId,
    required this.invoiceNumber,
    required this.balanceDue,
    required this.customerId,
  });

  final String invoiceId;
  final String invoiceNumber;
  final double balanceDue;
  final String customerId;

  @override
  State<_SalesPaymentSheet> createState() => _SalesPaymentSheetState();
}

class _SalesPaymentSheetState extends State<_SalesPaymentSheet> {
  final _formKey = GlobalKey<FormState>();
  final _amountCtrl = TextEditingController();
  final _refCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  String _paymentDate = todayYmdLocal();
  String _paymentMode = 'CASH';
  bool _submitted = false;

  @override
  void initState() {
    super.initState();
    _amountCtrl.text = widget.balanceDue.toStringAsFixed(2);
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _refCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    setState(() => _submitted = true);
    if (!_formKey.currentState!.validate()) return;

    Navigator.pop(context, {
      'customerId': widget.customerId,
      'salesInvoiceId': widget.invoiceId,
      'paymentDate': _paymentDate,
      'amount': num.tryParse(_amountCtrl.text.trim()) ?? 0,
      'paymentMode': _paymentMode,
      if (_refCtrl.text.trim().isNotEmpty) 'referenceNumber': _refCtrl.text.trim(),
      if (_notesCtrl.text.trim().isNotEmpty) 'notes': _notesCtrl.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) {
    // Store MediaQuery lookups once per build to avoid repeated InheritedWidget traversal.
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppTheme.modalRadius),
        ),
      ),
      padding: EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.md,
        AppSpacing.lg + bottomInset,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              const Text('Record Customer Payment', style: AppTypography.cardTitle),
              if (widget.invoiceNumber.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  'Invoice: ${widget.invoiceNumber}',
                  style: AppTypography.secondary,
                ),
              ],
              const SizedBox(height: AppSpacing.md),

              // Balance due info
              Container(
                padding: const EdgeInsets.all(AppSpacing.sm),
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  border: Border.all(color: AppColors.primarySubtle),
                ),
                child: Row(
                  children: [
                    const Icon(AppIcons.info,
                        size: 16, color: AppColors.primary),
                    const SizedBox(width: AppSpacing.xs),
                    Text(
                      'Still owed: ${fmtCurrency(widget.balanceDue)}',
                      style: AppTypography.labelSemibold.copyWith(
                        color: AppColors.primaryDark,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.sm),

              // Amount
              const _SPayLabel('Amount'),
              const SizedBox(height: 5),
              TextFormField(
                controller: _amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: AppTypography.body,
                decoration: const InputDecoration(
                  hintText: '0.00',
                  prefixIcon: Padding(
                    padding: EdgeInsets.only(left: 12, right: 8),
                    child: Icon(AppIcons.payment,
                        size: 17, color: AppColors.textMuted),
                  ),
                  prefixIconConstraints: BoxConstraints(),
                ),
                validator: (v) {
                  if (_submitted) {
                    final n = num.tryParse(v?.trim() ?? '');
                    if (n == null || n <= 0) return 'Enter a valid amount';
                  }
                  return null;
                },
              ),
              const SizedBox(height: AppSpacing.sm),

              // Payment date
              const _SPayLabel('Payment date'),
              const SizedBox(height: 5),
              GestureDetector(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: DateTime.tryParse(_paymentDate) ?? DateTime.now(),
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) {
                    setState(() => _paymentDate = todayYmdLocal(picked));
                  }
                },
                child: Container(
                  height: 48,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      const Icon(AppIcons.date,
                          size: 17, color: AppColors.textMuted),
                      const SizedBox(width: 8),
                      Text(fmtDisplayDate(_paymentDate), style: AppTypography.body),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),

              // Payment mode
              const _SPayLabel('Payment mode'),
              const SizedBox(height: 5),
              AppDropdownField<String>(
                label: '',
                value: _paymentMode,
                items: _kSalesPaymentModes
                    .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                    .toList(),
                onChanged: (v) => setState(() => _paymentMode = v ?? 'CASH'),
              ),
              const SizedBox(height: AppSpacing.sm),

              // Reference
              const _SPayLabel('Reference number (optional)'),
              const SizedBox(height: 5),
              TextFormField(
                controller: _refCtrl,
                style: AppTypography.body,
                decoration: const InputDecoration(
                  hintText: 'UTR / cheque no.',
                  prefixIcon: Padding(
                    padding: EdgeInsets.only(left: 12, right: 8),
                    child: Icon(AppIcons.category, size: 17, color: AppColors.textMuted),
                  ),
                  prefixIconConstraints: BoxConstraints(),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),

              // Notes
              const _SPayLabel('Notes (optional)'),
              const SizedBox(height: 5),
              TextFormField(
                controller: _notesCtrl,
                maxLines: 2,
                style: AppTypography.body,
                decoration: const InputDecoration(hintText: 'Any additional notes…'),
              ),
              const SizedBox(height: AppSpacing.lg),

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                        ),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: _submit,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 48),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                        ),
                      ),
                      child: const Text('Record payment'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SPayLabel extends StatelessWidget {
  const _SPayLabel(this.label);
  final String label;

  @override
  Widget build(BuildContext context) =>
      Text(label, style: AppTypography.inputLabel);
}
