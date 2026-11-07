import 'dart:async';
import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import '../team/team_model.dart';
import 'application_model.dart';
import 'application_repository.dart';
import 'submission_store.dart';
import 'team_submission_model.dart';
import 'team_submission_repository.dart';

/// Team submission screen (APP-05, F37) for both roles:
/// - leader: freeze the roster, follow consents, commit the TEAM Application, or cancel;
/// - member (leader too): preview their own Passport and consent.
///
/// Q14: while a session is open the status refreshes every 5 s. Q16: an expired lease restarts the
/// whole round; a member whose consent is older than the preview lifetime consents again.
/// Q17: the commit body and its Idempotency-Key are kept on the device, per account, for retries.
class TeamSubmissionViewModel extends BaseViewModel {
  final TeamSubmissionRepository _repo;
  final SubmissionStore _store;
  final Future<String?> Function() _currentUserId;
  final DateTime Function() _clock;
  final String Function() _newKey;
  final Duration? _tick;

  final String teamId;
  final String competitionTitle;

  TeamSubmissionViewModel({
    required TeamSubmissionRepository repository,
    required SubmissionStore store,
    required Future<String?> Function() currentUserId,
    required this.teamId,
    required this.competitionTitle,
    DateTime Function()? clock,
    String Function()? newKey,
    Duration? tick = const Duration(seconds: 1),
  })  : _repo = repository,
        _store = store,
        _currentUserId = currentUserId,
        _clock = clock ?? DateTime.now,
        _newKey = newKey ?? (() => const Uuid().v4()),
        _tick = tick;

  ApplicationRepository get _applications => _repo.applications;

  // ---------------- State ----------------
  String? _userId;
  String? get userId => _userId;

  TeamModel? _team;
  TeamModel? get team => _team;

  TeamSubmissionStatus? _status;
  TeamSubmissionStatus? get status => _status;

  ReadinessResult? _readiness;
  ReadinessResult? get readiness => _readiness;

  ApplicationPreview? _myPreview;
  ApplicationPreview? get myPreview => _myPreview;

  bool _consentChecked = false;
  bool get consentChecked => _consentChecked;

  bool _busy = false;
  bool get busy => _busy;

  /// Error of the last action, shown above the actions.
  String? _actionError;
  String? get actionError => _actionError;

  /// Set when the last commit may or may not have reached the server (lost response).
  bool _canRetrySubmit = false;
  bool get canRetrySubmit => _canRetrySubmit;

  PendingSubmission? _pending;

  /// A commit from an earlier session (app killed, offline) whose answer never arrived.
  bool get hasUnconfirmedAttempt => _pending?.hasSentRequest == true && !(_status?.isSubmitted ?? false);

  String? _applicationId;

  /// Set once by a successful commit from this screen; the view opens the result and clears it.
  String? _committedApplicationId;

  String? takeCommittedApplicationId() {
    final String? id = _committedApplicationId;
    _committedApplicationId = null;
    return id;
  }

  /// Team Application, once the team has submitted.
  String? get applicationId => _applicationId;

  DateTime get now => _clock();

  bool get isLeader => _status?.isLeader(_userId) ?? (_team != null && _team!.leaderId == _userId);
  bool get isSessionOpen => _status?.active == true && !(_status?.isLeaseOver(now) ?? true);
  bool get isLeaseOver => _status?.active == true && (_status?.isLeaseOver(now) ?? false);
  bool get isSubmitted => _status?.isSubmitted ?? false;

  int get leaseSecondsLeft {
    final DateTime? end = _status?.leaseExpiresAt;
    if (end == null) return 0;
    final int s = end.difference(now).inSeconds;
    return s < 0 ? 0 : s;
  }

  MemberConsentState get myConsentState =>
      (_status != null && _userId != null) ? _status!.stateOf(_userId!, now) : MemberConsentState.missing;

  bool get canSubmit => isLeader && isSessionOpen && (_status?.allReady(now) ?? false) && !_busy;

  String get opportunityId => _status?.competitionId.isNotEmpty == true ? _status!.competitionId : (_team?.competitionId ?? '');

  Timer? _timer;
  int _ticks = 0;

  // ---------------- Loading ----------------

