import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../../../../core/viewmodels/base_viewmodel.dart';
import '../../domain/entities/user_entity.dart';
import '../../domain/usecases/login_usecase.dart';

/// ViewModel managing state and operations for Login Screen in MVVM architecture.
class LoginViewModel extends BaseViewModel {
  final LoginUseCase _loginUseCase;

  UserEntity? _currentUser;
  UserEntity? get currentUser => _currentUser;

  LoginViewModel(this._loginUseCase);

  Future<bool> login(String email, String password) async {
    setLoading();

    final Result<UserEntity, Failure> result = await _loginUseCase(
      email: email,
      password: password,
    );

    return result.fold<bool>(
      onSuccess: (UserEntity user) {
        _currentUser = user;
        setSuccess();
        return true;
      },
      onFailure: (Failure failure) {
        setError(failure.message);
        return false;
      },
    );
  }
}
