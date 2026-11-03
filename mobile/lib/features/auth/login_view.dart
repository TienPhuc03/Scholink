import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import 'login_viewmodel.dart';

/// Flutter Login View faithfully implementing Figma Screen 202:5517 (Chào mừng bạn trở lại!)
/// following Clean Architecture & MVVM with Defensive Null-Safety.
class LoginView extends StatefulWidget {
  final LoginViewModel viewModel;
  final VoidCallback onLoginSuccess;
  final VoidCallback? onNavigateToRegister;
  final VoidCallback? onNavigateToGuest;
  final VoidCallback? onForgotPassword;

  const LoginView({
    super.key,
    required this.viewModel,
    required this.onLoginSuccess,
    this.onNavigateToRegister,
    this.onNavigateToGuest,
    this.onForgotPassword,
  });

  @override
  State<LoginView> createState() => _LoginViewState();
}

class _LoginViewState extends State<LoginView> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _rememberMe = true;
  bool _showDemoQuickFill = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final String email = _emailController.text.trim();
    final String password = _passwordController.text;

    if (email.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng nhập email của bạn'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    if (password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng nhập mật khẩu'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    final bool success = await widget.viewModel.login(email, password);
    if (success && mounted) {
      widget.onLoginSuccess();
    }
  }

  void _fillPersona(String email, String password) {
    setState(() {
      _emailController.text = email;
      _passwordController.text = password;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: <Widget>[
            // Figma Node 202:5518 - Header
            _buildHeader(),

            // Figma Node 202:5527 - Login Content Scrollable
            Expanded(
              child: SingleChildScrollView(
                physics: const ClampingScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 24.0),
                child: ListenableBuilder(
                  listenable: widget.viewModel,
                  builder: (BuildContext context, Widget? child) {
                    final bool isLoading = widget.viewModel.isLoading;

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        // Figma Node 202:5528 - Welcome Section
                        _buildWelcomeSection(),
                        const SizedBox(height: 20),

                        // Figma Node 202:5531 - Product Benefit Card
                        _buildBenefitCard(),
                        const SizedBox(height: 24),

                        // Figma Node 202:5535 - Login Form
                        _buildLoginForm(isLoading),
                        const SizedBox(height: 24),

                        // Figma Node 202:5556 - Alternative Sign-in (Google OAuth)
                        _buildAlternativeSignIn(isLoading),
                        const SizedBox(height: 24),

                        // Figma Node 202:5561 - Registration Entry
                        _buildRegistrationEntry(),
                        const SizedBox(height: 16),

                        // SRS AUTH-01: Guest Mode CTA
                        _buildGuestModeCTA(),
                        const SizedBox(height: 16),

                        // Discreet Developer/Testing Helper
                        _buildDemoAccountsSection(),
                      ],
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Figma Node 202:5518 - Top Header with Scholink brand and action bell
  Widget _buildHeader() {
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 16.0),
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(
          bottom: BorderSide(color: AppColors.borderLight, width: 1.0),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: <Widget>[
          // Scholink Brand (Logo + Name + Tagline)
          Row(
            children: <Widget>[
              // Scholink Logo
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(6),
                ),
                clipBehavior: Clip.antiAlias,
                child: Image.asset(
                  'assets/images/scholink_logo.png',
                  fit: BoxFit.contain,
                  errorBuilder: (BuildContext context, Object error, StackTrace? stack) {
                    return Container(
                      color: AppColors.primaryLight,
                      child: const Icon(
                        Icons.school_rounded,
                        size: 20,
                        color: AppColors.primary,
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(width: 8),
              // Brand information
              const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    'Scholink',
                    style: TextStyle(
                      fontFamily: 'Be Vietnam Pro',
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                      height: 1.2,
                    ),
                  ),
                  Text(
                    'Cơ hội cho sinh viên',
                    style: TextStyle(
                      fontFamily: 'Inter',
                      fontSize: 11,
                      fontWeight: FontWeight.w400,
                      color: AppColors.textSecondary,
                      height: 1.2,
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Action Bell Icon
          IconButton(
            onPressed: () {},
            icon: const Icon(
              Icons.notifications_none_rounded,
              color: AppColors.textPrimary,
              size: 22,
            ),
            splashRadius: 22,
          ),
        ],
      ),
    );
  }

  /// Figma Node 202:5528 - Welcome Title & Subtitle
  Widget _buildWelcomeSection() {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          'Chào mừng bạn trở lại!',
          style: TextStyle(
            fontFamily: 'Be Vietnam Pro',
            fontSize: 22,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
            height: 1.25,
          ),
        ),
        SizedBox(height: 8),
        Text(
          'Tiếp tục hành trình chinh phục học bổng cùng Scholink.',
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 14,
            fontWeight: FontWeight.w400,
            color: AppColors.textSecondary,
            height: 1.4,
          ),
        ),
      ],
    );
  }

  /// Figma Node 202:5531 - Product Benefit Info Card
  Widget _buildBenefitCard() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
      decoration: BoxDecoration(
        color: AppColors.cardInfoBackground,
        borderRadius: BorderRadius.circular(8.0),
      ),
      child: const Row(
        children: <Widget>[
          Icon(
            Icons.school_outlined,
            size: 26,
            color: AppColors.primary,
          ),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Một hồ sơ sinh viên. Nhiều cơ hội hơn. Hạn chót luôn trong tầm tay.',
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 12,
                fontWeight: FontWeight.w400,
                color: AppColors.textSecondary,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Figma Node 202:5535 - Login Form Fields & Action
  Widget _buildLoginForm(bool isLoading) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // Email Field
        const Text(
          'Email',
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          style: const TextStyle(
            fontFamily: 'Inter',
            fontSize: 14,
            color: AppColors.textPrimary,
          ),
          decoration: const InputDecoration(
            hintText: 'an.nguyen@uet.vnu.edu.vn',
            prefixIcon: Icon(
              Icons.mail_outline_rounded,
              color: AppColors.textMuted,
              size: 20,
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Password Field
        const Text(
          'Mật khẩu',
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _passwordController,
          obscureText: _obscurePassword,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _handleLogin(),
          style: const TextStyle(
            fontFamily: 'Inter',
            fontSize: 14,
            color: AppColors.textPrimary,
          ),
          decoration: InputDecoration(
            hintText: '••••••••••••',
            prefixIcon: const Icon(
              Icons.lock_outline_rounded,
              color: AppColors.textMuted,
              size: 20,
            ),
            suffixIcon: IconButton(
              icon: Icon(
                _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                color: AppColors.textMuted,
                size: 20,
              ),
              onPressed: () {
                setState(() {
                  _obscurePassword = !_obscurePassword;
                });
              },
            ),
          ),
        ),
        const SizedBox(height: 12),

        // Figma Node 202:5547 - Remember me & Forgot Password
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            // Remember me checkbox
            InkWell(
              borderRadius: BorderRadius.circular(4),
              onTap: () {
                setState(() {
                  _rememberMe = !_rememberMe;
                });
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4.0),
                child: Row(
                  children: <Widget>[
                    SizedBox(
                      width: 18,
                      height: 18,
                      child: Checkbox(
                        value: _rememberMe,
                        activeColor: AppColors.primary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(4),
                        ),
                        side: const BorderSide(color: AppColors.border, width: 1.5),
                        onChanged: (bool? val) {
                          setState(() {
                            _rememberMe = val ?? false;
                          });
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Text(
                      'Ghi nhớ đăng nhập',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Forgot password link
            InkWell(
              onTap: widget.onForgotPassword ??
                  () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Tính năng khôi phục mật khẩu qua OTP (FR-AUTH-03)'),
                      ),
                    );
                  },
              child: const Text(
                'Quên mật khẩu?',
                style: TextStyle(
                  fontFamily: 'Inter',
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: AppColors.primary,
                ),
              ),
            ),
          ],
        ),

        // Error message banner if any
        if (widget.viewModel.hasError) ...<Widget>[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.error.withOpacity(0.08),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: AppColors.error.withOpacity(0.3)),
            ),
            child: Row(
              children: <Widget>[
                const Icon(Icons.error_outline_rounded, color: AppColors.error, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    widget.viewModel.errorMessage ?? 'Đăng nhập không thành công',
                    style: const TextStyle(
                      fontFamily: 'Inter',
                      color: AppColors.error,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],

        const SizedBox(height: 20),

        // Figma Node 202:5553 - Primary Login Button
        ElevatedButton(
          onPressed: isLoading ? null : _handleLogin,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            elevation: 0,
            minimumSize: const Size.fromHeight(48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(6),
            ),
          ),
          child: isLoading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    Icon(Icons.arrow_forward_rounded, size: 18, color: Colors.white),
                    SizedBox(width: 8),
                    Text(
                      'Đăng nhập',
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
        ),
      ],
    );
  }

  /// Figma Node 202:5556 - Alternative Sign-in (Google OAuth)
  Widget _buildAlternativeSignIn(bool isLoading) {
    return Column(
      children: <Widget>[
        const Text(
          'hoặc đăng nhập bằng',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Inter',
            fontSize: 12,
            color: AppColors.textMuted,
          ),
        ),
        const SizedBox(height: 12),
        InkWell(
          borderRadius: BorderRadius.circular(6),
          onTap: isLoading
              ? null
              : () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Tính năng đăng nhập với Google (FR-AUTH-02)'),
                    ),
                  );
                },
          child: Container(
            height: 48,
            decoration: BoxDecoration(
              color: AppColors.googleButtonBackground,
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Text(
                  'G',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                  ),
                ),
                SizedBox(width: 10),
                Text(
                  'Tiếp tục với Google',
                  style: TextStyle(
                    fontFamily: 'Inter',
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// Figma Node 202:5561 - Registration entry
  Widget _buildRegistrationEntry() {
    return Center(
      child: InkWell(
        borderRadius: BorderRadius.circular(4),
        onTap: widget.onNavigateToRegister ??
            () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Chuyển hướng đến màn hình Đăng ký tài khoản (Bắt đầu cùng Scholink)'),
                ),
              );
            },
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4.0, horizontal: 8.0),
          child: RichText(
            text: const TextSpan(
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 14,
                color: AppColors.textSecondary,
              ),
              children: <InlineSpan>[
                TextSpan(text: 'Chưa có tài khoản? '),
                TextSpan(
                  text: 'Đăng ký ngay',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// SRS AUTH-01: Guest Mode Entry Button
  Widget _buildGuestModeCTA() {
    return OutlinedButton.icon(
      onPressed: widget.onNavigateToGuest ??
          () {
            widget.onLoginSuccess();
          },
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        side: const BorderSide(color: AppColors.primary, width: 1.2),
        minimumSize: const Size.fromHeight(44),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(6),
        ),
      ),
      icon: const Icon(Icons.explore_outlined, size: 18),
      label: const Text(
        'Khám phá trước, đăng nhập sau',
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  /// Helper section for quickly selecting test accounts during grading/demo
  Widget _buildDemoAccountsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        InkWell(
          onTap: () {
            setState(() {
              _showDemoQuickFill = !_showDemoQuickFill;
            });
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Text(
                  _showDemoQuickFill ? 'Ẩn tài khoản Demo' : 'Hiển thị tài khoản Demo (Kiểm thử nhanh)',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                    decoration: TextDecoration.underline,
                  ),
                ),
                Icon(
                  _showDemoQuickFill ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                  size: 16,
                  color: AppColors.textMuted,
                ),
              ],
            ),
          ),
        ),
        if (_showDemoQuickFill) ...<Widget>[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: AppColors.borderLight),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Chọn tài khoản persona kiểm thử:',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: <Widget>[
                    ActionChip(
                      label: const Text('Student', style: TextStyle(fontSize: 11)),
                      onPressed: () => _fillPersona(
                        'student@scholink.edu.vn',
                        'Password@123',
                      ),
                    ),
                    ActionChip(
                      label: const Text('Applicant 1', style: TextStyle(fontSize: 11)),
                      onPressed: () => _fillPersona(
                        'applicant1@scholink.edu.vn',
                        'Password@123',
                      ),
                    ),
                    ActionChip(
                      label: const Text('Applicant 2', style: TextStyle(fontSize: 11)),
                      onPressed: () => _fillPersona(
                        'applicant2@scholink.edu.vn',
                        'Password@123',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
