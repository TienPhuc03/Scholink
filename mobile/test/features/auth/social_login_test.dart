import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/features/auth/auth_model.dart';
import 'package:scholink_mobile/features/auth/auth_repository.dart';
import 'package:scholink_mobile/features/auth/email_verification_viewmodel.dart';
import 'package:scholink_mobile/features/auth/login_viewmodel.dart';
import 'package:scholink_mobile/features/auth/social_sign_in.dart';

import 'auth_test_fakes.dart';

/// Returns a scripted Firebase ID token (null = user closed the dialog).
class FakeSocialSignIn implements SocialSignIn {
  String? token = 'firebase-id-token';
  Failure? failure;
  SocialProvider? lastProvider;
  int signOuts = 0;

  @override
  Future<String?> signIn(SocialProvider provider) async {
    lastProvider = provider;
    if (failure != null) throw failure!;
    return token;
  }

  @override
  Future<String?> currentIdToken() async => token;

  @override
  Future<void> signOut() async => signOuts++;
}

void main() {
  late ScriptedApiClient api;
  late InMemorySecureStorage storage;
  late FakeSocialSignIn social;
  late AuthRepository repo;

  setUp(() {
    api = ScriptedApiClient();
    storage = InMemorySecureStorage();
    social = FakeSocialSignIn();
    repo = AuthRepository(
        apiClient: api, secureStorage: storage, socialSignIn: social);
  });

  test('Facebook sign-in sends the Firebase ID token and stores the session',
      () async {
    api.reply(ApiEndpoints.socialLogin, loginBody());
    final LoginViewModel vm = LoginViewModel(repo);

    expect(await vm.loginWithSocial(SocialProvider.facebook), isTrue);
    expect(social.lastProvider, SocialProvider.facebook);
    expect(api.calls.single.data,
        <String, dynamic>{'idToken': 'firebase-id-token'});
    expect(storage.accessToken, 'access-1');
    expect(vm.currentUser?.email, 'sv@uni.edu.vn');
  });

  test('closing the provider dialog is neither a login nor an error', () async {
    social.token = null;
    final LoginViewModel vm = LoginViewModel(repo);

    expect(await vm.loginWithSocial(SocialProvider.google), isFalse);
    expect(vm.hasError, isFalse);
    expect(api.calls, isEmpty);
  });

  test('provider and server errors are shown to the user', () async {
    social.failure = const ServerFailure(message: 'Chưa bật Facebook');
    final LoginViewModel vm = LoginViewModel(repo);
    expect(await vm.loginWithSocial(SocialProvider.facebook), isFalse);
    expect(vm.errorMessage, 'Chưa bật Facebook');

    social.failure = null;
    api.reply(
        ApiEndpoints.socialLogin,
        const ServerFailure(
            message: 'Email này đã có tài khoản',
            code: 'EMAIL_ALREADY_EXISTS'));
    expect(await vm.loginWithSocial(SocialProvider.facebook), isFalse);
    expect(vm.errorMessage, 'Email này đã có tài khoản');
    expect(storage.accessToken, isNull);
  });

  test('an email owned by another provider asks to link, without an error',
      () async {
    social.failure = const AccountLinkRequired(
        existingProvider: SocialProvider.google, email: 'sv@uni.edu.vn');
    final LoginViewModel vm = LoginViewModel(repo);

    expect(await vm.loginWithSocial(SocialProvider.facebook), isFalse);
    expect(vm.hasError, isFalse);
    expect(vm.linkRequired?.existingProvider, SocialProvider.google);

    // Continuing with Google clears the prompt and signs in.
    social.failure = null;
    api.reply(ApiEndpoints.socialLogin, loginBody());
    expect(await vm.loginWithSocial(SocialProvider.google), isTrue);
    expect(vm.linkRequired, isNull);
    expect(storage.accessToken, 'access-1');
  });

  test('unverified social email: no session until OTP, then signs in again',
      () async {
    final Map<String, dynamic> pending = loginBody();
    (pending['user'] as Map<String, dynamic>)['status'] =
        'PENDING_VERIFICATION';
    api.reply(ApiEndpoints.socialLogin, pending);

    final UserModel user =
        (await repo.loginWithSocial(SocialProvider.facebook)).dataOrNull!;
    expect(user.isPendingVerification, isTrue);
    expect(storage.accessToken, isNull);

    // Empty password = social account: after the OTP the app re-exchanges the Firebase token.
    api.reply(ApiEndpoints.verifyOtp, <String, dynamic>{'verified': true});
    api.reply(ApiEndpoints.socialLogin, loginBody());
    final EmailVerificationViewModel otp = EmailVerificationViewModel(repo)
      ..start(email: user.email, password: '');
    expect(await otp.verify('123456'), isTrue);
    expect(storage.accessToken, 'access-1');
    expect(api.calls.any((RecordedCall c) => c.path == ApiEndpoints.login),
        isFalse);
    otp.dispose();
  });

  test('logout also signs out of Firebase/Google/Facebook', () async {
    storage.accessToken = 'access-1';
    await repo.logout();
    expect(social.signOuts, 1);
    expect(storage.accessToken, isNull);
  });
}
