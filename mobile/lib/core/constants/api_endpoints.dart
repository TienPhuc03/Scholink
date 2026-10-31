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
  static const String passport = '/api/v1/passport';

  // Opportunity Service routes
  static const String opportunities = '/api/v1/opportunities';
  static String opportunityDetail(String id) => '/api/v1/opportunities/$id';

  // Collaboration Service routes
  static const String teams = '/api/v1/teams';
  static String teamDetail(String id) => '/api/v1/teams/$id';
  static String competitionTeams(String compId) => '/api/v1/teams/competitions/$compId';
  static String joinTeam(String id) => '/api/v1/teams/$id/join';
  static String leaveTeam(String id) => '/api/v1/teams/$id/leave';
  static String teamJoinRequests(String teamId) => '/api/v1/teams/$teamId/requests';
  static String reviewJoinRequest(String teamId, String requestId) =>
      '/api/v1/teams/$teamId/requests/$requestId/review';

  // Chat routes
  static const String chatRooms = '/api/v1/chat/rooms';
  static String chatMessages(String roomId) => '/api/v1/chat/rooms/$roomId/messages';
}
