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
import '../../repositories/purchase_repository.dart';
import '../../widgets/barcode_scan_sheet.dart';
import '../../providers/auth_controller.dart';
import '../../widgets/confirm_dialog.dart';
import '../../widgets/searchable_picker.dart';
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

class PurchaseLineItem {
  PurchaseLineItem({
    this.productId = '',
    this.batchId = '',
    this.productName = '',
    this.batchNo = '',
    this.expiryDate = '',
    this.mfgDate = '',
    this.qty = 1,
    this.freeQty = 0,
    this.purchaseRate = 0,
    this.salesRate = 0,
    this.mrp = 0,
    this.discountPercent = 0,
    this.gstPercent = 0,
  });

  String productId;
  String batchId;
  String productName;
  String batchNo;
  String expiryDate;
  String mfgDate;
  int qty;
  int freeQty;
  double purchaseRate;
  double salesRate;
  double mrp;
  double discountPercent;
  double gstPercent;

  bool get isComplete => isCompletePurchaseLine(
        productId: productId,
        batchNo: batchNo,
        expiryDate: expiryDate,
        qty: qty,
        mrp: mrp,
        purchaseRate: purchaseRate,
      );

  Map<String, dynamic> toJson() => {
        'productId': productId,
        if (batchId.isNotEmpty) 'batchId': batchId,
        'batchNo': batchNo,
        'expiryDate': expiryDate,
        if (mfgDate.isNotEmpty) 'mfgDate': mfgDate,
        'qty': qty,
        'freeQty': freeQty,
        'mrp': mrp,
        'purchaseRate': purchaseRate,
        'salesRate': salesRate > 0 ? salesRate : purchaseRate,
        if (discountPercent > 0) 'discountPercent': discountPercent,
        'gstPercent': gstPercent,
        'isNewBatch': batchId.isEmpty,
      };

  double get lineTotal => lineAmount(
        qty: qty,
        rate: purchaseRate,
        discountPercent: discountPercent,
        gstPercent: gstPercent,
      );
}

class PurchaseInvoiceEditorScreen extends ConsumerStatefulWidget {
  const PurchaseInvoiceEditorScreen({
    super.key,
    this.invoiceId,
    this.initialBatch,
  });

  final String? invoiceId;
  /// Pre-populated batch from a listing-page barcode scan.
  final Map<String, dynamic>? initialBatch;

  @override
  ConsumerState<PurchaseInvoiceEditorScreen> createState() =>
      _PurchaseInvoiceEditorScreenState();
}

