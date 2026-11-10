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
  String? _actionError;

  /// Cache of join requests per team (key: teamId, value: list of requests).
  final Map<String, List<JoinRequestModel>> _teamJoinRequests = <String, List<JoinRequestModel>>{};

  /// Tracks request IDs currently being reviewed to disable actions and prevent double clicks.
  final Set<String> _pendingReviewActionIds = <String>{};

  /// Tracks my own sent requests (key: teamId, value: JoinRequestModel).
  final Map<String, JoinRequestModel> _mySentRequests = <String, JoinRequestModel>{};

  List<TeamModel> get teams => _teams;
  String? get currentUserId => _currentUserId;
  String? get actionFeedback => _actionFeedback;
  String? get actionError => _actionError;

  bool isRequestProcessing(String requestId) => _pendingReviewActionIds.contains(requestId);

  List<JoinRequestModel> getJoinRequestsForTeam(String teamId) =>
      _teamJoinRequests[teamId] ?? <JoinRequestModel>[];

  JoinRequestModel? getMyRequestForTeam(String teamId) => _mySentRequests[teamId];

  TeamViewModel({
    required TeamRepository repository,
    required SecureStorageHelper secureStorage,
  })  : _repository = repository,
        _secureStorage = secureStorage;

  Future<void> initUser() async {
    _currentUserId = await _secureStorage.getUserId();
  }

  /// Formats server error codes into clear Vietnamese user messages.
  String _formatErrorMessage(String rawMessage) {
    if (rawMessage.contains('SLOT_FULL') || rawMessage.contains('đã đủ số lượng')) {
      return 'Đội thi đã đủ số lượng thành viên (SLOT_FULL).';
    }
    if (rawMessage.contains('403') || rawMessage.contains('FORBIDDEN')) {
      return 'Không có quyền thực hiện thao tác này (403 Forbidden).';
    }
    if (rawMessage.contains('STATE_CONFLICT') || rawMessage.contains('đã tham gia')) {
      return 'Xung đột: Bạn đã tham gia một đội thi khác trong cuộc thi này.';
    }
    return rawMessage;
  }

  Future<void> loadTeams(String competitionId) async {
    setLoading();
    _actionFeedback = null;
    _actionError = null;
    await initUser();

    final Result<List<TeamModel>, Failure> result =
        await _repository.getTeamsByCompetition(competitionId);

    result.fold<void>(
      onSuccess: (List<TeamModel> data) {
        _teams = data;
        setSuccess();
        // Automatically fetch join requests for teams where current user is Leader
        if (_currentUserId != null) {
          for (final TeamModel t in _teams) {
            if (t.isLeader(_currentUserId!)) {
              loadJoinRequests(t.id);
            }
          }
        }
      },
      onFailure: (Failure failure) {
        setError(_formatErrorMessage(failure.message));
      },
    );
  }

  Future<void> loadJoinRequests(String teamId) async {
    final Result<List<JoinRequestModel>, Failure> result =
        await _repository.getJoinRequests(teamId);

    result.fold<void>(
      onSuccess: (List<JoinRequestModel> requests) {
        _teamJoinRequests[teamId] = requests;
        notifyListeners();
      },
      onFailure: (Failure failure) {
        // Silently capture or log 403 when not leader
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
    _actionFeedback = null;
    _actionError = null;

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
        final String msg = _formatErrorMessage(failure.message);
        _actionError = msg;
        setError(msg);
        return false;
      },
    );
  }

  /// Sends a JoinRequest with optional message. Updates status and handles SLOT_FULL / Membership conflict.
  Future<bool> sendJoinRequest({
    required String teamId,
    required String competitionId,
    String? message,
  }) async {
    setLoading();
    _actionFeedback = null;
    _actionError = null;

    final Result<JoinRequestModel, Failure> result = await _repository.sendJoinRequest(
      teamId,
      message: message,
    );

    return result.fold<bool>(
      onSuccess: (JoinRequestModel req) {
        _mySentRequests[teamId] = req;
        _actionFeedback = 'Đã gửi yêu cầu xin vào đội thành công! Đang chờ trưởng đội xét duyệt.';
        setSuccess();
        loadTeams(competitionId);
        return true;
      },
      onFailure: (Failure failure) {
        final String msg = _formatErrorMessage(failure.message);
        _actionError = msg;
        setError(msg);
        return false;
      },
    );
  }

  /// Leader reviews (ACCEPT or REJECT) a JoinRequest.
  /// Action is locked during review to prevent duplicate calls.
  Future<bool> reviewJoinRequest({
    required String teamId,
    required String requestId,
    required String decision,
    required String competitionId,
  }) async {
    if (_pendingReviewActionIds.contains(requestId)) return false;

    _pendingReviewActionIds.add(requestId);
    _actionFeedback = null;
    _actionError = null;
    notifyListeners();

    final Result<void, Failure> result = await _repository.reviewJoinRequest(
      teamId: teamId,
      requestId: requestId,
      decision: decision,
    );

    _pendingReviewActionIds.remove(requestId);

    return result.fold<bool>(
      onSuccess: (_) {
        final String actionText = decision == 'ACCEPT' ? 'Đã duyệt thành viên vào đội!' : 'Đã từ chối yêu cầu gia nhập.';
        _actionFeedback = actionText;
        notifyListeners();
        // Refresh team slot and list
        loadTeams(competitionId);
        loadJoinRequests(teamId);
        return true;
      },
      onFailure: (Failure failure) {
        final String msg = _formatErrorMessage(failure.message);
        _actionError = msg;
        notifyListeners();
        return false;
      },
    );
  }

  /// Applicant withdraws pending request.
  Future<bool> withdrawJoinRequest({
    required String requestId,
    required String teamId,
    required String competitionId,
  }) async {
    setLoading();
    _actionFeedback = null;
    _actionError = null;

    final Result<void, Failure> result = await _repository.withdrawJoinRequest(requestId);

    return result.fold<bool>(
      onSuccess: (_) {
        _mySentRequests.remove(teamId);
        _actionFeedback = 'Đã rút yêu cầu xin vào đội.';
        setSuccess();
        loadTeams(competitionId);
        return true;
      },
      onFailure: (Failure failure) {
        final String msg = _formatErrorMessage(failure.message);
        _actionError = msg;
        setError(msg);
        return false;
      },
    );
  }

  Future<bool> leaveTeam(String teamId, String competitionId) async {
    setLoading();
    _actionFeedback = null;
    _actionError = null;

    final Result<void, Failure> result = await _repository.leaveTeam(teamId);

    return result.fold<bool>(
      onSuccess: (_) {
        _actionFeedback = 'Đã rời đội thi thành công.';
        loadTeams(competitionId);
        return true;
      },
      onFailure: (Failure failure) {
        final String msg = _formatErrorMessage(failure.message);
        _actionError = msg;
        setError(msg);
        return false;
      },
    );
  }
}
