import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/firebase/fcm_service.dart';
import 'package:scholink_mobile/core/network/api_client.dart';

const NotificationSettings _granted = NotificationSettings(
  alert: AppleNotificationSetting.enabled,
  announcement: AppleNotificationSetting.disabled,
  authorizationStatus: AuthorizationStatus.authorized,
  badge: AppleNotificationSetting.enabled,
  carPlay: AppleNotificationSetting.disabled,
  lockScreen: AppleNotificationSetting.enabled,
  notificationCenter: AppleNotificationSetting.enabled,
  showPreviews: AppleShowPreviewSetting.always,
  timeSensitive: AppleNotificationSetting.disabled,
  criticalAlert: AppleNotificationSetting.disabled,
  sound: AppleNotificationSetting.enabled,
  providesAppNotificationSettings: AppleNotificationSetting.disabled,
);

/// Only the members FcmService uses; anything else fails the test loudly.
class FakeMessaging implements FirebaseMessaging {
  String? token = 'token-1';
  int permissionRequests = 0;
  int deletes = 0;
  final StreamController<String> refresh =
      StreamController<String>.broadcast();

  Future<void> dispose() => refresh.close();

  @override
  dynamic noSuchMethod(Invocation invocation) {
    switch (invocation.memberName) {
      case #requestPermission:
        permissionRequests++;
        return Future<NotificationSettings>.value(_granted);
      case #getToken:
        return Future<String?>.value(token);
      case #onTokenRefresh:
        return refresh.stream;
      case #deleteToken:
        deletes++;
        token = null;
        return Future<void>.value();
    }
    return super.noSuchMethod(invocation);
  }
}

class RecordingApi implements ApiClient {
  final List<Map<String, dynamic>> posted = <Map<String, dynamic>>[];
  bool fail = false;

  @override
  Future<Response<T>> post<T>(String path,
      {dynamic data,
      Map<String, dynamic>? queryParameters,
      Options? options}) async {
    if (fail) {
      throw DioException(requestOptions: RequestOptions(path: path));
    }
    posted.add(<String, dynamic>{'path': path, ...(data as Map<String, String>)});
    return Response<T>(requestOptions: RequestOptions(path: path), statusCode: 200);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  late FakeMessaging messaging;
  late RecordingApi api;
  late FcmService fcm;

  setUp(() {
    messaging = FakeMessaging();
    api = RecordingApi();
    fcm = FcmService(
      messaging: messaging,
      apiClient: api,
      foregroundData: const Stream<Map<String, dynamic>>.empty(),
    );
  });

  tearDown(() => messaging.dispose());

  Future<void> flush() => Future<void>.delayed(Duration.zero);

  test('login sends this device token once; resuming does not ask or send again',
      () async {
    await fcm.register();
    await fcm.register(); // app resumed

    expect(messaging.permissionRequests, 1);
    expect(api.posted, <Map<String, dynamic>>[
      <String, dynamic>{
        'path': ApiEndpoints.notificationDevices,
        'token': 'token-1',
        'platform': 'android',
      }
    ]);
  });

  test('a refreshed token is sent to the server', () async {
    await fcm.register();
    messaging.refresh.add('token-2');
    await flush();

    expect(api.posted.map((Map<String, dynamic> p) => p['token']),
        <String>['token-1', 'token-2']);
  });

  test('a failed upload is retried on the next register', () async {
    api.fail = true;
    await fcm.register();
    api.fail = false;
    await fcm.register();

    expect(api.posted.single['token'], 'token-1');
  });

  test(
      'logout deletes the token; the next account gets a new one, '
      'and old refresh events no longer upload', () async {
    await fcm.register();
    await fcm.unregister();
    expect(messaging.deletes, 1);

    messaging.refresh.add('stale');
    await flush();
    messaging.token = 'token-for-u2';
    await fcm.register();

    expect(api.posted.map((Map<String, dynamic> p) => p['token']),
        <String>['token-1', 'token-for-u2']);
  });
}
