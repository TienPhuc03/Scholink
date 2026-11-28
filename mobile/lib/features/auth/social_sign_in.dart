import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_facebook_auth/flutter_facebook_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/errors/failures.dart';

enum SocialProvider { google, facebook }

/// The email already belongs to an account of [existingProvider]. Signing in with it next
/// links the provider the user just tried, so both open the same Scholink account.
class AccountLinkRequired extends Failure {
  final SocialProvider existingProvider;
  final String email;

  const AccountLinkRequired(
      {required this.existingProvider, required this.email})
      : super(
            message: 'Email này đã đăng nhập bằng phương thức khác.',
            code: 'ACCOUNT_LINK_REQUIRED');
}

/// FR-AUTH-02: provider sign-in that yields a Firebase ID token for `POST /auth/social`.
/// An interface so tests never touch the Firebase/Google/Facebook plugins.
abstract interface class SocialSignIn {
  /// Firebase ID token, or null when the user closed the provider dialog.
  /// Throws a [Failure] with a message ready to show.
  Future<String?> signIn(SocialProvider provider);

  /// Fresh ID token of the Firebase user signed in earlier (used after the OTP step).
  Future<String?> currentIdToken();

  Future<void> signOut();
}

class FirebaseSocialSignIn implements SocialSignIn {
  bool _googleReady = false;

  /// Credential refused with account-exists-with-different-credential, waiting to be linked.
  AuthCredential? _pendingCredential;
  String? _pendingEmail;

  /// Lazy: an app built without google-services.json still starts; only these buttons fail.
  Future<FirebaseAuth> _auth() async {
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp();
      return FirebaseAuth.instance;
    } catch (_) {
      throw const ServerFailure(
          message:
              'Ứng dụng chưa được cấu hình Firebase (thiếu google-services.json).');
    }
  }

  @override
  Future<String?> signIn(SocialProvider provider) async {
    final FirebaseAuth auth = await _auth();
    try {
      final AuthCredential? credential = switch (provider) {
        SocialProvider.google => await _googleCredential(),
        SocialProvider.facebook => await _facebookCredential(),
      };
      if (credential == null) return null;
      final UserCredential result = await auth.signInWithCredential(credential);
      final User? user = result.user;
      if (user == null) return null;
      await _linkPending(user);
      return await user.getIdToken();
    } on FirebaseAuthException catch (e) {
      if (e.code == 'account-exists-with-different-credential' &&
          e.credential != null &&
          e.email != null) {
        _pendingCredential = e.credential;
        _pendingEmail = e.email;
        // Only Google and Facebook exist, and Google (a trusted provider) never hits this.
        throw AccountLinkRequired(
            existingProvider: provider == SocialProvider.facebook
                ? SocialProvider.google
                : SocialProvider.facebook,
            email: e.email!);
      }
      throw ServerFailure(message: _firebaseMessage(e), code: e.code);
    } on GoogleSignInException catch (e) {
      throw ServerFailure(
          message: 'Đăng nhập Google thất bại (${e.code.name}).',
          code: e.code.name);
    } on PlatformException catch (e) {
      throw ServerFailure(message: 'Đăng nhập thất bại: ${e.message ?? e.code}');
    }
  }

  /// Links the waiting credential, but only into the account of the same email.
  Future<void> _linkPending(User user) async {
    final AuthCredential? pending = _pendingCredential;
    final String? email = _pendingEmail;
    _pendingCredential = null;
    _pendingEmail = null;
    if (pending == null ||
        email == null ||
        user.email?.toLowerCase() != email.toLowerCase()) {
      return;
    }
    try {
      await user.linkWithCredential(pending);
    } on FirebaseAuthException catch (e) {
      // Sign-in already succeeded; a failed link only means the next login asks again.
      debugPrint('Linking social account failed: ${e.code}');
    }
  }

  Future<AuthCredential?> _googleCredential() async {
    final GoogleSignIn google = GoogleSignIn.instance;
    if (!_googleReady) {
      // serverClientId comes from google-services.json (default_web_client_id).
      await google.initialize();
      _googleReady = true;
    }
    try {
      final GoogleSignInAccount account = await google.authenticate();
      return GoogleAuthProvider.credential(
          idToken: account.authentication.idToken);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        // A missing SHA-1 also comes back as "canceled", so leave a trace for debugging.
        debugPrint('Google sign-in canceled: ${e.description}');
        return null;
      }
      rethrow;
    }
  }

  Future<AuthCredential?> _facebookCredential() async {
    // iOS uses Facebook Limited Login: the token is an OIDC JWT, not a Graph access token.
    // Passing it as an access token made Firebase fail with {"code":190,"message":"Bad
    // signature"}; Firebase wants it as an OIDC id token with the nonce it was issued for.
    final String rawNonce = _randomNonce();
    final LoginResult result = await FacebookAuth.instance.login(
        nonce: sha256.convert(utf8.encode(rawNonce)).toString());
    switch (result.status) {
      case LoginStatus.success:
        final AccessToken token = result.accessToken!;
        if (token.type == AccessTokenType.limited) {
          return OAuthProvider('facebook.com')
              .credential(idToken: token.tokenString, rawNonce: rawNonce);
        }
        return FacebookAuthProvider.credential(token.tokenString);
      case LoginStatus.cancelled:
        return null;
      case LoginStatus.failed:
      case LoginStatus.operationInProgress:
        throw ServerFailure(
            message:
                'Đăng nhập Facebook thất bại: ${result.message ?? result.status.name}');
    }
  }

  static String _randomNonce([int length = 32]) {
    const String chars =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final Random random = Random.secure();
    return List<String>.generate(
        length, (_) => chars[random.nextInt(chars.length)]).join();
  }

  static String _firebaseMessage(FirebaseAuthException e) {
    switch (e.code) {
      case 'account-exists-with-different-credential':
        return 'Email này đã đăng nhập bằng phương thức khác (Google hoặc Facebook). '
            'Hãy dùng phương thức đó.';
      case 'operation-not-allowed':
        return 'Phương thức đăng nhập này chưa được bật trên Firebase.';
      case 'user-disabled':
        return 'Tài khoản đã bị vô hiệu hóa.';
      case 'network-request-failed':
        return 'Không có kết nối mạng.';
      default:
        return 'Đăng nhập thất bại: ${e.message ?? e.code}';
    }
  }

  @override
  Future<String?> currentIdToken() async {
    if (Firebase.apps.isEmpty) return null;
    return FirebaseAuth.instance.currentUser?.getIdToken(true);
  }

  @override
  Future<void> signOut() async {
    _pendingCredential = null;
    _pendingEmail = null;
    if (Firebase.apps.isEmpty) return;
    // Each step may fail if that provider was never used; logout must still finish.
    await Future.wait(<Future<void>>[
      FirebaseAuth.instance.signOut(),
      if (_googleReady) GoogleSignIn.instance.signOut(),
      FacebookAuth.instance.logOut(),
    ].map((Future<void> f) => f.catchError((Object _) {})));
  }
}
