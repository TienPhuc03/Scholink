import 'package:dio/dio.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/core/network/api_client.dart';
import 'package:scholink_mobile/core/storage/secure_storage_helper.dart';

/// One recorded HTTP call.
class RecordedCall {
  final String method;
  final String path;
  final dynamic data;
  final Map<String, dynamic> headers;
  final Map<String, dynamic>? query;

  RecordedCall(this.method, this.path, this.data, {Map<String, dynamic>? headers, this.query})
      : headers = headers ?? <String, dynamic>{};
}

/// ApiClient double: answers each path with a scripted body or throws a scripted [Failure],
/// mimicking DioApiClient, which converts HTTP errors into Failures.
class ScriptedApiClient implements ApiClient {
  final Map<String, Object> responses = <String, Object>{};
  final List<RecordedCall> calls = <RecordedCall>[];

  void reply(String path, Object bodyOrFailure) => responses[path] = bodyOrFailure;

  /// Lets a test change the answer per call, e.g. fail the first submit and succeed on retry.
  final Map<String, Object Function(RecordedCall call)> handlers = <String, Object Function(RecordedCall call)>{};

  List<RecordedCall> callsTo(String path) => calls.where((RecordedCall c) => c.path == path).toList();

  Future<Response<T>> _answer<T>(String method, String path, dynamic data,
      {Options? options, Map<String, dynamic>? query}) async {
    final RecordedCall call = RecordedCall(method, path, data, headers: options?.headers, query: query);
    calls.add(call);
    final Object? scripted = handlers.containsKey(path) ? handlers[path]!(call) : responses[path];
    if (scripted is Failure) throw scripted;
    return Response<T>(
      requestOptions: RequestOptions(path: path),
      statusCode: 200,
      data: (scripted ?? <String, dynamic>{}) as T,
    );
  }

  @override
  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? queryParameters, Options? options}) =>
      _answer<T>('GET', path, null, options: options, query: queryParameters);

  @override
  Future<Response<T>> post<T>(String path,
          {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) =>
      _answer<T>('POST', path, data, options: options, query: queryParameters);

  @override
  Future<Response<T>> put<T>(String path, {dynamic data, Options? options}) =>
      _answer<T>('PUT', path, data, options: options);

  @override
  Future<Response<T>> delete<T>(String path, {dynamic data, Options? options}) =>
      _answer<T>('DELETE', path, data, options: options);
}

class InMemorySecureStorage implements SecureStorageHelper {
  String? accessToken;
  String? refreshToken;
  String? userId;
  int clearCount = 0;

  @override
  Future<void> clear() async {
    clearCount++;
    accessToken = null;
    refreshToken = null;
    userId = null;
  }

  @override
  Future<String?> getAccessToken() async => accessToken;

  @override
  Future<String?> getRefreshToken() async => refreshToken;

  @override
  Future<String?> getUserId() async => userId;

  @override
  Future<void> saveTokens({required String accessToken, required String refreshToken, String? userId}) async {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    if (userId != null) this.userId = userId;
  }
}

Map<String, dynamic> loginBody({String email = 'sv@uni.edu.vn'}) => <String, dynamic>{
      'accessToken': 'access-1',
      'refreshToken': 'refresh-1',
      'user': <String, dynamic>{'id': 'u1', 'email': email, 'fullName': 'Sinh Viên', 'role': 'STUDENT'},
    };

Map<String, dynamic> otpBody({String email = 'sv@uni.edu.vn', String preview = '123456'}) => <String, dynamic>{
      'sent': true,
      'email': email,
      'purpose': 'VERIFY_EMAIL',
      'expiresInSeconds': 300,
      'cooldownSeconds': 60,
      'message': 'ok',
      'devOtpPreview': preview,
    };
