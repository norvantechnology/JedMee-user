import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/app_icons.dart';
import '../../core/auth/biometric_service.dart';
import '../../core/constants/brand.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_motion.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/app_typography.dart';
import '../../providers/auth_controller.dart';
import '../../providers/app_providers.dart';
import '../../widgets/branding/auth_screen_layout.dart';
import '../../widgets/snackbar.dart';

/// Sign-in only (no registration) — aligned with web `AuthUnifiedPage` login tab.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  String _role = 'WHOLESALER';
  bool _remember = true;
  bool _obscure = true;
  bool _submitting = false;
  bool _biometricAvailable = false;
  bool _biometricLoading = false;

  @override
  void initState() {
    super.initState();
    _checkBiometrics();
  }

  Future<void> _checkBiometrics() async {
    final available = await BiometricService.isAvailable();
    if (mounted) setState(() => _biometricAvailable = available);
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _biometricLogin() async {
    final storage = ref.read(authStorageProvider);
    final auth = await storage.readAuth();
    if (auth == null || auth.refreshToken.isEmpty) {
      showAppSnack(
        context,
        message: 'No saved session found. Please sign in with your credentials first.',
        type: AppSnackType.info,
      );
      return;
    }

    setState(() => _biometricLoading = true);
    final authenticated = await BiometricService.authenticate(
      reason: 'Authenticate to sign in to JedMee',
    );
    if (!mounted) return;
    setState(() => _biometricLoading = false);

    if (!authenticated) return;
    if (!mounted) return;

    HapticFeedback.mediumImpact();
    await ref.read(authControllerProvider.notifier).bootstrap();
    if (!mounted) return;

    final authState = ref.read(authControllerProvider);
    if (authState.approvalGate) {
      context.go('/approval');
    } else if (authState.mustChangePassword) {
      context.go('/first-login-change-password');
    } else if (authState.isAuthed) {
      context.go('/dashboard');
    } else {
      if (!mounted) return;
      showAppSnack(
        context,
        message: 'Session expired. Please sign in again.',
        type: AppSnackType.warning,
      );
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    HapticFeedback.mediumImpact();
    setState(() => _submitting = true);
    final err = await ref.read(authControllerProvider.notifier).login(
          email: _emailCtrl.text.trim(),
          password: _passwordCtrl.text,
          role: _role,
          rememberMe: _remember,
        );
    if (!mounted) return;
    setState(() => _submitting = false);

    if (err == 'EMAIL_NOT_VERIFIED') {
      context.go(
        '/verify-otp?email=${Uri.encodeComponent(_emailCtrl.text.trim())}&role=${Uri.encodeComponent(_role)}',
      );
      return;
    }
    if (err != null) {
      showAppSnack(context, message: err, type: AppSnackType.error);
      return;
    }

    final auth = ref.read(authControllerProvider);
    if (auth.approvalGate) {
      context.go('/approval');
    } else if (auth.mustChangePassword) {
      context.go('/first-login-change-password');
    } else {
      context.go('/dashboard');
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScreenLayout(
      title: 'Welcome back',
      subtitle: Brand.signInSubtitle,
      child: AutofillGroup(
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _RoleRow(
                value: _role,
                onChanged: (v) => setState(() => _role = v),
              ),
              const SizedBox(height: 14),
              _AuthTextField(
                controller: _emailCtrl,
                label: 'Email address',
                hint: 'you@example.com',
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email, AutofillHints.username],
                prefixIcon: AppIcons.email,
                textInputAction: TextInputAction.next,
                autocorrect: false,
                validator: (v) =>
                    v != null && v.contains('@') ? null : 'Enter a valid email',
              ),
              const SizedBox(height: 10),
              _AuthTextField(
                controller: _passwordCtrl,
                label: 'Password',
                hint: 'Enter password',
                obscureText: _obscure,
                autofillHints: const [AutofillHints.password],
                prefixIcon: AppIcons.lock,
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _submit(),
                suffixIcon: SizedBox(
                  width: 44,
                  height: 44,
                  child: IconButton(
                    icon: Icon(
                      _obscure ? AppIcons.visibility : AppIcons.hidden,
                      size: 18,
                      color: AppColors.textMuted,
                    ),
                    tooltip: _obscure ? 'Show password' : 'Hide password',
                    onPressed: () => setState(() => _obscure = !_obscure),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                  ),
                ),
                validator: (v) =>
                    v != null && v.isNotEmpty ? null : 'Password required',
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _RememberMeCheckbox(
                    value: _remember,
                    onChanged: (v) {
                      HapticFeedback.lightImpact();
                      setState(() => _remember = v ?? true);
                    },
                  ),
                  TextButton(
                    onPressed: () => context.go('/forgot-password'),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text(
                      'Forgot password?',
                      style: AppTypography.secondary.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w500,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _SubmitButton(
                label: 'Sign in',
                loading: _submitting,
                onPressed: _submit,
              ),
              if (_biometricAvailable) ...[
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: _biometricLoading ? null : _biometricLogin,
                  icon: _biometricLoading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(AppIcons.biometric, size: 18),
                  label: const Text('Sign in with biometrics'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 46),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              const _SecurityNote(),
            ],
          ),
        ),
      ),
    );
  }
}

/// Compact horizontal role selector cards (Wholesaler / Retailer).
class _RoleRow extends StatelessWidget {
  const _RoleRow({
    required this.value,
    required this.onChanged,
  });

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Account type',
          style: AppTypography.inputLabel.copyWith(
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _AuthRoleCard(
                selected: value == 'WHOLESALER',
                icon: AppIcons.suppliers,
                title: 'Wholesaler',
                subtitle: 'Distribute & supply',
                onTap: () => onChanged('WHOLESALER'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _AuthRoleCard(
                selected: value == 'RETAILER',
                icon: AppIcons.store,
                title: 'Retailer',
                subtitle: 'Order & stock',
                onTap: () => onChanged('RETAILER'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Compact horizontal role card — icon left, text right.
/// Selection is indicated by border color + background tint (no extra indicator widget).
class _AuthRoleCard extends StatelessWidget {
  const _AuthRoleCard({
    required this.selected,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: AnimatedContainer(
          duration: AppMotion.fast,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.primary.withOpacity(0.06)
                : AppColors.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected ? AppColors.primary : AppColors.border,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: selected
                      ? AppColors.primary.withOpacity(0.12)
                      : AppColors.primary.withOpacity(0.07),
                  borderRadius: BorderRadius.circular(7),
                ),
                child: Icon(
                  icon,
                  size: 16,
                  color: selected ? AppColors.primary : AppColors.textMuted,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.label.copyWith(
                        fontWeight: FontWeight.w600,
                        color: selected ? AppColors.primary : AppColors.text,
                        fontSize: 12,
                      ),
                    ),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.textMuted,
                        fontSize: 11,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AuthTextField extends StatelessWidget {
  const _AuthTextField({
    required this.controller,
    required this.label,
    this.hint,
    this.keyboardType,
    this.obscureText = false,
    this.prefixIcon,
    this.suffixIcon,
    this.validator,
    this.autofillHints,
    this.textInputAction,
    this.autocorrect = true,
    this.onFieldSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final String? hint;
  final TextInputType? keyboardType;
  final bool obscureText;
  final IconData? prefixIcon;
  final Widget? suffixIcon;
  final FormFieldValidator<String>? validator;
  final Iterable<String>? autofillHints;
  final TextInputAction? textInputAction;
  final bool autocorrect;
  final ValueChanged<String>? onFieldSubmitted;

  static const _radius = BorderRadius.all(Radius.circular(10));

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.inputLabel.copyWith(
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        TextFormField(
          controller: controller,
          keyboardType: keyboardType,
          obscureText: obscureText,
          validator: validator,
          autofillHints: autofillHints,
          textInputAction: textInputAction,
          autocorrect: autocorrect,
          onFieldSubmitted: onFieldSubmitted,
          style: AppTypography.body,
          decoration: InputDecoration(
            hintText: hint,
            constraints: const BoxConstraints(minHeight: 48),
            prefixIcon: prefixIcon != null
                ? Icon(
                    prefixIcon,
                    size: 17,
                    color: AppColors.textMuted,
                  )
                : null,
            suffixIcon: suffixIcon,
            border: const OutlineInputBorder(borderRadius: _radius),
            enabledBorder: OutlineInputBorder(
              borderRadius: _radius,
              borderSide: const BorderSide(color: AppColors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: _radius,
              borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
            ),
            errorBorder: OutlineInputBorder(
              borderRadius: _radius,
              borderSide: const BorderSide(color: AppColors.danger),
            ),
            focusedErrorBorder: OutlineInputBorder(
              borderRadius: _radius,
              borderSide: const BorderSide(color: AppColors.danger, width: 1.5),
            ),
          ),
        ),
      ],
    );
  }
}

class _RememberMeCheckbox extends StatelessWidget {
  const _RememberMeCheckbox({
    required this.value,
    required this.onChanged,
  });

  final bool value;
  final ValueChanged<bool?> onChanged;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onChanged(!value),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              color: value ? AppColors.primary : Colors.transparent,
              borderRadius: BorderRadius.circular(4),
              border: value
                  ? null
                  : Border.all(color: AppColors.border, width: 1.5),
            ),
            child: value
                ? const Icon(AppIcons.confirm, size: 11, color: Colors.white)
                : null,
          ),
          const SizedBox(width: 8),
          Text(
            'Remember me',
            style: AppTypography.secondary.copyWith(
              color: AppColors.textMuted,
              fontWeight: FontWeight.w400,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

class _SubmitButton extends StatelessWidget {
  const _SubmitButton({
    required this.label,
    required this.loading,
    required this.onPressed,
  });

  final String label;
  final bool loading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 50,
      width: double.infinity,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        style: FilledButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: loading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  strokeCap: StrokeCap.round,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              )
            : Text(
                label,
                style: AppTypography.labelSemibold.copyWith(
                  color: AppColors.onPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
      ),
    );
  }
}

class _SecurityNote extends StatelessWidget {
  const _SecurityNote();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(
          AppIcons.security,
          size: 13,
          color: AppColors.textFaint,
        ),
        const SizedBox(width: 5),
        Flexible(
          child: Text(
            'Secured with 256-bit TLS encryption',
            textAlign: TextAlign.center,
            style: AppTypography.caption.copyWith(
              color: AppColors.textFaint,
              fontSize: 11,
            ),
          ),
        ),
      ],
    );
  }
}
