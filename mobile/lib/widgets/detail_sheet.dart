import 'package:flutter/material.dart';

import '../core/app_icons.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_elevation.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';
import '../core/theme/modal_animation_tokens.dart';
import '../core/utils/product_expiry.dart';
import '../core/utils/record_fields.dart';
import 'app_animated_modal.dart';
import 'barcode_display.dart';
import 'expiry_badge.dart';
import 'invoice_line_items_section.dart';
import 'responsive.dart';
import 'section_divider.dart';
import 'status_badge.dart';

/// User-friendly record detail bottom sheet (grouped fields, no raw API keys).
///
/// Uses the spec's bottom-sheet animation:
///   OPEN:  translateY(+40px) + opacity(0) → translateY(0) + opacity(1)
///          300ms, easeOpen cubic-bezier(0.32, 0.72, 0, 1)
///   CLOSE: translateY(0) → translateY(+60px) + opacity(0)
///          200ms, easeClose cubic-bezier(0.4, 0, 1, 0.6)
///   Backdrop: opacity 0 → 0.45
void showRecordDetailSheet(
  BuildContext context, {
  required String title,
  required Map<String, dynamic> row,
  String? subtitle,
  List<Widget>? actions,
  RecordEntity? entity,
  List<Map<String, dynamic>>? lineItems,
  bool purchaseLineItems = false,
}) {
  final reduceMotion = MediaQuery.of(context).disableAnimations;

  showGeneralDialog<void>(
    context: context,
    useRootNavigator: true,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black.withOpacity(ModalAnimationTokens.backdropOpacity),
    transitionDuration: reduceMotion
        ? ModalAnimationTokens.durationReducedMotion
        : ModalAnimationTokens.durationBottomOpen,
    pageBuilder: (ctx, animation, secondaryAnimation) {
      // Align to bottom so DraggableScrollableSheet gets the full screen height
      // as its constraint and positions itself correctly.
      return SafeArea(
        top: false,
        child: Align(
          alignment: Alignment.bottomCenter,
          child: _RecordDetailSheet(
            title: title,
            subtitle: subtitle,
            row: row,
            actions: actions,
            entity: entity,
            lineItems: lineItems,
            purchaseLineItems: purchaseLineItems,
          ),
        ),
      );
    },
    transitionBuilder: (ctx, animation, secondaryAnimation, child) {
      return AppAnimatedModal(
        type: AppModalType.bottom,
        animation: animation,
        child: child,
      );
    },
  );
}

class _RecordDetailSheet extends StatelessWidget {
  const _RecordDetailSheet({
    required this.title,
    required this.row,
    this.subtitle,
    this.actions,
    this.entity,
    this.lineItems,
    this.purchaseLineItems = false,
  });

  final String title;
  final String? subtitle;
  final Map<String, dynamic> row;
  final List<Widget>? actions;
  final RecordEntity? entity;
  final List<Map<String, dynamic>>? lineItems;
  final bool purchaseLineItems;

