import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/secure_storage_helper.dart';
import 'auth_model.dart';

/// Single concrete Repository for Auth operations in MVVM + Repository pattern.
class AuthRepository {
  final ApiClient _apiClient;
  final SecureStorageHelper _secureStorage;

  AuthRepository({
    required ApiClient apiClient,
    required SecureStorageHelper secureStorage,
  })  : _apiClient = apiClient,
        _secureStorage = secureStorage;

  Future<Result<UserModel, Failure>> login({
    required String email,
    required String password,
  }) async {
    final String trimmedEmail = email.trim();
    if (trimmedEmail.isEmpty) {
      return const FailureResult<UserModel, Failure>(
        ValidationFailure(message: 'Email không được để trống.'),
      );
    }
    if (password.isEmpty) {
      return const FailureResult<UserModel, Failure>(
        ValidationFailure(message: 'Mật khẩu không được để trống.'),
      );
    }

    try {
      final Response<dynamic> response = await _apiClient.post<dynamic>(
        ApiEndpoints.login,
        data: <String, dynamic>{
          'email': trimmedEmail,
          'password': password,
        },
      );

      final Map<String, dynamic>? payload = _unwrap(response.data);
      if (payload == null) {
        return const FailureResult<UserModel, Failure>(
          ServerFailure(message: 'Phản hồi xác thực từ máy chủ không hợp lệ.'),
        );
      }

      final String? accessToken = payload['accessToken'] as String?;
      final String? refreshToken = payload['refreshToken'] as String?;
      final dynamic userMap = payload['user'];

      if (accessToken == null || userMap is! Map<String, dynamic>) {
        return const FailureResult<UserModel, Failure>(
          ServerFailure(message: 'Thiếu token xác thực hoặc hồ sơ người dùng.'),
        );
      }

      final UserModel user = UserModel.fromJson(userMap);

      await _secureStorage.saveTokens(
        accessToken: accessToken,
        refreshToken: refreshToken ?? '',
        userId: user.id,
      );

      return SuccessResult<UserModel, Failure>(user);
    } on Failure catch (failure) {
      return FailureResult<UserModel, Failure>(failure);
    } catch (e) {
      return FailureResult<UserModel, Failure>(ServerFailure(message: e.toString()));
    }
  }

  /// FR-AUTH-02 / FR-AUTH-07: the server always assigns role STUDENT, so no role is sent.
  /// Registration does not return tokens; the caller verifies email by OTP and then logs in.
  Future<Result<void, Failure>> register({
    required String email,
    required String password,
    required String fullName,
  }) {
    return _run<void>(() async {
      await _apiClient.post<dynamic>(
        ApiEndpoints.register,
        data: <String, dynamic>{
          'email': email.trim(),
          'password': password,
          'fullName': fullName.trim(),
        },
      );
    });
  }

  /// FR-AUTH-02: issues a 6-digit OTP (TTL 5 min, 60 s resend cooldown).
  Future<Result<OtpTicket, Failure>> sendOtp({
    required String email,
    OtpPurpose purpose = OtpPurpose.verifyEmail,
  }) {
    final String trimmed = email.trim();
    return _run<OtpTicket>(() async {
      final Response<dynamic> response = await _apiClient.post<dynamic>(
        ApiEndpoints.sendOtp,
        data: <String, dynamic>{'email': trimmed, 'purpose': purpose.apiValue},
      );
      return OtpTicket.fromJson(_unwrap(response.data) ?? <String, dynamic>{}, fallbackEmail: trimmed);
    });
  }

  /// FR-AUTH-02: 5 wrong attempts lock the OTP for 15 minutes (OTP_LOCKED).
  Future<Result<void, Failure>> verifyOtp({
    required String email,
    required String otpCode,
    OtpPurpose purpose = OtpPurpose.verifyEmail,
  }) {
    return _run<void>(() async {
      await _apiClient.post<dynamic>(
        ApiEndpoints.verifyOtp,
        data: <String, dynamic>{
          'email': email.trim(),
          'otpCode': otpCode.trim(),
          'purpose': purpose.apiValue,
        },
      );
    });
  }

  /// FR-AUTH-03: always answers success for unknown emails (anti-enumeration).
  Future<Result<OtpTicket, Failure>> forgotPassword({required String email}) {
    final String trimmed = email.trim();
    return _run<OtpTicket>(() async {
      final Response<dynamic> response = await _apiClient.post<dynamic>(
        ApiEndpoints.forgotPassword,
        data: <String, dynamic>{'email': trimmed},
      );
      return OtpTicket.fromJson(_unwrap(response.data) ?? <String, dynamic>{}, fallbackEmail: trimmed);
    });
  }

  /// FR-AUTH-03 & FR-AUTH-04: verifies the OTP and sets the new password in one call;
  /// the server revokes every existing session, so local tokens are cleared too.
  Future<Result<void, Failure>> resetPassword({
    required String email,
    required String otpCode,
    required String newPassword,
  }) {
    return _run<void>(() async {
      await _apiClient.post<dynamic>(
        ApiEndpoints.resetPassword,
        data: <String, dynamic>{
          'email': email.trim(),
          'otpCode': otpCode.trim(),
          'newPassword': newPassword,
        },
      );
      await _secureStorage.clear();
    });
  }

  /// Revokes the current server session, then always clears local tokens,
  /// even when the network call fails (the user must never stay half-logged-in).
  Future<Result<void, Failure>> logout() async {
    try {
      final String? token = await _secureStorage.getAccessToken();
      if (token != null && token.isNotEmpty) {
        await _apiClient.post<dynamic>(ApiEndpoints.logout);
      }
    } catch (_) {
      // Session may already be expired or offline; local logout still proceeds.
    }
    try {
      await _secureStorage.clear();
      return const SuccessResult<void, Failure>(null);
    } catch (e) {
      return FailureResult<void, Failure>(CacheFailure(message: e.toString()));
    }
  }

  Future<bool> isAuthenticated() async {
    final String? token = await _secureStorage.getAccessToken();
    return token != null && token.isNotEmpty;
  }

  Future<String?> getCurrentUserId() async {
    return _secureStorage.getUserId();
  }

  Future<Result<T, Failure>> _run<T>(Future<T> Function() action) async {
    try {
      return SuccessResult<T, Failure>(await action());
    } on Failure catch (failure) {
      return FailureResult<T, Failure>(failure);
    } catch (e) {
      return FailureResult<T, Failure>(ServerFailure(message: e.toString()));
    }
  }

  static Map<String, dynamic>? _unwrap(dynamic resData) {
    if (resData is! Map<String, dynamic>) return null;
    final dynamic inner = resData['data'];
    return inner is Map<String, dynamic> ? inner : resData;
  }
}
