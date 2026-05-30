import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/api_helpers.dart';
import '../../core/utils/date.dart';
import '../../core/utils/format.dart';
import '../../providers/app_providers.dart';
import '../../widgets/app_bottom_sheet.dart';
import '../../widgets/form_sheet_loading.dart';
import '../../widgets/searchable_picker.dart';
import '../shared/invoice_editor_helpers.dart';

const kPaymentModes = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'NEFT', 'OTHER'];

enum PaymentPartyKind { customer, vendor, division }

/// Payment record form — opens immediately, loads party list inside the sheet.
Future<Map<String, dynamic>?> showPaymentFormSheet(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  required PaymentPartyKind partyKind,
  String? initialPartyId,
  String? salesInvoiceId,
  String? purchaseInvoiceId,
  double? suggestedAmount,
}) async {
  if (!context.mounted) return null;
  return showAppBottomSheet<Map<String, dynamic>>(
    context: context,
    builder: (_) => _PaymentFormSheet(
      title: title,
      partyKind: partyKind,
      initialPartyId: initialPartyId,
      salesInvoiceId: salesInvoiceId,
      purchaseInvoiceId: purchaseInvoiceId,
      suggestedAmount: suggestedAmount,
    ),
  );
}

class _PaymentFormSheet extends ConsumerStatefulWidget {
  const _PaymentFormSheet({
    required this.title,
    required this.partyKind,
    this.initialPartyId,
    this.salesInvoiceId,
    this.purchaseInvoiceId,
    this.suggestedAmount,
  });

  final String title;
  final PaymentPartyKind partyKind;
  final String? initialPartyId;
  final String? salesInvoiceId;
  final String? purchaseInvoiceId;
  final double? suggestedAmount;

  @override
  ConsumerState<_PaymentFormSheet> createState() => _PaymentFormSheetState();
}

class _PaymentFormSheetState extends ConsumerState<_PaymentFormSheet> {
  final _formKey = GlobalKey<FormState>();
  final _amountCtrl = TextEditingController();
  final _refCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();

  bool _loadingParties = true;
  String? _loadError;
  List<Map<String, dynamic>> _parties = [];

  String? _partyId;
  String _paymentDate = todayYmdLocal();
  String _paymentMode = 'CASH';
  bool _submitted = false;

  String get _partyLabel => switch (widget.partyKind) {
        PaymentPartyKind.customer => 'Customer',
        PaymentPartyKind.vendor => 'Supplier',
        PaymentPartyKind.division => 'Division',
      };

  String get _partyIdKey => switch (widget.partyKind) {
        PaymentPartyKind.customer => 'customerId',
        PaymentPartyKind.vendor => 'vendorId',
        PaymentPartyKind.division => 'divisionId',
      };

  IconData get _partyIcon => switch (widget.partyKind) {
        PaymentPartyKind.customer => AppIcons.customer,
        PaymentPartyKind.vendor => AppIcons.company,
        PaymentPartyKind.division => AppIcons.divisions,
      };

  @override
  void initState() {
    super.initState();
    _partyId = widget.initialPartyId;
    if (widget.suggestedAmount != null && widget.suggestedAmount! > 0) {
      _amountCtrl.text = widget.suggestedAmount!.toStringAsFixed(2);
    }
    _loadParties();
  }

