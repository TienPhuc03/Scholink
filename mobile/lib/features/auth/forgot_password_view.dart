import 'package:flutter/material.dart';
import 'password_reset_viewmodel.dart';
import 'widgets/auth_widgets.dart';

/// Step 1 of FR-AUTH-03: ask for the account email and send a reset OTP.
/// The backend answers the same way for unknown emails (anti-enumeration),
/// so the screen never says whether the email exists.
class ForgotPasswordView extends StatefulWidget {
  final PasswordResetViewModel viewModel;
  final String initialEmail;
  final VoidCallback onOtpSent;
  final VoidCallback onBack;

  const ForgotPasswordView({
    super.key,
    required this.viewModel,
    required this.onOtpSent,
    required this.onBack,
    this.initialEmail = '',
  });

  @override
  State<ForgotPasswordView> createState() => _ForgotPasswordViewState();
}

class _ForgotPasswordViewState extends State<ForgotPasswordView> {
  late final TextEditingController _email = TextEditingController(text: widget.initialEmail);

  @override
  void dispose() {
    _email.dispose();
    // This screen owns the flow's view model; ResetPasswordView only borrows it.
    widget.viewModel.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final bool ok = await widget.viewModel.requestReset(_email.text);
    if (ok && mounted) widget.onOtpSent();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.viewModel,
      builder: (BuildContext context, Widget? child) {
        final PasswordResetViewModel vm = widget.viewModel;
        return AuthScaffold(
          onBack: vm.isLoading ? null : widget.onBack,
          children: <Widget>[
            const AuthTitle(
              title: 'Quên mật khẩu',
              subtitle: 'Nhập email đã đăng ký. Nếu tài khoản tồn tại, Scholink sẽ gửi mã OTP để đặt lại mật khẩu.',
            ),
            AuthFormSection(
              children: <Widget>[
                AuthTextField(
                  label: 'Email',
                  hint: 'ban@university.edu.vn',
                  icon: Icons.mail_outline_rounded,
                  controller: _email,
                  enabled: !vm.isLoading,
                  errorText: vm.emailError,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.done,
                  autofillHints: const <String>[AutofillHints.email],
                  onSubmitted: (_) => _submit(),
                  onChanged: (_) => vm.clearEmailError(),
                ),
              ],
            ),
            if (vm.hasError && vm.errorMessage != null) AuthMessageBanner(message: vm.errorMessage!),
            AuthPrimaryButton(
              key: const Key('forgot_submit'),
              label: 'Gửi mã OTP',
              isLoading: vm.isLoading,
              onPressed: _submit,
            ),
            AuthLinkText(prefix: 'Nhớ ra mật khẩu? ', link: 'Đăng nhập', onTap: widget.onBack),
          ],
        );
      },
    );
  }
}
