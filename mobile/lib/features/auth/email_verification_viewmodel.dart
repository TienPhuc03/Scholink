import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import 'auth_model.dart';
import 'auth_repository.dart';
import 'auth_validators.dart';
import 'otp_flow_viewmodel.dart';

/// FR-AUTH-02: verify the email of a freshly registered account, then sign in
/// with the credentials the user just chose (registration itself issues no tokens).
class EmailVerificationViewModel extends OtpFlowViewModel {
  final AuthRepository _repository;
  String _password = '';

  EmailVerificationViewModel(this._repository, {super.clock});

  UserModel? _user;
  UserModel? get user => _user;

  /// True when the email is verified but the automatic sign-in failed;
  /// the view then sends the user to the login screen.
  bool _needsManualLogin = false;
  bool get needsManualLogin => _needsManualLogin;

  void start({required String email, required String password, OtpTicket? ticket, String? initialError}) {
    _password = password;
    startWithTicket(email, ticket, initialError: initialError);
  }

  @override
  Future<({OtpTicket? ticket, Failure? failure})> requestOtp() async {
    final Result<OtpTicket, Failure> r = await _repository.sendOtp(email: email);
    return (ticket: r.dataOrNull, failure: r.errorOrNull);
  }

  /// Returns true once the email is verified and the session is stored.
  Future<bool> verify(String code) async {
    final String? invalid = AuthValidators.otp(code);
    if (invalid != null) {
      setError(invalid);
      return false;
    }
    if (isLocked || isLoading) return false;

    setLoading();
    final Result<void, Failure> verified = await _repository.verifyOtp(email: email, otpCode: code);
    final Failure? verifyError = verified.errorOrNull;
    if (verifyError != null) {
      handleOtpFailure(verifyError);
      return false;
    }

    final Result<UserModel, Failure> login = await _repository.login(email: email, password: _password);
    _password = '';
    return login.fold<bool>(
      onSuccess: (UserModel u) {
        _user = u;
        setSuccess();
        return true;
      },
      onFailure: (Failure f) {
        _needsManualLogin = true;
        setError('Email đã được xác thực. Vui lòng đăng nhập để tiếp tục.');
        return false;
      },
    );
  }
}