  Future<void> _loadParties() async {
    try {
      List<Map<String, dynamic>> rows = [];
      switch (widget.partyKind) {
        case PaymentPartyKind.customer:
          final resp = await ref.read(customerRepositoryProvider).list({'limit': '500'});
          rows = listFromResponse(resp).rows;
        case PaymentPartyKind.vendor:
          final resp = await ref.read(vendorRepositoryProvider).list({'limit': '500'});
          rows = listFromResponse(resp).rows;
        case PaymentPartyKind.division:
          final resp = await ref.read(divisionRepositoryProvider).list({'limit': '500'});
          rows = listFromResponse(resp).rows;
      }
      if (!mounted) return;
      setState(() {
        _parties = rows;
        _loadingParties = false;
        _loadError = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loadingParties = false;
        _loadError = 'Could not load ${_partyLabel.toLowerCase()} list. Tap retry.';
      });
    }
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
    if (_partyId == null || _partyId!.isEmpty) return;

    Navigator.pop(context, {
      _partyIdKey: _partyId,
      'amount': num.tryParse(_amountCtrl.text.trim()) ?? 0,
      'paymentDate': _paymentDate,
      'paymentMode': _paymentMode,
      if (widget.salesInvoiceId != null && widget.salesInvoiceId!.isNotEmpty)
        'salesInvoiceId': widget.salesInvoiceId,
      if (widget.purchaseInvoiceId != null && widget.purchaseInvoiceId!.isNotEmpty)
        'purchaseInvoiceId': widget.purchaseInvoiceId,
      if (_refCtrl.text.trim().isNotEmpty) 'referenceNumber': _refCtrl.text.trim(),
      if (_notesCtrl.text.trim().isNotEmpty) 'notes': _notesCtrl.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppTheme.modalRadius)),
      ),
      padding: EdgeInsets.fromLTRB(
        AppSpacing.sm,
        AppSpacing.xs,
        AppSpacing.sm,
        AppSpacing.md + bottomInset,
      ),
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
          const SizedBox(height: AppSpacing.sm),
          Text(widget.title, style: AppTypography.cardTitle),
          const SizedBox(height: AppSpacing.sm),
          if (_loadingParties)
            const FormSheetLoadingBody(message: 'Loading parties…')
          else if (_loadError != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_loadError!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: () {
                      setState(() {
                        _loadingParties = true;
                        _loadError = null;
                      });
                      _loadParties();
                    }, child: const Text('Retry')),
                  ],
                ),
              ),
            )
          else
            Form(
              key: _formKey,
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SearchablePickerField(
                      compact: true,
                      label: _partyLabel,
                      value: _partyId,
                      hint: _parties.isEmpty
                          ? 'No ${_partyLabel.toLowerCase()}s found — add one in Master'
                          : 'Select ${_partyLabel.toLowerCase()}',
                      items: masterPickerItems(_parties),
                      onChanged: (v) => setState(() => _partyId = v),
                      errorText: _submitted && (_partyId == null || _partyId!.isEmpty)
                          ? 'Please select a ${_partyLabel.toLowerCase()}'
                          : null,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    const _FieldLabel('Amount'),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: _amountCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      style: AppTypography.body,
                      decoration: const InputDecoration(
                        hintText: '0.00',
                        prefixIcon: Padding(
                          padding: EdgeInsets.only(left: 12, right: 8),
                          child: Icon(AppIcons.payment, size: 17, color: AppColors.textMuted),
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
                    const SizedBox(height: AppSpacing.xs),
                    const _FieldLabel('Payment date'),
                    const SizedBox(height: 4),
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
                        height: 44,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          children: [
                            const Icon(AppIcons.date, size: 17, color: AppColors.textMuted),
                            const SizedBox(width: 8),
                            Text(fmtDisplayDate(_paymentDate), style: AppTypography.body),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    SearchablePickerField(
                      compact: true,
                      label: 'Payment mode',
                      value: _paymentMode,
                      items: kPaymentModes
                          .map((m) => SearchablePickerItem(value: m, label: m))
                          .toList(),
                      onChanged: (v) => setState(() => _paymentMode = v ?? 'CASH'),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    const _FieldLabel('Reference number (optional)'),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: _refCtrl,
                      style: AppTypography.body,
                      decoration: const InputDecoration(
                        hintText: 'UTR / cheque no. / transaction ID',
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    const _FieldLabel('Notes (optional)'),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: _notesCtrl,
                      maxLines: 2,
                      style: AppTypography.body,
                      decoration: const InputDecoration(hintText: 'Any additional notes…'),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => Navigator.pop(context),
                            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                            child: const Text('Cancel'),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.xs),
                        Expanded(
                          flex: 2,
                          child: FilledButton(
                            onPressed: _submit,
                            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                            child: const Text('Record payment'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(label, style: AppTypography.inputLabel);
  }
}
