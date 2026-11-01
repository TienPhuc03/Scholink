import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../entities/team_entity.dart';
import '../repositories/team_repository.dart';

class GetTeamsByCompetitionUseCase {
  final TeamRepository _repository;

  GetTeamsByCompetitionUseCase(this._repository);

  Future<Result<List<TeamEntity>, Failure>> call(String competitionId) =>
      _repository.getTeamsByCompetition(competitionId);
}

class CreateTeamUseCase {
  final TeamRepository _repository;

  CreateTeamUseCase(this._repository);

  Future<Result<TeamEntity, Failure>> call({
    required String competitionId,
    required String name,
    String? description,
    int minSize = 2,
    int maxSize = 5,
  }) {
    if (name.trim().isEmpty) {
      return Future<Result<TeamEntity, Failure>>.value(
        const FailureResult<TeamEntity, Failure>(
          ValidationFailure(message: 'Tên đội thi không được để trống.'),
        ),
      );
    }
    if (maxSize < minSize) {
      return Future<Result<TeamEntity, Failure>>.value(
        const FailureResult<TeamEntity, Failure>(
          ValidationFailure(message: 'Số lượng thành viên tối đa phải lớn hơn hoặc bằng tối thiểu.'),
        ),
      );
    }
    return _repository.createTeam(
      competitionId: competitionId,
      name: name.trim(),
      description: description?.trim(),
      minSize: minSize,
      maxSize: maxSize,
    );
  }
}

class JoinTeamUseCase {
  final TeamRepository _repository;

  JoinTeamUseCase(this._repository);

  Future<Result<void, Failure>> call(String teamId) => _repository.joinTeam(teamId);
}

class LeaveTeamUseCase {
  final TeamRepository _repository;

  LeaveTeamUseCase(this._repository);

  Future<Result<void, Failure>> call(String teamId) => _repository.leaveTeam(teamId);
}
