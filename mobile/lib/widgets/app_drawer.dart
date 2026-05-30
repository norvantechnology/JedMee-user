import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/app_icons.dart';
import '../core/constants/brand.dart';
import '../core/navigation/sidebar_nav.dart';
import '../core/navigation/sidebar_nav_icons.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_motion.dart';
import '../core/theme/app_theme.dart';
import '../core/theme/app_typography.dart';
import '../core/theme/modal_animation_tokens.dart';
import '../providers/auth_controller.dart';
import 'app_animated_modal.dart';
import 'branding/jedmee_logo.dart';
import 'responsive.dart';

// ─── Public API ───────────────────────────────────────────────────────────────

/// Open the navigation drawer with the spec's side-drawer animation:
///   OPEN:  translateX(-100%) → translateX(0)
///          300ms, easeOpen cubic-bezier(0.32, 0.72, 0, 1)
///   CLOSE: translateX(0) → translateX(-100%)
///          240ms, easeClose cubic-bezier(0.4, 0, 1, 0.6)
///   Backdrop: opacity 0 → 0.45 crossfade, same duration
///
/// Respects [MediaQuery.disableAnimations]: falls back to 150ms opacity-only.
///
/// Call this instead of [Scaffold.openDrawer] to get the unified animation.
Future<void> showAppDrawer(
  BuildContext context, {
  required List<SidebarNavSection> sections,
  required String currentPath,
}) {
  final reduceMotion = MediaQuery.of(context).disableAnimations;

  return showGeneralDialog<void>(
    context: context,
    useRootNavigator: true,
    barrierDismissible: true,
    barrierLabel: MaterialLocalizations.of(context).modalBarrierDismissLabel,
    barrierColor: Colors.black.withOpacity(ModalAnimationTokens.backdropOpacity),
    transitionDuration: reduceMotion
        ? ModalAnimationTokens.durationReducedMotion
        : ModalAnimationTokens.durationBottomOpen, // 300ms — matches drawer spec
    pageBuilder: (ctx, animation, secondaryAnimation) {
      // Align to left edge so the drawer slides in from the left.
      return Align(
        alignment: Alignment.centerLeft,
        child: AppDrawer(
          sections: sections,
          currentPath: currentPath,
        ),
      );
    },
    transitionBuilder: (ctx, animation, secondaryAnimation, child) {
      return AppAnimatedModal(
        type: AppModalType.drawer,
        animation: animation,
        child: child,
      );
    },
  );
}

// ─── Drawer widget ────────────────────────────────────────────────────────────

/// Premium navigation drawer — dark sidebar with grouped sections.
/// Inspired by Linear, Notion, and Stripe dashboard navigation.
class AppDrawer extends ConsumerWidget {
  const AppDrawer({
    super.key,
    required this.sections,
    required this.currentPath,
  });

  final List<SidebarNavSection> sections;
  final String currentPath;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Drawer(
      width: Responsive.drawerWidth(context),
      backgroundColor: AppColors.sidebarBg,
      elevation: 0,
      shadowColor: Colors.transparent,
      shape: const RoundedRectangleBorder(),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.sidebarBg,
          border: Border(
            right: BorderSide(color: AppColors.sidebarBorder),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _DrawerHeader(
              onClose: () => Navigator.pop(context),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 16),
                children: [
                  for (var si = 0; si < sections.length; si++) ...[
                    if (si > 0) const SizedBox(height: 2),
                    _DrawerSection(
                      title: sections[si].title,
                      isFirst: si == 0,
                      children: [
                        for (final item in sections[si].items)
                          _DrawerNavTile(
                            item: item,
                            selected: _isRouteSelected(currentPath, item.to),
                            onTap: () {
                              Navigator.pop(context);
                              context.go(item.to);
                            },
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const _DrawerFooter(),
          ],
        ),
      ),
    );
  }

  static bool _isRouteSelected(String current, String route) {
    if (current == route) return true;
    if (route == '/dashboard') return false;
    return current.startsWith('$route/');
  }
}

/// Drawer header: brand logo + close button only.
/// Profile/account actions have moved to the app bar avatar button.
class _DrawerHeader extends StatelessWidget {
  const _DrawerHeader({required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: AppColors.sidebarBorder),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
          child: Row(
            children: [
              const JedMeeLogo(height: 28, inverted: true),
              const Spacer(),
              _CloseButton(onPressed: onClose),
            ],
          ),
        ),
      ),
    );
  }
}

class _CloseButton extends StatefulWidget {
  const _CloseButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  State<_CloseButton> createState() => _CloseButtonState();
}

class _CloseButtonState extends State<_CloseButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: SizedBox(
        width: 36,
        height: 36,
        child: Material(
          color: _hovered
              ? Colors.white.withOpacity(0.1)
              : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(AppTheme.radiusSm),
          child: InkWell(
            onTap: widget.onPressed,
            borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            splashColor: Colors.white.withOpacity(0.15),
            highlightColor: Colors.white.withOpacity(0.08),
            child: Icon(
              AppIcons.close,
              size: 18,
              color: AppColors.sidebarText.withOpacity(0.8),
            ),
          ),
        ),
      ),
    );
  }
}

