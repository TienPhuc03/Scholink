import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'application_model.dart';
import 'application_repository.dart';

/// "Hồ sơ của tôi": every application of the signed-in student, newest first.
/// Reloads when an application is submitted or withdrawn anywhere in the app (F28, Q11).
class MyApplicationsViewModel extends BaseViewModel {
  final ApplicationRepository _repository;

  MyApplicationsViewModel(this._repository) {
    _repository.changes.addListener(load);
  }

  List<ApplicationSummary> _items = <ApplicationSummary>[];
  List<ApplicationSummary> get items => _items;

  Future<void> load() async {
    setLoading();
    final Result<List<ApplicationSummary>, Failure> r = await _repository.getMyApplications();
    r.fold<void>(
      onSuccess: (List<ApplicationSummary> list) {
        _items = list;
        setSuccess();
      },
      onFailure: (Failure f) => setError(f.message),
    );
  }

  @override
  void dispose() {
    _repository.changes.removeListener(load);
    super.dispose();
  }
}

/// One application: status timeline, submitted revisions, withdraw (F28).
/// Resubmitting reuses the F19 apply flow; this view model reloads when it succeeds.
class ApplicationDetailViewModel extends BaseViewModel {
  final ApplicationRepository _repository;
  final String applicationId;

  ApplicationDetailViewModel(this._repository, {required this.applicationId}) {
    _repository.changes.addListener(load);
  }

  ApplicationDetail? _detail;
  ApplicationDetail? get detail => _detail;

  bool _withdrawing = false;
  bool get isWithdrawing => _withdrawing;

  Future<void> load() async {
    setLoading();
    final Result<ApplicationDetail, Failure> r = await _repository.getApplication(applicationId);
    r.fold<void>(
      onSuccess: (ApplicationDetail d) {
        _detail = d;
        setSuccess();
      },
      onFailure: (Failure f) => setError(f.message),
    );
  }

  /// Returns `null` when the application ends up withdrawn, otherwise a message to show.
  /// Q3: a 409 because it was already withdrawn (double tap, lost response) counts as done.
  Future<String?> withdraw() async {
    if (_withdrawing) return null;
    _withdrawing = true;
    notifyListeners();
    final Failure? f = (await _repository.withdraw(applicationId)).errorOrNull;
    String? message;
    if (f != null) {
      await load();
      if (f.code == 'DEADLINE_PASSED') {
        message = 'Đã hết hạn đăng ký nên không thể rút hồ sơ.';
      } else if (_detail?.summary.status != ApplicationStatus.withdrawn) {
        message = f.message;
      }
    }
    _withdrawing = false;
    notifyListeners();
    return message;
  }

  @override
  void dispose() {
    _repository.changes.removeListener(load);
    super.dispose();
  }
}
