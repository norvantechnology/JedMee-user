import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/skeleton_loader.dart';
import '../../widgets/responsive.dart';

/// Invoice add/edit page shell: scrollable form body + fixed footer actions.
class InvoiceEditorScaffold extends StatelessWidget {
  const InvoiceEditorScaffold({
    super.key,
    required this.title,
    required this.loading,
    required this.body,
    required this.onCancel,
    this.onSaveDraft,
    this.onConfirm,
    this.saveDraftLabel = 'Save draft',
    this.confirmLabel = 'Confirm',
    this.saving = false,
    this.autoSaving = false,
    this.showConfirm = true,
    this.footerSummary,
  });

  final String title;
  final bool loading;
  final Widget body;
  final VoidCallback onCancel;
  final VoidCallback? onSaveDraft;
  final VoidCallback? onConfirm;
  final String saveDraftLabel;
  final String confirmLabel;
  final bool saving;
  final bool autoSaving;
  final bool showConfirm;
  final Widget? footerSummary;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: Text(title, style: AppTypography.pageTitle),
        centerTitle: false,
        actions: [
          if (autoSaving && !saving)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: Center(
                child: Text('Saving…', style: TextStyle(fontSize: 12)),
              ),
            ),
          if (saving)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
        ],
      ),
      body: loading
          ? const SkeletonLoader(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  children: [
                    SkeletonCard(lines: 4),
                    SizedBox(height: 16),
                    SkeletonCard(lines: 6),
                  ],
                ),
              ),
            )
          : Column(
              children: [
                Expanded(
                  child: Builder(
                    builder: (ctx) {
                      final pad = Responsive.pagePadding(ctx);
                      return ListView(
                        padding: EdgeInsets.fromLTRB(
                          pad.left,
                          6,
                          pad.right,
                          12,
                        ),
                        children: [body],
                      );
                    },
                  ),
                ),
                _InvoiceEditorFooter(
                  saving: saving,
                  onCancel: onCancel,
                  onSaveDraft: onSaveDraft,
                  onConfirm: onConfirm,
                  saveDraftLabel: saveDraftLabel,
                  confirmLabel: confirmLabel,
                  showConfirm: showConfirm,
                  footerSummary: footerSummary,
                ),
              ],
            ),
    );
  }
}

class _InvoiceEditorFooter extends StatelessWidget {
  const _InvoiceEditorFooter({
    required this.saving,
    required this.onCancel,
    this.onSaveDraft,
    this.onConfirm,
    required this.saveDraftLabel,
    required this.confirmLabel,
    required this.showConfirm,
    this.footerSummary,
  });

  final bool saving;
  final VoidCallback onCancel;
  final VoidCallback? onSaveDraft;
  final VoidCallback? onConfirm;
  final String saveDraftLabel;
  final String confirmLabel;
  final bool showConfirm;
  final Widget? footerSummary;

  @override
  Widget build(BuildContext context) {
    // pagePadding reads MediaQuery — store once per build.
    final pad = Responsive.pagePadding(context);
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.card,
        border: Border(
          top: BorderSide(color: AppColors.border, width: 0.5),
        ),
        boxShadow: [
          BoxShadow(
            color: Color(0x0A0F172A),
            blurRadius: 16,
            offset: Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(pad.left, 4, pad.right, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (footerSummary != null) footerSummary!,
              if (onSaveDraft != null)
                Align(
                  child: TextButton(
                    onPressed: saving ? null : onSaveDraft,
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text(
                      saveDraftLabel,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.saveDraftLink,
                        fontWeight: FontWeight.w500,
                        fontSize: 13,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                ),
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 48,
                      child: OutlinedButton(
                        onPressed: saving ? null : onCancel,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.textMuted,
                          backgroundColor: Colors.transparent,
                          side: BorderSide(
                            color: AppColors.colorMix(AppColors.text, 18, AppColors.border),
                            width: 0.5,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          textStyle: AppTypography.labelSemibold,
                        ),
                        child: const Text('Cancel'),
                      ),
                    ),
                  ),
                  if (showConfirm && onConfirm != null) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: SizedBox(
                        height: 48,
                        child: FilledButton(
                          onPressed: saving ? null : onConfirm,
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            textStyle: AppTypography.labelSemibold,
                          ),
                          child: Text(
                            confirmLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Collapsible form block — keeps new-invoice screens focused on line items.
class CollapsibleInvoiceSection extends StatefulWidget {
  const CollapsibleInvoiceSection({
    super.key,
    required this.title,
    required this.children,
    this.subtitle,
    this.initiallyExpanded = false,
  });

  final String title;
  final String? subtitle;
  final List<Widget> children;
  final bool initiallyExpanded;

  @override
  State<CollapsibleInvoiceSection> createState() =>
      _CollapsibleInvoiceSectionState();
}

class _CollapsibleInvoiceSectionState extends State<CollapsibleInvoiceSection> {
  late bool _expanded;

  @override
  void initState() {
    super.initState();
    _expanded = widget.initiallyExpanded;
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.title, style: AppTypography.sectionTitle),
                        if (widget.subtitle != null) ...[
                          const SizedBox(height: 3),
                          Text(widget.subtitle!, style: AppTypography.secondary),
                        ],
                      ],
                    ),
                  ),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    color: AppColors.textMuted,
                  ),
                ],
              ),
            ),
          ),
          if (_expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: widget.children,
              ),
            ),
        ],
      ),
    );
  }
}

/// Grouped form block with title.
class InvoiceFormSection extends StatelessWidget {
  const InvoiceFormSection({
    super.key,
    required this.title,
    required this.children,
    this.subtitle,
    this.footerNote,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final String? footerNote;
  final List<Widget> children;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border, width: 0.5),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D000000),
            blurRadius: 4,
            offset: Offset(0, 1),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
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
                        title,
                        style: AppTypography.sectionTitle.copyWith(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 3),
                        Text(subtitle!, style: AppTypography.secondary),
                      ],
                    ],
                  ),
                ),
                if (trailing != null) ...[
                  const SizedBox(width: 8),
                  trailing!,
                ],
              ],
            ),
            if (footerNote != null) ...[
              const SizedBox(height: 6),
              Text(footerNote!, style: AppTypography.requiredNote),
            ],
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }
}
