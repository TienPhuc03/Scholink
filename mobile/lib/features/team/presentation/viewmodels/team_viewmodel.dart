import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../../../../core/storage/secure_storage_helper.dart';
import '../../../../core/viewmodels/base_viewmodel.dart';
import '../../domain/entities/team_entity.dart';
import '../../domain/usecases/team_usecases.dart';

class TeamViewModel extends BaseViewModel {
  final GetTeamsByCompetitionUseCase _getTeamsUseCase;
  final CreateTeamUseCase _createTeamUseCase;
  final JoinTeamUseCase _joinTeamUseCase;
  final LeaveTeamUseCase _leaveTeamUseCase;
  final SecureStorageHelper _secureStorage;

  List<TeamEntity> _teams = <TeamEntity>[];
  String? _currentUserId;
  String? _actionFeedback;

  List<TeamEntity> get teams => _teams;
  String? get currentUserId => _currentUserId;
  String? get actionFeedback => _actionFeedback;

  TeamViewModel({
    required GetTeamsByCompetitionUseCase getTeamsUseCase,
    required CreateTeamUseCase createTeamUseCase,
    required JoinTeamUseCase joinTeamUseCase,
    required LeaveTeamUseCase leaveTeamUseCase,
    required SecureStorageHelper secureStorage,
  })  : _getTeamsUseCase = getTeamsUseCase,
        _createTeamUseCase = createTeamUseCase,
        _joinTeamUseCase = joinTeamUseCase,
        _leaveTeamUseCase = leaveTeamUseCase,
        _secureStorage = secureStorage;

  Future<void> initUser() async {
    _currentUserId = await _secureStorage.getUserId();
  }

  Future<void> loadTeams(String competitionId) async {
    setLoading();
    _actionFeedback = null;
    await initUser();

    final Result<List<TeamEntity>, Failure> result = await _getTeamsUseCase(competitionId);

    result.fold<void>(
      onSuccess: (List<TeamEntity> data) {
        _teams = data;
        setSuccess();
      },
      onFailure: (Failure failure) {
        setError(failure.message);
      },
    );
  }

  Future<bool> createTeam({
    required String competitionId,
    required String name,
    String? description,
    int minSize = 2,
    int maxSize = 5,
  }) async {
    setLoading();

    final Result<TeamEntity, Failure> result = await _createTeamUseCase(
      competitionId: competitionId,
      name: name,
      description: description,
      minSize: minSize,
      maxSize: maxSize,
    );

    return result.fold<bool>(
      onSuccess: (TeamEntity created) {
        _teams = <TeamEntity>[created, ..._teams];
        _actionFeedback = 'Tạo đội "${created.name}" thành công!';
        setSuccess();
        return true;
      },
      onFailure: (Failure failure) {
        setError(failure.message);
        return false;
      },
    );
  }

  Future<bool> joinTeam(String teamId, String competitionId) async {
    setLoading();

    final Result<void, Failure> result = await _joinTeamUseCase(teamId);

    return result.fold<bool>(
      onSuccess: (_) {
        _actionFeedback = 'Gửi yêu cầu gia nhập đội thành công!';
        loadTeams(competitionId);
        return true;
      },
      onFailure: (Failure failure) {
        setError(failure.message);
        return false;
      },
    );
  }

  Future<bool> leaveTeam(String teamId, String competitionId) async {
    setLoading();

    final Result<void, Failure> result = await _leaveTeamUseCase(teamId);

    return result.fold<bool>(
      onSuccess: (_) {
        _actionFeedback = 'Rời đội thành công!';
        loadTeams(competitionId);
        return true;
      },
      onFailure: (Failure failure) {
        setError(failure.message);
        return false;
      },
    );
  }
}