  Future<void> load() async {
    setLoading();
    _userId = await _currentUserId();
    final Result<TeamModel, Failure> t = await _repo.getTeam(teamId);
    _team = t.dataOrNull ?? _team;
    final bool ok = await _refreshStatus();
    if (_team == null && t.errorOrNull != null) {
      setError(t.errorOrNull!.message);
      return;
    }
    if (!ok && _status == null) return;
    if (opportunityId.isNotEmpty) {
      _pending = await _store.load(opportunityId);
      if (isSubmitted && _pending != null) {
        await _store.clear(opportunityId);
        _pending = null;
      }
      await _checkReadiness();
    }
    if (isSubmitted) await _findApplication();
    setSuccess();
    _startTimer();
  }

  /// Returns false when the status could not be loaded.
  Future<bool> _refreshStatus() async {
    final Result<TeamSubmissionStatus, Failure> r = await _repo.getStatus(teamId);
    final Failure? f = r.errorOrNull;
    if (f != null) {
      if (_status == null) setError(f.message);
      return false;
    }
    final TeamSubmissionStatus next = r.dataOrNull!;
    // A new reservation invalidates a preview made for the previous one.
    if (_myPreview != null && next.reservationId != _status?.reservationId) {
      _myPreview = null;
      _consentChecked = false;
    }
    _status = next;
    return true;
  }

  Future<void> _checkReadiness() async {
    final Result<ReadinessResult, Failure> r = await _applications.checkReadiness(opportunityId);
    _readiness = r.dataOrNull ?? _readiness;
  }

  Future<void> _findApplication() async {
    final Result<List<ApplicationSummary>, Failure> mine = await _applications.getMyApplications();
    for (final ApplicationSummary a in mine.dataOrNull ?? <ApplicationSummary>[]) {
      if (a.opportunityId == opportunityId && a.isTeam) {
        _applicationId = a.id;
        return;
      }
    }
  }

  Future<void> refresh() async {
    final bool wasSubmitted = isSubmitted;
    await _refreshStatus();
    if (isSubmitted && !wasSubmitted) await _findApplication();
    notifyListeners();
  }

  void _startTimer() {
    final Duration? tick = _tick;
    if (tick == null || _timer != null) return;
    _timer = Timer.periodic(tick, (_) {
      _ticks++;
      if (_status?.active == true && !isSubmitted && !_busy && _ticks % 5 == 0) {
        unawaited(refresh());
      } else {
        notifyListeners(); // countdown
      }
    });
  }

  // ---------------- Leader: open / cancel ----------------

  /// Q14/Q16: freezes the roster; an expired session is cancelled first ("Bắt đầu lại").
  Future<void> startSubmission() async {
    await _run(() async {
      final TeamSubmissionStatus? s = _status;
      if (s != null && s.active && s.reservationId.isNotEmpty) {
        final Failure? abortError = (await _repo.abort(s.reservationId)).errorOrNull;
        if (abortError != null) return abortError.message;
      }
      final Failure? f = (await _repo.prepare(teamId)).errorOrNull;
      await _refreshStatus();
      return f == null ? null : _messageFor(f);
    });
  }

  Future<void> cancelSubmission() async {
    final String reservationId = _status?.reservationId ?? '';
    if (reservationId.isEmpty) return;
    await _run(() async {
      final Failure? f = (await _repo.abort(reservationId)).errorOrNull;
      await _refreshStatus();
      return f?.message;
    });
  }

  // ---------------- Member: preview + consent ----------------

  Future<void> createMyPreview() async {
    final TeamSubmissionStatus? s = _status;
    if (s == null || !isSessionOpen) return;
    await _run(() async {
      await _checkReadiness();
      final ReadinessResult? r = _readiness;
      if (r == null) return 'Không kiểm tra được Passport của bạn. Vui lòng thử lại.';
      if (!r.canProceed) return 'Passport của bạn chưa đáp ứng điều kiện của cuộc thi.';
      final Result<ApplicationPreview, Failure> p = await _applications.createPreview(
        opportunityId: opportunityId,
        submissionId: s.reservationId,
        expectedRuleVersion: r.ruleVersion,
        attachmentIds: const <String>[],
      );
      _myPreview = p.dataOrNull;
      _consentChecked = false;
      return p.errorOrNull?.message;
    });
  }

  void setConsent(bool value) {
    _consentChecked = value;
    notifyListeners();
  }

