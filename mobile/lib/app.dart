import 'dart:async';

import 'package:flutter/material.dart';
import 'core/constants/app_colors.dart';
import 'core/constants/app_routes.dart';
import 'core/database/room_database.dart';
import 'core/di/service_locator.dart';
import 'core/errors/failures.dart';
import 'core/errors/result.dart';
import 'core/storage/secure_storage_helper.dart';
import 'core/network/session_events.dart';
import 'core/theme/app_theme.dart';

// Flat Feature imports for MVVM + Repository Architecture
import 'features/application/application_detail_view.dart';
import 'features/application/application_model.dart';
import 'features/application/application_repository.dart';
import 'features/application/application_snapshot_view.dart';
import 'features/application/apply_view.dart';
import 'features/application/apply_viewmodel.dart';
import 'features/application/media_repository.dart';
import 'features/application/my_applications_view.dart';
import 'features/application/my_applications_viewmodel.dart';
import 'features/application/submission_store.dart';
import 'features/application/team_submission_repository.dart';
import 'features/application/team_submission_view.dart';
import 'features/application/team_submission_viewmodel.dart';
import 'features/auth/auth_model.dart';
import 'features/auth/auth_repository.dart';
import 'features/auth/email_verification_view.dart';
import 'features/auth/email_verification_viewmodel.dart';
import 'features/auth/forgot_password_view.dart';
import 'features/auth/login_view.dart';
import 'features/auth/login_viewmodel.dart';
import 'features/auth/password_reset_viewmodel.dart';
import 'features/auth/register_view.dart';
import 'features/auth/register_viewmodel.dart';
import 'features/auth/widgets/login_required_sheet.dart';
import 'features/auth/reset_password_view.dart';
import 'features/chat/chat_view.dart';
import 'features/chat/chat_viewmodel.dart';
import 'features/notification/notification_inbox_view.dart';
import 'features/notification/notification_model.dart';
import 'features/notification/notification_settings_view.dart';
import 'features/notification/notification_viewmodel.dart';
import 'features/notification/push_listener.dart';
import 'core/device/device_services.dart';
import 'features/notification/reminder_settings_sheet.dart';
import 'features/opportunity/opportunity_detail_view.dart';
import 'features/opportunity/opportunity_list_view.dart';
import 'features/opportunity/opportunity_model.dart';
import 'features/opportunity/opportunity_repository.dart';
import 'features/opportunity/opportunity_viewmodel.dart';
import 'features/passport/passport_edit_view.dart';
import 'features/passport/passport_repository.dart';
import 'features/passport/passport_view.dart';
import 'features/passport/passport_viewmodel.dart';
import 'features/passport/profile_view_screen.dart';
import 'features/team/team_list_view.dart';
import 'features/team/team_model.dart';
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

  /// AUTH-05 (F28, Q9): opportunity a guest wanted to apply to. After login the app reopens
  /// it and its apply flow at the readiness step; nothing is sent without the user's review.
  OpportunityModel? _pendingApply;

  /// F10/F29: opportunity a guest tried to bookmark. Saving a bookmark is safe to repeat, so
  /// after login it is saved for them (unlike apply, which is never replayed on its own).
  OpportunityModel? _pendingBookmark;

  StreamSubscription<void>? _sessionExpiry;

  /// Tab view models live for one session. Views load data once in initState, so handing them
  /// a fresh factory instance on every rebuild (e.g. each tab switch) dropped their data.
  /// Reset on login/logout so one user's data never leaks into the next session.
  _TabViewModels? _tabViewModels;
  _TabViewModels get _tabs => _tabViewModels ??= _TabViewModels();

  void _resetTabViewModels() {
    _tabViewModels = null;
  }

  /// F37 (Q2, Q3): when an account's session ends, no screen of it stays on the stack
  /// (Passport, applications, snapshots) and its cached data is dropped from the device.
  void _closeAccountScreensAndData() {
    _nav.popUntil((Route<dynamic> r) => r.isFirst);
    _resetTabViewModels();
    // F29: the next account on this device must not receive this account's pushes.
    if (sl.isRegistered<PushListener>()) unawaited(sl<PushListener>().stop());
    if (sl.isRegistered<RoomDatabase>()) unawaited(sl<RoomDatabase>().clearUserData());
  }

  @override
  void initState() {
    super.initState();
    _isAuthenticated = widget.initialIsAuthenticated;
    if (sl.isRegistered<SessionEvents>()) {
      _sessionExpiry = sl<SessionEvents>().expired.listen((_) => _onSessionExpired());
    }
    _lifecycle = AppLifecycleListener(onResume: _onAppResumed);
    if (_isAuthenticated) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        unawaited(_startPush());
        unawaited(_openLaunchTarget());
      });
    }
  }

  late final AppLifecycleListener _lifecycle;

  /// F29: back from the background (e.g. after a reminder time passed), fetch new notifications
  /// and open what a tapped push points to.
  void _onAppResumed() {
    if (_isAuthenticated && !_isGuest) {
      unawaited(_tabs.notification.loadNotifications());
      unawaited(_openLaunchTarget());
    }
  }

  /// F29: pushes over MQTT for the signed-in account; each one also reloads the inbox.
  Future<void> _startPush() async {
    if (!sl.isRegistered<PushListener>()) return;
    final String? userId = await sl<SecureStorageHelper>().getUserId();
    if (userId == null || userId.isEmpty || !mounted || !_isAuthenticated) return;
    await sl<PushListener>().start(
      userId,
      onReceived: () {
        if (mounted && _isAuthenticated && !_isGuest) unawaited(_tabs.notification.loadNotifications());
      },
    );
  }

  /// The user tapped a push notification: open its opportunity / application.
  Future<void> _openLaunchTarget() async {
    if (!sl.isRegistered<LocalNotifier>()) return;
    final String? refUrl = await sl<LocalNotifier>().takeLaunchRefUrl();
    if (refUrl == null || refUrl.isEmpty || !mounted || !_isAuthenticated || _isGuest) return;
    if (refUrl == '/notifications') {
      // The user tapped a stack of notifications: show the inbox.
      _nav.popUntil((Route<dynamic> r) => r.isFirst);
      setState(() => _currentTabIndex = AppTabs.notifications);
      unawaited(_tabs.notification.loadNotifications());
      return;
    }
    await _openNotificationTarget(NotificationModel(
      notificationId: 'push',
      type: NotificationType.system,
      title: '',
      body: '',
      refUrl: refUrl,
      createdAt: DateTime.now(),
    ));
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    _sessionExpiry?.cancel();
    super.dispose();
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
    final OpportunityModel? resumeApply = _pendingApply;
    final OpportunityModel? resumeBookmark = _pendingBookmark;
    setState(() {
      _isAuthenticated = true;
      _isGuest = false;
      _currentTabIndex = resumeApply != null || resumeBookmark != null
          ? AppTabs.opportunities
          : (_pendingTabIndex ?? _currentTabIndex);
      _pendingTabIndex = null;
      _pendingApply = null;
      _pendingBookmark = null;
    });
    unawaited(_startPush());
    if (resumeBookmark != null) unawaited(_completePendingBookmark(resumeBookmark));
    if (resumeApply != null) {
      // Wait for the main shell to replace the login screen before pushing on top of it.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _openOpportunityDetail(resumeApply);
        _startApply(resumeApply);
      });
    }
  }

  void _onEnterGuestMode() {
    setState(() {
      _isGuest = true;
      _pendingTabIndex = null;
      _pendingApply = null;
      _pendingBookmark = null;
      _currentTabIndex = AppTabs.opportunities;
    });
  }

  /// Q10: the refresh token was rejected. Close every screen, drop this session's data and
  /// show the login screen; after logging in again the user lands on the same tab.
  void _onSessionExpired() {
    if (!_isAuthenticated) return;
    _closeAccountScreensAndData();
    setState(() {
      _isAuthenticated = false;
      _isGuest = false;
      _pendingTabIndex = _currentTabIndex;
      _pendingApply = null;
      _pendingBookmark = null;
    });
    _showMessage('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.', color: AppColors.error);
  }

  Future<void> _handleLogout() async {
    await sl<AuthRepository>().logout();
    if (!mounted) return;
    _closeAccountScreensAndData();
    setState(() {
      _isAuthenticated = false;
      _isGuest = false;
      _pendingTabIndex = null;
      _pendingApply = null;
      _pendingBookmark = null;
      _currentTabIndex = AppTabs.opportunities;
    });
    _showMessage('Bạn đã đăng xuất.');
  }

  /// Guests are asked to log in before opening account-only tabs.
  Future<void> _selectTab(int index) async {
    if (!_isGuest || !AppTabs.requiresAccount(index)) {
      // The inbox tab is built once per session; refresh it each time it is opened again.
      if (!_isGuest && index == AppTabs.notifications && _currentTabIndex != index) {
        unawaited(_tabs.notification.loadNotifications());
      }
      setState(() => _currentTabIndex = index);
      return;
    }
    final LoginChoice? choice = await LoginRequiredSheet.show(
      _navigatorKey.currentContext!,
      message: 'Đăng nhập để dùng mục ${AppTabs.label(index)}. '
          'Sau khi đăng nhập, Scholink sẽ đưa bạn quay lại đúng chỗ này.',
    );
    if (choice == null || !mounted) return;
    setState(() {
      _pendingTabIndex = index;
      _isGuest = false;
    });
    if (choice == LoginChoice.register) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openRegister());
    }
  }

  /// AUTH-05: a guest tapped "Nộp hồ sơ". Remember the opportunity, then log in or register.
  Future<void> _askLoginToApply(OpportunityModel opp) async {
    final LoginChoice? choice = await LoginRequiredSheet.show(
      _navigatorKey.currentContext!,
      message: 'Đăng nhập tài khoản sinh viên để nộp hồ sơ cho "${opp.title}". '
          'Sau khi đăng nhập, Scholink mở lại cơ hội này để bạn xem lại và xác nhận trước khi nộp.',
    );
    if (choice == null || !mounted) return;
    _nav.popUntil((Route<dynamic> r) => r.isFirst);
    setState(() {
      _pendingApply = opp;
      _isGuest = false;
    });
    if (choice == LoginChoice.register) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openRegister());
    }
  }

  /// F10/F29: a guest tapped "Lưu". Remember the opportunity, log in, then save it.
  Future<void> _askLoginToBookmark(OpportunityModel opp) async {
    final LoginChoice? choice = await LoginRequiredSheet.show(
      _navigatorKey.currentContext!,
      message: 'Đăng nhập để lưu "${opp.title}" và nhận nhắc hạn 7, 3, 1 ngày trước khi đóng đăng ký. '
          'Sau khi đăng nhập, Scholink sẽ lưu cơ hội này giúp bạn.',
    );
    if (choice == null || !mounted) return;
    _nav.popUntil((Route<dynamic> r) => r.isFirst);
    setState(() {
      _pendingBookmark = opp;
      _isGuest = false;
    });
    if (choice == LoginChoice.register) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openRegister());
    }
  }

  Future<void> _completePendingBookmark(OpportunityModel opp) async {
    final Failure? failure = await _tabs.opportunity.setBookmark(opp, true);
    if (!mounted) return;
    if (failure == null) {
      _showMessage('Đã lưu "${opp.title}". Bạn sẽ nhận nhắc hạn trong Hộp thư.', color: AppColors.success);
    } else {
      _showMessage('Chưa lưu được "${opp.title}": ${failure.message}', color: AppColors.error);
    }
  }

  // ---------- Notifications (F29) ----------

  void _openNotificationSettings() {
    _nav.push<void>(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: AppRoutes.notificationSettings),
        builder: (_) => NotificationSettingsView(viewModel: _tabs.notification),
      ),
    );
  }

  /// A reminder opens its opportunity, an application update opens TV1's application detail,
  /// a team notification opens the Teams tab.
  Future<void> _openNotificationTarget(NotificationModel noti) async {
    final String? applicationId = noti.applicationId;
    if (applicationId != null) {
      _openApplicationDetail(applicationId);
      return;
    }
    final String? opportunityId = noti.targetOpportunityId;
    if (opportunityId != null) {
      final OpportunityModel? known = _tabs.opportunity.findById(opportunityId);
      if (known != null) {
        _openOpportunityDetail(known);
        return;
      }
      final Result<OpportunityDetail, Failure> res = await _tabs.opportunity.refreshDetail(opportunityId);
      if (!mounted) return;
      res.fold(
        onSuccess: (OpportunityDetail d) => _openOpportunityDetail(d.item),
        onFailure: (Failure f) => _showMessage('Không mở được cơ hội: ${f.message}', color: AppColors.error),
      );
      return;
    }
    if (noti.teamId != null) setState(() => _currentTabIndex = AppTabs.teams);
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

  /// FR-AUTH-02: a student who left the OTP screen earlier verifies now, before getting a session.
  Future<void> _verifyEmailAfterLogin(String email, String password) async {
    final Result<OtpTicket, Failure> otp = await sl<AuthRepository>().sendOtp(email: email);
    if (!mounted) return;
    _openEmailVerification(RegisterOutcome(
      email: email,
      password: password,
      ticket: otp.dataOrNull,
      otpError: otp.errorOrNull?.message,
    ));
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
          // Same view model as the list: a bookmark changed here shows there too (F29).
          viewModel: _tabs.opportunity,
          // Apply for guests is handled by onApplyInApp (AUTH-05: log in, then come back here).
          isGuest: _isGuest,
          onOpenReminderSettings: () {
            ReminderSettingsSheet.show(
              ctx,
              opportunity: _tabs.opportunity.findById(opp.id) ?? opp,
              viewModel: _tabs.notification,
            );
          },
          onApplyInApp: () => _isGuest ? _askLoginToApply(opp) : _startApply(opp),
          onBookmarkNeedsLogin: _askLoginToBookmark,
        ),
      ),
    );
  }

  // ---------- Application flow (F19) ----------

  /// [fromDetail]: resubmitting from an application detail (F28, Q4). The detail is already
  /// below this screen and reloads itself, so the apply flow just closes when it is done.
  void _openApply({required String opportunityId, required String title, bool fromDetail = false}) {
    final ApplyViewModel vm = ApplyViewModel(
      applications: sl<ApplicationRepository>(),
      media: sl<MediaRepository>(),
      store: sl<SubmissionStore>(),
      picker: sl<AttachmentPicker>(),
      opportunityId: opportunityId,
      opportunityTitle: title,
    );
    _nav.push<void>(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: AppRoutes.apply),
        builder: (BuildContext ctx) => ApplyView(
          viewModel: vm,
          onEditPassport: _editPassportFromApply,
          onOpenApplication: (String id, {required bool justSubmitted}) {
            if (!fromDetail) {
              _openApplicationDetail(id, justSubmitted: justSubmitted, replace: justSubmitted);
              return;
            }
            _nav.pop();
            if (justSubmitted) _showMessage('Đã nộp lại hồ sơ thành công.', color: AppColors.success);
          },
        ),
      ),
    );
  }

  /// Q4: "Cập nhật Passport" from the readiness step; the shared Passport tab view model
  /// is reused so the tab shows the saved data too.
  Future<void> _editPassportFromApply() async {
    final PassportViewModel passportVm = _tabs.passport;
    if (passportVm.passport == null) await passportVm.loadPassport();
    if (passportVm.passport == null) {
      _showMessage(passportVm.errorMessage ?? 'Không tải được Passport.', color: AppColors.error);
      return;
    }
    await _nav.push<bool>(
      MaterialPageRoute<bool>(
        settings: const RouteSettings(name: AppRoutes.passportEdit),
        builder: (_) => PassportEditView(viewModel: passportVm),
      ),
    );
  }

  void _openMyApplications() {
    _nav.push<void>(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: AppRoutes.myApplications),
        builder: (_) => MyApplicationsView(
          viewModel: MyApplicationsViewModel(sl<ApplicationRepository>()),
          onOpenApplication: (String id) => _openApplicationDetail(id),
        ),
      ),
    );
  }

  /// Q11: after a successful submit the apply flow is replaced by the detail,
  /// so "back" returns to the opportunity.
  void _openApplicationDetail(String id, {bool justSubmitted = false, bool replace = false}) {
    final MaterialPageRoute<void> route = MaterialPageRoute<void>(
      settings: const RouteSettings(name: AppRoutes.applicationDetail),
      builder: (_) => ApplicationDetailView(
        viewModel: ApplicationDetailViewModel(sl<ApplicationRepository>(), applicationId: id),
        justSubmitted: justSubmitted,
        onResubmit: (ApplicationDetail d) =>
            _openApply(opportunityId: d.summary.opportunityId, title: d.summary.displayTitle, fromDetail: true),
        onOpenRevision: _openRevisionSnapshot,
        onResubmitTeam: _resubmitTeam,
      ),
    );
    if (replace) {
      _nav.pushReplacement<void, void>(route);
    } else {
      _nav.push<void>(route);
    }
  }

  /// Individual opportunities use the F19 flow; TEAM competitions go through the team
  /// submission flow of the student's own team (APP-05, F37).
  void _startApply(OpportunityModel opp) {
    if ((opp.competitionMode ?? '').toUpperCase() == 'TEAM') {
      unawaited(_openTeamSubmissionForCompetition(opp));
    } else {
      _openApply(opportunityId: opp.id, title: opp.title);
    }
  }

  Future<void> _openTeamSubmissionForCompetition(OpportunityModel opp) async {
    final Result<List<TeamModel>, Failure> teams = await sl<TeamSubmissionRepository>().getCompetitionTeams(opp.id);
    final String? me = await sl<SecureStorageHelper>().getUserId();
    if (!mounted) return;
    TeamModel? mine;
    for (final TeamModel t in teams.dataOrNull ?? <TeamModel>[]) {
      if (me != null && t.isMember(me)) mine = t;
    }
    if (mine == null) {
      _showMessage(
        teams.errorOrNull?.message ??
            'Cuộc thi này nộp theo đội. Hãy tạo hoặc tham gia một đội ở tab Đội thi trước khi nộp.',
      );
      return;
    }
    _openTeamSubmission(teamId: mine.id, competitionTitle: opp.title);
  }

  void _openTeamSubmission({required String teamId, required String competitionTitle}) {
    final TeamSubmissionViewModel vm = TeamSubmissionViewModel(
      repository: sl<TeamSubmissionRepository>(),
      store: sl<SubmissionStore>(),
      currentUserId: sl<SecureStorageHelper>().getUserId,
      teamId: teamId,
      competitionTitle: competitionTitle,
    );
    _nav.push<void>(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: AppRoutes.teamSubmission),
        builder: (_) => TeamSubmissionView(
          viewModel: vm,
          onOpenApplication: (String id, {required bool justSubmitted}) =>
              _openApplicationDetail(id, justSubmitted: justSubmitted, replace: true),
          onOpenMemberProfile: (String studentId) => _openTeammateProfile(teamId: teamId, studentId: studentId),
        ),
      ),
    );
  }

  // ---------- Profile views (FR-PROF-05) ----------

  void _openMyProfilePreview() {
    final PassportRepository repo = sl<PassportRepository>();
    _nav.push<void>(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: AppRoutes.profilePreview),
        builder: (_) => ProfileViewScreen(
          title: 'Hồ sơ như người khác thấy',
          note: 'Chọn đối tượng để xem các trường họ thấy. Đổi quyền hiển thị trong "Chỉnh sửa Passport".',
          viewModel: ProfileViewViewModel(
            repo.previewMyProfile,
            audiences: const <ProfileAudience>[ProfileAudience.public, ProfileAudience.teammates],
          ),
        ),
      ),
    );
  }

  void _openTeammateProfile({required String teamId, required String studentId}) {
    final PassportRepository repo = sl<PassportRepository>();
    _nav.push<void>(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: AppRoutes.teammateProfile),
        builder: (_) => ProfileViewScreen(
          title: 'Hồ sơ đồng đội',
          viewModel: ProfileViewViewModel(
            (_) => repo.getTeammateProfile(teamId: teamId, studentId: studentId),
            audiences: const <ProfileAudience>[ProfileAudience.teammates],
          ),
        ),
      ),
    );
  }

  /// Q18: a withdrawn team application is reopened, then the leader runs the team flow again.
  Future<void> _resubmitTeam(ApplicationDetail d) async {
    final String? teamId = d.summary.teamId;
    if (teamId == null) return;
    final Failure? f = (await sl<TeamSubmissionRepository>().reopen(teamId)).errorOrNull;
    if (!mounted) return;
    // A team that is already open again answers with a state conflict: the flow still applies.
    if (f != null && f.code != 'STATE_CONFLICT') {
      _showMessage(f.message, color: AppColors.error);
      return;
    }
    _openTeamSubmission(teamId: teamId, competitionTitle: d.summary.displayTitle);
  }

  void _openRevisionSnapshot(ApplicationDetail d, ApplicationRevision revision) {
    _nav.push<void>(
      MaterialPageRoute<void>(
        settings: const RouteSettings(name: AppRoutes.applicationSnapshot),
        builder: (_) => ApplicationSnapshotView(
          opportunityTitle: d.summary.displayTitle,
          revision: revision,
          isCurrent: d.revisions.isNotEmpty && identical(d.revisions.first, revision),
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
      onEmailNotVerified: _verifyEmailAfterLogin,
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
            onBookmarkNeedsLogin: _askLoginToBookmark,
          ),
          // Account-only tabs are not built for guests, so they never fire authenticated calls.
          if (_isGuest)
            const SizedBox.shrink()
          else
            TeamListView(
              viewModel: _tabs.team,
              onOpenTeamSubmission: (TeamModel team, String competitionTitle) =>
                  _openTeamSubmission(teamId: team.id, competitionTitle: competitionTitle),
            ),
          if (_isGuest) const SizedBox.shrink() else ChatView(viewModel: _tabs.chat),
          if (_isGuest)
            const SizedBox.shrink()
          else
            NotificationInboxView(
              viewModel: _tabs.notification,
              onOpenTarget: _openNotificationTarget,
              onOpenSettings: _openNotificationSettings,
            ),
          if (_isGuest)
            const SizedBox.shrink()
          else
            PassportView(
              viewModel: _tabs.passport,
              onLogout: _handleLogout,
              onOpenMyApplications: _openMyApplications,
              onPreviewProfile: _openMyProfilePreview,
            ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentTabIndex,
        onDestinationSelected: _selectTab,
        destinations: <NavigationDestination>[
          const NavigationDestination(
            icon: Icon(Icons.search_rounded),
            selectedIcon: Icon(Icons.search_rounded, color: AppColors.primary),
            label: 'Cơ hội',
          ),
          const NavigationDestination(
            icon: Icon(Icons.group_outlined),
            selectedIcon: Icon(Icons.group_rounded, color: AppColors.primary),
            label: 'Đội thi',
          ),
          const NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline_rounded),
            selectedIcon: Icon(Icons.chat_bubble_rounded, color: AppColors.primary),
            label: 'Chat',
          ),
          // F29: unread count on the tab, so reminders are seen without opening the inbox.
          NavigationDestination(
            icon: _UnreadBadge(
              viewModel: _isGuest ? null : _tabs.notification,
              child: const Icon(Icons.notifications_none_rounded),
            ),
            selectedIcon: _UnreadBadge(
              viewModel: _isGuest ? null : _tabs.notification,
              child: const Icon(Icons.notifications_rounded, color: AppColors.primary),
            ),
            label: 'Thông báo',
          ),
          const NavigationDestination(
            icon: Icon(Icons.account_circle_outlined),
            selectedIcon: Icon(Icons.account_circle_rounded, color: AppColors.primary),
            label: 'Passport',
          ),
        ],
      ),
    );
  }
}

/// Unread count on the "Thông báo" tab icon; plain icon for guests.
class _UnreadBadge extends StatelessWidget {
  final NotificationViewModel? viewModel;
  final Widget child;

  const _UnreadBadge({required this.viewModel, required this.child});

  @override
  Widget build(BuildContext context) {
    final NotificationViewModel? vm = viewModel;
    if (vm == null) return child;
    return ListenableBuilder(
      listenable: vm,
      builder: (BuildContext context, Widget? _) {
        final int n = vm.unreadCount;
        return Badge(
          isLabelVisible: n > 0,
          label: Text(n > 99 ? '99+' : '$n', semanticsLabel: '$n thông báo chưa đọc'),
          child: child,
        );
      },
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

