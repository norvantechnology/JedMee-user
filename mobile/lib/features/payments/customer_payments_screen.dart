import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/utils/api_helpers.dart';
import '../../core/utils/record_fields.dart';
import '../../providers/app_providers.dart';
import '../../core/app_icons.dart';
import '../../widgets/app_bottom_nav.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/snackbar.dart';
import '../shared/async_list_page.dart';
import '../shared/entity_dialogs.dart';
import '../shared/master_ui.dart';
import '../shared/payment_form_sheet.dart';
import '../shared/permission_gate.dart';

class CustomerPaymentsScreen extends ConsumerStatefulWidget {
  const CustomerPaymentsScreen({super.key});

  @override
  ConsumerState<CustomerPaymentsScreen> createState() => _CustomerPaymentsScreenState();
}

class _CustomerPaymentsScreenState extends ConsumerState<CustomerPaymentsScreen> {
  final _listKey = GlobalKey<AsyncListPageState>();

  Future<void> _recordPayment() async {
    final result = await showPaymentFormSheet(
      context,
      ref,
      title: 'Record customer payment',
      partyKind: PaymentPartyKind.customer,
    );
    if (result == null || !mounted) return;
    await withSavingOverlay(context, () async {
      final resp = await ref.read(paymentRepositoryProvider).createCustomerPayment(result);
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
    return PermissionGate(
      resource: 'CUSTOMER_PAYMENTS',
      action: 'VIEW',
      title: 'Customer Payments',
      child: AppShell(
        title: 'Customer Payments',
        bottomBar: AppBottomActionBar(
          primaryAction: BottomAction(
            icon: AppIcons.payment,
            label: 'New Payment',
            tooltip: 'Record a customer payment',
            onTap: _recordPayment,
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
            final resp = await ref.read(paymentRepositoryProvider).listCustomerPayments({
              if (search.isNotEmpty) 'search': search,
            });
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
