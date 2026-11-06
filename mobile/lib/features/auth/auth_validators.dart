/// Client-side validation mirroring the backend Zod rules in
/// `identity-contract.dto.ts` (RegisterDtoSchema, VerifyOtpDtoSchema, ResetPasswordDtoSchema).
/// Each validator returns a Vietnamese error message, or null when the value is valid.
abstract final class AuthValidators {
  static final RegExp _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
  static final RegExp _hasLetter = RegExp(r'[A-Za-zÀ-ỹ]');
  static final RegExp _hasDigit = RegExp(r'\d');
  static final RegExp _otpPattern = RegExp(r'^\d{6}$');

  static String? fullName(String value) {
    final String v = value.trim();
    if (v.isEmpty) return 'Vui lòng nhập họ và tên.';
    if (v.length < 2) return 'Họ và tên ít nhất 2 ký tự.';
    if (v.length > 100) return 'Họ và tên không vượt quá 100 ký tự.';
    return null;
  }

  static String? email(String value) {
    final String v = value.trim();
    if (v.isEmpty) return 'Vui lòng nhập email.';
    if (v.length > 150 || !_emailPattern.hasMatch(v)) return 'Email không đúng định dạng.';
    return null;
  }

  /// Figma helper: "Ít nhất 8 ký tự, gồm chữ và số."
  static String? newPassword(String value) {
    if (value.isEmpty) return 'Vui lòng nhập mật khẩu.';
    if (value.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự.';
    if (value.length > 128) return 'Mật khẩu không vượt quá 128 ký tự.';
    if (!_hasLetter.hasMatch(value) || !_hasDigit.hasMatch(value)) {
      return 'Mật khẩu phải gồm cả chữ và số.';
    }
    return null;
  }

  static String? confirmPassword(String password, String confirm) {
    if (confirm.isEmpty) return 'Vui lòng nhập lại mật khẩu.';
    if (password != confirm) return 'Mật khẩu xác nhận không khớp.';
    return null;
  }

  static String? otp(String value) {
    if (!_otpPattern.hasMatch(value.trim())) return 'Mã OTP phải gồm đúng 6 chữ số.';
    return null;
  }
}
