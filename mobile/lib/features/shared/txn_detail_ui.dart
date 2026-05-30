import 'package:flutter/material.dart';

export 'txn_parse_utils.dart';

import '../../core/app_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/record_fields.dart';
import '../../widgets/confirm_dialog.dart';
import 'entity_dialogs.dart';

/// Premium detail sheet for draft/confirmed transaction rows.
///
/// Button hierarchy (top → bottom inside the sheet):
///   1. Primary workflow  — Confirm (filled) + Edit (outlined) side-by-side  [DRAFT]
///                        — Record Payment (filled green, full-width)         [CONFIRMED]
///   2. Document actions  — Print + Share PDF side-by-side
///                        — Send Email + Create Return side-by-side
///   3. ── divider ──
///   4. Destructive       — Cancel Invoice / Delete Draft (outlined red)
void showTxnInvoiceDetail(
  BuildContext context, {
  required String title,
  required Map<String, dynamic> row,
  required RecordEntity entity,
  required String status,
  required bool canEdit,
  required bool canConfirm,
  required bool canCancel,
  required VoidCallback onEdit,
  required Future<void> Function() onConfirm,
  required Future<void> Function() onCancel,
  List<Map<String, dynamic>>? lineItems,
  bool purchaseLineItems = false,
  // Optional extended actions
  bool canRecordPayment = false,
  Future<void> Function()? onRecordPayment,
  bool canSendEmail = false,
  Future<void> Function()? onSendEmail,
  bool canDelete = false,
  Future<void> Function()? onDelete,
  bool canPrint = false,
  Future<void> Function()? onPrint,
  Future<void> Function()? onShare,
  Future<void> Function()? onDownloadPdf,
  Future<void> Function()? onMarkPaid,
  Future<void> Function()? onDuplicate,
  bool canCreateReturn = false,
  VoidCallback? onCreateReturn,
}) {
  final upper = status.toUpperCase();
  final isDraft = upper == 'DRAFT';
  final isCancelled = upper == 'CANCELLED';
  final isConfirmed = upper == 'CONFIRMED';

  // ── Pre-build all callbacks (each closes the sheet before acting) ──────────
  final cbEdit = (isDraft && canEdit)
      ? () {
          Navigator.pop(context);
          onEdit();
        }
      : null;

  final cbConfirm = (isDraft && canConfirm)
      ? () async {
          Navigator.pop(context);
          final ok = await showConfirmDialog(context, title: 'Confirm this invoice?');
          if (ok == true) await onConfirm();
        }
      : null;

  final cbPayment = (isConfirmed && canRecordPayment && onRecordPayment != null)
      ? () async {
          Navigator.pop(context);
          await onRecordPayment();
        }
      : null;

  final cbPrint = (canPrint && onPrint != null)
      ? () async {
          Navigator.pop(context);
          await onPrint();
        }
      : null;

  final cbShare = (onShare != null)
      ? () async {
          Navigator.pop(context);
          await onShare();
        }
      : null;

  final cbEmail = (canSendEmail && onSendEmail != null)
      ? () async {
          Navigator.pop(context);
          await onSendEmail();
        }
      : null;

  final cbCreateReturn =
      (isConfirmed && canCreateReturn && onCreateReturn != null)
          ? () {
              Navigator.pop(context);
              onCreateReturn();
            }
          : null;

  final cbCancel = (!isCancelled && canCancel)
      ? () async {
          Navigator.pop(context);
          final ok = await showConfirmDialog(
            context,
            title: 'Cancel this record?',
            destructive: true,
          );
          if (ok == true) await onCancel();
        }
      : null;

  final cbDelete = (isDraft && canDelete && onDelete != null)
      ? () async {
          Navigator.pop(context);
          final ok = await showConfirmDialog(
            context,
            title: 'Delete this draft?',
            destructive: true,
          );
          if (ok == true) await onDelete!();
        }
      : null;

  showDetailBottomSheet(
    context,
    title: title,
    row: row,
    entity: entity,
    lineItems: lineItems,
    purchaseLineItems: purchaseLineItems,
    actions: [
      _TxnActionSection(
        isDraft: isDraft,
        // workflow
        onEdit: cbEdit,
        onConfirm: cbConfirm,
        // payment
        onPayment: cbPayment,
        // document
        onPrint: cbPrint,
        onShare: cbShare,
        onEmail: cbEmail,
        onCreateReturn: cbCreateReturn,
        // destructive
        onCancel: cbCancel,
        onDelete: cbDelete,
      ),
    ],
  );
}

