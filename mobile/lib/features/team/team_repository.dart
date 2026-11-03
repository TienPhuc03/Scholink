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

  Future<Result<List<TeamModel>, Failure>> getTeamsByCompetition(String competitionId) async {
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
      return FailureResult<List<TeamModel>, Failure>(ServerFailure(message: e.toString()));
    }
  }

  Future<Result<TeamModel, Failure>> createTeam({
    required String competitionId,
    required String name,
    String? description,
    int minSize = 2,
    int maxSize = 5,
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
      return FailureResult<TeamModel, Failure>(ServerFailure(message: e.toString()));
    }
  }

  Future<Result<void, Failure>> joinTeam(String teamId) async {
    try {
      await _apiClient.post<dynamic>(ApiEndpoints.joinTeam(teamId));
      return const SuccessResult<void, Failure>(null);
    } on Failure catch (failure) {
      return FailureResult<void, Failure>(failure);
    } catch (e) {
      return FailureResult<void, Failure>(ServerFailure(message: e.toString()));
    }
  }

  Future<Result<void, Failure>> leaveTeam(String teamId) async {
    try {
      await _apiClient.delete<dynamic>(ApiEndpoints.leaveTeam(teamId));
      return const SuccessResult<void, Failure>(null);
    } on Failure catch (failure) {
      return FailureResult<void, Failure>(failure);
    } catch (e) {
      return FailureResult<void, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
