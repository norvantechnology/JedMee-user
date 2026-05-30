import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/format.dart';
import 'ongoing_bills_controller.dart';

/// Compact horizontal rail of in-progress DRAFT bills for the parallel-billing
/// workflow.
///
/// Design goals:
/// * **Stay out of the way.** Hidden completely when there is nothing to
///   resume — the regular "+ New" buttons / FAB cover that path.
/// * **Glanceable.** Each chip shows the customer / vendor, item count and
///   running total — enough to recognise the right bill at the counter.
/// * **Counter ergonomics.** Big tap targets, primary-accent active state,
///   horizontal scrolling that doesn't fight with the list under it.
class OngoingBillsRail extends ConsumerWidget {
  const OngoingBillsRail({
    super.key,
    required this.module,
    required this.onTapBill,
    required this.onCreateNew,
    this.currentBillId,
    this.onLongPressBill,
    this.showWhenEmpty = false,
  });

  final BillModule module;
  final void Function(OngoingBill bill) onTapBill;
  final VoidCallback onCreateNew;

  /// The bill currently being edited on screen (if any). Used to highlight
  /// the chip even if [OngoingBillsState.activeId] hasn't caught up yet.
  final String? currentBillId;
  final void Function(OngoingBill bill)? onLongPressBill;

  /// When `false` (default) the widget renders nothing if there are no
  /// ongoing drafts. Set `true` on the editor screen to keep the rail's
  /// header pinned for consistency.
  final bool showWhenEmpty;

  StateNotifierProvider<OngoingBillsController, OngoingBillsState>
      get _provider => module == BillModule.sales
          ? ongoingSalesBillsProvider
          : ongoingPurchaseBillsProvider;

  bool get _isSales => module == BillModule.sales;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(_provider);
    final controller = ref.read(_provider.notifier);

    // Resolve which chip to highlight. Prefer the screen-supplied id so the
    // active highlight stays correct even while the state catches up.
    final activeId = currentBillId?.isNotEmpty == true
        ? currentBillId
        : state.activeId;

    // Nothing to show and caller doesn't want a placeholder → render zero
    // height. Saves precious vertical space at the counter.
    if (state.bills.isEmpty && !state.loading && !showWhenEmpty) {
      return const SizedBox.shrink();
    }

    // Inside an editor, if the only ongoing draft is the one being edited,
    // there's nothing meaningful to switch to — hide the rail entirely.
    final hasOnlyCurrent = currentBillId != null &&
        state.bills.length == 1 &&
        state.bills.first.id == currentBillId &&
        !showWhenEmpty;
    if (hasOnlyCurrent && !state.loading) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: AppColors.card,
        border: Border(
          bottom: BorderSide(color: AppColors.borderSubtle),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          _Header(
            count: state.bills.length,
            loading: state.loading,
            isSales: _isSales,
            onRefresh: controller.refresh,
          ),
          if (state.bills.isEmpty && !state.loading)
            _EmptyHint(isSales: _isSales)
          else
            _ChipRow(
              bills: state.bills,
              activeId: activeId,
              loading: state.loading,
              isSales: _isSales,
              onTapBill: (bill) {
                controller.setActive(bill.id);
                onTapBill(bill);
              },
              onLongPressBill: onLongPressBill,
              onCreateNew: onCreateNew,
            ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.count,
    required this.loading,
    required this.isSales,
    required this.onRefresh,
  });

  final int count;
  final bool loading;
  final bool isSales;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final label = isSales ? 'Ongoing bills' : 'Ongoing purchases';
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 6),
      child: Row(
        children: [
          Icon(
            isSales ? Icons.point_of_sale_outlined : Icons.local_shipping_outlined,
            size: 16,
            color: AppColors.primary,
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.labelSemibold.copyWith(color: AppColors.text2),
          ),
          if (count > 0) ...[
            const SizedBox(width: 6),
            _CountBadge(count: count),
          ],
          const Spacer(),
          if (loading)
            const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            InkResponse(
              radius: 18,
              onTap: onRefresh,
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(Icons.refresh, size: 16, color: AppColors.textMuted),
              ),
            ),
        ],
      ),
    );
  }
}

class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: AppColors.primaryLight,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        '$count',
        style: AppTypography.caption.copyWith(
          color: AppColors.primaryDark,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _ChipRow extends StatelessWidget {
  const _ChipRow({
    required this.bills,
    required this.activeId,
    required this.loading,
    required this.isSales,
    required this.onTapBill,
    required this.onLongPressBill,
    required this.onCreateNew,
  });

  final List<OngoingBill> bills;
  final String? activeId;
  final bool loading;
  final bool isSales;
  final void Function(OngoingBill bill) onTapBill;
  final void Function(OngoingBill bill)? onLongPressBill;
  final VoidCallback onCreateNew;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 80,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
        itemCount: bills.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          if (i == bills.length) {
            return _NewBillChip(
              label: isSales ? 'New bill' : 'New PO',
              onTap: onCreateNew,
            );
          }
          final bill = bills[i];
          final active = bill.id == activeId;
          return _BillChip(
            bill: bill,
            active: active,
            isSales: isSales,
            onTap: () => onTapBill(bill),
            onLongPress: onLongPressBill == null
                ? null
                : () => onLongPressBill!(bill),
          );
        },
      ),
    );
  }
}

