import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../entities/team_entity.dart';

abstract interface class TeamRepository {
  Future<Result<List<TeamEntity>, Failure>> getTeamsByCompetition(String competitionId);

  Future<Result<TeamEntity, Failure>> createTeam({
    required String competitionId,
    required String name,
    String? description,
    int minSize = 2,
    int maxSize = 5,
  });

  Future<Result<void, Failure>> joinTeam(String teamId);

  Future<Result<void, Failure>> leaveTeam(String teamId);
}
