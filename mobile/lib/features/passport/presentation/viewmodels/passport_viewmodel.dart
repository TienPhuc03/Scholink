import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../../../../core/viewmodels/base_viewmodel.dart';
import '../../domain/entities/passport_entity.dart';
import '../../domain/usecases/get_passport_usecase.dart';

class PassportViewModel extends BaseViewModel {
  final GetPassportUseCase _getPassportUseCase;

  PassportEntity? _passport;
  PassportEntity? get passport => _passport;

  PassportViewModel(this._getPassportUseCase);

  Future<void> loadPassport() async {
    setLoading();

    final Result<PassportEntity, Failure> result = await _getPassportUseCase();

    result.fold<void>(
      onSuccess: (PassportEntity data) {
        _passport = data;
        setSuccess();
      },
      onFailure: (Failure failure) {
        setError(failure.message);
      },
    );
  }
}