/// Detail sheet for return documents (confirm / cancel only).
void showTxnReturnDetail(
  BuildContext context, {
  required String title,
  required Map<String, dynamic> row,
  required RecordEntity entity,
  required String status,
  required bool canConfirm,
  required bool canCancel,
  required Future<void> Function() onConfirm,
  required Future<void> Function() onCancel,
  List<Map<String, dynamic>>? lineItems,
  bool purchaseLineItems = false,
}) {
  showTxnInvoiceDetail(
    context,
    title: title,
    row: row,
    entity: entity,
    status: status,
    canEdit: false,
    canConfirm: canConfirm,
    canCancel: canCancel,
    lineItems: lineItems,
    purchaseLineItems: purchaseLineItems,
    onEdit: () {},
    onConfirm: onConfirm,
    onCancel: onCancel,
  );
}

// ─── Action section ───────────────────────────────────────────────────────────

/// Renders all action buttons for a transaction detail sheet in a clean,
/// hierarchical layout:
///
///  DRAFT
///  ┌──────────┐  ┌──────────────────────────┐
///  │   Edit   │  │  ✓  Confirm Invoice  →   │  ← primary (filled)
///  └──────────┘  └──────────────────────────┘
///
///  CONFIRMED
///  ┌──────────────────────────────────────────┐
///  │  💳  Record Payment                      │  ← primary (filled green)
///  └──────────────────────────────────────────┘
///
///  Document actions (both states)
///  ┌──────────────┐  ┌──────────────┐
///  │  🖨  Print   │  │  ↗  Share PDF │
///  └──────────────┘  └──────────────┘
///  ┌──────────────┐  ┌──────────────────────┐
///  │  📧  Email   │  │  ↩  Create Return    │
///  └──────────────┘  └──────────────────────┘
///
///  ─────────────────────────────────────────── divider
///
///  ┌──────────────────────────────────────────┐
///  │  ✕  Cancel Invoice                       │  ← destructive (outlined red)
///  └──────────────────────────────────────────┘
class _TxnActionSection extends StatelessWidget {
  const _TxnActionSection({
    required this.isDraft,
    this.onEdit,
    this.onConfirm,
    this.onPayment,
    this.onPrint,
    this.onShare,
    this.onEmail,
    this.onCreateReturn,
    this.onCancel,
    this.onDelete,
  });

  final bool isDraft;

  // Workflow
  final VoidCallback? onEdit;
  final VoidCallback? onConfirm;

  // Payment
  final VoidCallback? onPayment;

  // Document
  final VoidCallback? onPrint;
  final VoidCallback? onShare;
  final VoidCallback? onEmail;
  final VoidCallback? onCreateReturn;

  // Destructive
  final VoidCallback? onCancel;
  final VoidCallback? onDelete;

  bool get _hasWorkflow => onEdit != null || onConfirm != null;
  bool get _hasPayment => onPayment != null;
  bool get _hasPrintShare => onPrint != null || onShare != null;
  bool get _hasEmailReturn => onEmail != null || onCreateReturn != null;
  bool get _hasDocuments => _hasPrintShare || _hasEmailReturn;
  bool get _hasDestructive => onCancel != null || onDelete != null;
  bool get _hasAny =>
      _hasWorkflow || _hasPayment || _hasDocuments || _hasDestructive;

