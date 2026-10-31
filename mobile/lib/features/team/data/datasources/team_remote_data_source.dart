import 'package:dio/dio.dart';
import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../dtos/team_dtos.dart';

abstract interface class TeamRemoteDataSource {
  Future<List<TeamDetailDto>> getTeamsByCompetition(String competitionId);
  Future<TeamDetailDto> createTeam(CreateTeamRequestDto request);
  Future<void> joinTeam(String teamId);
  Future<void> leaveTeam(String teamId);
}

class TeamRemoteDataSourceImpl implements TeamRemoteDataSource {
  final ApiClient _apiClient;

  TeamRemoteDataSourceImpl(this._apiClient);

  @override
  Future<List<TeamDetailDto>> getTeamsByCompetition(String competitionId) async {
    final Response<dynamic> response = await _apiClient.get<dynamic>(
      ApiEndpoints.competitionTeams(competitionId),
    );

    final dynamic resData = response.data;
    final dynamic payload = (resData is Map<String, dynamic>)
        ? (resData['data'] ?? resData['teams'] ?? resData)
        : resData;

    if (payload is List) {
      return payload
          .whereType<Map<String, dynamic>>()
          .map((Map<String, dynamic> item) => TeamDetailDto.fromJson(item))
          .toList();
    }
    return <TeamDetailDto>[];
  }

  @override
  Future<TeamDetailDto> createTeam(CreateTeamRequestDto request) async {
    final Response<dynamic> response = await _apiClient.post<dynamic>(
      ApiEndpoints.teams,
      data: request.toJson(),
    );

    final dynamic resData = response.data;
    final dynamic payload = (resData is Map<String, dynamic>)
        ? (resData['data'] ?? resData)
        : resData;

    if (payload is Map<String, dynamic>) {
      return TeamDetailDto.fromJson(payload);
    }
    return const TeamDetailDto();
  }

  @override
  Future<void> joinTeam(String teamId) async {
    await _apiClient.post<dynamic>(ApiEndpoints.joinTeam(teamId));
  }

  @override
  Future<void> leaveTeam(String teamId) async {
    await _apiClient.post<dynamic>(ApiEndpoints.leaveTeam(teamId));
  }
}
