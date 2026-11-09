import 'dart:async';

import 'package:dio/dio.dart';
import 'package:scholink_mobile/core/database/local_cache_manager.dart';
import 'package:scholink_mobile/core/device/device_services.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/core/network/api_client.dart';

import 'auth/auth_test_fakes.dart';

export 'auth/auth_test_fakes.dart' show RecordedCall, ScriptedApiClient;

class InMemoryCacheManager implements LocalCacheManager {
  final Map<String, dynamic> store = <String, dynamic>{};

  @override
  Future<void> clear() async => store.clear();

  @override
  Future<dynamic> getJson(String key) async => store[key];

  @override
  Future<String?> getString(String key) async => store[key] as String?;

  @override
  Future<void> remove(String key) async => store.remove(key);

  @override
  Future<void> saveJson(String key, dynamic data) async => store[key] = data;

  @override
  Future<void> saveString(String key, String value) async => store[key] = value;
}

/// ApiClient whose answers can be delayed per call (to test late, out-of-order responses).
class DelayedApiClient implements ApiClient {
  final List<RecordedCall> calls = <RecordedCall>[];
  final List<Completer<Object>> pending = <Completer<Object>>[];

  @override
  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? queryParameters, Options? options}) async {
    calls.add(RecordedCall('GET', path, null, query: queryParameters));
    final Completer<Object> c = Completer<Object>();
    pending.add(c);
    final Object body = await c.future;
    if (body is Failure) throw body;
    return Response<T>(requestOptions: RequestOptions(path: path), statusCode: 200, data: body as T);
  }

  @override
  Future<Response<T>> post<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) =>
      throw UnimplementedError();

  @override
  Future<Response<T>> put<T>(String path, {dynamic data, Options? options}) => throw UnimplementedError();

  @override
  Future<Response<T>> delete<T>(String path, {dynamic data, Options? options}) => throw UnimplementedError();
}

/// Device calendar double: records every write, like the Android channel would.
class FakeDeviceCalendar implements DeviceCalendar, NotificationPermission {
  bool calendarGranted;
  bool grantOnRequest;
  bool notificationsGranted;
  bool grantNotificationsOnRequest;
  int calendarRequests = 0;
  int notificationRequests = 0;
  int _nextId = 100;

  /// native id -> event currently on the "device".
  final Map<String, DeviceCalendarEvent> events = <String, DeviceCalendarEvent>{};
  final List<String?> upsertExistingIds = <String?>[];

  FakeDeviceCalendar({
    this.calendarGranted = true,
    this.grantOnRequest = true,
    this.notificationsGranted = false,
    this.grantNotificationsOnRequest = true,
  });

  @override
  Future<bool> hasCalendarPermission() async => calendarGranted;

  @override
  Future<bool> requestCalendarPermission() async {
    calendarRequests++;
    calendarGranted = grantOnRequest;
    return calendarGranted;
  }

  @override
  Future<String> upsertEvent(DeviceCalendarEvent event, {String? existingEventId}) async {
    if (!calendarGranted) {
      throw const DeviceServiceException(DeviceErrorKind.permissionDenied, 'no permission');
    }
    upsertExistingIds.add(existingEventId);
    final String id =
        existingEventId != null && events.containsKey(existingEventId) ? existingEventId : '${_nextId++}';
    events[id] = event;
    return id;
  }

  @override
  Future<bool> eventExists(String eventId) async => events.containsKey(eventId);

  @override
  Future<void> deleteEvent(String eventId) async => events.remove(eventId);

  @override
  Future<bool> isGranted() async => notificationsGranted;

  @override
  Future<bool> request() async {
    notificationRequests++;
    notificationsGranted = grantNotificationsOnRequest;
    return notificationsGranted;
  }
}

Map<String, dynamic> oppJson(
  String id, {
  String type = 'SCHOLARSHIP',
  String applyMode = 'IN_APP',
  String title = 'Học bổng',
  Duration deadlineIn = const Duration(days: 20),
  String? sourceUrl,
}) =>
    <String, dynamic>{
      'id': id,
      'type': type,
      'title': '$title $id',
      'description': 'Mô tả $id',
      'organizerName': 'Đơn vị $id',
      'applyMode': applyMode,
      'registerDeadline': DateTime.now().add(deadlineIn).toUtc().toIso8601String(),
      'timezone': 'Asia/Ho_Chi_Minh',
      'sourceUrl': sourceUrl ?? 'https://example.edu.vn/$id',
      'updatedAt': '2026-11-01T03:00:00.000Z',
      'version': 1,
    };
