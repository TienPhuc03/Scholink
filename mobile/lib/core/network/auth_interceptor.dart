import 'package:dio/dio.dart';
import '../constants/api_endpoints.dart';
import '../storage/secure_storage_helper.dart';
import 'session_events.dart';

/// Interceptor that attaches JWT Bearer token to outgoing HTTP requests
/// and handles automatic 401 token refresh queue.
///
/// The refresh call and the retry go through [_plainDio], a client without this interceptor:
/// with a [QueuedInterceptor], an error raised by a request sent from inside [onError] waits
/// behind the current [onError] forever, so a rejected refresh token used to hang the app.
class AuthInterceptor extends QueuedInterceptor {
  final SecureStorageHelper _secureStorage;
  final Dio _plainDio;
  final SessionEvents? _sessionEvents;

  AuthInterceptor({
    required SecureStorageHelper secureStorage,
    required Dio dio,
    SessionEvents? sessionEvents,
    Dio? refreshDio,
  })  : _secureStorage = secureStorage,
        _sessionEvents = sessionEvents,
        _plainDio = refreshDio ?? Dio(dio.options.copyWith());

  /// 401 from these means wrong credentials or a bad refresh token, not an expired session.
  static const Set<String> _authPaths = <String>{
    ApiEndpoints.login,
    ApiEndpoints.register,
    ApiEndpoints.refreshToken,
  };

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
    final RequestOptions request = err.requestOptions;
    final bool hadSession = request.headers['Authorization'] != null && !_authPaths.contains(request.path);
    if (err.response?.statusCode != 401 || !hadSession) {
      handler.next(err);
      return;
    }

    final String? refreshToken = await _secureStorage.getRefreshToken();
    if (refreshToken != null && refreshToken.isNotEmpty) {
      try {
        final Response<dynamic> refreshResponse = await _plainDio.post<dynamic>(
          ApiEndpoints.refreshToken,
          data: <String, dynamic>{'refreshToken': refreshToken},
        );
        final dynamic resData = refreshResponse.data;
        final dynamic payload = (resData is Map<String, dynamic>) ? (resData['data'] ?? resData) : null;
        final String? newAccessToken = (payload is Map<String, dynamic>) ? (payload['accessToken'] as String?) : null;
        final String? newRefreshToken =
            (payload is Map<String, dynamic>) ? (payload['refreshToken'] as String?) : null;

        if (newAccessToken != null && newRefreshToken != null) {
          await _secureStorage.saveTokens(accessToken: newAccessToken, refreshToken: newRefreshToken);
          request.headers['Authorization'] = 'Bearer $newAccessToken';
          try {
            return handler.resolve(await _plainDio.fetch<dynamic>(request));
          } on DioException catch (retryError) {
            // The retry itself failed (e.g. 409 from the API): surface that error, not the 401.
            return handler.next(retryError);
          }
        }
      } on DioException catch (refreshError) {
        // No answer from the server (offline): keep the session and let the caller retry later.
        if (refreshError.response == null) return handler.next(err);
        // Otherwise the refresh token was rejected: fall through and end the session.
      } catch (_) {
        // Malformed refresh response: end the session.
      }
    }

    await _secureStorage.clear();
    _sessionEvents?.notifyExpired();
    handler.next(err);
  }
}
