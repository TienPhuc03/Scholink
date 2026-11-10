import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'auth_model.dart';
import 'auth_repository.dart';
import 'auth_validators.dart';

/// Field-level validation errors for the register form.
class RegisterFieldErrors {
  final String? fullName;
  final String? email;
  final String? password;
  final String? confirmPassword;
  final String? consent;

  const RegisterFieldErrors({
    this.fullName,
    this.email,
    this.password,
    this.confirmPassword,
    this.consent,
  });

  bool get isEmpty =>
      fullName == null && email == null && password == null && confirmPassword == null && consent == null;
}

/// Outcome handed to the view so it can open the OTP screen.
/// [ticket] is null when the account was created but the first OTP could not be sent;
/// the OTP screen then lets the user resend.
class RegisterOutcome {
  final String email;
  final String password;
  final OtpTicket? ticket;
  final String? otpError;

  const RegisterOutcome({required this.email, required this.password, this.ticket, this.otpError});
}

/// FR-AUTH-02: register the account, then immediately request an email-verification OTP.
class RegisterViewModel extends BaseViewModel {
  final AuthRepository _repository;

  RegisterViewModel(this._repository);

  RegisterFieldErrors _fieldErrors = const RegisterFieldErrors();
  RegisterFieldErrors get fieldErrors => _fieldErrors;

  RegisterFieldErrors validate({
    required String fullName,
    required String email,
    required String password,
    required String confirmPassword,
    required bool acceptedTerms,
  }) {
    return RegisterFieldErrors(
      fullName: AuthValidators.fullName(fullName),
      email: AuthValidators.email(email),
      password: AuthValidators.newPassword(password),
      confirmPassword: AuthValidators.confirmPassword(password, confirmPassword),
      consent: acceptedTerms ? null : 'Bạn cần đồng ý Điều khoản sử dụng và Chính sách bảo mật.',
    );
  }

  /// Clears one field's error as soon as the user edits it.
  void clearFieldError(String field) {
    final RegisterFieldErrors e = _fieldErrors;
    _fieldErrors = RegisterFieldErrors(
      fullName: field == 'fullName' ? null : e.fullName,
      email: field == 'email' ? null : e.email,
      password: field == 'password' ? null : e.password,
      confirmPassword: field == 'confirmPassword' ? null : e.confirmPassword,
      consent: field == 'consent' ? null : e.consent,
    );
    notifyListeners();
  }

  /// Returns an outcome on success, or null when validation or registration failed
  /// (the form keeps everything the user typed).
  Future<RegisterOutcome?> submit({
    required String fullName,
    required String email,
    required String password,
    required String confirmPassword,
    required bool acceptedTerms,
  }) async {
    _fieldErrors = validate(
      fullName: fullName,
      email: email,
      password: password,
      confirmPassword: confirmPassword,
      acceptedTerms: acceptedTerms,
    );
    if (!_fieldErrors.isEmpty) {
      setIdle();
      return null;
    }

    setLoading();
    final String normalizedEmail = email.trim();

    final Result<void, Failure> registered = await _repository.register(
      email: normalizedEmail,
      password: password,
      fullName: fullName,
    );
    final Failure? registerError = registered.errorOrNull;
    if (registerError != null) {
      if (registerError.code == 'EMAIL_ALREADY_EXISTS' || registerError.code == 'CONFLICT') {
        _fieldErrors = const RegisterFieldErrors(email: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.');
        setIdle();
      } else {
        setError(registerError.message);
      }
      return null;
    }

    final Result<OtpTicket, Failure> otp = await _repository.sendOtp(email: normalizedEmail);
    setSuccess();
    return RegisterOutcome(
      email: normalizedEmail,
      password: password,
      ticket: otp.dataOrNull,
      otpError: otp.errorOrNull?.message,
    );
  }
}
