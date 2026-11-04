import 'package:flutter/material.dart';
import 'core/constants/app_colors.dart';
import 'core/di/service_locator.dart';
import 'core/storage/secure_storage_helper.dart';
import 'core/theme/app_theme.dart';

// Flat Feature imports for MVVM + Repository Architecture
import 'features/auth/login_view.dart';
import 'features/auth/login_viewmodel.dart';
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
  late bool _isAuthenticated;
  bool _isGuest = false;
  int _currentTabIndex = 0;

  @override
  void initState() {
    super.initState();
    _isAuthenticated = widget.initialIsAuthenticated;
  }

  void _onLoginSuccess() {
    setState(() {
      _isAuthenticated = true;
      _isGuest = false;
    });
  }

  void _onEnterGuestMode() {
    setState(() {
      _isGuest = true;
    });
  }

  Future<void> _handleLogout() async {
    await sl<SecureStorageHelper>().clear();
    setState(() {
      _isAuthenticated = false;
      _isGuest = false;
      _currentTabIndex = 0;
    });
  }

  void _openOpportunityDetail(OpportunityModel opp) {
    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
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
      onNavigateToRegister: () {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Tính năng đăng ký tài khoản sinh viên (FR-AUTH-02)'),
          ),
        );
      },
    );
  }

  Widget _buildMainNavigationScaffold() {
    return Scaffold(
      body: IndexedStack(
        index: _currentTabIndex,
        children: <Widget>[
          OpportunityListView(
            viewModel: sl<OpportunityViewModel>(),
            isGuest: _isGuest,
            onOpportunityTap: _openOpportunityDetail,
            onOpenNotificationInbox: () {
              setState(() {
                _currentTabIndex = 3; // Switch to Notification Inbox Tab
              });
            },
          ),
          TeamListView(
            viewModel: sl<TeamViewModel>(),
          ),
          ChatView(
            viewModel: sl<ChatViewModel>(),
          ),
          NotificationInboxView(
            viewModel: sl<NotificationViewModel>(),
          ),
          PassportView(
            viewModel: sl<PassportViewModel>(),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentTabIndex,
        onDestinationSelected: (int index) {
          setState(() {
            _currentTabIndex = index;
          });
        },
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
