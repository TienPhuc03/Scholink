import 'package:flutter/material.dart';
import 'password_reset_viewmodel.dart';
import 'widgets/auth_widgets.dart';

/// Step 2 of FR-AUTH-03: OTP + new password in one form.
/// Shares its [PasswordResetViewModel] with [ForgotPasswordView], which owns and disposes it.
class ResetPasswordView extends StatefulWidget {
  final PasswordResetViewModel viewModel;
  final VoidCallback onPasswordReset;
  final VoidCallback onBack;

  const ResetPasswordView({
    super.key,
    required this.viewModel,
    required this.onPasswordReset,
    required this.onBack,
  });

  @override
  State<ResetPasswordView> createState() => _ResetPasswordViewState();
}

class _ResetPasswordViewState extends State<ResetPasswordView> {
  final TextEditingController _code = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _confirm = TextEditingController();

  @override
  void initState() {
    super.initState();
    _code.addListener(() {
      if (_code.text.isNotEmpty) widget.viewModel.clearFieldError('otp');
    });
  }

  @override
  void dispose() {
    _code.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final bool ok = await widget.viewModel.resetPassword(
      otpCode: _code.text,
      newPassword: _password.text,
      confirmPassword: _confirm.text,
    );
    if (!mounted) return;
    if (ok) {
      widget.onPasswordReset();
    } else if (widget.viewModel.codeRejected) {
      _code.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.viewModel,
      builder: (BuildContext context, Widget? child) {
        final PasswordResetViewModel vm = widget.viewModel;
        final ResetFieldErrors errors = vm.fieldErrors;
        final bool locked = vm.isLocked;
        final bool busy = vm.isLoading;

        return AuthScaffold(
          onBack: busy ? null : widget.onBack,
          children: <Widget>[
            AuthTitle(
              title: 'Đặt lại mật khẩu',
              subtitle: 'Nhập mã OTP gửi tới ${vm.email} và tạo mật khẩu mới.',
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                OtpCodeField(
                  controller: _code,
                  enabled: !locked && !busy,
                  hasError: vm.codeRejected || errors.otp != null,
                ),
                if (errors.otp != null) ...<Widget>[
                  const SizedBox(height: 6),
                  Text(errors.otp!, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.error)),
                ],
              ],
            ),
            if (locked)
              AuthMessageBanner(
                message: 'Bạn đã nhập sai quá 5 lần. Vui lòng thử lại sau khoảng ${vm.lockMinutesLeft} phút.',
              )
            else if (vm.hasError && vm.errorMessage != null)
              AuthMessageBanner(message: vm.errorMessage!)
            else if (vm.notice != null)
              AuthMessageBanner(message: vm.notice!, tone: AuthBannerTone.info),
            if (vm.devOtpHint != null)
              AuthMessageBanner(
                message: 'Chế độ phát triển: mã OTP là ${vm.devOtpHint}',
                tone: AuthBannerTone.success,
              ),
            AuthFormSection(
              children: <Widget>[
                AuthTextField(
                  label: 'Mật khẩu mới',
                  hint: 'Tạo mật khẩu mới',
                  icon: Icons.lock_outline_rounded,
                  controller: _password,
                  obscurable: true,
                  enabled: !busy,
                  errorText: errors.password,
                  autofillHints: const <String>[AutofillHints.newPassword],
                  onChanged: (_) => vm.clearFieldError('password'),
                ),
                const AuthHelperText('Ít nhất 8 ký tự, gồm chữ và số.'),
                AuthTextField(
                  label: 'Xác nhận mật khẩu mới',
                  hint: 'Nhập lại mật khẩu mới',
                  icon: Icons.lock_outline_rounded,
                  controller: _confirm,
                  obscurable: true,
                  enabled: !busy,
                  errorText: errors.confirmPassword,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  onChanged: (_) => vm.clearFieldError('confirmPassword'),
                ),
              ],
            ),
            AuthPrimaryButton(
              key: const Key('reset_submit'),
              label: 'Đổi mật khẩu',
              isLoading: busy,
              onPressed: locked ? null : _submit,
            ),
            OtpResendRow(
              secondsLeft: vm.resendSecondsLeft,
              isSending: vm.isResending,
              onResend: () {
                _code.clear();
                vm.resend();
              },
            ),
          ],
        );
      },
    );
  }
}