class _PurchaseInvoiceEditorScreenState extends ConsumerState<PurchaseInvoiceEditorScreen>
    with WidgetsBindingObserver {
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
  String? _vendorId;
  String? _divisionId;
  String _invoiceNumber = '';
  String _vendorInvoiceNumber = '';
  String _invoiceDate = todayYmdLocal();
  String _dueDate = '';
  String _notes = '';
  InvoicePaymentPrefs _paymentPrefs = defaultPurchasePaymentPrefs();
  List<PurchaseLineItem> _items = [PurchaseLineItem()];

  List<Map<String, dynamic>> _vendors = [];
  List<Map<String, dynamic>> _divisions = [];
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _batches = [];

  // Cached dropdown item lists — rebuilt only when underlying data changes.
  List<SearchablePickerItem>? _cachedVendorPickerItems;
  List<SearchablePickerItem>? _cachedDivisionPickerItems;
  // Products and batches use SearchablePickerField (lazy, searchable).
  List<SearchablePickerItem>? _cachedProductPickerItems;

  /// Tracks whether the UI is in "Add" mode (new bill) vs "Edit" mode.
  /// Set at open time; never changed by auto-save so the title stays stable.
  bool _isAddMode = true;

  bool get _isEdit =>
      (_editingId != null && _editingId!.isNotEmpty) ||
      (widget.invoiceId != null && widget.invoiceId!.isNotEmpty);

  String? get _currentInvoiceId => _editingId ?? widget.invoiceId;

  bool get _isRetailer {
    final auth = ref.read(authControllerProvider).auth;
    return isRetailer(auth);
  }

  double get _grandTotal => _items.fold(0.0, (s, it) => s + it.lineTotal);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _autoSaveScheduler = DraftAutoSaveScheduler(onSave: _autoSaveDraft);
    _editingId = widget.invoiceId;
    // If opened with an existing invoice ID, start in Edit mode.
    _isAddMode = widget.invoiceId == null || widget.invoiceId!.isEmpty;
    _init();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final id = _currentInvoiceId;
      if (id != null && id.isNotEmpty) {
        ref.read(ongoingPurchaseBillsProvider.notifier).setActive(id);
      }
    });
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
        ref.read(vendorRepositoryProvider).list({'limit': '500'}),
        ref.read(divisionRepositoryProvider).list({'limit': '500'}),
        ref.read(productRepositoryProvider).listProducts({'limit': '500'}),
        ref.read(productBatchRepositoryProvider).list({'limit': '2000'}),
        if (_isEdit)
          ref.read(purchaseRepositoryProvider).getPurchaseInvoice(widget.invoiceId!),
      ]);

      _vendors = listFromResponse(futures[0]).rows;
      _divisions = listFromResponse(futures[1]).rows;
      _products = listFromResponse(futures[2]).rows;
      _batches = listFromResponse(futures[3]).rows;

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
            _vendorId = recordIdStr(inv['vendor_id'] ?? inv['vendorId']);
            _divisionId = recordIdStr(inv['division_id'] ?? inv['divisionId']);
            _invoiceNumber = (inv['invoice_number'] ?? inv['invoiceNumber'] ?? '').toString();
            _vendorInvoiceNumber =
                (inv['vendor_invoice_number'] ?? inv['vendorInvoiceNumber'] ?? '').toString();
            _invoiceDate = ymd(inv['invoice_date'] ?? inv['invoiceDate']).isNotEmpty
                ? ymd(inv['invoice_date'] ?? inv['invoiceDate'])
                : _invoiceDate;
            _dueDate = ymd(inv['due_date'] ?? inv['dueDate']);
            _notes = (inv['notes'] ?? '').toString();
          }
          if (items.isNotEmpty) {
            _items = items.map((it) {
              final productId = recordIdStr(it['product_id'] ?? it['productId']);
              final batchId = recordIdStr(it['batch_id'] ?? it['batchId']);
              final productName = (it['product_name'] ?? it['productName'] ?? '').toString();
              final batchNo = (it['batch_no'] ?? it['batchNo'] ?? '').toString();
              // Ensure products and batches from the invoice are in the local lists
              // so pickers can display them even if they weren't in the master fetch.
              if (productId.isNotEmpty) {
                _products = ensureProductFromBatch(_products, {
                  'product_id': productId,
                  'product_name': productName,
                  'product_code': (it['product_code'] ?? it['productCode'] ?? '').toString(),
                });
              }
              if (batchId.isNotEmpty) {
                _batches = ensureBatchInList(_batches, {
                  ...it,
                  'id': batchId,
                  'product_id': productId,
                });
              }
              return PurchaseLineItem(
                productId: productId,
                batchId: batchId,
                productName: productName,
                batchNo: batchNo,
                expiryDate: ymd(it['expiry_date'] ?? it['expiryDate']),
                mfgDate: ymd(it['mfg_date'] ?? it['mfgDate']),
                qty: parseInt(it['qty'], 1),
                freeQty: parseInt(it['free_qty'] ?? it['freeQty']),
                purchaseRate: parseDouble(it['purchase_rate'] ?? it['purchaseRate']),
                salesRate: parseDouble(it['sales_rate'] ?? it['salesRate']),
                mrp: parseDouble(it['mrp']),
                discountPercent: parseDouble(it['discount_percent'] ?? it['discountPercent']),
                gstPercent: parseDouble(it['gst_percent'] ?? it['gstPercent']),
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
        _cachedVendorPickerItems = null;
        _cachedDivisionPickerItems = null;
        _cachedProductPickerItems = null;
      });
    }
  }

  List<PurchaseLineItem> get _completeItems =>
      _items.where((line) => line.isComplete).toList();

  Map<String, dynamic> _buildPayload() => {
        if (_vendorId != null && _vendorId!.isNotEmpty) 'vendorId': _vendorId,
        if (_divisionId != null && _divisionId!.isNotEmpty) 'divisionId': _divisionId,
        if (_invoiceNumber.isNotEmpty) 'invoiceNumber': _invoiceNumber,
        if (_vendorInvoiceNumber.isNotEmpty) 'vendorInvoiceNumber': _vendorInvoiceNumber,
        'invoiceDate': _invoiceDate,
        if (_dueDate.isNotEmpty) 'dueDate': _dueDate,
        'notes': _notes.isEmpty ? null : _notes,
        'clientToday': todayYmdLocal(),
        'items': _completeItems.map((e) => e.toJson()).toList(),
      };

  Future<void> _save({bool confirmAfter = false, InvoicePaymentPrefs? paymentPrefs}) async {
    if ((_vendorId == null || _vendorId!.isEmpty) &&
        (_divisionId == null || _divisionId!.isEmpty)) {
      showAppSnack(
        context,
        message: _isRetailer ? 'Select a supplier' : 'Select a division',
        type: AppSnackType.error,
      );
      return;
    }
    final lines = _completeItems;
    if (lines.isEmpty) {
      showAppSnack(context, message: 'Add at least one line item', type: AppSnackType.error);
      return;
    }
    for (final it in lines) {
      if (!it.isComplete) {
        showAppSnack(context, message: 'Fill all item details', type: AppSnackType.error);
        return;
      }
    }
    setState(() => _saving = true);
    final repo = ref.read(purchaseRepositoryProvider);
    final resp = _isEdit
        ? await repo.updatePurchaseInvoice(_currentInvoiceId!, _buildPayload())
        : await repo.createPurchaseInvoice(_buildPayload());
    if (!mounted) return;
    if (!resp.ok) {
      setState(() => _saving = false);
      showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      return;
    }
    final data = extractDataMap(resp);
    final savedId = (data?['invoice']?['id'] ?? data?['invoiceId'] ?? _currentInvoiceId)
        ?.toString();
    if (savedId != null && savedId.isNotEmpty) {
      _editingId = savedId;
    }
    if (confirmAfter && savedId != null && savedId.isNotEmpty) {
      final prefs = paymentPrefs ?? _paymentPrefs;
      final err = await confirmInvoiceWithPayment(
        ref: ref,
        isSales: false,
        invoiceId: savedId,
        prefs: prefs,
        totalAmount: _grandTotal,
        vendorId: _vendorId,
        divisionId: _divisionId,
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

  Future<void> _scanForNextLine() async {
    var idx = _items.indexWhere((l) => l.productId.isEmpty || l.batchId.isEmpty);
    if (idx < 0) {
      setState(() => _items.add(PurchaseLineItem()));
      idx = _items.length - 1;
    }
    await _scanBarcodeForLine(idx);
  }

  Future<void> _scanBarcodeForLine(int lineIndex) async {
    final code = await scanBarcode(context);
    if (code == null || code.isEmpty || !mounted) return;

    setState(() => _scanningLine = true);

    final resp = await ref.read(productBatchRepositoryProvider).findByBarcode(code);
    final batchListResp = await ref
        .read(productBatchRepositoryProvider)
        .list({'limit': '2000'});

    if (!mounted) return;

    setState(() {
      _scanningLine = false;
      if (batchListResp.ok) {
        _batches = listFromResponse(batchListResp).rows;
        _cachedProductPickerItems = null;
      }
    });

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
      setState(() => _items.add(PurchaseLineItem()));
    }

    showAppSnack(
      context,
      message: '${productLineSummary(normalized)} — enter qty',
      type: AppSnackType.success,
    );

    unawaited(_autoSaveDraft());
  }

  /// Best-effort silent save so the active purchase draft is durable across
  /// switches between vendors / app reloads. Skips when vendor/division and
  /// items aren't ready (backend rejects partial payloads).
  void _scheduleExitDraftSave() {
    if (_autoSaveMutex || !_isDraftOnly) return;
    if (_isRetailer) {
      if (_vendorId == null || _vendorId!.isEmpty) return;
    } else {
      if (_divisionId == null || _divisionId!.isEmpty) return;
    }
    if (_items.where((l) => l.isComplete).isEmpty) return;
    final repo = ref.read(purchaseRepositoryProvider);
    final invoiceId = _currentInvoiceId;
    final payload = _buildPayload();
    unawaited(_fireAndForgetDraftSave(repo, invoiceId, payload));
  }

  static Future<void> _fireAndForgetDraftSave(
    PurchaseRepository repo,
    String? invoiceId,
    Map<String, dynamic> payload,
  ) async {
    try {
      if (invoiceId != null && invoiceId.isNotEmpty) {
        await repo.updatePurchaseInvoice(invoiceId, payload);
      } else {
        await repo.createPurchaseInvoice(payload);
      }
    } catch (_) {
      // Best-effort persist on exit — no UI to update.
    }
  }

  Future<void> _autoSaveDraft({bool updateUi = true}) async {
    if (_autoSaveMutex || !_isDraftOnly) return;
    if (_isRetailer) {
      if (_vendorId == null || _vendorId!.isEmpty) return;
    } else {
      if (_divisionId == null || _divisionId!.isEmpty) return;
    }
    final lines = _items.where((l) => l.isComplete).toList();
    if (lines.isEmpty) return;
    _autoSaveMutex = true;
    if (updateUi && mounted) setState(() => _autoSaveBusy = true);
    try {
      final repo = ref.read(purchaseRepositoryProvider);
      final invoiceId = _currentInvoiceId;
      final wasNew = invoiceId == null || invoiceId.isEmpty;
      final resp = invoiceId != null && invoiceId.isNotEmpty
          ? await repo.updatePurchaseInvoice(invoiceId, _buildPayload())
          : await repo.createPurchaseInvoice(_buildPayload());
      if (!resp.ok) return;
      final data = extractDataMap(resp);
      final newId = (data?['invoice']?['id'] ?? data?['invoiceId'])?.toString();
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
        ref.read(ongoingPurchaseBillsProvider.notifier).setActive(newId);
        unawaited(ref.read(ongoingPurchaseBillsProvider.notifier).refresh());
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

  Future<void> _switchToOngoingBill(OngoingBill bill) async {
    if (bill.id == _currentInvoiceId) return;
    await _autoSaveDraft();
    if (!mounted) return;
    setState(() => _isAddMode = false);
    await ref.read(ongoingPurchaseBillsProvider.notifier).setActive(bill.id);
    if (!mounted) return;
    context.pushReplacement('/purchase-invoices/edit/${bill.id}');
  }

  Future<void> _startNewBill() async {
    await _autoSaveDraft();
    if (!mounted) return;
    setState(() => _isAddMode = true);
    await ref.read(ongoingPurchaseBillsProvider.notifier).setActive(null);
    if (!mounted) return;
    context.pushReplacement('/purchase-invoices/new');
  }

  void _setBatchOnLine(int index, Map<String, dynamic> batch) {
    final line = _items[index];
    line.productId = recordIdStr(batch['product_id'] ?? batch['productId']);
    line.batchId = recordIdStr(batch['id'] ?? batch['batch_id'] ?? batch['batchId']);
    line.productName =
        (batch['product_name'] ?? batch['productName'] ?? batch['drug_name'] ?? '')
            .toString();
    line.batchNo = (batch['batch_no'] ?? batch['batchNo'] ?? '').toString();
    line.expiryDate = ymd(batch['expiry_date'] ?? batch['expiryDate']);
    line.mfgDate = ymd(batch['mfg_date'] ?? batch['mfgDate']);
    line.mrp = parseDouble(batch['mrp']);
    line.salesRate = parseDouble(
      batch['sales_rate'] ?? batch['salesRate'] ?? batch['purchase_rate'] ?? batch['purchaseRate'],
    );
    line.gstPercent = gstPercentFromBatch(batch, purchase: true);
    line.purchaseRate = parseDouble(
      batch['purchase_rate'] ?? batch['purchaseRate'] ?? batch['mrp'],
    );
    final disc = purchaseDiscountFromBatch(batch);
    if (disc > 0) line.discountPercent = disc;
  }

  void _applyHeaderAutofillFromBatch(Map<String, dynamic> batch) {
    if (!_isRetailer && (_divisionId == null || _divisionId!.isEmpty)) {
      final divId = divisionIdFromBatchOrProduct(batch, _products);
      if (divId.isNotEmpty) _divisionId = divId;
    }
    if (_isRetailer && (_vendorId == null || _vendorId!.isEmpty)) {
      final vendorId = vendorIdFromBatchOrProduct(batch, _products);
      if (vendorId.isNotEmpty) _vendorId = vendorId;
    }
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

  void _applyBatchToLine(int index, Map<String, dynamic> batch) {
    _touch(() {
      _setBatchOnLine(index, batch);
      _applyHeaderAutofillFromBatch(batch);
    });
  }

  List<SearchablePickerItem> _vendorPickerItems() {
    return _cachedVendorPickerItems ??= masterPickerItems(_vendors);
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

  bool _showLinePickers(int i, PurchaseLineItem line) =>
      _manualLinePickers.contains(i) ||
      line.productId.isEmpty ||
      line.batchId.isEmpty;

  Widget _buildLineCard(int i, PurchaseLineItem line) {
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
          ? () => _touch(() => _manualLinePickers.add(i))
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
                : 'No batches found — enter batch details manually',
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
        lineKey: 'purchase-$i',
        qty: line.qty,
        freeQty: line.freeQty,
        rate: line.purchaseRate,
        discountPercent: line.discountPercent,
        rateLabel: 'Rate',
        onQtyChanged: (v) => _touch(() => line.qty = v),
        onFreeQtyChanged: (v) => _touch(() => line.freeQty = v),
        onRateChanged: (v) => _touch(() => line.purchaseRate = v),
        onDiscountChanged: (v) => _touch(() => line.discountPercent = v),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return InvoiceEditorScaffold(
      title: _isAddMode ? 'New Purchase Bill' : 'Edit Purchase Bill',
      loading: _loading,
      saving: _saving,
      autoSaving: _autoSaveBusy,
      saveDraftLabel: 'Save',
      onCancel: () => context.pop(),
      onSaveDraft: _save,
      onConfirm: () async {
        final validation = validatePaymentPrefs(_paymentPrefs, _grandTotal);
        if (validation != null) {
          showAppSnack(context, message: validation, type: AppSnackType.error);
          return;
        }
        if (await showConfirmDialog(
              context,
              title: 'Confirm this bill?',
              message: _paymentPrefs.timing == InvoicePaymentTiming.full
                  ? 'Stock will come in. Full payment will be saved.'
                  : _paymentPrefs.timing == InvoicePaymentTiming.partial
                      ? 'Stock will come in. ${fmtCurrency(_paymentPrefs.partialAmount)} payment will be saved.'
                      : 'Stock will come in. Payment can be done later.',
            ) ==
            true) {
          await _save(confirmAfter: true);
        }
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
          OngoingBillsRail(
            module: BillModule.purchase,
            currentBillId: _currentInvoiceId,
            onTapBill: _switchToOngoingBill,
            onCreateNew: _startNewBill,
            showWhenEmpty: true,
          ),
          // ── Party (always visible) ───────────────────────────────────
          InvoiceFormSection(
            title: _isRetailer ? 'Supplier' : 'Buy from',
            subtitle: _isRetailer ? 'Who are you buying from?' : 'Pick division',
            children: [
              if (_isRetailer)
                SearchablePickerField(
                  compact: true,
                  label: 'Supplier *',
                  value: _vendorId,
                  hint: _vendors.isEmpty
                      ? 'No suppliers — add in Master'
                      : 'Search supplier',
                  items: _vendorPickerItems(),
                  onChanged: (v) => _touch(() => _vendorId = v),
                ),
              if (!_isRetailer)
                SearchablePickerField(
                  compact: true,
                  label: 'Division *',
                  value: _divisionId,
                  hint: _divisions.isEmpty
                      ? 'No divisions — add in Master'
                      : 'Search division',
                  items: _divisionPickerItems(),
                  onChanged: (v) => _touch(() => _divisionId = v),
                ),
            ],
          ),

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
                        _items.add(PurchaseLineItem());
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
                  onChanged: (p) => _touch(() => _paymentPrefs = p),
                ),
              ],
            ),

          CollapsibleInvoiceSection(
            title: 'Extra',
            subtitle: 'Bill no., date, notes',
            initiallyExpanded: _isEdit,
            children: [
              if (!_isRetailer) ...[
                SearchablePickerField(
                  compact: true,
                  label: 'Supplier (optional)',
                  value: _vendorId,
                  hint: _vendors.isEmpty
                      ? 'No suppliers found'
                      : 'Link vendor if applicable',
                  items: _vendorPickerItems(),
                  onChanged: (v) => _touch(() => _vendorId = v),
                ),
                const SizedBox(height: 12),
              ],
              TextFormField(
                initialValue: _vendorInvoiceNumber,
                decoration: InputDecoration(
                  labelText: _isRetailer ? 'Supplier bill no.' : 'Their bill no.',
                  hintText: 'Number on their bill',
                ),
                onChanged: (v) => _touch(() => _vendorInvoiceNumber = v),
              ),
              if (_isEdit) ...[
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: _invoiceNumber,
                  decoration: const InputDecoration(labelText: 'Our bill no.'),
                  readOnly: true,
                ),
              ],
              const SizedBox(height: 12),
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
