import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import 'register_viewmodel.dart';
import 'widgets/auth_widgets.dart';

/// Register screen implementing Figma frame 202:5464 ("Bắt đầu cùng Scholink").
/// On success it hands a [RegisterOutcome] to [onRegistered] so the app opens the OTP step.
class RegisterView extends StatefulWidget {
  final RegisterViewModel viewModel;
  final ValueChanged<RegisterOutcome> onRegistered;
  final VoidCallback onNavigateToLogin;

  const RegisterView({
    super.key,
    required this.viewModel,
    required this.onRegistered,
    required this.onNavigateToLogin,
  });

  @override
  State<RegisterView> createState() => _RegisterViewState();
}

class _RegisterViewState extends State<RegisterView> {
  final TextEditingController _fullName = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _confirm = TextEditingController();
  bool _acceptedTerms = false;

  @override
  void dispose() {
    _fullName.dispose();
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    widget.viewModel.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final RegisterOutcome? outcome = await widget.viewModel.submit(
      fullName: _fullName.text,
      email: _email.text,
      password: _password.text,
      confirmPassword: _confirm.text,
      acceptedTerms: _acceptedTerms,
    );
    if (outcome != null && mounted) {
      widget.onRegistered(outcome);
    }
  }

  void _showPolicy(String title) {
    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: Text(title),
        content: const Text(
          'Nội dung chi tiết sẽ được cập nhật trước khi phát hành. '
          'Scholink chỉ dùng hồ sơ của bạn cho các cơ hội bạn chủ động nộp và không chia sẻ khi chưa có sự đồng ý.',
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Đã hiểu')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.viewModel,
      builder: (BuildContext context, Widget? child) {
        final RegisterViewModel vm = widget.viewModel;
        final RegisterFieldErrors errors = vm.fieldErrors;
        final bool busy = vm.isLoading;

        return AuthScaffold(
          children: <Widget>[
            // Figma 202:5475 - Welcome
            const AuthTitle(
              title: 'Bắt đầu cùng Scholink',
              subtitle: 'Tạo tài khoản để tìm học bổng phù hợp và không bỏ lỡ hạn chót.',
            ),

            // Figma 202:5478 - Registration form
            AuthFormSection(
              children: <Widget>[
                AuthTextField(
                  label: 'Họ và tên',
                  hint: 'Nhập họ và tên của bạn',
                  icon: Icons.person_outline_rounded,
                  controller: _fullName,
                  enabled: !busy,
                  errorText: errors.fullName,
                  autofillHints: const <String>[AutofillHints.name],
                  onChanged: (_) => vm.clearFieldError('fullName'),
                ),
                AuthTextField(
                  label: 'Email',
                  hint: 'ban@university.edu.vn',
                  icon: Icons.mail_outline_rounded,
                  controller: _email,
                  enabled: !busy,
                  errorText: errors.email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const <String>[AutofillHints.email],
                  onChanged: (_) => vm.clearFieldError('email'),
                ),
                AuthTextField(
                  label: 'Mật khẩu',
                  hint: 'Tạo mật khẩu',
                  icon: Icons.lock_outline_rounded,
                  controller: _password,
                  obscurable: true,
                  enabled: !busy,
                  errorText: errors.password,
                  autofillHints: const <String>[AutofillHints.newPassword],
                  onChanged: (_) => vm.clearFieldError('password'),
                ),
                // Figma 202:5495 - password rule hint
                const AuthHelperText('Ít nhất 8 ký tự, gồm chữ và số.'),
                AuthTextField(
                  label: 'Xác nhận mật khẩu',
                  hint: 'Nhập lại mật khẩu',
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

            // Figma 202:5502 - Account consent
            _buildConsent(errors.consent, busy),

            if (vm.hasError && vm.errorMessage != null) AuthMessageBanner(message: vm.errorMessage!),

            // Figma 202:5506 - Primary action
            AuthPrimaryButton(
              key: const Key('register_submit'),
              label: 'Tạo tài khoản',
              isLoading: busy,
              onPressed: _submit,
            ),

            // Figma 202:5509 - Alternative sign-up
            const AuthGoogleSection(caption: 'hoặc đăng ký bằng'),

            // Figma 202:5514 - Back to login
            AuthLinkText(
              prefix: 'Đã có tài khoản? ',
              link: 'Đăng nhập',
              onTap: widget.onNavigateToLogin,
            ),
          ],
        );
      },
    );
  }

  Widget _buildConsent(String? error, bool busy) {
    const TextStyle linkStyle = TextStyle(
      fontFamily: 'Inter',
      fontSize: 12,
      height: 18 / 12,
      fontWeight: FontWeight.w600,
      color: AppColors.primary,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            SizedBox(
              width: 20,
              height: 20,
              child: Checkbox(
                key: const Key('register_consent'),
                value: _acceptedTerms,
                onChanged: busy
                    ? null
                    : (bool? v) {
                        setState(() => _acceptedTerms = v ?? false);
                        widget.viewModel.clearFieldError('consent');
                      },
                activeColor: AppColors.primary,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
                side: BorderSide(color: error != null ? AppColors.error : AppColors.border, width: 1.5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text.rich(
                TextSpan(
                  style: const TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 12,
                    height: 18 / 12,
                    color: AppColors.textSecondary,
                  ),
                  children: <InlineSpan>[
                    const TextSpan(text: 'Tôi đồng ý với '),
                    WidgetSpan(
                      alignment: PlaceholderAlignment.baseline,
                      baseline: TextBaseline.alphabetic,
                      child: GestureDetector(
                        onTap: () => _showPolicy('Điều khoản sử dụng'),
                        child: const Text('Điều khoản sử dụng', style: linkStyle),
                      ),
                    ),
                    const TextSpan(text: ' và '),
                    WidgetSpan(
                      alignment: PlaceholderAlignment.baseline,
                      baseline: TextBaseline.alphabetic,
                      child: GestureDetector(
                        onTap: () => _showPolicy('Chính sách bảo mật'),
                        child: const Text('Chính sách bảo mật', style: linkStyle),
                      ),
                    ),
                    const TextSpan(text: ' của Scholink.'),
                  ],
                ),
              ),
            ),
          ],
        ),
        if (error != null) ...<Widget>[
          const SizedBox(height: 6),
          Text(error, style: const TextStyle(fontSize: 12, color: AppColors.error)),
        ],
      ],
    );
  }
}
