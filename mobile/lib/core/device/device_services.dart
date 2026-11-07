import 'package:flutter/services.dart';

/// One deadline written to the device calendar (FR-NOTI-04).
class DeviceCalendarEvent {
  final String title;
  final String description;
  final DateTime start;
  final DateTime end;

  /// IANA timezone stored with the event, so the calendar app shows it at the right time.
  final String timezone;

  /// Alarms before [start], in minutes (one per reminder milestone).
  final List<int> reminderMinutes;

  const DeviceCalendarEvent({
    required this.title,
    required this.description,
    required this.start,
    required this.end,
    required this.timezone,
    this.reminderMinutes = const <int>[],
  });
}

/// Errors from the device layer that the UI explains differently.
enum DeviceErrorKind { permissionDenied, noWritableCalendar, unsupported, failed }

class DeviceServiceException implements Exception {
  final DeviceErrorKind kind;
  final String message;

  const DeviceServiceException(this.kind, this.message);

  @override
  String toString() => 'DeviceServiceException($kind, $message)';
}

/// Device calendar access. Events are written by the app itself (not through the calendar's
/// "add event" screen), so the app keeps the event id and updates the same event on every
/// sync instead of creating a duplicate ("lịch không trùng").
abstract interface class DeviceCalendar {
  Future<bool> hasCalendarPermission();

  /// Shows the system permission dialog when needed. Returns false when the user refuses.
  Future<bool> requestCalendarPermission();

  /// Updates [existingEventId] when it still exists on the device, otherwise inserts a new
  /// event. Returns the id of the event that now holds the data.
  Future<String> upsertEvent(DeviceCalendarEvent event, {String? existingEventId});

  Future<bool> eventExists(String eventId);

  Future<void> deleteEvent(String eventId);
}

/// Android 13+ notification permission (other versions report the app-level switch).
abstract interface class NotificationPermission {
  Future<bool> isGranted();

  Future<bool> request();
}

/// Android implementation backed by the `com.scholink.app/device` method channel
/// (MainActivity.kt, CalendarContract).
class MethodChannelDeviceServices implements DeviceCalendar, NotificationPermission {
  static const MethodChannel _channel = MethodChannel('com.scholink.app/device');

  const MethodChannelDeviceServices();

  Future<T?> _invoke<T>(String method, [Map<String, Object?>? args]) async {
    try {
      return await _channel.invokeMethod<T>(method, args);
    } on MissingPluginException {
      throw const DeviceServiceException(
        DeviceErrorKind.unsupported,
        'Thiết bị này chưa hỗ trợ ghi lịch/thông báo từ Scholink.',
      );
    } on PlatformException catch (e) {
      final DeviceErrorKind kind = switch (e.code) {
        'PERMISSION_DENIED' => DeviceErrorKind.permissionDenied,
        'NO_CALENDAR' => DeviceErrorKind.noWritableCalendar,
        _ => DeviceErrorKind.failed,
      };
      throw DeviceServiceException(kind, e.message ?? 'Thao tác với thiết bị thất bại.');
    }
  }

  @override
  Future<bool> hasCalendarPermission() async => await _invoke<bool>('calendarPermissionGranted') ?? false;

  @override
  Future<bool> requestCalendarPermission() async => await _invoke<bool>('requestCalendarPermission') ?? false;

  @override
  Future<String> upsertEvent(DeviceCalendarEvent event, {String? existingEventId}) async {
    final Object? id = await _invoke<Object>('upsertCalendarEvent', <String, Object?>{
      'eventId': existingEventId == null ? null : int.tryParse(existingEventId),
      'title': event.title,
      'description': event.description,
      'startMillis': event.start.millisecondsSinceEpoch,
      'endMillis': event.end.millisecondsSinceEpoch,
      'timezone': event.timezone,
      'reminderMinutes': event.reminderMinutes,
    });
    if (id == null) {
      throw const DeviceServiceException(DeviceErrorKind.failed, 'Lịch thiết bị không trả về mã sự kiện.');
    }
    return id.toString();
  }

  @override
  Future<bool> eventExists(String eventId) async {
    final int? id = int.tryParse(eventId);
    if (id == null) return false;
    return await _invoke<bool>('calendarEventExists', <String, Object?>{'eventId': id}) ?? false;
  }

  @override
  Future<void> deleteEvent(String eventId) async {
    final int? id = int.tryParse(eventId);
    if (id == null) return;
    await _invoke<bool>('deleteCalendarEvent', <String, Object?>{'eventId': id});
  }

  @override
  Future<bool> isGranted() async => await _invoke<bool>('notificationPermissionGranted') ?? false;

  @override
  Future<bool> request() async => await _invoke<bool>('requestNotificationPermission') ?? false;
}
