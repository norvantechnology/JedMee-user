import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/app_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_motion.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../widgets/branding/jedmee_logo.dart';

/// SharedPreferences key — set to true after onboarding is completed.
const _kOnboardingDoneKey = 'jedmee_onboarding_done_v1';

/// Returns true if the user has already seen onboarding.
Future<bool> hasSeenOnboarding() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getBool(_kOnboardingDoneKey) == true;
}

/// Marks onboarding as completed.
Future<void> markOnboardingDone() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_kOnboardingDoneKey, true);
}

class _OnboardingPage {
  const _OnboardingPage({
    required this.icon,
    required this.headline,
    required this.description,
    required this.color,
  });

  final IconData icon;
  final String headline;
  final String description;
  final Color color;
}

const _pages = [
  _OnboardingPage(
    icon: AppIcons.invoice,
    headline: 'Manage your invoices\non the go',
    description:
        'Create, share and track sales invoices from anywhere. '
        'PDF generation and printing built in.',
    color: AppColors.primary,
  ),
  _OnboardingPage(
    icon: AppIcons.purchases,
    headline: 'Track purchases\nand payments',
    description:
        'Record purchase invoices, manage vendor payments, '
        'and keep your accounts up to date.',
    color: Color(0xFF0EA5E9), // sky-500
  ),
  _OnboardingPage(
    icon: AppIcons.reports,
    headline: 'GST reports\nin one tap',
    description:
        'Generate GSTR-1, GSTR-2, GSTR-3B and B2B/B2C reports '
        'instantly — ready for filing.',
    color: Color(0xFF10B981), // emerald-500
  ),
  _OnboardingPage(
    icon: AppIcons.customers,
    headline: 'Works for your\nwhole team',
    description:
        'Role-based access control lets you manage what each '
        'team member can see and do.',
    color: Color(0xFF8B5CF6), // violet-500
  ),
];

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _currentPage = 0;
  bool _checking = true;

  @override
  void initState() {
    super.initState();
    _checkIfAlreadySeen();
  }

  Future<void> _checkIfAlreadySeen() async {
    final seen = await hasSeenOnboarding();
    if (!mounted) return;
    if (seen) {
      context.go('/login');
      return;
    }
    setState(() => _checking = false);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    HapticFeedback.mediumImpact();
    await markOnboardingDone();
    if (mounted) context.go('/login');
  }

  void _next() {
    HapticFeedback.selectionClick();
    if (_currentPage < _pages.length - 1) {
      _controller.nextPage(
        duration: AppMotion.normal,
        curve: AppMotion.enter,
      );
    } else {
      _finish();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        backgroundColor: AppColors.bg,
        body: SizedBox.shrink(),
      );
    }

    final isLast = _currentPage == _pages.length - 1;

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            // Skip button
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(0, 8, 16, 0),
                child: TextButton(
                  onPressed: _finish,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.textMuted,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                  ),
                  child: const Text('Skip'),
                ),
              ),
            ),

            // Page carousel
            Expanded(
              child: PageView.builder(
                controller: _controller,
                onPageChanged: (i) {
                  HapticFeedback.selectionClick();
                  setState(() => _currentPage = i);
                },
                itemCount: _pages.length,
                itemBuilder: (_, i) => _OnboardingPageView(page: _pages[i]),
              ),
            ),

            // Dots + CTA
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.xl,
                AppSpacing.md,
                AppSpacing.xl,
                AppSpacing.xl,
              ),
              child: Column(
                children: [
                  // Page dots
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      _pages.length,
                      (i) => AnimatedContainer(
                        duration: AppMotion.fast,
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: i == _currentPage ? 24 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: i == _currentPage
                              ? AppColors.primary
                              : AppColors.border,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),

                  // CTA button
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: FilledButton(
                      onPressed: _next,
                      style: FilledButton.styleFrom(
                        shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(AppTheme.radiusMd),
                        ),
                      ),
                      child: Text(
                        isLast ? 'Get Started' : 'Next',
                        style: AppTypography.labelSemibold.copyWith(
                          color: AppColors.onPrimary,
                          fontSize: 16,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OnboardingPageView extends StatelessWidget {
  const _OnboardingPageView({required this.page});

  final _OnboardingPage page;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Brand mark
          const JedMeeMark(size: 36),
          const SizedBox(height: AppSpacing.xxl),

          // Icon illustration
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              color: page.color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(32),
              border: Border.all(
                color: page.color.withOpacity(0.2),
                width: 1.5,
              ),
            ),
            child: Icon(
              page.icon,
              size: 56,
              color: page.color,
            ),
          ),
          const SizedBox(height: AppSpacing.xxl),

          // Headline
          Text(
            page.headline,
            textAlign: TextAlign.center,
            style: AppTypography.pageTitle.copyWith(
              fontSize: 26,
              height: 1.25,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          // Description
          Text(
            page.description,
            textAlign: TextAlign.center,
            style: AppTypography.secondary.copyWith(
              height: 1.6,
              fontSize: 15,
            ),
          ),
        ],
      ),
    );
  }
}