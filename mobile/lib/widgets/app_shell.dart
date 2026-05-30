import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/app_icons.dart';
import '../core/navigation/sidebar_nav.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_spacing.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';
import '../core/utils/access.dart';
import '../providers/app_providers.dart';
import '../providers/auth_controller.dart';
import 'app_drawer.dart';
import 'network_banner.dart';
import 'notifications_button.dart';

/// Premium app shell — sticky app bar, drawer navigation, consistent layout.
class AppShell extends ConsumerWidget {
  const AppShell({
    super.key,
    required this.title,
    required this.child,
    this.actions,
    this.floatingActionButton,
    this.bottomBar,
    this.titleWidget,
    this.showBackButton = false,
  });

  final String title;
  final Widget child;
  final List<Widget>? actions;
  final Widget? floatingActionButton;

  /// Page-specific bottom bar (e.g. bottom action bar, invoice editor save row).
  final Widget? bottomBar;

  final Widget? titleWidget;
  final bool showBackButton;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).auth;
    final snapshot = getAccessSnapshot(auth);
    final retailer = isRetailer(auth);
    final currentPath = GoRouterState.of(context).uri.path;

    final pendingCount =
        ref.watch(_pendingOrderCountProvider).valueOrNull ?? 0;

    final sections = buildUserSidebarSections(
      SidebarNavContext(
        isOwner: snapshot.isOwner,
        perms: snapshot.perms,
        isRetailer: retailer,
        pendingOrderCount: pendingCount,
      ),
    );

    final user = auth?.user;
    final displayName = (user?['full_name'] ??
            user?['fullName'] ??
            user?['firm_name'] ??
            user?['firmName'] ??
            user?['email'] ??
            'User')
        .toString();

    // Use a Column inside the body instead of bottomNavigationBar.
    // This gives Flutter a deterministic layout — the bar is always anchored
    // to the bottom of the visible area regardless of animation state.
    // (bottomNavigationBar + AnimatedBuilder/Opacity can mis-measure the
    //  widget's intrinsic height and float the bar in the centre of the screen.)
    final bodyContent = bottomBar != null
        ? Column(
            children: [
              Expanded(child: NetworkBanner(child: child)),
              bottomBar!,
            ],
          )
        : NetworkBanner(child: child);

    final isDashboard = currentPath == '/dashboard';

    return PopScope(
      // Dashboard: allow pop so the OS can close the app.
      // All other pages: intercept and go to dashboard instead.
      canPop: isDashboard,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !isDashboard) {
          context.go('/dashboard');
        }
      },
      child: Scaffold(
        backgroundColor: AppColors.bg,
        appBar: _PremiumAppBar(
          title: title,
          titleWidget: titleWidget,
          actions: actions,
          showBackButton: showBackButton,
          displayName: displayName,
          // Pass a callback so _PremiumAppBar can open the drawer via
          // showAppDrawer() — which applies the spec's side-drawer animation
          // instead of the Scaffold's built-in DrawerController animation.
          onMenuPressed: () => showAppDrawer(
            context,
            sections: sections,
            currentPath: currentPath,
          ),
        ),
        // No Scaffold.drawer — drawer is opened via showAppDrawer() overlay
        // to apply the unified AppAnimatedModal.drawer animation.
        body: bodyContent,
        floatingActionButton: floatingActionButton,
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Premium App Bar
// ═══════════════════════════════════════════════════════════════════════════════

/// Premium app bar with subtle shadow and clean typography.
class _PremiumAppBar extends StatelessWidget implements PreferredSizeWidget {
  const _PremiumAppBar({
    required this.title,
    this.titleWidget,
    this.actions,
    this.showBackButton = false,
    this.displayName = '',
    this.onMenuPressed,
  });

  final String title;
  final Widget? titleWidget;
  final List<Widget>? actions;
  final bool showBackButton;
  final String displayName;

  /// Called when the hamburger menu button is tapped.
  /// Provided by [AppShell] and calls [showAppDrawer] with the current
  /// nav sections — bypassing [Scaffold.openDrawer] to apply the unified
  /// side-drawer animation from [AppAnimatedModal].
  final VoidCallback? onMenuPressed;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final canPop = showBackButton && Navigator.of(context).canPop();
    final screenWidth = MediaQuery.of(context).size.width;
    final hPad = screenWidth < 360 ? 2.0 : AppSpacing.xs.toDouble();

    return Material(
      color: AppColors.card,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          color: AppColors.card,
          border: Border(
            bottom: BorderSide(color: AppColors.border),
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: SizedBox(
            height: 56,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: hPad),
              child: Row(
                children: [
                  if (canPop)
                    _AppBarIconButton(
                      icon: AppIcons.back,
                      onPressed: () => Navigator.of(context).pop(),
                      tooltip: 'Back',
                    )
                  else
                    _AppBarIconButton(
                      icon: AppIcons.menu,
                      onPressed: onMenuPressed ?? () {},
                      tooltip: 'Menu',
                    ),
                  const SizedBox(width: 2),
                  Expanded(
                    child: titleWidget ??
                        Text(
                          title,
                          style: AppTypography.pageTitle,
                          overflow: TextOverflow.ellipsis,
                          maxLines: 1,
                        ),
                  ),
                  if (actions != null) ...actions!,
                  const NotificationsButton(),
                  _ProfileAvatarButton(displayName: displayName),
                  SizedBox(width: screenWidth < 360 ? 2 : 4),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// App Bar Icon Button
// ═══════════════════════════════════════════════════════════════════════════════

class _AppBarIconButton extends StatefulWidget {
  const _AppBarIconButton({
    required this.icon,
    required this.onPressed,
    this.tooltip,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final String? tooltip;

  @override
  State<_AppBarIconButton> createState() => _AppBarIconButtonState();
}

class _AppBarIconButtonState extends State<_AppBarIconButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: Tooltip(
        message: widget.tooltip ?? '',
        child: SizedBox(
          width: 40,
          height: 40,
          child: Material(
            color: _hovered ? AppColors.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            child: InkWell(
              onTap: widget.onPressed,
              borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              splashColor: AppColors.primary.withOpacity(0.08),
              highlightColor: AppColors.primary.withOpacity(0.04),
              child: Icon(
                widget.icon,
                size: 20,
                color: AppColors.text2,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Profile Avatar Button
// ═══════════════════════════════════════════════════════════════════════════════

class _ProfileAvatarButton extends StatefulWidget {
  const _ProfileAvatarButton({required this.displayName});
  final String displayName;

  @override
  State<_ProfileAvatarButton> createState() => _ProfileAvatarButtonState();
}

class _ProfileAvatarButtonState extends State<_ProfileAvatarButton> {
  bool _pressed = false;

  static String _initials(String name) {
    final s = name.trim();
    if (s.isEmpty) return 'JM';
    final parts = s.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    if (s.contains('@')) {
      final local = s.split('@').first;
      return local.length >= 2
          ? local.substring(0, 2).toUpperCase()
          : local.toUpperCase();
    }
    return s.length >= 2 ? s.substring(0, 2).toUpperCase() : s.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final initials = _initials(widget.displayName);
    final screenWidth = MediaQuery.of(context).size.width;
    final avatarSize = screenWidth < 360 ? 28.0 : 32.0;
    final touchSize = screenWidth < 360 ? 36.0 : 40.0;

    return Tooltip(
      message: widget.displayName.isNotEmpty ? widget.displayName : 'Profile',
      child: GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        onTap: () => context.go('/profile'),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          width: touchSize,
          height: touchSize,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(touchSize / 2),
            color: _pressed
                ? AppColors.primary.withOpacity(0.08)
                : Colors.transparent,
          ),
          alignment: Alignment.center,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            width: avatarSize,
            height: avatarSize,
            decoration: BoxDecoration(
              gradient: AppColors.primaryGradient,
              shape: BoxShape.circle,
              boxShadow: _pressed
                  ? []
                  : [
                      BoxShadow(
                        color: AppColors.primary.withOpacity(0.28),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
            ),
            alignment: Alignment.center,
            child: Text(
              initials,
              style: TextStyle(
                color: Colors.white,
                fontSize: screenWidth < 360 ? 10.0 : 11.0,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.3,
                height: 1,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page Header
// ═══════════════════════════════════════════════════════════════════════════════

/// Page-level header with title, subtitle, and actions.
class PageHeader extends StatelessWidget {
  const PageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.actions,
    this.padding,
    this.showDivider = false,
  });

  final String title;
  final String? subtitle;
  final List<Widget>? actions;
  final EdgeInsetsGeometry? padding;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: padding ??
              const EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.sm,
                AppSpacing.md,
                AppSpacing.xs,
              ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: AppTypography.pageTitle),
                    if (subtitle != null) ...[
                      const SizedBox(height: 3),
                      Text(subtitle!, style: AppTypography.secondary),
                    ],
                  ],
                ),
              ),
              if (actions != null) ...[
                const SizedBox(width: AppSpacing.sm),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: actions!,
                ),
              ],
            ],
          ),
        ),
        if (showDivider)
          const Divider(height: 1, thickness: 1, color: AppColors.border),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page Search Bar
// ═══════════════════════════════════════════════════════════════════════════════

/// Sticky search + filter bar for list pages.
class PageSearchBar extends StatelessWidget {
  const PageSearchBar({
    super.key,
    required this.controller,
    this.hint = 'Search…',
    this.onChanged,
    this.trailing,
    this.padding,
  });

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String>? onChanged;
  final Widget? trailing;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ??
          const EdgeInsets.fromLTRB(
            AppSpacing.md,
            0,
            AppSpacing.md,
            AppSpacing.xs,
          ),
      child: Row(
        children: [
          Expanded(
            child: Container(
              height: 38,
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                border: Border.all(color: AppColors.border),
              ),
              child: TextField(
                controller: controller,
                onChanged: onChanged,
                style: AppTypography.body,
                decoration: InputDecoration(
                  hintText: hint,
                  hintStyle: AppTypography.body.copyWith(
                    color: AppColors.textPlaceholder,
                  ),
                  prefixIcon: const Icon(
                    AppIcons.search,
                    size: 18,
                    color: AppColors.textMuted,
                  ),
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 11,
                  ),
                  isDense: true,
                ),
              ),
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: AppSpacing.xs),
            trailing!,
          ],
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Providers
// ═══════════════════════════════════════════════════════════════════════════════

final _pendingOrderCountProvider = FutureProvider<int>((ref) async {
  final auth = ref.watch(authDataProvider);
  if (auth == null || isRetailer(auth)) return 0;
  final resp = await ref.read(orderRepositoryProvider).getPendingOrderCount();
  if (!resp.ok) return 0;
  final data = resp.data;
  if (data is Map) {
    return (data['total'] as num?)?.toInt() ??
        (data['count'] as num?)?.toInt() ??
        0;
  }
  return 0;
});
