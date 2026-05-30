import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/auth_controller.dart';
import '../../widgets/branding/auth_screen_layout.dart';
import '../../widgets/snackbar.dart';

class VerifyOtpScreen extends ConsumerStatefulWidget {
  const VerifyOtpScreen({
    super.key,
    this.email,
    this.role,
    this.rememberMe = true,
  });

  final String? email;
  final String? role;
  final bool rememberMe;

  @override
  ConsumerState<VerifyOtpScreen> createState() => _VerifyOtpScreenState();
}

class _VerifyOtpScreenState extends ConsumerState<VerifyOtpScreen> {
  final _otpCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _otpCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = widget.email ?? '';
    if (email.isEmpty || _otpCtrl.text.trim().length < 4) {
      showAppSnack(context, message: 'Enter the OTP', type: AppSnackType.error);
      return;
    }
    setState(() => _submitting = true);
    final err = await ref.read(authControllerProvider.notifier).verifyOtp(
          email: email,
          otp: _otpCtrl.text.trim(),
          role: widget.role ?? 'WHOLESALER',
          rememberMe: widget.rememberMe,
        );
    if (!mounted) return;
    setState(() => _submitting = false);

    if (err != null) {
      showAppSnack(context, message: err, type: AppSnackType.error);
      return;
    }

    final auth = ref.read(authControllerProvider);
    if (auth.approvalGate) {
      context.go('/approval');
    } else {
      context.go('/dashboard');
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = widget.email ?? 'your email';

    return AuthScreenLayout(
      title: 'Verify your email',
      subtitle: 'Enter the code sent to $email',
      footer: TextButton(
        onPressed: () => context.go('/login'),
        child: const Text('Back to sign in'),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _otpCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'OTP'),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Verify'),
          ),
        ],
      ),
    );
  }
}
