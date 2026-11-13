/// Centralized API Endpoints matching Scholink Gateway and Microservices routes.
abstract final class ApiEndpoints {
  // 10.0.2.2 for Android Emulator, localhost for iOS Simulator or Desktop
  static const String defaultBaseUrl = 'http://10.0.2.2:3000';
  static const String mqttBrokerUri = '10.0.2.2';
  static const int mqttPort = 1883;

  // Identity Service routes
  static const String login = '/api/v1/auth/login';
  static const String register = '/api/v1/auth/register';
  static const String refreshToken = '/api/v1/auth/refresh';
  static const String logout = '/api/v1/auth/logout';
  static const String deleteAccount = '/api/v1/auth/delete-account';
  static const String sendOtp = '/api/v1/auth/send-otp';
  static const String verifyOtp = '/api/v1/auth/verify-otp';
  static const String forgotPassword = '/api/v1/auth/forgot-password';
  static const String resetPassword = '/api/v1/auth/reset-password';

  // Passport lives under the profiles routes of the gateway (GET/PUT /api/v1/profiles/me).
  static const String passport = '/api/v1/profiles/me';
  // FR-PROF-05: field visibility and profile views
  static const String passportPrivacy = '/api/v1/profiles/me/privacy';
  static const String passportView = '/api/v1/profiles/me/view';
  static const String profileSuggestions = '/api/v1/profiles/suggestions';
  static String publicProfile(String studentId) => '/api/v1/profiles/$studentId';
  static String teammateProfile(String teamId, String studentId) =>
      '/api/v1/teams/$teamId/members/$studentId/profile';
  static const String readiness = '/api/v1/profiles/me/readiness';
  static const String consents = '/api/v1/profiles/me/consents';

  // Media (identity service, F13): simulated storage, see media.use-case.ts
  static const String mediaUploadUrl = '/api/v1/media/upload-url';
  static String mediaComplete(String assetId) => '/api/v1/media/$assetId/complete';

  // Applications (opportunity service, F19)
  static const String applicationPreviews = '/api/v1/applications/previews';
  static const String applications = '/api/v1/applications';
  static const String myApplications = '/api/v1/applications/me';
  static String applicationDetail(String id) => '/api/v1/applications/$id';
  static String withdrawApplication(String id) => '/api/v1/applications/$id/withdraw';

  // Opportunity Service routes
  static const String opportunities = '/api/v1/opportunities';
  static String opportunityDetail(String id) => '/api/v1/opportunities/$id';
  // F14/F29: bookmark sync (body {bookmarked: bool} is idempotent) and APP-04 external mark.
  static const String myBookmarks = '/api/v1/opportunities/bookmarks/me';
  static String opportunityBookmark(String id) => '/api/v1/opportunities/$id/bookmark';
  static String opportunityExternalMark(String id) => '/api/v1/opportunities/$id/external-mark';

  // Notification Service routes (F20/F29)
  static const String notifications = '/api/v1/notifications';
  static const String notificationsReadAll = '/api/v1/notifications/read-all';
  static String notificationRead(String id) => '/api/v1/notifications/$id/read';
  static const String notificationPreferences = '/api/v1/notifications/preferences';

  // Collaboration Service routes
  static const String teams = '/api/v1/teams';
  static String teamDetail(String id) => '/api/v1/teams/$id';

  // Team submission (APP-05, F37)
  static String teamSubmission(String teamId) => '/api/v1/teams/$teamId/submission';
  static String prepareTeamSubmission(String teamId) => '/api/v1/teams/$teamId/prepare-submission';
  static String reopenTeam(String teamId) => '/api/v1/teams/$teamId/reopen';
  static String teamSubmissionConsents(String reservationId) => '/api/v1/teams/submissions/$reservationId/consents';
  static String abortTeamSubmission(String reservationId) => '/api/v1/teams/submissions/$reservationId/abort';
  static String competitionTeams(String compId) => '/api/v1/teams/competitions/$compId';
  static String joinTeam(String id) => '/api/v1/teams/$id/join-requests';
  static String leaveTeam(String id) => '/api/v1/teams/$id/leave';
  static String teamJoinRequests(String teamId) => '/api/v1/teams/$teamId/join-requests';
  static String reviewJoinRequest(String teamId, String requestId) =>
      '/api/v1/teams/$teamId/join-requests/$requestId/review';
  static String withdrawJoinRequest(String requestId) =>
      '/api/v1/teams/join-requests/$requestId/withdraw';

  // Chat routes (Collaboration Service SCHOL-26)
  static const String chatRooms = '/api/v1/chats/rooms';
  static String chatMessages(String roomId, {int? afterSeq, int limit = 50}) {
    if (afterSeq != null && afterSeq > 0) {
      return '/api/v1/chats/rooms/$roomId/messages?afterSeq=$afterSeq&limit=$limit';
    }
    return '/api/v1/chats/rooms/$roomId/messages?limit=$limit';
  }
  static String markChatRead(String roomId) => '/api/v1/chats/rooms/$roomId/read';
  static const String directChatRoom = '/api/v1/chats/direct-rooms';
}
