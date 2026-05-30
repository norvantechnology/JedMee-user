import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/app_providers.dart';
import '../../widgets/branding/auth_screen_layout.dart';
import '../../widgets/snackbar.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _emailCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _otpSent = false;
  bool _submitting = false;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _otpCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    if (_emailCtrl.text.trim().isEmpty) return;
    setState(() => _submitting = true);
    final resp = await ref.read(authRepositoryProvider).forgotPasswordRequest({
      'email': _emailCtrl.text.trim(),
    });
    if (!mounted) return;
    setState(() {
      _submitting = false;
      _otpSent = resp.ok;
    });
    if (resp.ok) {
      showAppSnack(context, message: 'OTP sent to your email');
    } else {
      showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
    }
  }

  Future<void> _reset() async {
    setState(() => _submitting = true);
    final resp = await ref.read(authRepositoryProvider).forgotPasswordReset({
      'email': _emailCtrl.text.trim(),
      'otp': _otpCtrl.text.trim(),
      'newPassword': _passwordCtrl.text,
    });
    if (!mounted) return;
    setState(() => _submitting = false);
    if (resp.ok) {
      showAppSnack(context, message: 'Password updated', type: AppSnackType.success);
      context.go('/login');
    } else {
      showAppSnack(context, message: resp.parseErrorMessage(), type: AppSnackType.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScreenLayout(
      title: 'Reset password',
      subtitle: _otpSent
          ? 'Enter the OTP we sent and choose a new password.'
          : 'We will send a one-time code to your email.',
      footer: TextButton(
        onPressed: () => context.go('/login'),
        child: const Text('Back to sign in'),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          const SizedBox(height: 12),
          if (_otpSent) ...[
            TextField(
              controller: _otpCtrl,
              decoration: const InputDecoration(labelText: 'OTP'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _passwordCtrl,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'New password'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting ? null : _reset,
              child: const Text('Reset password'),
            ),
          ] else
            FilledButton(
              onPressed: _submitting ? null : _requestOtp,
              child: const Text('Send OTP'),
            ),
        ],
      ),
    );
  }
}