class _BillChip extends StatelessWidget {
  const _BillChip({
    required this.bill,
    required this.active,
    required this.isSales,
    required this.onTap,
    this.onLongPress,
  });

  final OngoingBill bill;
  final bool active;
  final bool isSales;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final bg = active ? AppColors.primary : AppColors.card;
    final border = active ? AppColors.primary : AppColors.border;
    final fg = active ? Colors.white : AppColors.text;
    final muted = active
        ? AppColors.colorMixWithTransparent(Colors.white, 78)
        : AppColors.textMuted;

    return Semantics(
      button: true,
      selected: active,
      label: '${bill.shortLabel}, '
          '${bill.itemCount} item${bill.itemCount == 1 ? '' : 's'}, '
          'total ${fmtCurrency(bill.totalAmount)}',
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(14),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          curve: Curves.easeOut,
          constraints: const BoxConstraints(minWidth: 160, maxWidth: 224),
          padding: const EdgeInsets.fromLTRB(10, 7, 10, 7),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: border, width: active ? 1.2 : 1),
            boxShadow: active
                ? [
                    BoxShadow(
                      color: AppColors.colorMixWithTransparent(AppColors.primary, 32),
                      blurRadius: 10,
                      offset: const Offset(0, 3),
                    ),
                  ]
                : const [],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Icon(
                    active
                        ? Icons.check_circle_rounded
                        : (isSales
                            ? Icons.shopping_bag_outlined
                            : Icons.inventory_2_outlined),
                    size: 13,
                    color: fg,
                  ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      bill.shortLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.labelSemibold.copyWith(
                        color: fg,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  if (bill.invoiceNumber.isNotEmpty) ...[
                    const SizedBox(width: 5),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        color: active
                            ? AppColors.colorMixWithTransparent(
                                Colors.white, 22)
                            : AppColors.primaryLight,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        bill.invoiceNumber,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: active
                              ? Colors.white
                              : AppColors.primaryDark,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 5),
              Row(
                children: [
                  _MetaPill(
                    text: '${bill.itemCount} item${bill.itemCount == 1 ? '' : 's'}',
                    active: active,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      bill.totalAmount > 0
                          ? fmtCurrency(bill.totalAmount)
                          : '—',
                      textAlign: TextAlign.end,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.caption.copyWith(
                        color: muted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetaPill extends StatelessWidget {
  const _MetaPill({required this.text, required this.active});

  final String text;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: active
            ? AppColors.colorMixWithTransparent(Colors.white, 22)
            : AppColors.primaryLight,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        text,
        style: AppTypography.caption.copyWith(
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
          color: active ? Colors.white : AppColors.primaryDark,
        ),
      ),
    );
  }
}

class _NewBillChip extends StatelessWidget {
  const _NewBillChip({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: DottedBorderBox(
        color: AppColors.primary,
        radius: 14,
        child: Container(
          constraints: const BoxConstraints(minWidth: 110, maxWidth: 140),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          alignment: Alignment.center,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.add_circle_outline,
                  size: 18, color: AppColors.primary),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.labelSemibold
                      .copyWith(color: AppColors.primary),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Lightweight dashed-border container — keeps the "+ New" chip visually
/// distinct from saved drafts without pulling in another package.
class DottedBorderBox extends StatelessWidget {
  const DottedBorderBox({
    super.key,
    required this.child,
    required this.color,
    this.radius = 12,
  });

  final Widget child;
  final Color color;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedBorderPainter(
        color: color,
        radius: radius,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: child,
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  _DashedBorderPainter({required this.color, required this.radius});

  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.2
      ..style = PaintingStyle.stroke;

    final rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0.5, 0.5, size.width - 1, size.height - 1),
      Radius.circular(radius),
    );
    final path = Path()..addRRect(rrect);

    const dashWidth = 4.0;
    const dashSpace = 3.0;
    for (final metric in path.computeMetrics()) {
      double distance = 0;
      while (distance < metric.length) {
        final next = (distance + dashWidth).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance = next + dashSpace;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedBorderPainter old) =>
      old.color != color || old.radius != radius;
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({required this.isSales});

  final bool isSales;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
      child: Text(
        isSales
            ? 'No ongoing bills. Start one to scan items for parallel customers.'
            : 'No ongoing purchases. Start one to log multiple vendor bills.',
        style: AppTypography.caption.copyWith(color: AppColors.textMuted),
      ),
    );
  }
}
