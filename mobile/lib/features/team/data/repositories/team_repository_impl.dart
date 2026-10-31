import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../../domain/entities/team_entity.dart';
import '../../domain/repositories/team_repository.dart';
import '../datasources/team_remote_data_source.dart';
import '../dtos/team_dtos.dart';
import '../mappers/team_mapper.dart';

class TeamRepositoryImpl implements TeamRepository {
  final TeamRemoteDataSource _remoteDataSource;

  TeamRepositoryImpl(this._remoteDataSource);

  @override
  Future<Result<List<TeamEntity>, Failure>> getTeamsByCompetition(String competitionId) async {
    try {
      final List<TeamDetailDto> dtos = await _remoteDataSource.getTeamsByCompetition(competitionId);
      final List<TeamEntity> entities = dtos.map(TeamMapper.toEntity).toList();
      return SuccessResult<List<TeamEntity>, Failure>(entities);
    } on Failure catch (failure) {
      return FailureResult<List<TeamEntity>, Failure>(failure);
    } catch (e) {
      return FailureResult<List<TeamEntity>, Failure>(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Result<TeamEntity, Failure>> createTeam({
    required String competitionId,
    required String name,
    String? description,
    int minSize = 2,
    int maxSize = 5,
  }) async {
    try {
      final CreateTeamRequestDto request = CreateTeamRequestDto(
        competitionId: competitionId,
        name: name,
        description: description,
        minSize: minSize,
        maxSize: maxSize,
      );
      final TeamDetailDto dto = await _remoteDataSource.createTeam(request);
      final TeamEntity entity = TeamMapper.toEntity(dto);
      return SuccessResult<TeamEntity, Failure>(entity);
    } on Failure catch (failure) {
      return FailureResult<TeamEntity, Failure>(failure);
    } catch (e) {
      return FailureResult<TeamEntity, Failure>(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Result<void, Failure>> joinTeam(String teamId) async {
    try {
      await _remoteDataSource.joinTeam(teamId);
      return const SuccessResult<void, Failure>(null);
    } on Failure catch (failure) {
      return FailureResult<void, Failure>(failure);
    } catch (e) {
      return FailureResult<void, Failure>(ServerFailure(message: e.toString()));
    }
  }

  @override
  Future<Result<void, Failure>> leaveTeam(String teamId) async {
    try {
      await _remoteDataSource.leaveTeam(teamId);
      return const SuccessResult<void, Failure>(null);
    } on Failure catch (failure) {
      return FailureResult<void, Failure>(failure);
    } catch (e) {
      return FailureResult<void, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