  @override
  Widget build(BuildContext context) {
    if (!_hasAny) return const SizedBox.shrink();

    final children = <Widget>[];

    // ── 1. Primary workflow (DRAFT: Edit + Confirm) ───────────────────────────
    if (isDraft && _hasWorkflow) {
      children.add(
        Row(
          children: [
            if (onEdit != null)
              Expanded(
                child: _TxnBtn.outlined(
                  label: 'Edit',
                  icon: AppIcons.edit,
                  onPressed: onEdit!,
                ),
              ),
            if (onEdit != null && onConfirm != null)
              const SizedBox(width: AppSpacing.sm),
            if (onConfirm != null)
              Expanded(
                flex: onEdit != null ? 2 : 1,
                child: _TxnBtn.filled(
                  label: 'Confirm Invoice',
                  icon: AppIcons.confirm,
                  onPressed: onConfirm!,
                ),
              ),
          ],
        ),
      );
    }

    // ── 2. Record Payment (CONFIRMED, full-width, most prominent) ─────────────
    if (_hasPayment) {
      if (children.isNotEmpty) children.add(const SizedBox(height: AppSpacing.sm));
      children.add(
        _TxnBtn.filledSuccess(
          label: 'Record Payment',
          icon: AppIcons.payment,
          onPressed: onPayment!,
        ),
      );
    }

    // ── 3. Document actions ───────────────────────────────────────────────────
    if (_hasDocuments) {
      if (children.isNotEmpty) children.add(const SizedBox(height: AppSpacing.sm));

      // Print + Share PDF
      if (_hasPrintShare) {
        children.add(
          Row(
            children: [
              if (onPrint != null)
                Expanded(
                  child: _TxnBtn.outlined(
                    label: 'Print',
                    icon: AppIcons.print,
                    onPressed: onPrint!,
                  ),
                ),
              if (onPrint != null && onShare != null)
                const SizedBox(width: AppSpacing.sm),
              if (onShare != null)
                Expanded(
                  child: _TxnBtn.outlined(
                    label: 'Share PDF',
                    icon: AppIcons.share,
                    onPressed: onShare!,
                  ),
                ),
            ],
          ),
        );
      }

      // Send Email + Create Return
      if (_hasEmailReturn) {
        if (_hasPrintShare) children.add(const SizedBox(height: AppSpacing.xs));
        children.add(
          Row(
            children: [
              if (onEmail != null)
                Expanded(
                  child: _TxnBtn.outlined(
                    label: 'Send Email',
                    icon: AppIcons.email,
                    onPressed: onEmail!,
                  ),
                ),
              if (onEmail != null && onCreateReturn != null)
                const SizedBox(width: AppSpacing.sm),
              if (onCreateReturn != null)
                Expanded(
                  child: _TxnBtn.outlinedAccent(
                    label: 'Create Return',
                    icon: AppIcons.undo,
                    onPressed: onCreateReturn!,
                  ),
                ),
            ],
          ),
        );
      }
    }

    // ── 4. Destructive actions (separated by divider) ─────────────────────────
    if (_hasDestructive) {
      children.add(const SizedBox(height: AppSpacing.md));
      children.add(
        const Divider(height: 1, thickness: 0.5, color: AppColors.border),
      );
      children.add(const SizedBox(height: AppSpacing.sm));

      // Cancel Invoice
      if (onCancel != null) {
        children.add(
          _TxnBtn.destructive(
            label: 'Cancel Invoice',
            icon: AppIcons.cancel,
            onPressed: onCancel!,
          ),
        );
      }

      // Delete Draft (only for drafts — shown below Cancel if both present)
      if (onDelete != null) {
        if (onCancel != null) children.add(const SizedBox(height: AppSpacing.xs));
        children.add(
          _TxnBtn.destructive(
            label: 'Delete Draft',
            icon: AppIcons.delete,
            onPressed: onDelete!,
          ),
        );
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    );
  }
}

// ─── Button primitives ────────────────────────────────────────────────────────

enum _TxnBtnVariant { filled, filledSuccess, outlined, outlinedAccent, destructive }

/// Unified button widget used exclusively inside transaction detail sheets.
/// All variants share the same height (48 px) and border-radius for visual
/// consistency across the entire action section.
class _TxnBtn extends StatelessWidget {
  const _TxnBtn._({
    required this.label,
    required this.icon,
    required this.onPressed,
    required this.variant,
  });

