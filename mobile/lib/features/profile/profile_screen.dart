import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../core/app_icons.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_motion.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/access.dart';
import '../../core/utils/format.dart';
import '../../providers/app_providers.dart';
import '../../providers/auth_controller.dart';
import '../../providers/currency_provider.dart';
import '../../widgets/app_card.dart';
import '../../widgets/app_shell.dart';
import '../../widgets/confirm_dialog.dart';
import '../../widgets/snackbar.dart';

// ─── Phone country code options (mirrors web) ────────────────────────────────
const _kPhoneCodes = ['+91', '+1', '+44', '+971', '+65', '+61'];

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();

  // Personal
  final _fullNameCtrl      = TextEditingController();
  final _firmNameCtrl      = TextEditingController();
  final _phoneCtrl         = TextEditingController();
  String _phoneCountryCode = '+91';

  // Business & compliance
  final _gstCtrl           = TextEditingController();
  final _drugLicense1Ctrl  = TextEditingController();
  final _drugLicense2Ctrl  = TextEditingController();

  // Document URLs
  final _gstCertUrlCtrl    = TextEditingController();
  final _dl1UrlCtrl        = TextEditingController();
  final _dl2UrlCtrl        = TextEditingController();

  // Address
  final _addressCtrl       = TextEditingController();
  final _cityCtrl          = TextEditingController();
  final _stateCtrl         = TextEditingController();
  final _pinCodeCtrl       = TextEditingController();

  bool _loading     = false;
  bool _initialized = false;
  bool _submitted   = false;
  String _appVersion = '';

  // Section collapse state — all closed by default
  bool _personalCollapsed    = true;
  bool _businessCollapsed    = true;
  bool _docsCollapsed        = true;
  bool _addressCollapsed     = true;
  bool _preferencesCollapsed = true;

  @override
  void initState() {
    super.initState();
    _loadAppVersion();
  }

  Future<void> _loadAppVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (mounted) {
        setState(() {
          _appVersion = 'v${info.version} (${info.buildNumber})';
        });
      }
    } catch (_) {
      // Package info unavailable on some platforms (e.g. web).
    }
  }

  @override
  void dispose() {
    _fullNameCtrl.dispose();
    _firmNameCtrl.dispose();
    _phoneCtrl.dispose();
    _gstCtrl.dispose();
    _drugLicense1Ctrl.dispose();
    _drugLicense2Ctrl.dispose();
    _gstCertUrlCtrl.dispose();
    _dl1UrlCtrl.dispose();
    _dl2UrlCtrl.dispose();
    _addressCtrl.dispose();
    _cityCtrl.dispose();
    _stateCtrl.dispose();
    _pinCodeCtrl.dispose();
    super.dispose();
  }

  void _initFromUser() {
    if (_initialized) return;
    final user = ref.read(authControllerProvider).auth?.user;
    if (user == null) return;

    _fullNameCtrl.text     = _str(user, ['full_name', 'fullName']);
    _firmNameCtrl.text     = _str(user, ['firm_name', 'firmName']);
    _phoneCtrl.text        = _str(user, ['phone_number', 'phoneNumber', 'phone']);
    _phoneCountryCode      = _str(user, ['phone_country_code', 'phoneCountryCode'], fallback: '+91');
    if (!_kPhoneCodes.contains(_phoneCountryCode)) _phoneCountryCode = '+91';

    _gstCtrl.text          = _str(user, ['gst_number', 'gstNumber']);
    _drugLicense1Ctrl.text = _str(user, ['drug_license_1_number', 'drugLicense1Number']);
    _drugLicense2Ctrl.text = _str(user, ['drug_license_2_number', 'drugLicense2Number']);

    _gstCertUrlCtrl.text   = _str(user, ['gst_certificate_url', 'gstCertificateUrl']);
    _dl1UrlCtrl.text       = _str(user, ['drug_license_1_url', 'drugLicense1Url']);
    _dl2UrlCtrl.text       = _str(user, ['drug_license_2_url', 'drugLicense2Url']);

    _addressCtrl.text      = _str(user, ['address']);
    _cityCtrl.text         = _str(user, ['city']);
    _stateCtrl.text        = _str(user, ['state']);
    _pinCodeCtrl.text      = _str(user, ['pin_code', 'pinCode']);

    _initialized = true;
  }

  static String _str(Map<String, dynamic> user, List<String> keys,
      {String fallback = ''}) {
    for (final k in keys) {
      final v = user[k];
      if (v != null && v.toString().isNotEmpty) return v.toString();
    }
    return fallback;
  }

  // ─── Validation ─────────────────────────────────────────────────────────────
  bool get _fullNameOk {
    return _fullNameCtrl.text.trim().length >= 2;
  }

  bool get _phoneNumOk {
    final digits = _phoneCtrl.text.trim().replaceAll(RegExp(r'\D'), '');
    return digits.length >= 7 && digits.length <= 15;
  }

  bool get _gstOk {
    final v = _gstCtrl.text.trim();
    return v.isEmpty || v.length == 15;
  }

  bool _urlOk(String v) =>
      v.trim().isEmpty ||
      RegExp(r'^https?://.+', caseSensitive: false).hasMatch(v.trim());

  bool get _canSave =>
      _fullNameOk &&
      _phoneNumOk &&
      _gstOk &&
      _urlOk(_gstCertUrlCtrl.text) &&
      _urlOk(_dl1UrlCtrl.text) &&
      _urlOk(_dl2UrlCtrl.text) &&
      !_loading;

  Future<void> _save() async {
    setState(() => _submitted = true);
    if (!_canSave) return;
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    final resp = await ref.read(userRepositoryProvider).updateMe({
      'fullName':           _fullNameCtrl.text.trim(),
      'firmName':           _firmNameCtrl.text.trim(),
      'phoneCountryCode':   _phoneCountryCode,
      'phoneNumber':        _phoneCtrl.text.trim(),
      'gstNumber':          _gstCtrl.text.trim(),
      'drugLicense1Number': _drugLicense1Ctrl.text.trim(),
      'drugLicense2Number': _drugLicense2Ctrl.text.trim(),
      'gstCertificateUrl':  _gstCertUrlCtrl.text.trim(),
      'drugLicense1Url':    _dl1UrlCtrl.text.trim(),
      'drugLicense2Url':    _dl2UrlCtrl.text.trim(),
      'address':            _addressCtrl.text.trim(),
      'city':               _cityCtrl.text.trim(),
      'state':              _stateCtrl.text.trim(),
      'pinCode':            _pinCodeCtrl.text.trim(),
    });
    if (!mounted) return;
    setState(() => _loading = false);
    if (resp.ok) {
      await ref.read(authControllerProvider.notifier).refreshProfile();
      if (!mounted) return;
      showAppSnack(context, message: 'Profile updated', type: AppSnackType.success);
    } else {
      showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    _initFromUser();
    final auth  = ref.watch(authControllerProvider).auth;
    final user  = auth?.user;
    final email = user?['email']?.toString() ?? '';
    final role  = (auth?.access?['roleCode'] ?? user?['role'] ?? '').toString().toUpperCase();
    final status = (user?['status'] ?? '').toString().toUpperCase();
    final emailVerified =
        user?['email_verified'] == true || user?['emailVerified'] == true;
    final displayName = _fullNameCtrl.text.isNotEmpty
        ? _fullNameCtrl.text
        : _firmNameCtrl.text.isNotEmpty
            ? _firmNameCtrl.text
            : email;
    final initials = _initialsFrom(displayName);

    return AppShell(
      title: 'Profile settings',
      child: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            AppSpacing.md,
            AppSpacing.md,
            AppSpacing.xl,
          ),
          children: [
            // ── Hero card ──────────────────────────────────────────────────
            _ProfileHeroCard(
              initials: initials,
              displayName: displayName,
              email: email,
              role: role,
              status: status,
              emailVerified: emailVerified,
            ),
            const SizedBox(height: AppSpacing.md),

            // ── Personal section ───────────────────────────────────────────
            _CollapsibleSection(
              title: 'Personal',
              subtitle: 'Your name and contact details',
              icon: AppIcons.customer,
              collapsed: _personalCollapsed,
              onToggle: () =>
                  setState(() => _personalCollapsed = !_personalCollapsed),
              children: [
                _ProfileField(
                  controller: _fullNameCtrl,
                  label: 'Full name',
                  hint: 'Your full name',
                  icon: AppIcons.idCard,
                  validator: (v) {
                    if (_submitted && (v == null || v.trim().length < 2)) {
                      return 'Full name must be at least 2 characters';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: AppSpacing.sm),
                _ProfileReadOnlyField(
                  label: 'Email address',
                  value: email.isNotEmpty ? email : '—',
                  icon: AppIcons.email,
                ),
                const SizedBox(height: AppSpacing.sm),
                _PhoneField(
                  controller: _phoneCtrl,
                  countryCode: _phoneCountryCode,
                  onCountryCodeChanged: (v) =>
                      setState(() => _phoneCountryCode = v),
                  showError: _submitted && !_phoneNumOk,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),

            // ── Business & compliance section ──────────────────────────────
            _CollapsibleSection(
              title: 'Business',
              subtitle: 'Firm name, GST and drug license details',
              icon: AppIcons.company,
              collapsed: _businessCollapsed,
              onToggle: () =>
                  setState(() => _businessCollapsed = !_businessCollapsed),
              children: [
                _ProfileField(
                  controller: _firmNameCtrl,
                  label: 'Business name',
                  hint: 'Your firm / business name',
                  icon: AppIcons.store,
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _ProfileField(
                        controller: _gstCtrl,
                        label: 'GST number',
                        hint: '22AAAAA0000A1Z5',
                        icon: AppIcons.gstin,
                        textCapitalization: TextCapitalization.characters,
                        validator: (v) {
                          if (_submitted &&
                              v != null &&
                              v.trim().isNotEmpty &&
                              v.trim().length != 15) {
                            return 'GST must be 15 characters';
                          }
                          return null;
                        },
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: _ProfileReadOnlyField(
                        label: 'Account status',
                        value: status.isNotEmpty ? status : '—',
                        icon: AppIcons.verified,
                        valueColor: status == 'ACTIVE'
                            ? AppColors.success
                            : status == 'PENDING'
                                ? AppColors.warning
                                : null,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _ProfileField(
                        controller: _drugLicense1Ctrl,
                        label: 'Drug license 1',
                        hint: 'DL-1234567',
                        icon: AppIcons.product,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: _ProfileField(
                        controller: _drugLicense2Ctrl,
                        label: 'Drug license 2',
                        hint: 'DL-7654321',
                        icon: AppIcons.product,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),

            // ── Documents section ──────────────────────────────────────────
            _CollapsibleSection(
              title: 'Documents',
              subtitle: 'Certificate and license document URLs',
              icon: AppIcons.folder,
              collapsed: _docsCollapsed,
              onToggle: () =>
                  setState(() => _docsCollapsed = !_docsCollapsed),
              children: [
                _ProfileField(
                  controller: _gstCertUrlCtrl,
                  label: 'GST certificate URL',
                  hint: 'https://…',
                  icon: AppIcons.link,
                  keyboardType: TextInputType.url,
                  validator: (v) {
                    if (_submitted && v != null && !_urlOk(v)) {
                      return 'Enter a valid https:// URL';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: AppSpacing.sm),
                _ProfileField(
                  controller: _dl1UrlCtrl,
                  label: 'Drug license 1 document URL',
                  hint: 'https://…',
                  icon: AppIcons.link,
                  keyboardType: TextInputType.url,
                  validator: (v) {
                    if (_submitted && v != null && !_urlOk(v)) {
                      return 'Enter a valid https:// URL';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: AppSpacing.sm),
                _ProfileField(
                  controller: _dl2UrlCtrl,
                  label: 'Drug license 2 document URL',
                  hint: 'https://…',
                  icon: AppIcons.link,
                  keyboardType: TextInputType.url,
                  validator: (v) {
                    if (_submitted && v != null && !_urlOk(v)) {
                      return 'Enter a valid https:// URL';
                    }
                    return null;
                  },
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),

            // ── Address section ────────────────────────────────────────────
            _CollapsibleSection(
              title: 'Address',
              subtitle: 'Used for billing and delivery',
              icon: AppIcons.address,
              collapsed: _addressCollapsed,
              onToggle: () =>
                  setState(() => _addressCollapsed = !_addressCollapsed),
              children: [
                _ProfileField(
                  controller: _addressCtrl,
                  label: 'Street address',
                  hint: '123 Main Street',
                  icon: AppIcons.home,
                  maxLines: 2,
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _ProfileField(
                        controller: _cityCtrl,
                        label: 'City',
                        hint: 'Mumbai',
                        icon: AppIcons.city,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: _ProfileField(
                        controller: _stateCtrl,
                        label: 'State',
                        hint: 'Maharashtra',
                        icon: AppIcons.map,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _ProfileField(
                        controller: _pinCodeCtrl,
                        label: 'PIN code',
                        hint: '400001',
                        icon: AppIcons.address,
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: _ProfileReadOnlyField(
                        label: 'Email verified',
                        value: emailVerified ? 'Verified' : 'Not verified',
                        icon: emailVerified
                            ? AppIcons.emailVerified
                            : AppIcons.email,
                        valueColor:
                            emailVerified ? AppColors.success : AppColors.warning,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),

            // ── Preferences section ────────────────────────────────────────
            _CollapsibleSection(
              title: 'Preferences',
              subtitle: 'Currency and display settings',
              icon: AppIcons.settings,
              collapsed: _preferencesCollapsed,
              onToggle: () =>
                  setState(() => _preferencesCollapsed = !_preferencesCollapsed),
              children: [
                _CurrencyPicker(
                  activeCurrency: ref.watch(currencyProvider),
                  onChanged: (code) =>
                      ref.read(currencyProvider.notifier).setCurrency(code),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xl),

            // ── Save button ────────────────────────────────────────────────
            SizedBox(
              height: 44,
              child: FilledButton(
                onPressed: (_loading || (_submitted && !_canSave)) ? null : _save,
                style: FilledButton.styleFrom(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                ),
                child: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          strokeCap: StrokeCap.round,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : const Text('Save changes'),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),

            // ── Secondary actions ──────────────────────────────────────────
            OutlinedButton.icon(
              onPressed: () => context.go('/change-password'),
              icon: const Icon(AppIcons.lock, size: 16),
              label: const Text('Change password'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 44),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
            if (isOwner(auth)) ...[
              const SizedBox(height: AppSpacing.xs),
              OutlinedButton.icon(
                onPressed: () => context.go('/roles-access'),
                icon: const Icon(AppIcons.security, size: 16),
                label: const Text('Roles & access'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, 44),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.xl),

            // ── App info ───────────────────────────────────────────────────
            AppCard(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: const Icon(
                      AppIcons.info,
                      size: 16,
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('JedMee', style: AppTypography.cardTitle),
                        if (_appVersion.isNotEmpty)
                          Text(
                            _appVersion,
                            style: AppTypography.secondary,
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),

            // ── Logout ─────────────────────────────────────────────────────
            OutlinedButton.icon(
              onPressed: () async {
                final confirmed = await showConfirmDialog(
                  context,
                  title: 'Sign out',
                  message: 'Are you sure you want to sign out of JedMee?',
                  confirmLabel: 'Sign out',
                  cancelLabel: 'Cancel',
                );
                if (confirmed == true && mounted) {
                  await ref.read(authControllerProvider.notifier).logout();
                }
              },
              icon: const Icon(Icons.logout_rounded, size: 16),
              label: const Text('Sign out'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size(0, 44),
                foregroundColor: AppColors.danger,
                side: const BorderSide(color: AppColors.alertRedBorder),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _initialsFrom(String name) {
    final s = name.trim();
    if (s.isEmpty) return 'JM';
    final parts =
        s.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
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
}

// ─── Hero card ────────────────────────────────────────────────────────────────

class _ProfileHeroCard extends StatelessWidget {
  const _ProfileHeroCard({
    required this.initials,
    required this.displayName,
    required this.email,
    required this.role,
    required this.status,
    required this.emailVerified,
  });

  final String initials;
  final String displayName;
  final String email;
  final String role;
  final String status;
  final bool emailVerified;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Avatar
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppTheme.radiusMd),
              gradient: AppColors.primaryGradient,
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withOpacity(0.28),
                  blurRadius: 14,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            alignment: Alignment.center,
            child: Text(
              initials,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 22,
                letterSpacing: 0.5,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),

          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (displayName.isNotEmpty && !displayName.contains('@'))
                  Text(
                    displayName,
                    style: AppTypography.labelSemibold,
                    overflow: TextOverflow.ellipsis,
                    maxLines: 1,
                  ),
                if (email.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    email,
                    style: AppTypography.secondary,
                    overflow: TextOverflow.ellipsis,
                    maxLines: 1,
                  ),
                ],
                const SizedBox(height: AppSpacing.xs),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (role.isNotEmpty)
                      _HeroBadge(
                        label: role,
                        icon: Icons.person_outline_rounded,
                        bg: AppColors.primaryLight,
                        fg: AppColors.primaryDark,
                        border: AppColors.primarySubtle,
                      ),
                    if (status.isNotEmpty)
                      _HeroBadge(
                        label: status,
                        icon: Icons.check_circle_outline_rounded,
                        bg: status == 'ACTIVE'
                            ? AppColors.successLight
                            : AppColors.warningLight,
                        fg: status == 'ACTIVE'
                            ? AppColors.successDark
                            : AppColors.warningDark,
                        border: status == 'ACTIVE'
                            ? AppColors.successLight
                            : AppColors.warningLight,
                      ),
                    _HeroBadge(
                      label: emailVerified ? 'Email verified' : 'Email unverified',
                      icon: emailVerified
                          ? AppIcons.emailVerified
                          : AppIcons.email,
                      bg: emailVerified
                          ? AppColors.successLight
                          : AppColors.surface,
                      fg: emailVerified
                          ? AppColors.successDark
                          : AppColors.textMuted,
                      border: emailVerified
                          ? AppColors.successLight
                          : AppColors.border,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroBadge extends StatelessWidget {
  const _HeroBadge({
    required this.label,
    required this.icon,
    required this.bg,
    required this.fg,
    required this.border,
  });

  final String label;
  final IconData icon;
  final Color bg;
  final Color fg;
  final Color border;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppTheme.pillRadius),
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: AppTypography.badge
                .copyWith(color: fg, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

// ─── Collapsible section ──────────────────────────────────────────────────────

class _CollapsibleSection extends StatelessWidget {
  const _CollapsibleSection({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.collapsed,
    required this.onToggle,
    required this.children,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final bool collapsed;
  final VoidCallback onToggle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header (tappable)
          InkWell(
            onTap: onToggle,
            borderRadius: BorderRadius.circular(AppTheme.layoutCardRadius),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AppColors.primaryLight,
                      borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                    ),
                    child: Icon(icon, size: 16, color: AppColors.primary),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: AppTypography.cardTitle),
                        Text(subtitle, style: AppTypography.secondary),
                      ],
                    ),
                  ),
                  AnimatedRotation(
                    turns: collapsed ? -0.25 : 0,
                    duration: AppMotion.fast,
                    child: const Icon(
                      Icons.keyboard_arrow_down_rounded,
                      size: 20,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Body (animated)
          AnimatedCrossFade(
            firstChild: const SizedBox.shrink(),
            secondChild: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Divider(height: 1, color: AppColors.border),
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: children,
                  ),
                ),
              ],
            ),
            crossFadeState: collapsed
                ? CrossFadeState.showFirst
                : CrossFadeState.showSecond,
            duration: AppMotion.fast,
          ),
        ],
      ),
    );
  }
}

// ─── Phone field with country code ───────────────────────────────────────────

class _PhoneField extends StatelessWidget {
  const _PhoneField({
    required this.controller,
    required this.countryCode,
    required this.onCountryCodeChanged,
    this.showError = false,
  });

  final TextEditingController controller;
  final String countryCode;
  final ValueChanged<String> onCountryCodeChanged;
  final bool showError;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Phone number', style: AppTypography.inputLabel),
        const SizedBox(height: 4),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Country code dropdown
            Container(
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                border: Border.all(
                  color: showError ? AppColors.danger : AppColors.border,
                ),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: countryCode,
                  isDense: true,
                  style: AppTypography.body,
                  items: _kPhoneCodes
                      .map((c) => DropdownMenuItem(
                            value: c,
                            child: Text(c, style: AppTypography.body),
                          ))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) onCountryCodeChanged(v);
                  },
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.xs),
            // Phone number input
            Expanded(
              child: TextFormField(
                controller: controller,
                keyboardType: TextInputType.phone,
                style: AppTypography.body,
                decoration: InputDecoration(
                  hintText: 'Phone number',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                    borderSide: BorderSide(
                      color: showError ? AppColors.danger : AppColors.border,
                    ),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                    borderSide: BorderSide(
                      color: showError ? AppColors.danger : AppColors.border,
                    ),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                    borderSide: const BorderSide(color: AppColors.primary),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 11,
                  ),
                  isDense: true,
                ),
              ),
            ),
          ],
        ),
        if (showError) ...[
          const SizedBox(height: 4),
          Text(
            'Phone must be 7 to 15 digits',
            style: AppTypography.badge.copyWith(color: AppColors.danger),
          ),
        ],
      ],
    );
  }
}

// ─── Profile field ────────────────────────────────────────────────────────────

class _ProfileField extends StatelessWidget {
  const _ProfileField({
    required this.controller,
    required this.label,
    this.hint,
    this.icon,
    this.keyboardType,
    this.maxLines = 1,
    this.textCapitalization = TextCapitalization.words,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final String? hint;
  final IconData? icon;
  final TextInputType? keyboardType;
  final int maxLines;
  final TextCapitalization textCapitalization;
  final FormFieldValidator<String>? validator;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.inputLabel),
        const SizedBox(height: 4),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          maxLines: maxLines,
          textCapitalization: textCapitalization,
          validator: validator,
          style: AppTypography.body,
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: icon != null
                ? Padding(
                    padding: const EdgeInsets.only(left: 12, right: 8),
                    child: Icon(icon, size: 17, color: AppColors.textMuted),
                  )
                : null,
            prefixIconConstraints:
                const BoxConstraints(),
          ),
        ),
      ],
    );
  }
}

// ─── Read-only field ──────────────────────────────────────────────────────────

class _ProfileReadOnlyField extends StatelessWidget {
  const _ProfileReadOnlyField({
    required this.label,
    required this.value,
    this.icon,
    this.valueColor,
  });

  final String label;
  final String value;
  final IconData? icon;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.inputLabel),
        const SizedBox(height: 4),
        Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              if (icon != null) ...[
                Icon(icon, size: 17, color: AppColors.textMuted),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  value,
                  style: AppTypography.body.copyWith(
                    color: valueColor ?? AppColors.textMuted,
                    fontWeight: valueColor != null ? FontWeight.w600 : null,
                  ),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── Currency picker ──────────────────────────────────────────────────────────

class _CurrencyPicker extends StatelessWidget {
  const _CurrencyPicker({
    required this.activeCurrency,
    required this.onChanged,
  });

  final String activeCurrency;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Currency', style: AppTypography.inputLabel),
        const SizedBox(height: 4),
        Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
            border: Border.all(color: AppColors.border),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: activeCurrency,
              isExpanded: true,
              style: AppTypography.body,
              icon: const Icon(AppIcons.chevronDown, size: 16, color: AppColors.textMuted),
              items: currencyList.map((cfg) {
                return DropdownMenuItem<String>(
                  value: cfg.code,
                  child: Text(
                    '${cfg.symbol}  ${cfg.code} — ${cfg.name}',
                    style: AppTypography.body,
                    overflow: TextOverflow.ellipsis,
                  ),
                );
              }).toList(),
              onChanged: (v) {
                if (v != null) onChanged(v);
              },
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Affects all currency amounts shown in the app.',
          style: AppTypography.secondary.copyWith(
            color: AppColors.textMuted,
            fontSize: 11,
          ),
        ),
      ],
    );
  }
}
