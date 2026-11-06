import 'package:flutter/material.dart';
import 'core/constants/app_colors.dart';
import 'core/constants/app_routes.dart';
import 'core/di/service_locator.dart';
import 'core/theme/app_theme.dart';

// Flat Feature imports for MVVM + Repository Architecture
import 'features/auth/auth_repository.dart';
import 'features/auth/email_verification_view.dart';
import 'features/auth/email_verification_viewmodel.dart';
import 'features/auth/forgot_password_view.dart';
import 'features/auth/login_view.dart';
import 'features/auth/login_viewmodel.dart';
import 'features/auth/password_reset_viewmodel.dart';
import 'features/auth/register_view.dart';
import 'features/auth/register_viewmodel.dart';
import 'features/auth/reset_password_view.dart';
import 'features/chat/chat_view.dart';
import 'features/chat/chat_viewmodel.dart';
import 'features/notification/notification_inbox_view.dart';
import 'features/notification/notification_viewmodel.dart';
import 'features/notification/reminder_settings_sheet.dart';
import 'features/opportunity/opportunity_detail_view.dart';
import 'features/opportunity/opportunity_list_view.dart';
import 'features/opportunity/opportunity_model.dart';
import 'features/opportunity/opportunity_viewmodel.dart';
import 'features/passport/passport_view.dart';
import 'features/passport/passport_viewmodel.dart';
import 'features/team/team_list_view.dart';
import 'features/team/team_viewmodel.dart';

class ScholinkApp extends StatefulWidget {
  final bool initialIsAuthenticated;

  const ScholinkApp({
    super.key,
    required this.initialIsAuthenticated,
  });

  @override
  State<ScholinkApp> createState() => _ScholinkAppState();
}

class _ScholinkAppState extends State<ScholinkApp> {
  /// This State sits above MaterialApp, so its own context has no Navigator/ScaffoldMessenger.
  /// All app-level navigation and snackbars go through these keys.
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  final GlobalKey<ScaffoldMessengerState> _messengerKey = GlobalKey<ScaffoldMessengerState>();

  late bool _isAuthenticated;
  bool _isGuest = false;
  int _currentTabIndex = AppTabs.opportunities;

  /// Tab a guest tried to open before being asked to log in; restored after login (F10).
  int? _pendingTabIndex;

  /// Tab view models live for one session. Views load data once in initState, so handing them
  /// a fresh factory instance on every rebuild (e.g. each tab switch) dropped their data.
  /// Reset on login/logout so one user's data never leaks into the next session.
  _TabViewModels? _tabViewModels;
  _TabViewModels get _tabs => _tabViewModels ??= _TabViewModels();

  void _resetTabViewModels() {
    _tabViewModels = null;
  }

  @override
  void initState() {
    super.initState();
    _isAuthenticated = widget.initialIsAuthenticated;
  }

  NavigatorState get _nav => _navigatorKey.currentState!;

