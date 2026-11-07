/// Route names shared by the app shell (route contract, F01).
/// Screens are pushed with `RouteSettings(name: ...)` so analytics/tests can identify them.
abstract final class AppRoutes {
  static const String register = '/auth/register';
  static const String verifyEmail = '/auth/verify-email';
  static const String forgotPassword = '/auth/forgot-password';
  static const String resetPassword = '/auth/reset-password';
  static const String passportEdit = '/passport/edit';
  static const String opportunityDetail = '/opportunities/detail';
  static const String apply = '/applications/apply';
  static const String myApplications = '/applications/mine';
  static const String applicationDetail = '/applications/detail';
  static const String applicationSnapshot = '/applications/snapshot';
  static const String teamSubmission = '/applications/team-submission';
  static const String profilePreview = '/passport/preview';
  static const String teammateProfile = '/teams/member-profile';
}

/// Bottom navigation tabs of the main shell, in display order.
abstract final class AppTabs {
  static const int opportunities = 0;
  static const int teams = 1;
  static const int chat = 2;
  static const int notifications = 3;
  static const int passport = 4;

  /// Guests can browse opportunities only (SRS AUTH-01); other tabs need an account.
  static bool requiresAccount(int index) => index != opportunities;

  static String label(int index) => switch (index) {
        teams => 'Đội thi',
        chat => 'Chat',
        notifications => 'Thông báo',
        passport => 'Passport',
        _ => 'Cơ hội',
      };
}
