import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/storage/secure_storage_helper.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'team_model.dart';
import 'team_repository.dart';

/// ViewModel managing state and operations for Team Feature in MVVM architecture.
class TeamViewModel extends BaseViewModel {
  final TeamRepository _repository;
  final SecureStorageHelper _secureStorage;

  List<TeamModel> _teams = <TeamModel>[];
  String? _currentUserId;
  String? _actionFeedback;

  List<TeamModel> get teams => _teams;
  String? get currentUserId => _currentUserId;
  String? get actionFeedback => _actionFeedback;

  TeamViewModel({
    required TeamRepository repository,
    required SecureStorageHelper secureStorage,
  })  : _repository = repository,
        _secureStorage = secureStorage;

  Future<void> initUser() async {
    _currentUserId = await _secureStorage.getUserId();
  }

  Future<void> loadTeams(String competitionId) async {
    setLoading();
    _actionFeedback = null;
    await initUser();

    final Result<List<TeamModel>, Failure> result =
        await _repository.getTeamsByCompetition(competitionId);

    result.fold<void>(
      onSuccess: (List<TeamModel> data) {
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

    final Result<TeamModel, Failure> result = await _repository.createTeam(
      competitionId: competitionId,
      name: name,
      description: description,
      minSize: minSize,
      maxSize: maxSize,
    );

    return result.fold<bool>(
      onSuccess: (TeamModel created) {
        _teams = <TeamModel>[created, ..._teams];
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

    final Result<void, Failure> result = await _repository.joinTeam(teamId);

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

    final Result<void, Failure> result = await _repository.leaveTeam(teamId);

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
