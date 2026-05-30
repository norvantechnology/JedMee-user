import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_icons.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_typography.dart';
import '../core/utils/api_helpers.dart';
import '../providers/app_providers.dart';
import 'app_bottom_sheet.dart';
import 'snackbar.dart';

/// Simplified CSV import (parse → validate → execute), matching web wizard core.
Future<bool?> showCsvImportSheet(
  BuildContext context, {
  required String entityType,
}) {
  return showAppBottomSheet<bool>(
    context: context,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(ctx).padding.bottom + 72,
      ),
      child: _CsvImportSheet(entityType: entityType),
    ),
  );
}

class _CsvImportSheet extends ConsumerStatefulWidget {
  const _CsvImportSheet({required this.entityType});

  final String entityType;

  @override
  ConsumerState<_CsvImportSheet> createState() => _CsvImportSheetState();
}

class _CsvImportSheetState extends ConsumerState<_CsvImportSheet> {
  int _step = 0;
  bool _busy = false;
  String? _jobId;
  String _duplicateStrategy = 'UPDATE';
  Map<String, dynamic>? _validateSummary;
  String? _error;

  Future<void> _pickAndParse() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['csv', 'xlsx', 'xls'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    final bytes = file.bytes;
    if (bytes == null) {
      setState(() => _error = 'Could not read file');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final b64 = base64Encode(bytes);
    final resp = await ref.read(importRepositoryProvider).parse(
          entityType: widget.entityType,
          filename: file.name,
          contentBase64: b64,
        );
    if (!mounted) return;
    if (!resp.ok) {
      setState(() {
        _busy = false;
        _error = resp.parseErrorMessage();
      });
      return;
    }
    final data = extractDataMap(resp);
    final jobId = data?['jobId'] ?? data?['job_id'];
    if (jobId == null) {
      setState(() {
        _busy = false;
        _error = 'Import job not created';
      });
      return;
    }
    setState(() {
      _jobId = jobId.toString();
      _step = 1;
      _busy = false;
    });
    await _validate();
  }

  Future<void> _validate() async {
    if (_jobId == null) return;
    setState(() => _busy = true);
    final resp = await ref.read(importRepositoryProvider).validate(jobId: _jobId!);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (!resp.ok) {
        _error = resp.parseErrorMessage();
      } else {
        _validateSummary = extractDataMap(resp);
        _step = 2;
      }
    });
  }

  Future<void> _execute() async {
    if (_jobId == null) return;
    setState(() => _busy = true);
    final resp = await ref.read(importRepositoryProvider).execute(
          jobId: _jobId!,
          duplicateStrategy: _duplicateStrategy,
          skipErrors: true,
        );
    if (!mounted) return;
    setState(() => _busy = false);
    if (resp.ok) {
      Navigator.pop(context, true);
      showAppSnack(context, message: 'Import completed', type: AppSnackType.success);
    } else {
      setState(() => _error = resp.parseErrorMessage());
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.md, AppSpacing.md, bottom + AppSpacing.md),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Import CSV', style: AppTypography.sectionTitle),
          Text('Entity: ${widget.entityType}', style: AppTypography.secondary),
          const SizedBox(height: AppSpacing.md),
          if (_error != null) ...[
            Text(_error!, style: AppTypography.secondary.copyWith(color: Colors.red)),
            const SizedBox(height: AppSpacing.sm),
          ],
          if (_step == 0)
            FilledButton.icon(
              onPressed: _busy ? null : _pickAndParse,
              icon: const Icon(AppIcons.importFile),
              label: const Text('Choose file'),
            ),
          if (_step >= 1 && _validateSummary != null) ...[
            Text(
              'Rows: ${_validateSummary!['totalRows'] ?? _validateSummary!['total_rows'] ?? '—'} · '
              'Valid: ${_validateSummary!['validRows'] ?? _validateSummary!['valid_rows'] ?? '—'} · '
              'Errors: ${_validateSummary!['errorRows'] ?? _validateSummary!['error_rows'] ?? 0}',
              style: AppTypography.label,
            ),
            const SizedBox(height: AppSpacing.sm),
            DropdownButtonFormField<String>(
              value: _duplicateStrategy,
              decoration: const InputDecoration(labelText: 'Duplicates'),
              items: const [
                DropdownMenuItem(value: 'SKIP', child: Text('Skip duplicates')),
                DropdownMenuItem(value: 'UPDATE', child: Text('Update existing (recommended)')),
                DropdownMenuItem(value: 'CREATE', child: Text('Create new records')),
              ],
              onChanged: _busy ? null : (v) => setState(() => _duplicateStrategy = v ?? 'UPDATE'),
            ),
            const SizedBox(height: AppSpacing.md),
            FilledButton(
              onPressed: _busy ? null : _execute,
              child: _busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Run import'),
            ),
          ],
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        ],
      ),
    );
  }
}
