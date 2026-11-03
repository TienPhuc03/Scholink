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

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData)
          : null;

      if (payload is! Map<String, dynamic>) {
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

  Future<Result<void, Failure>> register({
    required String email,
    required String password,
    required String fullName,
    String role = 'STUDENT',
  }) async {
    try {
      await _apiClient.post<dynamic>(
        ApiEndpoints.register,
        data: <String, dynamic>{
          'email': email.trim(),
          'password': password,
          'fullName': fullName.trim(),
          'role': role,
        },
      );
      return const SuccessResult<void, Failure>(null);
    } on Failure catch (failure) {
      return FailureResult<void, Failure>(failure);
    } catch (e) {
      return FailureResult<void, Failure>(ServerFailure(message: e.toString()));
    }
  }

  Future<Result<void, Failure>> logout() async {
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
}
