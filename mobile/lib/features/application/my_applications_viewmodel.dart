import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'application_model.dart';
import 'application_repository.dart';

/// "Hồ sơ của tôi": every application of the signed-in student, newest first.
class MyApplicationsViewModel extends BaseViewModel {
  final ApplicationRepository _repository;

  MyApplicationsViewModel(this._repository);

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
}

/// One application with its status timeline (read-only in F19; withdraw/resubmit is F28).
class ApplicationDetailViewModel extends BaseViewModel {
  final ApplicationRepository _repository;
  final String applicationId;

  ApplicationDetailViewModel(this._repository, {required this.applicationId});

  ApplicationDetail? _detail;
  ApplicationDetail? get detail => _detail;

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
}