  void _showMessage(String message, {Color? color}) {
    _messengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message), backgroundColor: color));
  }

  void _onLoginSuccess() {
    _nav.popUntil((Route<dynamic> r) => r.isFirst);
    _resetTabViewModels();
    setState(() {
      _isAuthenticated = true;
      _isGuest = false;
      _currentTabIndex = _pendingTabIndex ?? _currentTabIndex;
      _pendingTabIndex = null;
    });
  }

  void _onEnterGuestMode() {
    setState(() {
      _isGuest = true;
      _pendingTabIndex = null;
      _currentTabIndex = AppTabs.opportunities;
    });
  }

  Future<void> _handleLogout() async {
    await sl<AuthRepository>().logout();
    if (!mounted) return;
    _nav.popUntil((Route<dynamic> r) => r.isFirst);
    _resetTabViewModels();
    setState(() {
      _isAuthenticated = false;
      _isGuest = false;
      _pendingTabIndex = null;
      _currentTabIndex = AppTabs.opportunities;
    });
    _showMessage('Bạn đã đăng xuất.');
  }

  /// Guests are asked to log in before opening account-only tabs.
  Future<void> _selectTab(int index) async {
    if (!_isGuest || !AppTabs.requiresAccount(index)) {
      setState(() => _currentTabIndex = index);
      return;
    }
    final bool? goLogin = await showModalBottomSheet<bool>(
      context: _navigatorKey.currentContext!,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(12))),
      builder: (BuildContext ctx) => _LoginRequiredSheet(featureName: AppTabs.label(index)),
    );
    if (goLogin == true) {
      setState(() {
        _pendingTabIndex = index;
        _isGuest = false;
      });
    }
  }

  // ---------- Auth flows (F10) ----------

  void _openRegister() {
    _nav.push<void>(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: AppRoutes.register),
        builder: (BuildContext ctx) => RegisterView(
          viewModel: sl<RegisterViewModel>(),
          onNavigateToLogin: () => Navigator.of(ctx).pop(),
          onRegistered: _openEmailVerification,
        ),
      ),
    );
  }

  void _openEmailVerification(RegisterOutcome outcome) {
    final EmailVerificationViewModel vm = sl<EmailVerificationViewModel>()
      ..start(
        email: outcome.email,
        password: outcome.password,
        ticket: outcome.ticket,
        initialError: outcome.otpError,
      );
    _nav.push<void>(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: AppRoutes.verifyEmail),
        builder: (BuildContext ctx) => EmailVerificationView(
          viewModel: vm,
          onBack: () => Navigator.of(ctx).pop(),
          onVerified: () {
            _onLoginSuccess();
            _showMessage('Chào mừng bạn đến với Scholink!', color: AppColors.success);
          },
          onGoToLogin: () => _nav.popUntil((Route<dynamic> r) => r.isFirst),
        ),
      ),
    );
  }

  void _openForgotPassword() {
    final PasswordResetViewModel vm = sl<PasswordResetViewModel>();
    _nav.push<void>(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: AppRoutes.forgotPassword),
        builder: (BuildContext ctx) => ForgotPasswordView(
          viewModel: vm,
          onBack: () => Navigator.of(ctx).pop(),
          onOtpSent: () => _nav.push<void>(
            MaterialPageRoute<void>(
              settings: const RouteSettings(name: AppRoutes.resetPassword),
              builder: (BuildContext resetCtx) => ResetPasswordView(
                viewModel: vm,
                onBack: () => Navigator.of(resetCtx).pop(),
                onPasswordReset: () {
                  _nav.popUntil((Route<dynamic> r) => r.isFirst);
                  _showMessage(
                    'Đổi mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
                    color: AppColors.success,
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _openOpportunityDetail(OpportunityModel opp) {
    _nav.push<void>(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: AppRoutes.opportunityDetail),
        builder: (BuildContext ctx) => OpportunityDetailView(
          opportunity: opp,
          viewModel: sl<OpportunityViewModel>(),
          isGuest: _isGuest,
          onOpenReminderSettings: () {
            ReminderSettingsSheet.show(
              ctx,
              opportunity: opp,
              viewModel: sl<NotificationViewModel>(),
            );
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Scholink Mobile',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      navigatorKey: _navigatorKey,
      scaffoldMessengerKey: _messengerKey,
      home: (_isAuthenticated || _isGuest)
          ? _buildMainNavigationScaffold()
          : _buildLoginView(),
    );
  }

  Widget _buildLoginView() {
    return LoginView(
      viewModel: sl<LoginViewModel>(),
      onLoginSuccess: _onLoginSuccess,
      onNavigateToGuest: _onEnterGuestMode,
      onNavigateToRegister: _openRegister,
      onForgotPassword: _openForgotPassword,
    );
  }

  Widget _buildMainNavigationScaffold() {
    return Scaffold(
      body: IndexedStack(
        index: _currentTabIndex,
        children: <Widget>[
          OpportunityListView(
            viewModel: _tabs.opportunity,
            isGuest: _isGuest,
            onOpportunityTap: _openOpportunityDetail,
            onOpenNotificationInbox: () => _selectTab(AppTabs.notifications),
          ),
          // Account-only tabs are not built for guests, so they never fire authenticated calls.
          if (_isGuest) const SizedBox.shrink() else TeamListView(viewModel: _tabs.team),
          if (_isGuest) const SizedBox.shrink() else ChatView(viewModel: _tabs.chat),
          if (_isGuest) const SizedBox.shrink() else NotificationInboxView(viewModel: _tabs.notification),
          if (_isGuest)
            const SizedBox.shrink()
          else
            PassportView(viewModel: _tabs.passport, onLogout: _handleLogout),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentTabIndex,
        onDestinationSelected: _selectTab,
        destinations: const <NavigationDestination>[
          NavigationDestination(
            icon: Icon(Icons.search_rounded),
            selectedIcon: Icon(Icons.search_rounded, color: AppColors.primary),
            label: 'Cơ hội',
          ),
          NavigationDestination(
            icon: Icon(Icons.group_outlined),
            selectedIcon: Icon(Icons.group_rounded, color: AppColors.primary),
            label: 'Đội thi',
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline_rounded),
            selectedIcon: Icon(Icons.chat_bubble_rounded, color: AppColors.primary),
            label: 'Chat',
          ),
          NavigationDestination(
            icon: Icon(Icons.notifications_none_rounded),
            selectedIcon: Icon(Icons.notifications_rounded, color: AppColors.primary),
            label: 'Thông báo',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_circle_outlined),
            selectedIcon: Icon(Icons.account_circle_rounded, color: AppColors.primary),
            label: 'Passport',
          ),
        ],
      ),
    );
  }
}

/// View models of the bottom tabs for one session, created lazily on first use.
/// They are dropped (not disposed) on reset: the old tab widgets may still be listening
/// until the next frame, and disposing a listened notifier would assert.
class _TabViewModels {
  late final OpportunityViewModel opportunity = sl<OpportunityViewModel>();
  late final TeamViewModel team = sl<TeamViewModel>();
  late final ChatViewModel chat = sl<ChatViewModel>();
  late final NotificationViewModel notification = sl<NotificationViewModel>();
  late final PassportViewModel passport = sl<PassportViewModel>();
}

/// Shown when a guest taps an account-only tab. Pops `true` to go to login.
class _LoginRequiredSheet extends StatelessWidget {
  final String featureName;

  const _LoginRequiredSheet({required this.featureName});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const Icon(Icons.lock_person_outlined, size: 40, color: AppColors.primary),
            const SizedBox(height: 12),
            const Text(
              'Bạn cần đăng nhập',
              textAlign: TextAlign.center,
              style: TextStyle(fontFamily: 'Be Vietnam Pro', fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(
              'Đăng nhập để dùng mục $featureName. Sau khi đăng nhập, Scholink sẽ đưa bạn quay lại đúng chỗ này.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              key: const Key('login_required_go'),
              onPressed: () => Navigator.of(context).pop(true),
              style: ElevatedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
              ),
              child: const Text('Đăng nhập / Đăng ký'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Để sau'),
            ),
          ],
        ),
      ),
    );
  }
}