  @override
  Widget build(BuildContext context) {
    final resolvedEntity = entity ?? detectRecordEntity(row);
    var sections = buildDetailSections(row, entity: resolvedEntity);
    if (resolvedEntity == RecordEntity.productBatch) {
      sections = sections
          .map(
            (s) => DetailSection(
              title: s.title,
              fields: s.fields
                  .where((f) => f.label.toLowerCase() != 'barcode')
                  .toList(),
            ),
          )
          .where((s) => s.fields.isNotEmpty)
          .toList();
    }
    final chips = statusChipsForRow(row);
    final expiry = resolvedEntity == RecordEntity.productBatch
        ? productExpiryUrgency(row)
        : null;
    final barcodeText = (row['barcode'] ?? row['barcode_value'] ?? '')
        .toString()
        .trim();
    final batchProductName = (row['product_name'] ??
            row['productName'] ??
            row['name'] ??
            '')
        .toString();
    final batchNo = (row['batch_no'] ?? row['batchNo'] ?? '').toString();
    final bottom = MediaQuery.paddingOf(context).bottom;

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: Responsive.isNarrow(context) ? 0.72 : 0.58,
      maxChildSize: 0.92,
      minChildSize: 0.38,
      builder: (_, scrollCtrl) {
        // Material widget ensures all Text descendants have a proper
        // Material ancestor — prevents Flutter's default yellow underline
        // (TextDecoration.underline + yellow decorationColor) that appears
        // when Text is rendered without a Material ancestor in overlays
        // created via showGeneralDialog.
        return Material(
          color: AppColors.card,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          clipBehavior: Clip.antiAlias,
          elevation: 0,
          child: DecoratedBox(
            decoration: BoxDecoration(
              boxShadow: AppElevation.modal,
            ),
            child: Column(
              children: [
              const SizedBox(height: 8),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 8, 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (resolvedEntity != RecordEntity.generic) ...[
                      _DetailHeaderIcon(entity: resolvedEntity),
                      const SizedBox(width: 12),
                    ],
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: resolvedEntity == RecordEntity.productBatch
                                ? AppTypography.sectionTitle.copyWith(
                                    fontSize: 17,
                                  )
                                : AppTypography.sectionTitle,
                          ),
                          if (subtitle != null && subtitle!.isNotEmpty ||
                              (chips != null &&
                                  resolvedEntity != RecordEntity.productBatch &&
                                  expiry == null)) ...[
                            const SizedBox(height: 4),
                            Wrap(
                              crossAxisAlignment: WrapCrossAlignment.center,
                              spacing: 6,
                              runSpacing: 4,
                              children: [
                                if (subtitle != null && subtitle!.isNotEmpty)
                                  Text(
                                    subtitle!,
                                    style: AppTypography.secondary.copyWith(
                                      color: AppColors.textMuted,
                                    ),
                                  ),
                                if (expiry != null) ExpiryBadge(urgency: expiry),
                                // Status badges inline with subtitle — not a separate row
                                if (chips != null &&
                                    resolvedEntity != RecordEntity.productBatch &&
                                    expiry == null)
                                  for (final c in chips)
                                    StatusBadge(
                                      status: c,
                                      size: StatusBadgeSize.small,
                                    ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(AppIcons.close),
                      tooltip: 'Close',
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
              const Divider(height: 12),
              Expanded(
                // scrollCtrl from DraggableScrollableSheet must always be
                // attached to a scrollable. CustomScrollView keeps it attached
                // in every state, preventing the null check crash in
                // RenderViewportBase.hitTestChildren during drag gestures.
                child: CustomScrollView(
                  controller: scrollCtrl,
                  slivers: [
                    if (sections.isEmpty)
                      const SliverFillRemaining(
                        hasScrollBody: false,
                        child: Center(
                          child: Text(
                            'No details to show',
                            style: TextStyle(color: AppColors.textFaint),
                          ),
                        ),
                      )
                    else
                      SliverPadding(
                        padding: EdgeInsets.fromLTRB(14, 0, 14, 12 + bottom),
                        sliver: SliverList(
                          delegate: SliverChildListDelegate([
                            if (resolvedEntity == RecordEntity.productBatch) ...[
                              AppBarcodeImage(
                                data: barcodeText,
                                productName: batchProductName.isNotEmpty
                                    ? batchProductName
                                    : null,
                                batchNo:
                                    batchNo.isNotEmpty ? batchNo : null,
                              ),
                              const SizedBox(height: 12),
                            ],
                            for (final section in sections) ...[
                              SectionDividerLabel(label: section.title),
                              const SizedBox(height: 3),
                              if (section.title == 'Record')
                                _RecordMetaCard(fields: section.fields)
                              else
                                Card(
                                  margin: EdgeInsets.zero,
                                  // Financial section gets a subtle tinted background
                                  color: section.title == 'Financial'
                                      ? const Color(0x05000000)
                                      : null,
                                  child: Column(
                                    children: [
                                      for (final field in section.fields)
                                        _DetailRow(field: field),
                                    ],
                                  ),
                                ),
                              const SizedBox(height: 10),
                            ],
                            if (lineItems != null && lineItems!.isNotEmpty) ...[
                              InvoiceLineItemsSection(
                                items: lineItems!,
                                isPurchase: purchaseLineItems,
                              ),
                              const SizedBox(height: 10),
                            ],
                            if (actions != null && actions!.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              _ActionBar(actions: actions!),
                              const SizedBox(height: 6),
                            ],
                          ]),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          ),
        );
      },
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.field});

  final DetailField field;

  bool _isStatusField() {
    final l = field.label.toLowerCase();
    return l.contains('status') ||
        l.contains('health') ||
        l.contains('payment') ||
        field.value.toLowerCase().contains('expir');
  }

  bool _isBoolValue() {
    final v = field.value.toLowerCase();
    return v == 'yes' || v == 'no';
  }

  @override
  Widget build(BuildContext context) {
    Widget valueWidget;
    if (_isStatusField() && field.value != '—') {
      valueWidget = StatusBadge(status: field.value);
    } else if (_isBoolValue()) {
      final yes = field.value.toLowerCase() == 'yes';
      valueWidget = Row(
        mainAxisAlignment: MainAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            yes ? AppIcons.confirm : AppIcons.close,
            size: 16,
            color: yes ? AppColors.boolYesIcon : AppColors.boolNoText,
          ),
          const SizedBox(width: 4),
          Text(
            yes ? 'Yes' : 'No',
            style: AppTypography.detailValue.copyWith(
              color: yes ? AppColors.boolYesText : AppColors.boolNoText,
            ),
          ),
        ],
      );
    } else if (field.value == 'HSN not set') {
      valueWidget = Text(
        field.value,
        textAlign: TextAlign.end,
        style: AppTypography.detailValue.copyWith(
          fontStyle: FontStyle.italic,
          color: AppColors.textFaint,
        ),
      );
    } else {
      valueWidget = Text(
        field.value,
        textAlign: TextAlign.end,
        style: field.highlight ? AppTypography.amount : AppTypography.detailValue,
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: AppColors.colorMix(AppColors.text, 7, AppColors.border),
            width: 0.5,
          ),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            flex: 2,
            child: Text(
              field.label,
              style: AppTypography.detailLabel.copyWith(
                fontSize: 13,
                color: AppColors.text.withOpacity(0.45),
                fontWeight: FontWeight.w400,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Status badges are compact inline — not full-width
          if (_isStatusField() && field.value != '—')
            valueWidget
          else
            Expanded(
              flex: 3,
              child: Align(
                alignment: Alignment.centerRight,
                child: valueWidget,
              ),
            ),
        ],
      ),
    );
  }
}

class _DetailHeaderIcon extends StatelessWidget {
  const _DetailHeaderIcon({required this.entity});

  final RecordEntity entity;

  IconData get _icon => switch (entity) {
        RecordEntity.customer => AppIcons.customer,
        RecordEntity.vendor => AppIcons.supplier,
        RecordEntity.division => AppIcons.divisions,
        RecordEntity.mfgCompany => AppIcons.manufacturers,
        RecordEntity.productBatch => AppIcons.product,
        RecordEntity.payment => AppIcons.payment,
        RecordEntity.user => AppIcons.idCard,
        RecordEntity.salesInvoice => AppIcons.invoice,
        RecordEntity.purchaseInvoice => AppIcons.purchases,
        RecordEntity.salesReturn => AppIcons.salesReturns,
        RecordEntity.purchaseReturn => AppIcons.purchaseReturns,
        RecordEntity.order => AppIcons.stock,
        _ => AppIcons.folder,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(
        color: AppColors.primaryLight,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
      ),
      child: Icon(_icon, color: AppColors.primary, size: 20),
    );
  }
}

class _RecordMetaCard extends StatelessWidget {
  const _RecordMetaCard({required this.fields});

  final List<DetailField> fields;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.colorMix(AppColors.text, 2.5, AppColors.card),
        borderRadius: BorderRadius.circular(AppTheme.radius),
      ),
      child: Column(
        children: [
          for (var i = 0; i < fields.length; i++) ...[
            if (i > 0) const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  fields[i].label,
                  style: AppTypography.secondary.copyWith(
                    color: AppColors.textFaint,
                  ),
                ),
                Text(
                  fields[i].value,
                  style: AppTypography.secondary.copyWith(
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.actions});

  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    if (actions.length == 1) {
      return actions.first;
    }
    // Stack actions vertically with spacing — each action is already a row widget
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < actions.length; i++) ...[
          if (i > 0) const SizedBox(height: 8),
          actions[i],
        ],
      ],
    );
  }
}
