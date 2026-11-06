import 'package:flutter/material.dart';
import 'email_verification_viewmodel.dart';
import 'widgets/auth_widgets.dart';

/// OTP step after registration (FR-AUTH-02). Designed from the Register frame's style
/// because there is no Figma frame for it yet.
class EmailVerificationView extends StatefulWidget {
  final EmailVerificationViewModel viewModel;
  final VoidCallback onVerified;
  final VoidCallback onGoToLogin;
  final VoidCallback onBack;

  const EmailVerificationView({
    super.key,
    required this.viewModel,
    required this.onVerified,
    required this.onGoToLogin,
    required this.onBack,
  });

  @override
  State<EmailVerificationView> createState() => _EmailVerificationViewState();
}

class _EmailVerificationViewState extends State<EmailVerificationView> {
  final TextEditingController _code = TextEditingController();

  @override
  void initState() {
    super.initState();
    _code.addListener(() {
      if (_code.text.isNotEmpty) widget.viewModel.clearCodeError();
    });
  }

  @override
  void dispose() {
    _code.dispose();
    widget.viewModel.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final bool ok = await widget.viewModel.verify(_code.text);
    if (!mounted) return;
    if (ok) {
      widget.onVerified();
    } else if (widget.viewModel.codeRejected) {
      _code.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.viewModel,
      builder: (BuildContext context, Widget? child) {
        final EmailVerificationViewModel vm = widget.viewModel;
        final bool locked = vm.isLocked;

        return AuthScaffold(
          onBack: vm.isLoading ? null : widget.onBack,
          children: <Widget>[
            AuthTitle(
              title: 'Xác thực email',
              subtitle: 'Nhập mã 6 chữ số Scholink vừa gửi tới ${vm.email}.',
            ),
            OtpCodeField(
              controller: _code,
              enabled: !locked && !vm.isLoading && !vm.needsManualLogin,
              hasError: vm.codeRejected,
              onCompleted: (_) => _verify(),
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
            if (vm.needsManualLogin)
              AuthPrimaryButton(label: 'Đến trang đăng nhập', onPressed: widget.onGoToLogin)
            else
              AuthPrimaryButton(
                key: const Key('otp_submit'),
                label: 'Xác thực',
                icon: Icons.verified_outlined,
                isLoading: vm.isLoading,
                onPressed: locked ? null : _verify,
              ),
            if (!vm.needsManualLogin)
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
