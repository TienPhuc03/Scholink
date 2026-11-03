import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'passport_model.dart';
import 'passport_repository.dart';

/// ViewModel managing state and operations for Passport in MVVM architecture.
class PassportViewModel extends BaseViewModel {
  final PassportRepository _repository;

  PassportModel? _passport;
  PassportModel? get passport => _passport;

  PassportViewModel(this._repository);

  Future<void> loadPassport() async {
    setLoading();

    final Result<PassportModel, Failure> result = await _repository.getMyPassport();

    result.fold<void>(
      onSuccess: (PassportModel data) {
        _passport = data;
        setSuccess();
      },
      onFailure: (Failure failure) {
        setError(failure.message);
      },
    );
  }
}