  /// Primary workflow action — filled with brand colour.
  factory _TxnBtn.filled({
    required String label,
    required IconData icon,
    required VoidCallback onPressed,
  }) =>
      _TxnBtn._(
        label: label,
        icon: icon,
        onPressed: onPressed,
        variant: _TxnBtnVariant.filled,
      );

  /// Financial action — filled with success/green colour.
  factory _TxnBtn.filledSuccess({
    required String label,
    required IconData icon,
    required VoidCallback onPressed,
  }) =>
      _TxnBtn._(
        label: label,
        icon: icon,
        onPressed: onPressed,
        variant: _TxnBtnVariant.filledSuccess,
      );

  /// Standard secondary action — outlined with default border.
  factory _TxnBtn.outlined({
    required String label,
    required IconData icon,
    required VoidCallback onPressed,
  }) =>
      _TxnBtn._(
        label: label,
        icon: icon,
        onPressed: onPressed,
        variant: _TxnBtnVariant.outlined,
      );

  /// Accent secondary action (e.g. Create Return) — outlined with warning tint.
  factory _TxnBtn.outlinedAccent({
    required String label,
    required IconData icon,
    required VoidCallback onPressed,
  }) =>
      _TxnBtn._(
        label: label,
        icon: icon,
        onPressed: onPressed,
        variant: _TxnBtnVariant.outlinedAccent,
      );

  /// Destructive action — outlined with red colour, never filled red.
  factory _TxnBtn.destructive({
    required String label,
    required IconData icon,
    required VoidCallback onPressed,
  }) =>
      _TxnBtn._(
        label: label,
        icon: icon,
        onPressed: onPressed,
        variant: _TxnBtnVariant.destructive,
      );

  final String label;
  final IconData icon;
  final VoidCallback onPressed;
  final _TxnBtnVariant variant;

  static const double _height = 48;
  static const double _iconSize = 16;

  OutlinedBorder get _shape => RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
      );

  @override
  Widget build(BuildContext context) {
    switch (variant) {
      case _TxnBtnVariant.filled:
        return SizedBox(
          height: _height,
          child: FilledButton.icon(
            onPressed: onPressed,
            icon: Icon(icon, size: _iconSize),
            label: Text(label),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              shape: _shape,
              textStyle: AppTypography.labelSemibold,
            ),
          ),
        );

      case _TxnBtnVariant.filledSuccess:
        return SizedBox(
          height: _height,
          child: FilledButton.icon(
            onPressed: onPressed,
            icon: Icon(icon, size: _iconSize),
            label: Text(label),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.success,
              shape: _shape,
              textStyle: AppTypography.labelSemibold,
            ),
          ),
        );

      case _TxnBtnVariant.outlined:
        return SizedBox(
          height: _height,
          child: OutlinedButton.icon(
            onPressed: onPressed,
            icon: Icon(icon, size: _iconSize),
            label: Text(label),
            style: OutlinedButton.styleFrom(
              shape: _shape,
              textStyle: AppTypography.labelSemibold,
            ),
          ),
        );

      case _TxnBtnVariant.outlinedAccent:
        return SizedBox(
          height: _height,
          child: OutlinedButton.icon(
            onPressed: onPressed,
            icon: Icon(icon, size: _iconSize),
            label: Text(label),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.warning,
              side: BorderSide(color: AppColors.warning.withOpacity(0.5)),
              shape: _shape,
              textStyle: AppTypography.labelSemibold,
            ),
          ),
        );

      case _TxnBtnVariant.destructive:
        return SizedBox(
          height: _height,
          child: OutlinedButton.icon(
            onPressed: onPressed,
            icon: Icon(icon, size: _iconSize),
            label: Text(label),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.alertRedIcon,
              side: const BorderSide(
                color: AppColors.alertRedBorder,
                width: 0.75,
              ),
              shape: _shape,
              textStyle: AppTypography.labelSemibold,
            ),
          ),
        );
    }
  }
}
