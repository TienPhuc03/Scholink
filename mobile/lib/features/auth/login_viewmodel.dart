import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'auth_model.dart';
import 'auth_repository.dart';
import 'social_sign_in.dart';

/// ViewModel managing state and operations for Login Screen in MVVM architecture.
class LoginViewModel extends BaseViewModel {
  final AuthRepository _repository;

  UserModel? _currentUser;
  UserModel? get currentUser => _currentUser;

  LoginViewModel(this._repository);

  /// Set when the last social sign-in needs the user to confirm with their existing provider.
  AccountLinkRequired? _linkRequired;
  AccountLinkRequired? get linkRequired => _linkRequired;

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

  /// FR-AUTH-02: true when signed in; false when cancelled (no error) or failed (error set).
  Future<bool> loginWithSocial(SocialProvider provider) async {
    _linkRequired = null;
    setLoading();
    final Result<UserModel?, Failure> result =
        await _repository.loginWithSocial(provider);
    return result.fold<bool>(
      onSuccess: (UserModel? user) {
        _currentUser = user;
        setSuccess();
        return user != null;
      },
      onFailure: (Failure failure) {
        if (failure is AccountLinkRequired) {
          // Not an error: the view asks the user to continue with the existing provider.
          _linkRequired = failure;
          setSuccess();
        } else {
          setError(failure.message);
        }
        return false;
      },
    );
  }
}
