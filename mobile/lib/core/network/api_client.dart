import 'package:dio/dio.dart';
import '../constants/api_endpoints.dart';
import '../errors/api_error.dart';
import '../errors/failures.dart';
import '../storage/secure_storage_helper.dart';
import 'auth_interceptor.dart';
import 'idempotency_interceptor.dart';

/// Contract for standardized HTTP network operations.
abstract interface class ApiClient {
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  });

  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  });

  Future<Response<T>> put<T>(
    String path, {
    dynamic data,
    Options? options,
  });

  Future<Response<T>> delete<T>(
    String path, {
    dynamic data,
    Options? options,
  });
}

/// Concrete Dio implementation with defensive error handling and automatic interceptors.
class DioApiClient implements ApiClient {
  late final Dio _dio;

  DioApiClient({
    required SecureStorageHelper secureStorage,
    String? baseUrl,
    Dio? dio,
  }) {
    final BaseOptions options = BaseOptions(
      baseUrl: baseUrl ?? ApiEndpoints.defaultBaseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(seconds: 30),
      headers: <String, dynamic>{
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    );

    _dio = dio ?? Dio(options);

    // Add interceptors
    _dio.interceptors.addAll(<Interceptor>[
      AuthInterceptor(secureStorage: secureStorage, dio: _dio),
      IdempotencyInterceptor(),
      LogInterceptor(
        requestHeader: false,
        responseHeader: false,
        requestBody: true,
        responseBody: true,
        logPrint: (Object obj) {
          // Debug logging can be hooked here
        },
      ),
    ]);
  }

  @override
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.get<T>(
        path,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    } catch (e) {
      throw ServerFailure(message: e.toString());
    }
  }

  @override
  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.post<T>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    } catch (e) {
      throw ServerFailure(message: e.toString());
    }
  }

  @override
  Future<Response<T>> put<T>(
    String path, {
    dynamic data,
    Options? options,
  }) async {
    try {
      return await _dio.put<T>(
        path,
        data: data,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    } catch (e) {
      throw ServerFailure(message: e.toString());
    }
  }

  @override
  Future<Response<T>> delete<T>(
    String path, {
    dynamic data,
    Options? options,
  }) async {
    try {
      return await _dio.delete<T>(
        path,
        data: data,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    } catch (e) {
      throw ServerFailure(message: e.toString());
    }
  }

  Failure _handleDioError(DioException error) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.connectionError) {
      return const NetworkFailure();
    }

    final int? statusCode = error.response?.statusCode;
    if (statusCode == 401) {
      return const UnauthorizedFailure();
    }

    final dynamic resData = error.response?.data;
    if (resData is Map<String, dynamic>) {
      final ApiErrorModel apiError = ApiErrorModel.fromJson(resData);
      return ServerFailure(
        message: apiError.message,
        code: apiError.code,
        correlationId: apiError.correlationId,
        statusCode: statusCode,
        details: apiError.details,
      );
    }

    return ServerFailure(
      message: error.message ?? 'Lỗi kết nối máy chủ.',
      statusCode: statusCode,
    );
  }
}
