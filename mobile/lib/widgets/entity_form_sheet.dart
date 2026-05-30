import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/app_icons.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';
import '../core/theme/modal_animation_tokens.dart';
import 'app_animated_modal.dart';
import 'section_divider.dart';

typedef FormFieldDef = ({
  String key,
  String label,
  bool required,
  String? hint,
  TextInputType? keyboard,
  bool muted,
});

typedef FormFieldGroup = ({String title, List<String> keys});

/// Bottom-sheet form for add/edit with labels above inputs and sticky actions.
///
/// Uses the spec's bottom-sheet animation:
///   OPEN:  translateY(+40px) + opacity(0) → translateY(0) + opacity(1)
///          300ms, easeOpen cubic-bezier(0.32, 0.72, 0, 1)
///   CLOSE: translateY(0) → translateY(+60px) + opacity(0)
///          200ms, easeClose cubic-bezier(0.4, 0, 1, 0.6)
///   Backdrop: opacity 0 → 0.45
Future<Map<String, String>?> showEntityFormSheet(
  BuildContext context, {
  required String title,
  String? subtitle,
  required List<FormFieldDef> fields,
  Map<String, String>? initial,
  String saveLabel = 'Save',
  List<FormFieldGroup>? fieldGroups,
  String? requiredNote,
}) async {
  final reduceMotion = MediaQuery.of(context).disableAnimations;

  return showGeneralDialog<Map<String, String>>(
    context: context,
    useRootNavigator: true,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black.withOpacity(ModalAnimationTokens.backdropOpacity),
    transitionDuration: reduceMotion
        ? ModalAnimationTokens.durationReducedMotion
        : ModalAnimationTokens.durationBottomOpen,
    pageBuilder: (ctx, animation, secondaryAnimation) {
      return SafeArea(
        top: false,
        child: Align(
          alignment: Alignment.bottomCenter,
          child: _EntityFormSheet(
            title: title,
            subtitle: subtitle,
            fields: fields,
            initial: initial,
            saveLabel: saveLabel,
            fieldGroups: fieldGroups,
            requiredNote: requiredNote,
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

class _EntityFormSheet extends StatefulWidget {
  const _EntityFormSheet({
    required this.title,
    required this.fields,
    this.subtitle,
    this.initial,
    this.saveLabel = 'Save',
    this.fieldGroups,
    this.requiredNote,
  });

  final String title;
  final String? subtitle;
  final List<FormFieldDef> fields;
  final Map<String, String>? initial;
  final String saveLabel;
  final List<FormFieldGroup>? fieldGroups;
  final String? requiredNote;

  @override
  State<_EntityFormSheet> createState() => _EntityFormSheetState();
}

class _EntityFormSheetState extends State<_EntityFormSheet> {
  late final Map<String, TextEditingController> _ctrls;
  final _formKey = GlobalKey<FormState>();
  String? _error;

  @override
  void initState() {
    super.initState();
    _ctrls = {
      for (final f in widget.fields)
        f.key: TextEditingController(text: widget.initial?[f.key] ?? ''),
    };
  }

  @override
  void dispose() {
    for (final c in _ctrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(
      context,
      {for (final f in widget.fields) f.key: _ctrls[f.key]!.text.trim()},
    );
  }

  FormFieldDef? _def(String key) {
    for (final f in widget.fields) {
      if (f.key == key) return f;
    }
    return null;
  }

  List<Widget> _buildFormChildren() {
    if (widget.fieldGroups == null || widget.fieldGroups!.isEmpty) {
      return widget.fields.map(_buildField).toList();
    }

    final children = <Widget>[];
    for (var gi = 0; gi < widget.fieldGroups!.length; gi++) {
      final group = widget.fieldGroups![gi];
      if (gi > 0) children.add(const SizedBox(height: 4));
      children.add(SectionDividerLabel(label: group.title));
      for (final key in group.keys) {
        final f = _def(key);
        if (f != null) children.add(_buildField(f));
      }
    }
    return children;
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.sizeOf(context).height * 0.92;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxH),
        child: Container(
          decoration: const BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
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
                padding: const EdgeInsets.fromLTRB(16, 12, 10, 0),
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
                          if (widget.requiredNote != null) ...[
                            const SizedBox(height: 4),
                            Text(widget.requiredNote!, style: AppTypography.requiredNote),
                          ],
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(AppIcons.close),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
              const Divider(height: 12),
              Flexible(
                child: Form(
                  key: _formKey,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
                    shrinkWrap: true,
                    children: [
                      if (_error != null) ...[
                                Container(
                                  padding: const EdgeInsets.all(AppSpacing.sm),
                                  decoration: BoxDecoration(
                                    color: AppColors.dangerLight,
                                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                                    border: Border.all(color: AppColors.alertRedBorder),
                                  ),
                                  child: Text(
                                    _error!,
                                    style: AppTypography.caption.copyWith(
                                      color: AppColors.dangerDark,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: AppSpacing.sm),
                              ],
                      ..._buildFormChildren(),
                    ],
                  ),
                ),
              ),
              Container(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  AppSpacing.xs,
                  AppSpacing.md,
                  AppSpacing.sm + MediaQuery.paddingOf(context).bottom,
                ),
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: AppColors.border, width: 0.5)),
                  color: AppColors.card,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(context),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.textMuted,
                          backgroundColor: Colors.transparent,
                          side: BorderSide(
                            color: AppColors.colorMix(AppColors.text, 18, AppColors.border),
                            width: 0.5,
                          ),
                          minimumSize: const Size(0, 44),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                          ),
                          textStyle: AppTypography.labelSemibold,
                        ),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 2,
                      child: FilledButton(
                        onPressed: _submit,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          minimumSize: const Size(0, 44),
                          elevation: 2,
                          shadowColor: AppColors.primary.withOpacity(0.28),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                          ),
                          textStyle: AppTypography.labelSemibold,
                        ),
                        child: Text(widget.saveLabel),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildField(FormFieldDef f) {
    final isMultiline = f.key == 'notes' || f.key == 'address';
    final fieldBorderColor = AppColors.colorMix(AppColors.text, 14, AppColors.border);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.formGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(f.label, style: AppTypography.inputLabel),
              if (f.required)
                Text(
                  ' •',
                  style: AppTypography.inputLabel.copyWith(
                    color: AppColors.danger,
                    fontWeight: FontWeight.w700,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          TextFormField(
            controller: _ctrls[f.key],
            keyboardType: f.keyboard ??
                (f.key.contains('email')
                    ? TextInputType.emailAddress
                    : f.key.contains('phone')
                        ? TextInputType.phone
                        : f.key.contains('amount') ||
                                f.key.contains('mrp') ||
                                f.key.contains('rate') ||
                                f.key.contains('credit') ||
                                f.key.contains('qty') ||
                                f.key.contains('stock')
                            ? const TextInputType.numberWithOptions(decimal: true)
                            : TextInputType.text),
            inputFormatters: f.keyboard == TextInputType.number ||
                    (f.key.contains('mrp') ||
                        f.key.contains('rate') ||
                        f.key.contains('credit') ||
                        f.key.contains('stock'))
                ? [FilteringTextInputFormatter.allow(RegExp(r'[\d.]'))]
                : null,
            maxLines: isMultiline ? 3 : 1,
            style: AppTypography.body.copyWith(
              color: f.muted ? AppColors.textMuted : AppColors.text,
            ),
            enabled: !f.muted,
            decoration: InputDecoration(
              hintText: f.hint,
              hintStyle: AppTypography.secondary,
              filled: true,
              fillColor: f.muted ? AppColors.surface : AppColors.card,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.radius),
                borderSide: BorderSide(color: fieldBorderColor, width: 0.5),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.radius),
                borderSide: BorderSide(color: fieldBorderColor, width: 0.5),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.radius),
                borderSide: BorderSide(
                  color: AppColors.colorMix(AppColors.text, 8, AppColors.border),
                  width: 0.5,
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.radius),
                borderSide: const BorderSide(color: AppColors.primaryMid),
              ),
              focusedErrorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppTheme.radius),
                borderSide: const BorderSide(color: AppColors.danger),
              ),
            ),
            validator: (v) {
              if (f.required && (v == null || v.trim().isEmpty)) {
                return '${f.label} is required';
              }
              return null;
            },
          ),
          if (f.muted)
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text(
                'Auto-calculated',
                style: AppTypography.secondary,
              ),
            ),
        ],
      ),
    );
  }
}
