import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/utils/access.dart';
import '../../core/utils/api_helpers.dart';
import '../../core/utils/record_fields.dart';
import '../../providers/app_providers.dart';
import '../../providers/auth_controller.dart';
import '../../core/app_icons.dart';
import '../../widgets/app_bottom_nav.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/snackbar.dart';
import '../shared/async_list_page.dart';
import '../shared/entity_dialogs.dart';
import '../shared/master_ui.dart';
import '../shared/payment_form_sheet.dart';
import '../shared/permission_gate.dart';

/// Handles division payments (wholesaler) and vendor payments (retailer).
class VendorPaymentsScreen extends ConsumerStatefulWidget {
  const VendorPaymentsScreen({super.key});

  @override
  ConsumerState<VendorPaymentsScreen> createState() => _VendorPaymentsScreenState();
}

class _VendorPaymentsScreenState extends ConsumerState<VendorPaymentsScreen> {
  final _listKey = GlobalKey<AsyncListPageState>();

  Future<void> _recordPayment(bool retailer) async {
    final result = await showPaymentFormSheet(
      context,
      ref,
      title: retailer ? 'Record supplier payment' : 'Record division payment',
      partyKind: retailer ? PaymentPartyKind.vendor : PaymentPartyKind.division,
    );
    if (result == null || !mounted) return;
    await withSavingOverlay(context, () async {
      final repo = ref.read(paymentRepositoryProvider);
      final resp = retailer
          ? await repo.createVendorPayment(result)
          : await repo.createDivisionPayment(result);
      if (!mounted) return resp.ok;
      if (resp.ok) {
        showAppSnack(context, message: 'Payment recorded', type: AppSnackType.success);
        _listKey.currentState?.refresh();
      } else {
        showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
      }
      return resp.ok;
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).auth;
    final retailer = isRetailer(auth);
    final resource = retailer ? 'VENDOR_PAYMENTS' : 'DIVISION_PAYMENTS';
    final title = retailer ? 'Supplier Payments' : 'Division Payments';

    return PermissionGate(
      resource: resource,
      action: 'VIEW',
      title: title,
      child: AppShell(
        title: title,
        bottomBar: AppBottomActionBar(
          primaryAction: BottomAction(
            icon: AppIcons.payment,
            label: 'New Payment',
            tooltip: retailer
                ? 'Record a supplier payment'
                : 'Record a division payment',
            onTap: () => _recordPayment(retailer),
          ),
          trailingActions: [
            BottomAction(
              icon: AppIcons.refresh,
              tooltip: 'Refresh',
              onTap: () => _listKey.currentState?.refresh(),
            ),
          ],
        ),
        child: AsyncListPage(
          key: _listKey,
          title: 'Payments',
          searchHint: 'Search payments…',
          load: (search, _) async {
            final repo = ref.read(paymentRepositoryProvider);
            final resp = retailer
                ? await repo.listVendorPayments({if (search.isNotEmpty) 'search': search})
                : await repo.listDivisionPayments({if (search.isNotEmpty) 'search': search});
            return listFromResponse(resp);
          },
          onRowTap: (row) => showDetailBottomSheet(
            context,
            title: rowLabel(row, ['receipt_no', 'receiptNo', 'reference_number']),
            row: row,
            entity: RecordEntity.payment,
          ),
        ),
      ),
    );
  }
}