  Future<void> giveMyConsent() async {
    final TeamSubmissionStatus? s = _status;
    final ApplicationPreview? preview = _myPreview;
    if (s == null || preview == null || !_consentChecked) return;
    await _run(() async {
      if (preview.expiresAt.isBefore(now)) {
        _myPreview = null;
        return 'Bản xem trước đã hết hạn. Hãy tạo lại bản xem trước.';
      }
      final Result<ConsentReceipt, Failure> c = await _applications.createConsent(preview);
      final ConsentReceipt? receipt = c.dataOrNull;
      if (receipt == null) return c.errorOrNull!.message;
      final Failure? f = (await _repo.giveConsent(
        reservationId: s.reservationId,
        rosterVersion: s.rosterVersion,
        preview: preview,
        consent: receipt,
      ))
          .errorOrNull;
      await _refreshStatus();
      if (f != null) return _messageFor(f);
      _myPreview = null;
      _consentChecked = false;
      return null;
    });
  }

  // ---------------- Leader: commit ----------------

  Future<void> submit() async {
    final TeamSubmissionStatus? s = _status;
    if (s == null || !canSubmit) return;
    await _run(() async {
      await _checkReadiness();
      final int ruleVersion = _readiness?.ruleVersion ?? 1;
      final Map<String, dynamic> body = s.buildSubmitBody(expectedRuleVersion: ruleVersion);
      final PendingSubmission? previous = _pending;
      final bool sameRequest = previous != null &&
          previous.hasSentRequest &&
          previous.submissionId == s.reservationId &&
          _sameJson(previous.body!, body);
      _pending = sameRequest
          ? previous
          : PendingSubmission(
              opportunityId: opportunityId,
              submissionId: s.reservationId,
              createdAt: now,
            ).withRequest(idempotencyKey: _newKey(), body: body);
      await _store.save(_pending!);
      return _send();
    });
  }

  /// Resends exactly the stored request (same key, same body): never a second application.
  Future<void> retrySubmit() async {
    if (_pending?.hasSentRequest != true) return;
    await _run(_send);
  }

  Future<String?> _send() async {
    final PendingSubmission p = _pending!;
    final Result<SubmitResult, Failure> r =
        await _applications.submit(body: p.body!, idempotencyKey: p.idempotencyKey!);
    final SubmitResult? ok = r.dataOrNull;
    if (ok != null) {
      _canRetrySubmit = false;
      _applicationId = ok.applicationId;
      _committedApplicationId = ok.applicationId;
      _pending = null;
      await _store.clear(opportunityId);
      await _refreshStatus();
      return null;
    }
    final Failure f = r.errorOrNull!;
    final int? code = f is ServerFailure ? f.statusCode : null;
    if (f is NetworkFailure || f.code == 'REQUEST_IN_PROGRESS' || (code != null && code >= 500)) {
      _canRetrySubmit = true;
      return 'Chưa nhận được xác nhận từ máy chủ. Bấm "Thử lại" để gửi lại đúng yêu cầu này, '
          'Scholink sẽ không tạo hồ sơ đội trùng.';
    }
    _canRetrySubmit = false;
    _pending = null;
    await _store.clear(opportunityId);
    await _refreshStatus();
    if (f.code == 'ALREADY_APPLIED') await _findApplication();
    return _messageFor(f);
  }

  // ---------------- Helpers ----------------

  Future<void> _run(Future<String?> Function() action) async {
    if (_busy) return;
    _busy = true;
    _actionError = null;
    notifyListeners();
    try {
      _actionError = await action();
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  String _messageFor(Failure f) => switch (f.code) {
        'HOLD_EXPIRED' => 'Phiên nộp đã hết hạn. Trưởng đội cần bắt đầu lại và mọi người đồng ý lại.',
        'PREVIEW_EXPIRED' || 'CONSENT_MISMATCH' =>
          'Đồng ý của một thành viên không còn hiệu lực. Thành viên đó cần đồng ý lại trước khi nộp.',
        'VERSION_MISMATCH' => 'Đội hình hoặc điều kiện cuộc thi đã thay đổi. Hãy bắt đầu lại phiên nộp.',
        'PROFILE_INCOMPLETE' => 'Passport của một thành viên còn thiếu trường bắt buộc: ${f.message}',
        _ => f.message,
      };

  static bool _sameJson(Map<String, dynamic> a, Map<String, dynamic> b) => jsonEncode(a) == jsonEncode(b);

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
