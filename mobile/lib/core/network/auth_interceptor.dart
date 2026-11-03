import 'package:dio/dio.dart';
import '../storage/secure_storage_helper.dart';

/// Interceptor that attaches JWT Bearer token to outgoing HTTP requests
/// and handles automatic 401 token refresh queue.
class AuthInterceptor extends QueuedInterceptor {
  final SecureStorageHelper _secureStorage;
  final Dio _dio;

  AuthInterceptor({
    required SecureStorageHelper secureStorage,
    required Dio dio,
  })  : _secureStorage = secureStorage,
        _dio = dio;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final String? token = await _secureStorage.getAccessToken();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401) {
      final String? refreshToken = await _secureStorage.getRefreshToken();
      if (refreshToken != null && refreshToken.isNotEmpty) {
        try {
          // Perform refresh token request with separate Dio instance without interceptors
          final Response<dynamic> refreshResponse = await _dio.post<dynamic>(
            '/api/v1/auth/refresh',
            data: <String, dynamic>{'refreshToken': refreshToken},
          );

          if (refreshResponse.statusCode == 200 || refreshResponse.statusCode == 201) {
            final dynamic resData = refreshResponse.data;
            final dynamic payload = (resData is Map<String, dynamic>)
                ? (resData['data'] ?? resData)
                : null;

            final String? newAccessToken = (payload is Map<String, dynamic>)
                ? (payload['accessToken'] as String?)
                : null;
            final String? newRefreshToken = (payload is Map<String, dynamic>)
                ? (payload['refreshToken'] as String?)
                : null;

            if (newAccessToken != null && newRefreshToken != null) {
              await _secureStorage.saveTokens(
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
              );

              // Retry original request with new access token
              final RequestOptions reqOptions = err.requestOptions;
              reqOptions.headers['Authorization'] = 'Bearer $newAccessToken';

              final Response<dynamic> retryResponse = await _dio.fetch<dynamic>(reqOptions);
              return handler.resolve(retryResponse);
            }
          }
        } catch (_) {
          // Token refresh failed, clear session
          await _secureStorage.clear();
        }
      }
    }
    handler.next(err);
  }
}
