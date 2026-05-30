import 'package:flutter/material.dart';

export '../../widgets/saving_overlay.dart';
export 'product_detail_ui.dart';

import '../../core/utils/api_helpers.dart';
import '../../core/utils/record_fields.dart';
import '../../widgets/confirm_dialog.dart';
import '../../widgets/detail_sheet.dart';
import '../../widgets/form_sheet_loading.dart';

/// Detail sheet actions for master entities (customers, vendors, etc.).
List<Widget> masterDetailActions({
  required BuildContext context,
  required bool canUpdate,
  required bool canDelete,
  required VoidCallback onEdit,
  required Future<void> Function() onDelete,
  String deleteConfirmTitle = 'Delete?',
}) {
  return [
    if (canUpdate)
      FilledButton(
        onPressed: () {
          Navigator.pop(context);
          onEdit();
        },
        child: const Text('Edit'),
      ),
    if (canDelete)
      TextButton(
        onPressed: () async {
          final ok = await showConfirmDialog(
            context,
            title: deleteConfirmTitle,
            message: 'This action cannot be undone.',
            destructive: true,
          );
          if (ok != true) return;
          if (!context.mounted) return;
          Navigator.pop(context);
          await onDelete();
        },
        child: const Text('Delete'),
      ),
  ];
}

Future<void> openMasterDetailSheet(
  BuildContext context, {
  required String title,
  required Map<String, dynamic> row,
  required RecordEntity entity,
  required bool canUpdate,
  required bool canDelete,
  required VoidCallback onEdit,
  required Future<void> Function() onDelete,
  String deleteConfirmTitle = 'Delete?',
  String? subtitle,
  List<Widget>? extraActions,
}) async {
  showRecordDetailSheet(
    context,
    title: title,
    subtitle: subtitle ?? rowSubtitle(row),
    row: row,
    entity: entity,
    actions: [
      ...?extraActions,
      ...masterDetailActions(
        context: context,
        canUpdate: canUpdate,
        canDelete: canDelete,
        onEdit: onEdit,
        onDelete: onDelete,
        deleteConfirmTitle: deleteConfirmTitle,
      ),
    ],
  );
}

/// Placeholder while master form dependencies load.
Widget masterFormLoading({String message = 'Loading…'}) =>
    FormSheetLoadingBody(message: message);
