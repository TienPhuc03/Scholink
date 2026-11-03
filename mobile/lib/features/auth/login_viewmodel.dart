import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'auth_model.dart';
import 'auth_repository.dart';

/// ViewModel managing state and operations for Login Screen in MVVM architecture.
class LoginViewModel extends BaseViewModel {
  final AuthRepository _repository;

  UserModel? _currentUser;
  UserModel? get currentUser => _currentUser;

  LoginViewModel(this._repository);

  Future<bool> login(String email, String password) async {
    setLoading();

    final Result<UserModel, Failure> result = await _repository.login(
      email: email,
      password: password,
    );

    return result.fold<bool>(
      onSuccess: (UserModel user) {
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
