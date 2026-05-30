import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/app_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/access.dart';
import '../../core/utils/api_data.dart';
import '../../core/utils/api_helpers.dart';
import '../../core/utils/date.dart';
import '../../core/utils/barcode_lookup.dart';
import '../../core/utils/format.dart';
import '../../providers/app_providers.dart';
import '../../repositories/sales_repository.dart';
import '../../widgets/barcode_scan_sheet.dart';
import '../../providers/auth_controller.dart';
import '../../widgets/confirm_dialog.dart';
import '../../widgets/responsive.dart';
import '../../widgets/searchable_picker.dart';
import '../../widgets/section_divider.dart';
import '../../widgets/snackbar.dart';
import '../shared/draft_auto_save.dart';
import '../shared/invoice_editor_helpers.dart';
import '../shared/txn_parse_utils.dart';
import '../shared/invoice_editor_scaffold.dart';
import '../shared/invoice_editor_summary.dart';
import '../shared/invoice_payment_helpers.dart';
import '../shared/invoice_payment_section.dart';
import '../shared/ongoing_bills_controller.dart';
import '../shared/ongoing_bills_rail.dart';

class SalesLineItem {
  SalesLineItem({
    this.productId = '',
    this.batchId = '',
    this.productName = '',
    this.batchNo = '',
    this.qty = 1,
    this.freeQty = 0,
    this.salesRate = 0,
    this.discountPercent = 0,
    this.gstPercent = 0,
  });

  String productId;
  String batchId;
  String productName;
  String batchNo;
  int qty;
  int freeQty;
  double salesRate;
  double discountPercent;
  double gstPercent;

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'batchId': batchId,
        'qty': qty,
        'freeQty': freeQty,
        if (salesRate > 0) 'salesRate': salesRate,
        if (discountPercent > 0) 'discountPercent': discountPercent,
      };

  bool get isComplete => isCompleteSalesLine(
        productId: productId,
        batchId: batchId,
        qty: qty,
      );

  double get lineTotal => lineAmount(
        qty: qty,
        rate: salesRate,
        discountPercent: discountPercent,
        gstPercent: gstPercent,
      );
}

class SalesInvoiceEditorScreen extends ConsumerStatefulWidget {
  const SalesInvoiceEditorScreen({
    super.key,
    this.invoiceId,
    this.initialBatch,
  });

  final String? invoiceId;

  /// Pre-populated batch from a listing-page barcode scan.
  final Map<String, dynamic>? initialBatch;

  @override
  ConsumerState<SalesInvoiceEditorScreen> createState() =>
      _SalesInvoiceEditorScreenState();
}

