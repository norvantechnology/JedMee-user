import 'package:flutter/material.dart';

import '../../core/utils/record_fields.dart';
import '../../widgets/detail_sheet.dart';
import '../../widgets/entity_form_sheet.dart';
import 'master_forms.dart';

const _productBatchGroups = [
  (title: 'Product identity', keys: ['productName', 'batchNo', 'expiryDate']),
  (title: 'Pricing & stock', keys: ['mrp', 'purchaseRate', 'salesRate', 'openingStock']),
];

/// Add / edit form (bottom sheet with validation and sticky actions).
Future<Map<String, String>?> showEntityFormDialog(
  BuildContext context, {
  required String title,
  String? subtitle,
  required List<({String key, String label, bool required})> fields,
  Map<String, String>? initial,
  String saveLabel = 'Save',
}) {
  final isProductBatch = fields.length == MasterFields.productBatch.length &&
      fields.first.key == 'productName';
  final hasRequired = fields.any((f) => f.required);

  return showEntityFormSheet(
    context,
    title: title,
    subtitle: subtitle,
    initial: initial,
    saveLabel: saveLabel,
    requiredNote: hasRequired ? '• Required fields' : null,
    fieldGroups: isProductBatch ? _productBatchGroups : null,
    fields: [
      for (final f in fields)
        (
          key: f.key,
          label: f.label,
          required: f.required,
          hint: _hintForField(f.key),
          keyboard: _keyboardForField(f.key),
          muted: false,
        ),
    ],
  );
}

String? _hintForField(String key) {
  if (key == 'productName') return 'e.g. Paracetamol 500mg';
  if (key == 'expiryDate' || key == 'expiry_date') return 'e.g. 2026-12-31';
  if (key == 'dlExpiryDate' || key == 'dl_expiry_date') return 'e.g. 2026-12-31';
  if (key == 'batchNo') return 'e.g. B001';
  if (key == 'customerType') return 'RETAIL or WHOLESALE';
  if (key == 'gstNumber') return '15-character GSTIN';
  if (key == 'drugLicenseNumber') return 'e.g. DL-12345';
  if (key == 'rackNumber' || key == 'rackNo') return 'e.g. A-01';
  if (key == 'mainCompany') return 'Parent or flagship name';
  if (key == 'code') return 'Optional identifier code';
  if (key == 'shortName') return 'Short display name';
  if (key == 'creditDays') return 'e.g. 30';
  if (key == 'creditLimit') return 'e.g. 50000';
  if (key == 'discountPercent') return 'e.g. 5';
  return null;
}

TextInputType? _keyboardForField(String key) {
  if (key.contains('email')) return TextInputType.emailAddress;
  if (key.contains('phone')) return TextInputType.phone;
  if (key == 'discountPercent') return const TextInputType.numberWithOptions(decimal: true);
  if (key.contains('mrp') ||
      key.contains('rate') ||
      key.contains('credit') ||
      key.contains('qty') ||
      key.contains('amount') ||
      key.contains('stock') ||
      key == 'creditDays' ||
      key == 'creditLimit') {
    return const TextInputType.numberWithOptions(decimal: true);
  }
  return null;
}

/// Record detail view (grouped, labeled fields — no raw API keys).
void showDetailBottomSheet(
  BuildContext context, {
  required String title,
  required Map<String, dynamic> row,
  List<Widget>? actions,
  RecordEntity? entity,
  List<Map<String, dynamic>>? lineItems,
  bool purchaseLineItems = false,
}) {
  final sub = listRowSubtitleFor(row);
  showRecordDetailSheet(
    context,
    title: title,
    subtitle: sub.isNotEmpty ? sub : null,
    row: row,
    actions: actions,
    entity: entity,
    lineItems: lineItems,
    purchaseLineItems: purchaseLineItems,
  );
}
