import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/core/errors/result.dart';
import 'package:scholink_mobile/features/auth/auth_model.dart';
import 'package:scholink_mobile/features/auth/auth_repository.dart';
import 'package:scholink_mobile/features/auth/auth_validators.dart';
import 'package:scholink_mobile/features/auth/email_verification_viewmodel.dart';
import 'package:scholink_mobile/features/auth/password_reset_viewmodel.dart';
import 'package:scholink_mobile/features/auth/register_viewmodel.dart';

import 'auth_test_fakes.dart';

void main() {
  late ScriptedApiClient api;
  late InMemorySecureStorage storage;
  late AuthRepository repo;

  setUp(() {
    api = ScriptedApiClient();
    storage = InMemorySecureStorage();
    repo = AuthRepository(apiClient: api, secureStorage: storage);
  });

  group('AuthValidators', () {
    test('password needs 8+ chars with letters and digits', () {
      expect(AuthValidators.newPassword('abc12'), isNotNull);
      expect(AuthValidators.newPassword('abcdefgh'), isNotNull);
      expect(AuthValidators.newPassword('12345678'), isNotNull);
      expect(AuthValidators.newPassword('matkhau123'), isNull);
    });

    test('email, full name, confirm and OTP rules', () {
      expect(AuthValidators.email('a@b'), isNotNull);
      expect(AuthValidators.email(' sv@uni.edu.vn '), isNull);
      expect(AuthValidators.fullName('A'), isNotNull);
      expect(AuthValidators.confirmPassword('matkhau123', 'matkhau124'), isNotNull);
      expect(AuthValidators.otp('12345'), isNotNull);
      expect(AuthValidators.otp('123456'), isNull);
    });
  });

  group('AuthRepository', () {
    test('register never sends a role (server assigns STUDENT)', () async {
      await repo.register(email: ' sv@uni.edu.vn ', password: 'matkhau123', fullName: ' Sinh Viên ');
      final RecordedCall call = api.calls.single;
      expect(call.path, ApiEndpoints.register);
      expect(call.data, <String, dynamic>{'email': 'sv@uni.edu.vn', 'password': 'matkhau123', 'fullName': 'Sinh Viên'});
    });

    test('sendOtp parses the ticket including the dev preview', () async {
      api.reply(ApiEndpoints.sendOtp, otpBody());
      final OtpTicket ticket = (await repo.sendOtp(email: 'sv@uni.edu.vn')).dataOrNull!;
      expect(ticket.cooldownSeconds, 60);
      expect(ticket.devOtpPreview, '123456');
      expect(api.calls.single.data['purpose'], 'VERIFY_EMAIL');
    });

    test('logout clears local tokens even when the server call fails', () async {
      storage.accessToken = 'access-1';
      api.reply(ApiEndpoints.logout, const NetworkFailure());
      final Result<void, Failure> r = await repo.logout();
      expect(r.isSuccess, isTrue);
      expect(storage.accessToken, isNull);
      expect(api.calls.single.path, ApiEndpoints.logout);
    });

    test('resetPassword sends OTP and new password together and clears the session', () async {
      storage.accessToken = 'old';
      await repo.resetPassword(email: 'sv@uni.edu.vn', otpCode: '654321', newPassword: 'matkhaumoi1');
      expect(api.calls.single.path, ApiEndpoints.resetPassword);
      expect(api.calls.single.data['otpCode'], '654321');
      expect(storage.accessToken, isNull);
    });
  });

  group('RegisterViewModel', () {
    test('invalid form makes no network call and keeps field errors', () async {
      final RegisterViewModel vm = RegisterViewModel(repo);
      final RegisterOutcome? out = await vm.submit(
        fullName: '',
        email: 'bad',
        password: 'short',
        confirmPassword: 'x',
        acceptedTerms: false,
      );
      expect(out, isNull);
      expect(api.calls, isEmpty);
      expect(vm.fieldErrors.fullName, isNotNull);
      expect(vm.fieldErrors.email, isNotNull);
      expect(vm.fieldErrors.password, isNotNull);
      expect(vm.fieldErrors.confirmPassword, isNotNull);
      expect(vm.fieldErrors.consent, isNotNull);
    });

    test('duplicate email becomes a field error on the email input', () async {
      api.reply(
        ApiEndpoints.register,
        const ServerFailure(message: 'Email đã được sử dụng', code: 'EMAIL_ALREADY_EXISTS', statusCode: 409),
      );
      final RegisterViewModel vm = RegisterViewModel(repo);
      final RegisterOutcome? out = await vm.submit(
        fullName: 'Sinh Viên',
        email: 'sv@uni.edu.vn',
        password: 'matkhau123',
        confirmPassword: 'matkhau123',
        acceptedTerms: true,
      );
      expect(out, isNull);
      expect(vm.fieldErrors.email, contains('đã được đăng ký'));
    });

    test('success registers then requests a VERIFY_EMAIL OTP', () async {
      api.reply(ApiEndpoints.sendOtp, otpBody());
      final RegisterViewModel vm = RegisterViewModel(repo);
      final RegisterOutcome? out = await vm.submit(
        fullName: 'Sinh Viên',
        email: 'sv@uni.edu.vn',
        password: 'matkhau123',
        confirmPassword: 'matkhau123',
        acceptedTerms: true,
      );
      expect(out?.ticket?.email, 'sv@uni.edu.vn');
      expect(api.calls.map((RecordedCall c) => c.path), <String>[ApiEndpoints.register, ApiEndpoints.sendOtp]);
    });
  });

  group('EmailVerificationViewModel', () {
    EmailVerificationViewModel startVm() => EmailVerificationViewModel(repo)
      ..start(email: 'sv@uni.edu.vn', password: 'matkhau123', ticket: OtpTicket.fromJson(otpBody(), fallbackEmail: ''));

    test('wrong code marks the code rejected and does not log in', () async {
      api.reply(ApiEndpoints.verifyOtp, const ServerFailure(message: 'Mã OTP không đúng', code: 'OTP_INVALID'));
      final EmailVerificationViewModel vm = startVm();
      expect(await vm.verify('111111'), isFalse);
      expect(vm.codeRejected, isTrue);
      expect(api.calls.any((RecordedCall c) => c.path == ApiEndpoints.login), isFalse);
      vm.dispose();
    });

    test('OTP_LOCKED locks input for 15 minutes', () async {
      api.reply(ApiEndpoints.verifyOtp, const ServerFailure(message: 'Khóa 15 phút', code: 'OTP_LOCKED'));
      final EmailVerificationViewModel vm = startVm();
      await vm.verify('111111');
      expect(vm.isLocked, isTrue);
      expect(vm.lockMinutesLeft, 15);
      vm.dispose();
    });

    test('correct code verifies, signs in and stores tokens', () async {
      api.reply(ApiEndpoints.login, loginBody());
      final EmailVerificationViewModel vm = startVm();
      expect(await vm.verify('123456'), isTrue);
      expect(storage.accessToken, 'access-1');
      expect(api.calls.map((RecordedCall c) => c.path), <String>[ApiEndpoints.verifyOtp, ApiEndpoints.login]);
      vm.dispose();
    });

    test('resend is blocked while the cooldown is running', () async {
      final EmailVerificationViewModel vm = startVm();
      expect(vm.resendSecondsLeft, 60);
      await vm.resend();
      expect(api.calls, isEmpty);
      vm.dispose();
    });
  });

  group('PasswordResetViewModel', () {
    test('does not call verify-otp separately (it would consume the code)', () async {
      api.reply(ApiEndpoints.forgotPassword, otpBody());
      final PasswordResetViewModel vm = PasswordResetViewModel(repo);
      expect(await vm.requestReset('sv@uni.edu.vn'), isTrue);
      expect(
        await vm.resetPassword(otpCode: '123456', newPassword: 'matkhaumoi1', confirmPassword: 'matkhaumoi1'),
        isTrue,
      );
      expect(api.calls.map((RecordedCall c) => c.path), <String>[ApiEndpoints.forgotPassword, ApiEndpoints.resetPassword]);
      vm.dispose();
    });

    test('mismatched confirmation is caught before any network call', () async {
      api.reply(ApiEndpoints.forgotPassword, otpBody());
      final PasswordResetViewModel vm = PasswordResetViewModel(repo);
      await vm.requestReset('sv@uni.edu.vn');
      api.calls.clear();
      expect(
        await vm.resetPassword(otpCode: '123456', newPassword: 'matkhaumoi1', confirmPassword: 'khac12345'),
        isFalse,
      );
      expect(vm.fieldErrors.confirmPassword, isNotNull);
      expect(api.calls, isEmpty);
      vm.dispose();
    });
  });
}