class _SalesInvoiceEditorScreenState
    extends ConsumerState<SalesInvoiceEditorScreen> with WidgetsBindingObserver {
  bool _loading = true;
  bool _saving = false;
  bool _scanningLine = false;
  bool _autoSaveBusy = false;
  bool _autoSaveMutex = false;
  String _status = 'DRAFT';
  late final DraftAutoSaveScheduler _autoSaveScheduler;
  String? _editingId;
  final Set<int> _manualLinePickers = {};
  int? _expandProductLineIndex;

  String? _customerId;
  String? _divisionId;
  String _invoiceDate = todayYmdLocal();
  String _dueDate = '';
  String _rateType = 'MRP';
  String _billType = 'CASH_MEMO';
  double _globalDiscount = 0;
  String _cashReceived = '';
  String _notes = '';
  InvoicePaymentPrefs _paymentPrefs = InvoicePaymentPrefs();
  List<SalesLineItem> _items = [SalesLineItem()];

  List<Map<String, dynamic>> _customers = [];
  List<Map<String, dynamic>> _divisions = [];
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _batches = [];

  // Cached picker items — rebuilt only when underlying data changes.
  List<SearchablePickerItem>? _cachedCustomerPickerItems;
  List<SearchablePickerItem>? _cachedDivisionPickerItems;
  List<SearchablePickerItem>? _cachedProductPickerItems;

  /// Tracks whether the UI is in "Add" mode (new bill) vs "Edit" mode.
  /// Set at open time; never changed by auto-save so the title stays stable.
  bool _isAddMode = true;

  bool get _isEdit =>
      (_editingId != null && _editingId!.isNotEmpty) ||
      (widget.invoiceId != null && widget.invoiceId!.isNotEmpty);

  String? get _currentInvoiceId =>
      _editingId ?? widget.invoiceId;

  bool get _isRetailer {
    final auth = ref.read(authControllerProvider).auth;
    return isRetailer(auth);
  }

  double get _grandTotal =>
      _items.fold(0.0, (s, it) => s + it.lineTotal);

  static const _rateTypes = [
    ('MRP', 'MRP'),
    ('SALES_RATE', 'Sales rate'),
    ('RETAIL_RATE', 'Retail rate'),
    ('SPECIAL_RATE_1', 'Special rate 1'),
    ('SPECIAL_RATE_2', 'Special rate 2'),
    ('PURCHASE_RATE', 'Purchase rate'),
  ];

  static const _billTypes = [
    ('CASH_MEMO', 'Cash memo'),
    ('TAX_INVOICE', 'Tax invoice'),
    ('CREDIT', 'Credit'),
    ('DEBIT', 'Debit'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _autoSaveScheduler = DraftAutoSaveScheduler(onSave: _autoSaveDraft);
    // If opened with an existing invoice ID, start in Edit mode.
    _isAddMode = widget.invoiceId == null || widget.invoiceId!.isEmpty;
    _init();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _autoSaveScheduler.dispose();
    _scheduleExitDraftSave();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.detached) {
      unawaited(_autoSaveDraft(updateUi: false));
    }
  }

  bool get _isDraftOnly => isDraftInvoiceStatus(_status);

  void _scheduleAutoSave() {
    if (!_isDraftOnly || _loading || _saving) return;
    _autoSaveScheduler.schedule();
  }

  void _touch([VoidCallback? fn]) {
    setState(fn ?? () {});
    _scheduleAutoSave();
  }

  Future<void> _init() async {
    try {
      // Load master data in parallel for faster startup.
      final futures = await Future.wait([
        ref.read(customerRepositoryProvider).list({'limit': '500'}),
        ref.read(divisionRepositoryProvider).list({'limit': '500'}),
        ref.read(productRepositoryProvider).listProducts({'limit': '500'}),
        ref.read(productBatchRepositoryProvider).list({'limit': '2000'}),
        if (_isEdit)
          ref.read(salesRepositoryProvider).getSalesInvoice(_currentInvoiceId!),
      ]);

      _customers = listFromResponse(futures[0]).rows;
      _divisions = listFromResponse(futures[1]).rows;
      _products = listFromResponse(futures[2]).rows;
      _batches = listFromResponse(futures[3]).rows;

      if (_isRetailer) {
        _rateType = 'MRP';
      }

      // Pre-populate first line from a listing-page barcode scan.
      final ib = widget.initialBatch;
      if (ib != null && !_isEdit) {
        final batch = normalizeBarcodeBatch(ib);
        _batches = ensureBatchInList(_batches, batch);
        _products = ensureProductFromBatch(_products, batch);
        _cachedProductPickerItems = null;
        _setBatchOnLine(0, batch);
        _applyHeaderAutofillFromBatch(batch);
      }

      if (_isEdit && futures.length > 4) {
        final resp = futures[4];
        if (resp.ok) {
          final data = extractDataMap(resp);
          final inv = data?['invoice'] is Map
              ? Map<String, dynamic>.from(data!['invoice'] as Map)
              : data;
          final items = extractList(data?['items']);
          if (inv != null) {
            _status = invoiceStatusFromRow(inv);
            _customerId = recordIdStr(inv['customer_id'] ?? inv['customerId']);
            _divisionId = recordIdStr(inv['division_id'] ?? inv['divisionId']);
            _invoiceDate =
                ymd(inv['invoice_date'] ?? inv['invoiceDate']).isNotEmpty
                    ? ymd(inv['invoice_date'] ?? inv['invoiceDate'])
                    : _invoiceDate;
            _dueDate = ymd(inv['due_date'] ?? inv['dueDate']);
            _rateType =
                (inv['rate_type'] ?? inv['rateType'] ?? _rateType).toString();
            _billType =
                (inv['bill_type'] ?? inv['billType'] ?? _billType).toString();
            _globalDiscount = parseDouble(
              inv['global_discount_percent'] ?? inv['globalDiscountPercent'],
            );
            _notes = (inv['notes'] ?? '').toString();
            _cashReceived =
                (inv['cash_received'] ?? inv['cashReceived'] ?? '').toString();
          }
          if (items.isNotEmpty) {
            _items = items.map((it) {
              final productId = recordIdStr(it['product_id'] ?? it['productId']);
              final batchId = recordIdStr(it['batch_id'] ?? it['batchId']);
              final productName =
                  (it['product_name'] ?? it['productName'] ?? '').toString();
              final batchNo = (it['batch_no'] ?? it['batchNo'] ?? '').toString();
              // Ensure products and batches from the invoice are in the local lists
              // so pickers can display them even if they weren't in the master fetch.
              if (productId.isNotEmpty) {
                _products = ensureProductFromBatch(_products, {
                  'product_id': productId,
                  'product_name': productName,
                  'product_code':
                      (it['product_code'] ?? it['productCode'] ?? '').toString(),
                });
              }
              if (batchId.isNotEmpty) {
                _batches = ensureBatchInList(_batches, {
                  ...it,
                  'id': batchId,
                  'product_id': productId,
                });
              }
              return SalesLineItem(
                productId: productId,
                batchId: batchId,
                productName: productName,
                batchNo: batchNo,
                qty: parseInt(it['qty'], 1),
                freeQty: parseInt(it['free_qty'] ?? it['freeQty']),
                salesRate: parseDouble(it['sales_rate'] ?? it['salesRate']),
                discountPercent: parseDouble(
                  it['discount_percent'] ?? it['discountPercent'],
                ),
              );
            }).toList();
          }
        }
      }
    } catch (e) {
      // Swallow errors — show empty form rather than stuck loading state.
    }

    if (mounted) {
      setState(() {
        _loading = false;
        // Invalidate picker caches so they rebuild from the now-populated data.
        // Without this, the caches are filled with empty lists during the initial
        // build() call (when _loading = true) and never refreshed.
        _cachedCustomerPickerItems = null;
        _cachedDivisionPickerItems = null;
        _cachedProductPickerItems = null;
      });
    }
  }

  List<SalesLineItem> get _completeItems =>
      _items.where((line) => line.isComplete).toList();

  Map<String, dynamic> _buildPayload() => {
        'customerId': _customerId,
        if (!_isRetailer && _divisionId != null && _divisionId!.isNotEmpty)
          'divisionId': _divisionId,
        'invoiceDate': _invoiceDate,
        if (_dueDate.isNotEmpty) 'dueDate': _dueDate,
        'rateType': _rateType,
        'billType': _billType,
        'globalDiscountPercent': _globalDiscount,
        'notes': _notes.isEmpty ? null : _notes,
        if (_billType == 'CASH_MEMO' && _cashReceived.isNotEmpty)
          'cashReceived': num.tryParse(_cashReceived),
        'clientToday': todayYmdLocal(),
        'items': _completeItems.map((e) => e.toJson()).toList(),
      };

  Future<void> _save({bool confirmAfter = false, InvoicePaymentPrefs? paymentPrefs}) async {
    if (_customerId == null || _customerId!.isEmpty) {
      showAppSnack(context,
          message: 'Pick a customer', type: AppSnackType.error);
      return;
    }
    final lines = _completeItems;
    if (lines.isEmpty) {
      showAppSnack(context,
          message: 'Add at least one item', type: AppSnackType.error);
      return;
    }
    for (final it in lines) {
      if (!it.isComplete) {
        showAppSnack(context,
            message: 'Fill all item details', type: AppSnackType.error);
        return;
      }
    }
    setState(() => _saving = true);
    final repo = ref.read(salesRepositoryProvider);
    final resp = _isEdit
        ? await repo.updateSalesInvoice(_currentInvoiceId!, _buildPayload())
        : await repo.createSalesInvoice(_buildPayload());
    if (!mounted) return;
    if (!resp.ok) {
      setState(() => _saving = false);
      showAppSnack(context,
          message: resp.parseErrorMessage(), type: AppSnackType.error);
      return;
    }
    final data = extractDataMap(resp);
    final savedId =
        (data?['invoice']?['id'] ?? data?['invoiceId'] ?? _currentInvoiceId)
            ?.toString();
    if (savedId != null && savedId.isNotEmpty) {
      _editingId = savedId;
    }
    if (confirmAfter && savedId != null && savedId.isNotEmpty) {
      final prefs = paymentPrefs ?? _paymentPrefs;
      final err = await confirmInvoiceWithPayment(
        ref: ref,
        isSales: true,
        invoiceId: savedId,
        prefs: prefs,
        totalAmount: _grandTotal,
        customerId: _customerId,
      );
      if (!mounted) return;
      setState(() => _saving = false);
      if (err != null) {
        showAppSnack(context, message: err, type: AppSnackType.error);
        return;
      }
    } else {
      setState(() => _saving = false);
    }
    if (!mounted) return;
    showAppSnack(
      context,
      message: confirmAfter ? 'Bill saved and confirmed' : 'Bill saved',
      type: AppSnackType.success,
    );
    context.pop(true);
  }

  /// Scan into the first incomplete line, or append a new line when all are filled.
  Future<void> _scanForNextLine() async {
    var idx = _items.indexWhere((l) => l.productId.isEmpty || l.batchId.isEmpty);
    if (idx < 0) {
      setState(() => _items.add(SalesLineItem()));
      idx = _items.length - 1;
    }
    await _scanBarcodeForLine(idx);
  }

  /// Scan barcode for a specific line item. Always fetches fresh batch data
  /// from the server on every scan to ensure latest stock/pricing info.
  Future<void> _scanBarcodeForLine(int lineIndex) async {
    final code = await scanBarcode(context);
    if (code == null || code.isEmpty || !mounted) return;

    setState(() => _scanningLine = true);

    // Always fetch fresh batch data from server on every scan.
    final resp =
        await ref.read(productBatchRepositoryProvider).findByBarcode(code);

    // Also refresh the full batch list to get latest stock data.
    final batchListResp = await ref
        .read(productBatchRepositoryProvider)
        .list({'limit': '2000'});

    if (!mounted) return;

    setState(() {
      _scanningLine = false;
      if (batchListResp.ok) {
        _batches = listFromResponse(batchListResp).rows;
        // Invalidate product picker cache since batches changed.
        _cachedProductPickerItems = null;
      }
    });

    final batch = batchFromBarcodeResponse(resp);
    if (batch == null) {
      final errMsg = resp.parseErrorMessage();
      showAppSnack(
        context,
        message: errMsg.isNotEmpty
            ? errMsg
            : 'No product found for barcode "$code". Please check the barcode and try again.',
        type: AppSnackType.error,
      );
      return;
    }

    final normalized = normalizeBarcodeBatch(batch);
    setState(() {
      _batches = ensureBatchInList(_batches, normalized);
      _products = ensureProductFromBatch(_products, normalized);
      _cachedProductPickerItems = null;
      _manualLinePickers.remove(lineIndex);
    });

    _applyBatchToLine(lineIndex, normalized);

    final allFilled = _items.every((l) => l.productId.isNotEmpty && l.batchId.isNotEmpty);
    if (allFilled && mounted) {
      setState(() => _items.add(SalesLineItem()));
    }

    showAppSnack(
      context,
      message: '${productLineSummary(normalized)} — enter qty',
      type: AppSnackType.success,
    );

    // Counter-flow safety net: after each scan, persist a draft on the
    // server so switching customers or app reload never loses the cart.
    unawaited(_autoSaveDraft());
  }

  /// Best-effort background save. Skips when there's no customer yet
  /// (backend requires one) and is silent on failure — surfacing errors here
  /// would derail the rapid scan flow at the counter.
  /// Switch the editor over to another in-progress draft. Persists the
  /// current cart first so nothing is lost when the user pops between
  /// customers at the counter.
  Future<void> _switchToOngoingBill(OngoingBill bill) async {
    if (bill.id == _currentInvoiceId) return;
    await _autoSaveDraft();
    if (!mounted) return;
    setState(() => _isAddMode = false);
    await ref.read(ongoingSalesBillsProvider.notifier).setActive(bill.id);
    if (!mounted) return;
    context.pushReplacement(
      '/sales-billing/edit/${bill.id}',
    );
  }

  /// Start a new bill from inside the editor (use the "+" chip on the rail).
  Future<void> _startNewBill() async {
    await _autoSaveDraft();
    if (!mounted) return;
    setState(() => _isAddMode = true);
    await ref.read(ongoingSalesBillsProvider.notifier).setActive(null);
    if (!mounted) return;
    context.pushReplacement('/sales-billing/new');
  }

  void _scheduleExitDraftSave() {
    if (_autoSaveMutex || !_isDraftOnly) return;
    if (_customerId == null || _customerId!.isEmpty) return;
    if (_completeItems.isEmpty) return;
    final repo = ref.read(salesRepositoryProvider);
    final invoiceId = _currentInvoiceId;
    final payload = _buildPayload();
    unawaited(_fireAndForgetDraftSave(repo, invoiceId, payload));
  }

  static Future<void> _fireAndForgetDraftSave(
    SalesRepository repo,
    String? invoiceId,
    Map<String, dynamic> payload,
  ) async {
    try {
      if (invoiceId != null && invoiceId.isNotEmpty) {
        await repo.updateSalesInvoice(invoiceId, payload);
      } else {
        await repo.createSalesInvoice(payload);
      }
    } catch (_) {
      // Best-effort persist on exit — no UI to update.
    }
  }

  Future<void> _autoSaveDraft({bool updateUi = true}) async {
    if (_autoSaveMutex || !_isDraftOnly) return;
    if (_customerId == null || _customerId!.isEmpty) return;
    final lines = _completeItems;
    if (lines.isEmpty) return;
    _autoSaveMutex = true;
    if (updateUi && mounted) setState(() => _autoSaveBusy = true);
    try {
      final repo = ref.read(salesRepositoryProvider);
      final invoiceId = _currentInvoiceId;
      final wasNew = invoiceId == null || invoiceId.isEmpty;
      final resp = invoiceId != null && invoiceId.isNotEmpty
          ? await repo.updateSalesInvoice(invoiceId, _buildPayload())
          : await repo.createSalesInvoice(_buildPayload());
      if (!resp.ok) return;
      final data = extractDataMap(resp);
      final newId =
          (data?['invoice']?['id'] ?? data?['invoiceId'])?.toString();
      if (newId != null && newId.isNotEmpty) {
        _editingId = newId;
        _status = invoiceStatusFromRow(
          data?['invoice'] is Map
              ? Map<String, dynamic>.from(data!['invoice'] as Map)
              : null,
        );
      }
      if (!updateUi || !mounted) return;
      if (newId != null && newId.isNotEmpty) {
        ref.read(ongoingSalesBillsProvider.notifier).setActive(newId);
        unawaited(ref.read(ongoingSalesBillsProvider.notifier).refresh());
        // Do NOT navigate to edit route — keep UI in Add mode so the title
        // and action buttons remain stable while auto-save runs in background.
      }
    } catch (_) {
      // Silent — manual Save still surfaces errors.
    } finally {
      _autoSaveMutex = false;
      if (updateUi && mounted) setState(() => _autoSaveBusy = false);
    }
  }

  void _setBatchOnLine(int index, Map<String, dynamic> batch) {
    final line = _items[index];
    line.productId = recordIdStr(batch['product_id'] ?? batch['productId']);
    line.batchId = recordIdStr(batch['id'] ?? batch['batch_id'] ?? batch['batchId']);
    line.productName =
        (batch['product_name'] ?? batch['productName'] ?? batch['drug_name'] ?? '')
            .toString();
    line.batchNo = (batch['batch_no'] ?? batch['batchNo'] ?? '').toString();
    line.salesRate = _rateFromBatch(batch);
    final disc = salesDiscountFromBatch(batch);
    if (disc > 0) line.discountPercent = disc;
    line.gstPercent = gstPercentFromBatch(batch);
  }

  void _applyHeaderAutofillFromBatch(Map<String, dynamic> batch) {
    if (!_isRetailer && (_divisionId == null || _divisionId!.isEmpty)) {
      final divId = divisionIdFromBatchOrProduct(batch, _products);
      if (divId.isNotEmpty) _divisionId = divId;
    }
  }

  void _onCustomerChanged(String? customerId) {
    _customerId = customerId;
    if (_dueDate.isNotEmpty || customerId == null || customerId.isEmpty) {
      _scheduleAutoSave();
      return;
    }
    Map<String, dynamic>? customer;
    for (final c in _customers) {
      if (recordIdStr(c['id']) == customerId) {
        customer = c;
        break;
      }
    }
    if (customer == null) return;
    _paymentPrefs = defaultSalesPaymentPrefs(
      isRetailer: _isRetailer,
      customer: customer,
    );
    if (_paymentPrefs.timing == InvoicePaymentTiming.full &&
        _grandTotal > 0 &&
        _cashReceived.isEmpty) {
      _cashReceived = _grandTotal.toStringAsFixed(2);
      _paymentPrefs = _paymentPrefs.copyWith(cashReceived: _cashReceived);
    }
    final due = dueDateFromCreditDays(
      invoiceDate: _invoiceDate,
      creditDays: parseInt(customer['credit_days'] ?? customer['creditDays']),
    );
    if (due != null) _dueDate = due;
    final disc = parseDouble(
      customer['discount_percent'] ?? customer['discountPercent'],
    );
    if (disc > 0 && _globalDiscount == 0) _globalDiscount = disc;
    _scheduleAutoSave();
  }

  void _onProductSelected(int index, String? productId) {
    final line = _items[index];
    line.productId = productId ?? '';
    line.batchId = '';
    line.productName = partyLabelFromList(_products, productId);
    if (!_isRetailer && (_divisionId == null || _divisionId!.isEmpty)) {
      final product = findProductById(_products, line.productId);
      final divId = recordIdStr(product?['division_id'] ?? product?['divisionId']);
      if (divId.isNotEmpty) _divisionId = divId;
    }
    final batches = batchesForProduct(_batches, line.productId);
    if (batches.isNotEmpty) {
      _setBatchOnLine(index, batches.first);
      _applyHeaderAutofillFromBatch(batches.first);
    }
  }

  void _recalcLineRatesFromBatches() {
    for (final line in _items) {
      if (line.batchId.isEmpty) continue;
      final batch = findBatchById(_batches, line.batchId);
      if (batch != null) line.salesRate = _rateFromBatch(batch);
    }
  }

  void _applyBatchToLine(int index, Map<String, dynamic> batch) {
    _touch(() {
      _setBatchOnLine(index, batch);
      _applyHeaderAutofillFromBatch(batch);
    });
  }

  double _rateFromBatch(Map<String, dynamic> batch) {
    final mrp = parseDouble(batch['mrp']);
    switch (_rateType) {
      case 'PURCHASE_RATE':
        return parseDouble(
          batch['purchase_rate'] ?? batch['purchaseRate'],
          mrp,
        );
      case 'SPECIAL_RATE_1':
        return parseDouble(
          batch['special_rate_1'] ??
              batch['specialRate1'] ??
              batch['retail_rate'] ??
              batch['retailRate'],
          mrp,
        );
      case 'SPECIAL_RATE_2':
        return parseDouble(
          batch['special_rate_2'] ??
              batch['specialRate2'] ??
              batch['sales_rate'] ??
              batch['salesRate'],
          mrp,
        );
      case 'RETAIL_RATE':
        return parseDouble(
          batch['retail_rate'] ??
              batch['retailRate'] ??
              batch['sales_rate'] ??
              batch['salesRate'],
          mrp,
        );
      case 'SALES_RATE':
        return parseDouble(
          batch['sales_rate'] ?? batch['salesRate'],
          mrp,
        );
      default:
        return mrp > 0
            ? mrp
            : parseDouble(batch['sales_rate'] ?? batch['salesRate']);
    }
  }

  List<SearchablePickerItem> _customerPickerItems() {
    return _cachedCustomerPickerItems ??= masterPickerItems(_customers);
  }

  List<SearchablePickerItem> _divisionPickerItems() {
    return _cachedDivisionPickerItems ??= masterPickerItems(_divisions);
  }

  List<SearchablePickerItem> _productPickerItems() {
    return _cachedProductPickerItems ??= _products
        .where((p) => recordIdStr(p['id']).isNotEmpty)
        .map(
          (p) => SearchablePickerItem(
            value: recordIdStr(p['id']),
            label: productPickerLabel(p),
          ),
        )
        .toList();
  }

  List<SearchablePickerItem> _batchPickerItems(String productId) {
    return batchesForProduct(_batches, productId)
        .map(
          (b) => SearchablePickerItem(
            value: recordIdStr(b['id']),
            label: batchDropdownLabel(b),
          ),
        )
        .toList();
  }

  bool _showLinePickers(int i, SalesLineItem line) =>
      _manualLinePickers.contains(i) ||
      line.productId.isEmpty ||
      line.batchId.isEmpty;

  Widget _buildLineCard(int i, SalesLineItem line) {
    final batchOptions = batchesForProduct(_batches, line.productId);
    final showPickers = _showLinePickers(i, line);
    final summary = line.productName.isNotEmpty
        ? [
            line.productName,
            if (line.batchNo.isNotEmpty) 'B:${line.batchNo}',
          ].join(' · ')
        : '';

    return InvoiceLineCard(
      index: i,
      summary: summary,
      lineTotal: line.lineTotal,
      showPickers: showPickers,
      canDelete: _items.length > 1,
      onDelete: () => _touch(() {
        _items.removeAt(i);
        _manualLinePickers.remove(i);
      }),
      onChangeProduct: line.productId.isNotEmpty && !showPickers
          ? () => setState(() => _manualLinePickers.add(i))
          : null,
      pickers: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SearchablePickerField(
            compact: true,
            initiallyExpanded: _expandProductLineIndex == i,
            label: 'Product *',
            value: line.productId.isEmpty ? null : line.productId,
            displayLabel: line.productName.isEmpty ? null : line.productName,
            hint: 'Select product',
            items: _productPickerItems(),
            onChanged: (v) => _touch(() => _onProductSelected(i, v)),
          ),
          const SizedBox(height: 8),
          SearchablePickerField(
            compact: true,
            label: 'Batch *',
            value: line.batchId.isEmpty ? null : line.batchId,
            displayLabel: line.batchNo.isEmpty ? null : line.batchNo,
            hint: line.productId.isEmpty ? 'Select product first' : 'Select batch',
            enabled: line.productId.isNotEmpty,
            items: _batchPickerItems(line.productId),
            emptyMessage: line.productId.isEmpty
                ? 'Select a product first'
                : 'No batches found for this product',
            onChanged: (v) {
              if (v == null) return;
              final batch = batchOptions.firstWhere(
                (b) => recordIdStr(b['id']) == v,
                orElse: () => <String, dynamic>{},
              );
              if (batch.isNotEmpty) _applyBatchToLine(i, batch);
            },
          ),
        ],
      ),
      metrics: InvoiceLineMetricsRow(
        lineKey: 'sales-$i',
        qty: line.qty,
        freeQty: line.freeQty,
        rate: line.salesRate,
        discountPercent: line.discountPercent,
        rateLabel: 'Rate',
        onQtyChanged: (v) => _touch(() => line.qty = v),
        onFreeQtyChanged: (v) => _touch(() => line.freeQty = v),
        onRateChanged: (v) => _touch(() => line.salesRate = v),
        onDiscountChanged: (v) => _touch(() => line.discountPercent = v),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return InvoiceEditorScaffold(
      title: _isAddMode ? 'New Sale Bill' : 'Edit Sale Bill',
      loading: _loading,
      saving: _saving,
      autoSaving: _autoSaveBusy,
      onCancel: () => context.pop(),
      onSaveDraft: _save,
      onConfirm: () async {
        final validation = validatePaymentPrefs(_paymentPrefs, _grandTotal);
        if (validation != null) {
          showAppSnack(context, message: validation, type: AppSnackType.error);
          return;
        }
        final ok = await showConfirmDialog(
          context,
          title: 'Confirm this bill?',
          message: _paymentPrefs.timing == InvoicePaymentTiming.full
              ? 'Stock will go out. Full payment will be saved.'
              : _paymentPrefs.timing == InvoicePaymentTiming.partial
                  ? 'Stock will go out. ${fmtCurrency(_paymentPrefs.partialAmount)} payment will be saved.'
                  : 'Stock will go out. Payment can be taken later.',
        );
        if (ok == true) await _save(confirmAfter: true);
      },
      confirmLabel: confirmActionLabel(_paymentPrefs),
      footerSummary: _isDraftOnly
          ? InvoiceEditorFooterSummary(
              lineCount: _completeItems.length,
              total: _grandTotal,
              paymentPrefs: _paymentPrefs,
            )
          : null,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Ongoing bills rail (parallel customer billing) ───────────
          OngoingBillsRail(
            module: BillModule.sales,
            currentBillId: _currentInvoiceId,
            onTapBill: _switchToOngoingBill,
            onCreateNew: _startNewBill,
            showWhenEmpty: true,
          ),
          // ── Customer (always visible — required to save) ─────────────
          InvoiceFormSection(
            title: 'Customer',
            subtitle: 'Who is buying?',
            children: [
              SearchablePickerField(
                compact: true,
                label: 'Customer *',
                value: _customerId,
                hint: _customers.isEmpty
                    ? 'No customers — add in Master'
                    : 'Search customer',
                items: _customerPickerItems(),
                onChanged: (v) => _touch(() => _onCustomerChanged(v)),
              ),
              if (!_isRetailer && _divisionId != null && _divisionId!.isNotEmpty) ...[
                const SizedBox(height: 10),
                InvoiceAutoChip(
                  icon: AppIcons.divisions,
                  label: 'Division: ${partyLabelFromList(_divisions, _divisionId)}',
                ),
              ],
            ],
          ),

          // ── Line items (primary workflow) ────────────────────────────
          InvoiceFormSection(
            title: 'Items',
            subtitle: 'Scan barcode or add by hand',
            trailing: InvoiceSectionTotalBadge(
              lineCount: _completeItems.length,
              total: _grandTotal,
            ),
            children: [
              SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton.icon(
                  onPressed: _scanningLine ? null : _scanForNextLine,
                  icon: _scanningLine
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(AppIcons.barcode, size: 20),
                  label: Text(_scanningLine ? 'Scanning…' : 'Scan barcode'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _completeItems.isEmpty
                          ? 'No items yet'
                          : '${_completeItems.length} item${_completeItems.length == 1 ? '' : 's'} added',
                      style: AppTypography.caption
                          .copyWith(color: AppColors.textMuted),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () {
                      _touch(() {
                        final idx = _items.length;
                        _items.add(SalesLineItem());
                        _manualLinePickers.add(idx);
                        _expandProductLineIndex = idx;
                      });
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (mounted) setState(() => _expandProductLineIndex = null);
                      });
                    },
                    icon: const Icon(AppIcons.add, size: 18),
                    label: const Text('Add item'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ..._items.asMap().entries.map((e) => _buildLineCard(e.key, e.value)),
            ],
          ),

          if (_isDraftOnly)
            InvoiceFormSection(
              title: 'Payment',
              subtitle: 'Full, part, or pay later',
              children: [
                InvoicePaymentSection(
                  embedded: true,
                  prefs: _paymentPrefs,
                  totalAmount: _grandTotal,
                  onChanged: (p) => _touch(() {
                    _paymentPrefs = p;
                    if (p.paymentMode == 'CASH' && p.cashReceived.isNotEmpty) {
                      _cashReceived = p.cashReceived;
                    }
                  }),
                ),
              ],
            ),

          CollapsibleInvoiceSection(
            title: 'Extra',
            subtitle: 'Date, bill type, discount, notes',
            initiallyExpanded: _isEdit,
            children: [
              if (!_isRetailer) ...[
                SearchablePickerField(
                  compact: true,
                  label: 'Division',
                  value: _divisionId,
                  hint: _divisions.isEmpty
                      ? 'No divisions found — add one in Master'
                      : 'Optional',
                  items: _divisionPickerItems(),
                  onChanged: (v) => _touch(() => _divisionId = v),
                ),
                const SizedBox(height: 12),
              ],
              const SectionDividerLabel(label: 'Dates'),
              InvoiceDateTile(
                label: 'Bill date',
                value: fmtDisplayDate(_invoiceDate),
                onTap: () async {
                  final d = await pickInvoiceDate(context, _invoiceDate);
                  if (d != null) _touch(() => _invoiceDate = d);
                },
              ),
              const SizedBox(height: 8),
              InvoiceDateTile(
                label: 'Due date',
                value: _dueDate.isEmpty ? 'Not set' : fmtDisplayDate(_dueDate),
                icon: AppIcons.dateRange,
                isPlaceholder: _dueDate.isEmpty,
                onTap: () async {
                  final d = await pickInvoiceDate(
                    context,
                    _dueDate.isEmpty ? _invoiceDate : _dueDate,
                  );
                  if (d != null) _touch(() => _dueDate = d);
                },
              ),
              const SizedBox(height: 12),
              ResponsiveFieldsRow(
                spacing: 10,
                children: [
                  AppDropdownField<String>(
                    compact: true,
                    label: 'Rate type',
                    value: _rateType,
                    items: _rateTypes
                        .map((e) => DropdownMenuItem(
                            value: e.$1, child: Text(e.$2)))
                        .toList(),
                    onChanged: (v) {
                      if (v != null) {
                        _touch(() {
                          _rateType = v;
                          _recalcLineRatesFromBatches();
                        });
                      }
                    },
                  ),
                  AppDropdownField<String>(
                    compact: true,
                    label: 'Bill type',
                    value: _billType,
                    items: _billTypes
                        .map((e) => DropdownMenuItem(
                            value: e.$1, child: Text(e.$2)))
                        .toList(),
                    onChanged: (v) {
                      if (v != null) _touch(() => _billType = v);
                    },
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(
                initialValue:
                    _globalDiscount > 0 ? '$_globalDiscount' : '',
                decoration: const InputDecoration(
                  labelText: 'Discount on all items %',
                  hintText: 'For every item',
                ),
                keyboardType: const TextInputType.numberWithOptions(
                    decimal: true),
                onChanged: (v) =>
                    _touch(() => _globalDiscount = double.tryParse(v) ?? 0),
              ),
              if (_billType == 'CASH_MEMO') ...[
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: _cashReceived,
                  decoration: const InputDecoration(
                    labelText: 'Cash note',
                    hintText: 'Optional',
                  ),
                  keyboardType: TextInputType.text,
                  onChanged: (v) => _touch(() => _cashReceived = v),
                ),
              ],
              const SizedBox(height: 12),
              TextFormField(
                initialValue: _notes,
                decoration: const InputDecoration(labelText: 'Notes'),
                maxLines: 2,
                onChanged: (v) => _touch(() => _notes = v),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
