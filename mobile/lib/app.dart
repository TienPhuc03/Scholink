import 'package:flutter/material.dart';
import 'core/constants/app_colors.dart';
import 'core/di/service_locator.dart';
import 'core/storage/secure_storage_helper.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/viewmodels/login_viewmodel.dart';
import 'features/auth/presentation/views/login_view.dart';
import 'features/chat/presentation/viewmodels/chat_viewmodel.dart';
import 'features/chat/presentation/views/chat_view.dart';
import 'features/opportunity/presentation/viewmodels/opportunity_viewmodel.dart';
import 'features/opportunity/presentation/views/opportunity_list_view.dart';
import 'features/passport/presentation/viewmodels/passport_viewmodel.dart';
import 'features/passport/presentation/views/passport_view.dart';
import 'features/team/presentation/viewmodels/team_viewmodel.dart';
import 'features/team/presentation/views/team_list_view.dart';

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
  int _currentTabIndex = 0;

  @override
  void initState() {
    super.initState();
    _isAuthenticated = widget.initialIsAuthenticated;
  }

  void _onLoginSuccess() {
    setState(() {
      _isAuthenticated = true;
    });
  }

  Future<void> _handleLogout() async {
    await sl<SecureStorageHelper>().clear();
    setState(() {
      _isAuthenticated = false;
      _currentTabIndex = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Scholink Mobile',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: _isAuthenticated ? _buildMainNavigationScaffold() : _buildLoginView(),
    );
  }

  Widget _buildLoginView() {
    return LoginView(
      viewModel: sl<LoginViewModel>(),
      onLoginSuccess: _onLoginSuccess,
    );
  }

  Widget _buildMainNavigationScaffold() {
    return Scaffold(
      body: IndexedStack(
        index: _currentTabIndex,
        children: <Widget>[
          OpportunityListView(
            viewModel: sl<OpportunityViewModel>(),
          ),
          TeamListView(
            viewModel: sl<TeamViewModel>(),
          ),
          ChatView(
            viewModel: sl<ChatViewModel>(),
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
            icon: Icon(Icons.account_circle_outlined),
            selectedIcon: Icon(Icons.account_circle_rounded, color: AppColors.primary),
            label: 'Passport',
          ),
        ],
      ),
    );
  }
}