/// Navigation section with label and items.
/// When [title] is empty (Dashboard group) the label row is hidden entirely.
class _DrawerSection extends StatelessWidget {
  const _DrawerSection({
    required this.title,
    required this.children,
    this.isFirst = false,
  });

  final String title;
  final List<Widget> children;
  final bool isFirst;

  @override
  Widget build(BuildContext context) {
    final hasLabel = title.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!isFirst) SizedBox(height: hasLabel ? 8 : 2),
        if (hasLabel)
          Padding(
            padding: EdgeInsets.fromLTRB(10, isFirst ? 2 : 16, 10, 5),
            child: Text(
              title,
              style: AppTypography.navSectionLabel.copyWith(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.0,
                color: AppColors.sidebarSectionLabel.withOpacity(0.45),
              ),
            ),
          ),
        ...children,
        if (!isFirst) const SizedBox(height: 2),
      ],
    );
  }
}

/// Individual navigation tile with active/hover states.
class _DrawerNavTile extends StatefulWidget {
  const _DrawerNavTile({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final SidebarNavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_DrawerNavTile> createState() => _DrawerNavTileState();
}

class _DrawerNavTileState extends State<_DrawerNavTile>
    with SingleTickerProviderStateMixin {
  bool _hovered = false;
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: AppMotion.fast,
      value: widget.selected ? 1.0 : 0.0,
    );
  }

  @override
  void didUpdateWidget(_DrawerNavTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.selected != oldWidget.selected) {
      if (widget.selected) {
        _controller.forward();
      } else {
        _controller.reverse();
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final icon = iconForSidebarRoute(widget.item.to);
    final selected = widget.selected;
    final hovered = _hovered && !selected;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: BorderRadius.circular(AppTheme.radiusSm),
            hoverColor: Colors.transparent,
            splashColor: AppColors.primary.withOpacity(0.1),
            child: AnimatedContainer(
              duration: AppMotion.fast,
              curve: AppMotion.standard,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                color: selected
                    ? AppColors.primary.withOpacity(0.15)
                    : hovered
                        ? Colors.white.withOpacity(0.05)
                        : Colors.transparent,
                border: Border.all(
                  color: selected
                      ? AppColors.primary.withOpacity(0.3)
                      : Colors.transparent,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 0, 10, 0),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 40),
                  child: Row(
                    children: [
                      _NavIcon(
                        icon: icon,
                        selected: selected,
                        hovered: hovered,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          widget.item.label,
                          // No truncation — labels must always be fully visible.
                          softWrap: true,
                          overflow: TextOverflow.visible,
                          style: (selected
                              ? AppTypography.navItemActive
                              : hovered
                                  ? AppTypography.navItem.copyWith(
                                      color: AppColors.sidebarTextActive,
                                    )
                                  : AppTypography.navItem)
                              .copyWith(fontSize: 13),
                        ),
                      ),
                      if (widget.item.badge != null)
                        _NavBadge(label: widget.item.badge!),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavIcon extends StatelessWidget {
  const _NavIcon({
    required this.icon,
    required this.selected,
    this.hovered = false,
  });

  final IconData icon;
  final bool selected;
  final bool hovered;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: AppMotion.fast,
      curve: AppMotion.standard,
      width: 32,
      height: 32,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
        color: selected
            ? AppColors.primary.withOpacity(0.25)
            : hovered
                ? Colors.white.withOpacity(0.08)
                : Colors.white.withOpacity(0.04),
      ),
      child: Icon(
        icon,
        size: 18,
        color: selected
            ? AppColors.colorMix(AppColors.primary, 20, Colors.white)
            : hovered
                ? AppColors.sidebarTextActive
                : AppColors.sidebarText,
      ),
    );
  }
}

class _NavBadge extends StatelessWidget {
  const _NavBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 18),
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.danger,
        borderRadius: BorderRadius.circular(AppTheme.pillRadius),
        boxShadow: [
          BoxShadow(
            color: AppColors.danger.withOpacity(0.35),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Text(
        label,
        textAlign: TextAlign.center,
        style: AppTypography.badgeSmall.copyWith(color: Colors.white),
      ),
    );
  }
}

/// Drawer footer with branding.
class _DrawerFooter extends StatelessWidget {
  const _DrawerFooter();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: const BoxDecoration(
        border: Border(
          top: BorderSide(color: AppColors.sidebarBorder),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            const JedMeeMark(size: 20),
            const SizedBox(width: 8),
            Text(
              Brand.appName,
              style: TextStyle(
                color: AppColors.sidebarText.withOpacity(0.8),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
            const Spacer(),
            Text(
              Brand.tagline,
              style: TextStyle(
                color: AppColors.sidebarSectionLabel.withOpacity(0.8),
                fontSize: 10,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
