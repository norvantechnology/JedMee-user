import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/export/export_columns.dart';
import '../../core/utils/access.dart';
import '../../core/utils/api_helpers.dart';
import '../../core/utils/record_fields.dart';
import '../../providers/app_providers.dart';
import '../../providers/auth_controller.dart';
import '../../core/app_icons.dart';
import '../../widgets/app_bottom_nav.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/snackbar.dart';
import '../shared/permission_gate.dart';
import '../shared/txn_detail_loader.dart';
import '../shared/txn_detail_ui.dart';
import '../shared/txn_list_widgets.dart';

class SalesReturnsScreen extends ConsumerStatefulWidget {
  const SalesReturnsScreen({super.key});

  @override
  ConsumerState<SalesReturnsScreen> createState() => _SalesReturnsScreenState();
}

class _SalesReturnsScreenState extends ConsumerState<SalesReturnsScreen> {
  final _listKey = GlobalKey<TxnListPageState>();

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).auth;
    final canAdd = can(auth, 'SALES_RETURNS', 'ADD');

    return PermissionGate(
      resource: 'SALES_RETURNS',
      action: 'VIEW',
      title: 'Sales Returns',
      child: AppShell(
        title: 'Sales Returns',
        // 5-button bar: [Import, Filter] | New Return | [Export]
        bottomBar: AppBottomActionBar(
          primaryAction: BottomAction(
            icon: AppIcons.salesReturns,
            label: 'New Return',
            tooltip: 'Create a return from a confirmed sales invoice',
            onTap: canAdd
                ? () => showAppSnack(
                      context,
                      message:
                          'Open Sales & Billing → tap a confirmed invoice → Create Return.',
                    )
                : null,
            enabled: canAdd,
          ),
          leadingActions: [
            BottomAction(
              icon: AppIcons.importFile,
              tooltip: 'Import returns (CSV)',
              onTap: () => _listKey.currentState?.triggerImport(),
            ),
            BottomAction(
              icon: AppIcons.filter,
              tooltip: 'Filter returns',
              onTap: () => _listKey.currentState?.openFilterSheet(),
            ),
          ],
          trailingActions: [
            BottomAction(
              icon: AppIcons.download,
              tooltip: 'Export returns (CSV)',
              onTap: () => _listKey.currentState?.triggerExport(),
            ),
          ],
        ),
        child: TxnListPage(
          key: _listKey,
          searchHint: 'Search returns…',
          emptyTitle: 'No sales returns',
          emptyMessage: 'Create a return from a confirmed sales invoice.',
          statusFilters: const ['DRAFT', 'CONFIRMED', 'CANCELLED'],
          showDateFilter: true,
          importEntityType: 'SALES_RETURNS',
          exportColumns: ExportColumns.returns(numberKey: 'return_number'),
          exportFilename: 'sales-returns',
          hideToolbar: true, // Import/Export moved to bottom action bar
          load: (search, status) async {
            final resp = await ref.read(salesRepositoryProvider).listSalesReturns({
              if (search.isNotEmpty) 'search': search,
              if (status != null) 'status': status,
            });
            return listFromResponse(resp);
          },
          onRowTap: (row, refresh) async {
            final id = row['id'];
            if (id == null) return;

            final detail = await withDetailLoading(context, () async {
              final resp = await ref.read(salesRepositoryProvider).getSalesReturn(id);
              return parseReturnDetail(resp);
            });
            if (!context.mounted) return;

            final header = mergeInvoiceHeader(row, detail?.header);
            final items = detail?.items ?? const [];
            final status = (header['status'] ?? row['status'] ?? '').toString().toUpperCase();

            showTxnReturnDetail(
              context,
              title: rowLabel(header, ['return_number', 'returnNumber', 'return_no']),
              row: header,
              entity: RecordEntity.salesReturn,
              status: status,
              lineItems: items,
              canConfirm: can(auth, 'SALES_RETURNS', 'CONFIRM'),
              canCancel: can(auth, 'SALES_RETURNS', 'CANCEL'),
              onConfirm: () async {
                final resp =
                    await ref.read(salesRepositoryProvider).confirmSalesReturn(id);
                if (!context.mounted) return;
                if (resp.ok) {
                  showAppSnack(context, message: 'Return confirmed', type: AppSnackType.success);
                  refresh();
                } else {
                  showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
                }
              },
              onCancel: () async {
                final resp =
                    await ref.read(salesRepositoryProvider).cancelSalesReturn(id);
                if (!context.mounted) return;
                if (resp.ok) {
                  showAppSnack(context, message: 'Return cancelled', type: AppSnackType.success);
                  refresh();
                } else {
                  showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
                }
              },
            );
          },
        ),
      ),
    );
  }
}
