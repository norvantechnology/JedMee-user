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

class PurchaseReturnsScreen extends ConsumerStatefulWidget {
  const PurchaseReturnsScreen({super.key});

  @override
  ConsumerState<PurchaseReturnsScreen> createState() =>
      _PurchaseReturnsScreenState();
}

class _PurchaseReturnsScreenState extends ConsumerState<PurchaseReturnsScreen> {
  final _listKey = GlobalKey<TxnListPageState>();

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).auth;
    final canAdd = can(auth, 'PURCHASE_RETURNS', 'ADD');

    return PermissionGate(
      resource: 'PURCHASE_RETURNS',
      action: 'VIEW',
      title: 'Purchase Returns',
      child: AppShell(
        title: 'Purchase Returns',
        // 5-button bar: [Import, Filter] | New Return | [Export]
        bottomBar: AppBottomActionBar(
          primaryAction: BottomAction(
            icon: AppIcons.purchaseReturns,
            label: 'New Return',
            tooltip: 'Create a return from a confirmed purchase invoice',
            onTap: canAdd
                ? () => showAppSnack(
                      context,
                      message:
                          'Open Purchases → tap a confirmed invoice → Create Return.',
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
          emptyTitle: 'No purchase returns',
          emptyMessage: 'Create a return from a confirmed purchase invoice.',
          statusFilters: const ['DRAFT', 'CONFIRMED'],
          showDateFilter: true,
          importEntityType: 'PURCHASE_RETURNS',
          exportColumns: ExportColumns.returns(numberKey: 'return_number'),
          exportFilename: 'purchase-returns',
          hideToolbar: true, // Import/Export moved to bottom action bar
          load: (search, status) async {
            final resp = await ref.read(purchaseRepositoryProvider).listPurchaseReturns({
              if (search.isNotEmpty) 'search': search,
              if (status != null) 'status': status,
            });
            return listFromResponse(resp);
          },
          onRowTap: (row, refresh) async {
            final id = row['id'];
            if (id == null) return;

            final detail = await withDetailLoading(context, () async {
              final resp =
                  await ref.read(purchaseRepositoryProvider).getPurchaseReturn(id);
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
              entity: RecordEntity.purchaseReturn,
              status: status,
              lineItems: items,
              purchaseLineItems: true,
              canConfirm: can(auth, 'PURCHASE_RETURNS', 'CONFIRM'),
              canCancel: false,
              onConfirm: () async {
                final resp = await ref
                    .read(purchaseRepositoryProvider)
                    .confirmPurchaseReturn(id);
                if (!context.mounted) return;
                if (resp.ok) {
                  showAppSnack(context, message: 'Return confirmed', type: AppSnackType.success);
                  refresh();
                } else {
                  showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
                }
              },
              onCancel: () async {},
            );
          },
        ),
      ),
    );
  }
}
