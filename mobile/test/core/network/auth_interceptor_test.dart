import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/network/auth_interceptor.dart';
import 'package:scholink_mobile/core/network/session_events.dart';

import '../../features/auth/auth_test_fakes.dart';

/// Answers each request from a per-path script and records what was sent.
class ScriptedAdapter implements HttpClientAdapter {
  final Map<String, ResponseBody Function(RequestOptions o)> routes = <String, ResponseBody Function(RequestOptions o)>{};
  final List<RequestOptions> sent = <RequestOptions>[];

  static ResponseBody json(int status, Object body) => ResponseBody.fromString(
        jsonEncode(body),
        status,
        headers: <String, List<String>>{
          Headers.contentTypeHeader: <String>[Headers.jsonContentType],
        },
      );

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    sent.add(options);
    final ResponseBody Function(RequestOptions o)? route = routes[options.path];
    if (route == null) return json(404, <String, dynamic>{});
    return route(options);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late InMemorySecureStorage storage;
  late SessionEvents events;
  late ScriptedAdapter adapter;
  late Dio dio;
  late int expiredCount;

  setUp(() {
    storage = InMemorySecureStorage()
      ..accessToken = 'old_access'
      ..refreshToken = 'old_refresh';
    events = SessionEvents();
    expiredCount = 0;
    events.expired.listen((_) => expiredCount++);
    adapter = ScriptedAdapter();
    final BaseOptions options = BaseOptions(baseUrl: 'http://api.test');
    dio = Dio(options)..httpClientAdapter = adapter;
    final Dio plain = Dio(options)..httpClientAdapter = adapter;
    dio.interceptors.add(AuthInterceptor(secureStorage: storage, dio: dio, sessionEvents: events, refreshDio: plain));
  });

  test('a rejected refresh token ends the session instead of hanging (Q10)', () async {
    adapter.routes['/api/v1/applications/me'] = (_) => ScriptedAdapter.json(401, <String, dynamic>{});
    adapter.routes[ApiEndpoints.refreshToken] = (_) => ScriptedAdapter.json(401, <String, dynamic>{});

    await expectLater(
      dio.get<dynamic>('/api/v1/applications/me').timeout(const Duration(seconds: 5)),
      throwsA(isA<DioException>().having((DioException e) => e.response?.statusCode, 'status', 401)),
    );
    await pumpEventQueue();

    expect(storage.accessToken, isNull);
    expect(storage.clearCount, 1);
    expect(expiredCount, 1);
  });

  test('a successful refresh retries the request with the new token', () async {
    adapter.routes['/api/v1/applications/me'] = (RequestOptions o) => o.headers['Authorization'] == 'Bearer new_access'
        ? ScriptedAdapter.json(200, <String, dynamic>{'items': <dynamic>[]})
        : ScriptedAdapter.json(401, <String, dynamic>{});
    adapter.routes[ApiEndpoints.refreshToken] = (_) => ScriptedAdapter.json(
        200, <String, dynamic>{'accessToken': 'new_access', 'refreshToken': 'new_refresh'});

    final Response<dynamic> r = await dio.get<dynamic>('/api/v1/applications/me');

    expect(r.statusCode, 200);
    expect(storage.accessToken, 'new_access');
    expect(storage.refreshToken, 'new_refresh');
    expect(expiredCount, 0);
  });

  test('wrong password on login is not a session expiry', () async {
    storage
      ..accessToken = null
      ..refreshToken = null;
    adapter.routes[ApiEndpoints.login] = (_) => ScriptedAdapter.json(401, <String, dynamic>{});

    await expectLater(dio.post<dynamic>(ApiEndpoints.login), throwsA(isA<DioException>()));
    await pumpEventQueue();

    expect(expiredCount, 0);
    expect(storage.clearCount, 0);
  });

  test('no refresh token while signed in ends the session', () async {
    storage.refreshToken = null;
    adapter.routes['/api/v1/profiles/me'] = (_) => ScriptedAdapter.json(401, <String, dynamic>{});

    await expectLater(dio.get<dynamic>('/api/v1/profiles/me'), throwsA(isA<DioException>()));
    await pumpEventQueue();

    expect(expiredCount, 1);
  });
}
