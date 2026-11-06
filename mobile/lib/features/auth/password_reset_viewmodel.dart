import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import 'auth_model.dart';
import 'auth_repository.dart';
import 'auth_validators.dart';
import 'otp_flow_viewmodel.dart';

/// Field errors for the reset-password step.
class ResetFieldErrors {
  final String? otp;
  final String? password;
  final String? confirmPassword;

  const ResetFieldErrors({this.otp, this.password, this.confirmPassword});

  bool get isEmpty => otp == null && password == null && confirmPassword == null;
}

/// FR-AUTH-03 / FR-AUTH-04: request a reset OTP by email, then submit OTP + new password
/// in a single `reset-password` call (calling verify-otp first would consume the code).
class PasswordResetViewModel extends OtpFlowViewModel {
  final AuthRepository _repository;

  PasswordResetViewModel(this._repository, {super.clock});

  String? _emailError;
  String? get emailError => _emailError;

  ResetFieldErrors _fieldErrors = const ResetFieldErrors();
  ResetFieldErrors get fieldErrors => _fieldErrors;

  @override
  Future<({OtpTicket? ticket, Failure? failure})> requestOtp() async {
    final Result<OtpTicket, Failure> r = await _repository.forgotPassword(email: email);
    return (ticket: r.dataOrNull, failure: r.errorOrNull);
  }

  /// Step 1. Returns true when the OTP was requested and the reset step can open.
  Future<bool> requestReset(String rawEmail) async {
    _emailError = AuthValidators.email(rawEmail);
    if (_emailError != null) {
      setIdle();
      return false;
    }
    setLoading();
    final Result<OtpTicket, Failure> r = await _repository.forgotPassword(email: rawEmail.trim());
    return r.fold<bool>(
      onSuccess: (OtpTicket ticket) {
        startWithTicket(ticket.email, ticket);
        setIdle();
        return true;
      },
      onFailure: (Failure f) {
        handleOtpFailure(f);
        return false;
      },
    );
  }

  void clearEmailError() {
    if (_emailError == null) return;
    _emailError = null;
    notifyListeners();
  }

  void clearFieldError(String field) {
    final ResetFieldErrors e = _fieldErrors;
    _fieldErrors = ResetFieldErrors(
      otp: field == 'otp' ? null : e.otp,
      password: field == 'password' ? null : e.password,
      confirmPassword: field == 'confirmPassword' ? null : e.confirmPassword,
    );
    if (field == 'otp') {
      clearCodeError();
    } else {
      notifyListeners();
    }
  }

  /// Step 2. Returns true when the password was changed (all old sessions are revoked server-side).
  Future<bool> resetPassword({
    required String otpCode,
    required String newPassword,
    required String confirmPassword,
  }) async {
    _fieldErrors = ResetFieldErrors(
      otp: AuthValidators.otp(otpCode),
      password: AuthValidators.newPassword(newPassword),
      confirmPassword: AuthValidators.confirmPassword(newPassword, confirmPassword),
    );
    if (!_fieldErrors.isEmpty) {
      setIdle();
      return false;
    }
    if (isLocked || isLoading) return false;

    setLoading();
    final Result<void, Failure> r = await _repository.resetPassword(
      email: email,
      otpCode: otpCode,
      newPassword: newPassword,
    );
    final Failure? error = r.errorOrNull;
    if (error != null) {
      handleOtpFailure(error);
      return false;
    }
    setSuccess();
    return true;
  }
}
