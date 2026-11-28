import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'team_model.dart';

/// Single concrete Repository for Team operations in MVVM + Repository pattern.
class TeamRepository {
  final ApiClient _apiClient;

  TeamRepository(this._apiClient);

  Future<Result<List<TeamModel>, Failure>> getTeamsByCompetition(
      String competitionId) async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(
        ApiEndpoints.competitionTeams(competitionId),
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData['teams'] ?? resData)
          : resData;

      List<dynamic> rawList = <dynamic>[];
      if (payload is List) {
        rawList = payload;
      }

      final List<TeamModel> teams = rawList
          .whereType<Map<String, dynamic>>()
          .map((Map<String, dynamic> item) => TeamModel.fromJson(item))
          .toList();

      return SuccessResult<List<TeamModel>, Failure>(teams);
    } on Failure catch (failure) {
      return FailureResult<List<TeamModel>, Failure>(failure);
    } catch (e) {
      return FailureResult<List<TeamModel>, Failure>(
          ServerFailure(message: e.toString()));
    }
  }

  static List<dynamic> _list(dynamic resData, [String key = 'items']) {
    final dynamic payload = (resData is Map<String, dynamic>)
        ? (resData['data'] ?? resData[key] ?? resData)
        : resData;
    if (payload is Map<String, dynamic> && payload[key] is List) {
      return payload[key] as List<dynamic>;
    }
    return payload is List ? payload : <dynamic>[];
  }

  /// My teams in every competition, with the competition's review status.
  Future<Result<List<TeamModel>, Failure>> getMyTeams() async {
    try {
      final Response<dynamic> res =
          await _apiClient.get<dynamic>(ApiEndpoints.myTeams);
      return SuccessResult<List<TeamModel>, Failure>(_list(res.data)
          .whereType<Map<String, dynamic>>()
          .map(TeamModel.fromJson)
          .toList());
    } on Failure catch (failure) {
      return FailureResult<List<TeamModel>, Failure>(failure);
    } catch (e) {
      return FailureResult<List<TeamModel>, Failure>(
          ServerFailure(message: e.toString()));
    }
  }

  /// Open competitions of the catalog, plus the ones I suggested that are still under review
  /// (only I can form a team for those until an admin approves them).
  Future<Result<List<CompetitionOption>, Failure>> getCompetitions() async {
    try {
      final Response<dynamic> published = await _apiClient.get<dynamic>(
        ApiEndpoints.opportunities,
        queryParameters: <String, dynamic>{'type': 'COMPETITION', 'limit': 50},
      );
      List<dynamic> mine = <dynamic>[];
      try {
        mine = _list((await _apiClient
                .get<dynamic>(ApiEndpoints.myCompetitionSuggestions))
            .data);
      } catch (_) {} // guests and older backends: published ones are enough
      final List<CompetitionOption> options = <dynamic>[
        ...mine.where((dynamic raw) =>
            raw is Map<String, dynamic> && raw['status'] == 'PENDING_REVIEW'),
        ..._list(published.data),
      ]
          .whereType<Map<String, dynamic>>()
          .map(CompetitionOption.fromJson)
          .whereType<CompetitionOption>()
          .toList();
      return SuccessResult<List<CompetitionOption>, Failure>(options);
    } on Failure catch (failure) {
      return FailureResult<List<CompetitionOption>, Failure>(failure);
    } catch (e) {
      return FailureResult<List<CompetitionOption>, Failure>(
          ServerFailure(message: e.toString()));
    }
  }

  /// Sends a competition that is not in the app to the admin review queue. Returns the new
  /// (or already existing, same link) competition.
  Future<Result<CompetitionOption, Failure>> suggestCompetition({
    required String sourceUrl,
    required String title,
    required DateTime registerDeadline,
    String? organizerName,
  }) async {
    try {
      final Response<dynamic> res = await _apiClient.post<dynamic>(
        ApiEndpoints.competitionSuggestions,
        data: <String, dynamic>{
          'sourceUrl': sourceUrl.trim(),
          'title': title.trim(),
          'registerDeadline': registerDeadline.toUtc().toIso8601String(),
          if (organizerName != null && organizerName.trim().isNotEmpty)
            'organizerName': organizerName.trim(),
        },
      );
      final dynamic data = res.data;
      final CompetitionOption? option = CompetitionOption.fromJson(
          (data is Map<String, dynamic> ? (data['data'] ?? data) : data)
              as Map<String, dynamic>);
      if (option == null) {
        throw const ServerFailure(message: 'Máy chủ không trả về cuộc thi.');
      }
      return SuccessResult<CompetitionOption, Failure>(option);
    } on Failure catch (failure) {
      return FailureResult<CompetitionOption, Failure>(failure);
    } catch (e) {
      return FailureResult<CompetitionOption, Failure>(
          ServerFailure(message: e.toString()));
    }
  }

  Future<Result<TeamModel, Failure>> getTeamDetail(String teamId) async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(
        ApiEndpoints.teamDetail(teamId),
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData)
          : resData;

      if (payload is Map<String, dynamic>) {
        return SuccessResult<TeamModel, Failure>(TeamModel.fromJson(payload));
      }

      return const FailureResult<TeamModel, Failure>(
        ServerFailure(
            message: 'Phản hồi chi tiết đội từ máy chủ không hợp lệ.'),
      );
    } on Failure catch (failure) {
      return FailureResult<TeamModel, Failure>(failure);
    } catch (e) {
      return FailureResult<TeamModel, Failure>(
          ServerFailure(message: e.toString()));
    }
  }

  Future<Result<TeamModel, Failure>> createTeam({
    required String competitionId,
    required String name,
    String? description,
    int minSize = 2,
    int maxSize = 5,
    String? avatarUrl,
    String? bannerImageUrl,
  }) async {
    final String trimmedName = name.trim();
    if (trimmedName.isEmpty) {
      return const FailureResult<TeamModel, Failure>(
        ValidationFailure(message: 'Tên đội không được để trống.'),
      );
    }

    try {
      final Response<dynamic> response = await _apiClient.post<dynamic>(
        ApiEndpoints.teams,
        data: <String, dynamic>{
          'competitionId': competitionId,
          'name': trimmedName,
          'description': description?.trim(),
          'minSize': minSize,
          'maxSize': maxSize,
          if (avatarUrl != null && avatarUrl.trim().isNotEmpty)
            'avatarUrl': avatarUrl.trim(),
          if (bannerImageUrl != null && bannerImageUrl.trim().isNotEmpty)
            'bannerImageUrl': bannerImageUrl.trim(),
        },
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData)
          : resData;

      if (payload is Map<String, dynamic>) {
        return SuccessResult<TeamModel, Failure>(TeamModel.fromJson(payload));
      }

      return const FailureResult<TeamModel, Failure>(
        ServerFailure(message: 'Phản hồi tạo đội từ máy chủ không hợp lệ.'),
      );
    } on Failure catch (failure) {
      return FailureResult<TeamModel, Failure>(failure);
    } catch (e) {
      return FailureResult<TeamModel, Failure>(
          ServerFailure(message: e.toString()));
    }
  }

  Future<Result<TeamModel, Failure>> updateTeam(
    String teamId, {
    String? name,
    String? description,
    int? minSize,
    int? maxSize,
    String? avatarUrl,
    String? bannerImageUrl,
  }) async {
    try {
      final Response<dynamic> response = await _apiClient.patch<dynamic>(
        ApiEndpoints.teamDetail(teamId),
        data: <String, dynamic>{
          if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
          if (description != null) 'description': description.trim(),
          if (minSize != null) 'minSize': minSize,
          if (maxSize != null) 'maxSize': maxSize,
          if (avatarUrl != null) 'avatarUrl': avatarUrl.trim(),
          if (bannerImageUrl != null) 'bannerImageUrl': bannerImageUrl.trim(),
        },
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData)
          : resData;

      if (payload is Map<String, dynamic>) {
        return SuccessResult<TeamModel, Failure>(TeamModel.fromJson(payload));
      }

      return const FailureResult<TeamModel, Failure>(
        ServerFailure(message: 'Phản hồi cập nhật đội từ máy chủ không hợp lệ.'),
      );
    } on Failure catch (failure) {
      return FailureResult<TeamModel, Failure>(failure);
    } catch (e) {
      return FailureResult<TeamModel, Failure>(
          ServerFailure(message: e.toString()));
    }
  }

  /// Sends a JoinRequest to join a team with an optional greeting/intro message.
  Future<Result<JoinRequestModel, Failure>> sendJoinRequest(
    String teamId, {
    String? message,
  }) async {
    try {
      final Response<dynamic> response = await _apiClient.post<dynamic>(
        ApiEndpoints.joinTeam(teamId),
        data: <String, dynamic>{
          if (message != null && message.trim().isNotEmpty)
            'message': message.trim(),
        },
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData)
          : resData;

      if (payload is Map<String, dynamic>) {
        return SuccessResult<JoinRequestModel, Failure>(
            JoinRequestModel.fromJson(payload));
      }

      return const FailureResult<JoinRequestModel, Failure>(
        ServerFailure(message: 'Phản hồi xin vào đội từ máy chủ không hợp lệ.'),
      );
    } on Failure catch (failure) {
      return FailureResult<JoinRequestModel, Failure>(failure);
    } catch (e) {
      return FailureResult<JoinRequestModel, Failure>(
          ServerFailure(message: e.toString()));
    }
  }

  /// My PENDING JoinRequests across teams, so "Đã gửi yêu cầu" survives a reload.
  Future<Result<List<JoinRequestModel>, Failure>> getMyJoinRequests() async {
    try {
      final Response<dynamic> response =
          await _apiClient.get<dynamic>(ApiEndpoints.myJoinRequests);
      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData)
          : resData;
      final List<JoinRequestModel> requests = (payload is List
              ? payload
              : <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(JoinRequestModel.fromJson)
          .toList();
      return SuccessResult<List<JoinRequestModel>, Failure>(requests);
    } on Failure catch (failure) {
      return FailureResult<List<JoinRequestModel>, Failure>(failure);
    } catch (e) {
      return FailureResult<List<JoinRequestModel>, Failure>(
          ServerFailure(message: e.toString()));
    }
  }

  /// Fetches pending JoinRequests for a team (Leader only).
  Future<Result<List<JoinRequestModel>, Failure>> getJoinRequests(
      String teamId) async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(
        ApiEndpoints.teamJoinRequests(teamId),
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData)
          : resData;

      List<dynamic> rawList = <dynamic>[];
      if (payload is List) {
        rawList = payload;
      }

      final List<JoinRequestModel> requests = rawList
          .whereType<Map<String, dynamic>>()
          .map((Map<String, dynamic> item) => JoinRequestModel.fromJson(item))
          .toList();

      return SuccessResult<List<JoinRequestModel>, Failure>(requests);
    } on Failure catch (failure) {
      return FailureResult<List<JoinRequestModel>, Failure>(failure);
    } catch (e) {
      return FailureResult<List<JoinRequestModel>, Failure>(
          ServerFailure(message: e.toString()));
    }
  }

  /// Leader reviews (ACCEPT or REJECT) a JoinRequest atomically.
  Future<Result<void, Failure>> reviewJoinRequest({
    required String teamId,
    required String requestId,
    required String decision, // ACCEPT or REJECT
  }) async {
    try {
      await _apiClient.post<dynamic>(
        ApiEndpoints.reviewJoinRequest(teamId, requestId),
        data: <String, dynamic>{'decision': decision.toUpperCase()},
      );
      return const SuccessResult<void, Failure>(null);
    } on Failure catch (failure) {
      return FailureResult<void, Failure>(failure);
    } catch (e) {
      return FailureResult<void, Failure>(ServerFailure(message: e.toString()));
    }
  }

  /// Applicant withdraws their own pending JoinRequest.
  Future<Result<void, Failure>> withdrawJoinRequest(String requestId) async {
    try {
      await _apiClient.post<dynamic>(
        ApiEndpoints.withdrawJoinRequest(requestId),
      );
      return const SuccessResult<void, Failure>(null);
    } on Failure catch (failure) {
      return FailureResult<void, Failure>(failure);
    } catch (e) {
      return FailureResult<void, Failure>(ServerFailure(message: e.toString()));
    }
  }

  Future<Result<void, Failure>> leaveTeam(String teamId) async {
    try {
      await _apiClient.post<dynamic>(ApiEndpoints.leaveTeam(teamId));
      return const SuccessResult<void, Failure>(null);
    } on Failure catch (failure) {
      return FailureResult<void, Failure>(failure);
    } catch (e) {
      return FailureResult<void, Failure>(ServerFailure(message: e.toString()));
    }
  }

  /// Leader dissolves/deletes the team.
  Future<Result<void, Failure>> deleteTeam(String teamId) async {
    try {
      await _apiClient.delete<dynamic>(ApiEndpoints.teamDetail(teamId));
      return const SuccessResult<void, Failure>(null);
    } on Failure catch (failure) {
      return FailureResult<void, Failure>(failure);
    } catch (e) {
      return FailureResult<void, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
