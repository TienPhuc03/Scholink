import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/database/room_database.dart';
import '../../core/device/device_services.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import '../opportunity/opportunity_model.dart';
import 'notification_model.dart';

/// Inbox content; [fromCache] when the server could not be reached ([refreshFailure] says why).
class InboxSnapshot {
  final List<NotificationModel> items;
  final bool fromCache;
  final DateTime? syncedAt;
  final Failure? refreshFailure;

  const InboxSnapshot({required this.items, this.fromCache = false, this.syncedAt, this.refreshFailure});
}

/// Repository managing Notifications Inbox and Device Calendar Synchronization.
/// Tuần 3 (F20) and Tuần 4 (F29) - FR-NOTI-01, FR-NOTI-02, FR-NOTI-03, FR-NOTI-04.
///
/// - The inbox always comes from the server when it answers; the device copy is shown (with its
///   time) only when it does not. No sample notifications are ever shown in its place.
/// - "Read" marks made offline are kept and sent on the next load.
/// - The device calendar holds one event per opportunity; syncing again updates it.
/// - A refused permission is a failure, never a success (NOTI-04).
class NotificationRepository {
  final ApiClient _apiClient;
  final RoomDatabase _roomDb;
  final DeviceCalendar? _calendar;
  final NotificationPermission? _notificationPermission;
  final DateTime Function() _clock;

  NotificationRepository({
    required ApiClient apiClient,
    required RoomDatabase roomDb,
    DeviceCalendar? calendar,
    NotificationPermission? notificationPermission,
    DateTime Function()? clock,
  })  : _apiClient = apiClient,
        _roomDb = roomDb,
        _calendar = calendar,
        _notificationPermission = notificationPermission,
        _clock = clock ?? DateTime.now;

  static Failure _asFailure(Object e) =>
      e is Failure ? e : ServerFailure(message: 'Dữ liệu thông báo không hợp lệ: $e');

  /// Strict Deduplication by Unique notificationId (FR-NOTI-01), newest first.
  static List<NotificationModel> _dedupe(Iterable<NotificationModel> list) {
    final Map<String, NotificationModel> byId = <String, NotificationModel>{};
    for (final NotificationModel n in list) {
      if (n.notificationId.isEmpty) continue;
      byId.putIfAbsent(n.notificationId, () => n);
    }
    return byId.values.toList()..sort((NotificationModel a, NotificationModel b) => b.createdAt.compareTo(a.createdAt));
  }

  // ------------------------------------------------------------------ inbox

  Future<Result<InboxSnapshot, Failure>> getNotifications() async {
    await _flushPendingReads();
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(ApiEndpoints.notifications);
      final dynamic body = response.data;
      final dynamic payload = body is Map ? (body['items'] ?? body['data'] ?? body) : body;
      if (payload is! List) {
        throw const ServerFailure(message: 'Máy chủ trả về hộp thư không đúng định dạng.');
      }

      // Marks the server has not received yet stay read on this device.
      final Set<String> pending = await _roomDb.notificationDao.getPendingReads();
      final bool pendingAll = await _roomDb.notificationDao.isPendingReadAll();
      final List<NotificationModel> list = _dedupe(payload
          .whereType<Map<dynamic, dynamic>>()
          .map((Map<dynamic, dynamic> e) => NotificationModel.fromJson(Map<String, dynamic>.from(e)))
          .map((NotificationModel n) =>
              (pendingAll || pending.contains(n.notificationId)) && !n.isRead ? n.copyWith(isRead: true) : n));

      await _roomDb.notificationDao.replaceAll(list.map((NotificationModel n) => n.toJson()).toList());
      return SuccessResult<InboxSnapshot, Failure>(
        InboxSnapshot(items: list, syncedAt: await _roomDb.notificationDao.getLastSyncedAt()),
      );
    } catch (e) {
      final Failure failure = _asFailure(e);
      final DateTime? syncedAt = await _roomDb.notificationDao.getLastSyncedAt();
      final List<Map<String, dynamic>> cached = await _roomDb.notificationDao.getAllNotifications();
      if (syncedAt == null && cached.isEmpty) return FailureResult<InboxSnapshot, Failure>(failure);
      return SuccessResult<InboxSnapshot, Failure>(InboxSnapshot(
        items: _dedupe(cached.map(NotificationModel.fromJson)),
        fromCache: true,
        syncedAt: syncedAt,
        refreshFailure: failure,
      ));
    }
  }

  Future<void> _flushPendingReads() async {
    if (await _roomDb.notificationDao.isPendingReadAll()) {
      try {
        await _apiClient.post<dynamic>(ApiEndpoints.notificationsReadAll);
        await _roomDb.notificationDao.setPendingReadAll(false);
        await _roomDb.notificationDao.removePendingReads(await _roomDb.notificationDao.getPendingReads());
      } catch (_) {
        return; // still offline: keep everything queued
      }
    }
    final Set<String> pending = await _roomDb.notificationDao.getPendingReads();
    final List<String> sent = <String>[];
    for (final String id in pending) {
      try {
        await _apiClient.post<dynamic>(ApiEndpoints.notificationRead(id));
        sent.add(id);
      } on ServerFailure catch (f) {
        // Gone or not ours any more: nothing left to send.
        if (f.statusCode == 404 || f.statusCode == 403) sent.add(id);
      } catch (_) {
        break;
      }
    }
    if (sent.isNotEmpty) await _roomDb.notificationDao.removePendingReads(sent);
  }

  /// Marks one notification read on the device at once; when the server cannot be reached the
  /// mark is queued and sent with the next inbox load.
  /// Returns true when the server has it, false when it is queued.
  Future<bool> markAsRead(String notificationId) async {
    await _roomDb.notificationDao.markRead(notificationId);
    try {
      await _apiClient.post<dynamic>(ApiEndpoints.notificationRead(notificationId));
      return true;
    } catch (_) {
      await _roomDb.notificationDao.addPendingRead(notificationId);
      return false;
    }
  }

  /// Mark all notifications as read (queued like [markAsRead] when offline).
  Future<bool> markAllAsRead() async {
    await _roomDb.notificationDao.markAllRead();
    try {
      await _apiClient.post<dynamic>(ApiEndpoints.notificationsReadAll);
      return true;
    } catch (_) {
      await _roomDb.notificationDao.setPendingReadAll(true);
      return false;
    }
  }

  /// Get unread count
  Future<int> getUnreadCount() async {
    return _roomDb.notificationDao.getUnreadCount();
  }

  // ------------------------------------------------------------------ preferences (NOTI-03)

  /// Server settings; the last saved copy when offline ([fromCache] true).
  Future<Result<({NotificationPreferences prefs, bool fromCache}), Failure>> getPreferences() async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(ApiEndpoints.notificationPreferences);
      final dynamic body = response.data;
      if (body is! Map) throw const ServerFailure(message: 'Cài đặt thông báo không đúng định dạng.');
      final NotificationPreferences prefs = NotificationPreferences.fromJson(Map<String, dynamic>.from(body));
      await _roomDb.notificationDao.savePreferences(prefs.toJson());
      return SuccessResult<({NotificationPreferences prefs, bool fromCache}), Failure>((prefs: prefs, fromCache: false));
    } catch (e) {
      final Map<String, dynamic>? cached = await _roomDb.notificationDao.getPreferences();
      if (cached == null) {
        return FailureResult<({NotificationPreferences prefs, bool fromCache}), Failure>(_asFailure(e));
      }
      return SuccessResult<({NotificationPreferences prefs, bool fromCache}), Failure>(
        (prefs: NotificationPreferences.fromJson(cached), fromCache: true),
      );
    }
  }

  /// Saves only on the server's answer; nothing is reported as saved when the request fails.
  Future<Result<NotificationPreferences, Failure>> updatePreferences({
    String? timezone,
    bool? pushEnabled,
    bool? emailEnabled,
  }) async {
    final Map<String, dynamic> body = <String, dynamic>{
      if (timezone != null) 'timezone': timezone,
      if (pushEnabled != null) 'pushEnabled': pushEnabled,
      if (emailEnabled != null) 'emailEnabled': emailEnabled,
    };
    try {
      final Response<dynamic> response =
          await _apiClient.put<dynamic>(ApiEndpoints.notificationPreferences, data: body);
      final dynamic data = response.data;
      final NotificationPreferences saved = data is Map && data['timezone'] != null
          ? NotificationPreferences.fromJson(Map<String, dynamic>.from(data))
          : NotificationPreferences.fromJson(<String, dynamic>{
              ...?await _roomDb.notificationDao.getPreferences(),
              ...body,
            });
      await _roomDb.notificationDao.savePreferences(saved.toJson());
      return SuccessResult<NotificationPreferences, Failure>(saved);
    } catch (e) {
      return FailureResult<NotificationPreferences, Failure>(_asFailure(e));
    }
  }

  Future<bool> hasNotificationPermission() async {
    final NotificationPermission? p = _notificationPermission;
    if (p == null) return true;
    try {
      return await p.isGranted();
    } on DeviceServiceException {
      return false;
    }
  }

  /// Asks the OS (Android 13+) before the push channel is turned on.
  Future<Result<bool, Failure>> requestNotificationPermission() async {
    final NotificationPermission? p = _notificationPermission;
    if (p == null) return const SuccessResult<bool, Failure>(true);
    try {
      if (await p.isGranted() || await p.request()) return const SuccessResult<bool, Failure>(true);
      return const FailureResult<bool, Failure>(PermissionDeniedFailure(
        message: 'Bạn đã từ chối quyền thông báo nên chưa bật được thông báo đẩy. '
            'Nhắc hạn vẫn có trong Hộp thư; có thể cấp quyền lại trong Cài đặt của máy.',
      ));
    } on DeviceServiceException catch (e) {
      return FailureResult<bool, Failure>(PermissionDeniedFailure(message: e.message));
    }
  }

  // ------------------------------------------------------------------ device calendar (NOTI-04)

  Future<CalendarEventRecord?> getCalendarRecord(String opportunityId) async {
    final Map<String, dynamic>? raw =
        await _roomDb.calendarDao.findByEventId(CalendarEventRecord.keyFor(opportunityId));
    return raw == null ? null : CalendarEventRecord.fromJson(raw);
  }

  /// Device Calendar Sync with EventId Deduplication & Permission Verification (FR-NOTI-04).
  ///
  /// CRITICAL REQUIREMENT (NOTI-04):
  /// "Từ chối quyền không báo thành công; eventId chống trùng; inbox hiển thị notificationId duy nhất"
  Future<Result<CalendarEventRecord, Failure>> syncOpportunityToCalendar({
    required OpportunityModel opportunity,
    required List<ReminderMilestone> milestones,
  }) async {
    final String key = CalendarEventRecord.keyFor(opportunity.id);
    final DateTime now = _clock();

    final DateTime? deadline = opportunity.registerDeadlineAt;
    if (deadline == null) {
      return const FailureResult<CalendarEventRecord, Failure>(
        ValidationFailure(message: 'Thời hạn đăng ký không hợp lệ, không thể lưu vào lịch.'),
      );
    }
    if (!now.isBefore(deadline)) {
      return const FailureResult<CalendarEventRecord, Failure>(
        ValidationFailure(message: 'Cơ hội đã đóng đăng ký, không cần lưu vào lịch nữa.'),
      );
    }

    final DeviceCalendar? calendar = _calendar;
    if (calendar == null) {
      return const FailureResult<CalendarEventRecord, Failure>(
        PermissionDeniedFailure(message: 'Thiết bị này chưa hỗ trợ ghi lịch từ Scholink.'),
      );
    }

    final CalendarEventRecord? previous = await getCalendarRecord(opportunity.id);

    // 1. Permission: ask once; a refusal is recorded and NEVER reported as success.
    try {
      final bool granted = await calendar.hasCalendarPermission() || await calendar.requestCalendarPermission();
      if (!granted) return await _calendarDenied(opportunity, deadline, previous);
    } on DeviceServiceException catch (e) {
      return _calendarFailed(opportunity, deadline, previous, e);
    }

    // 2. Alarms for the chosen milestones still in the future, quiet hours applied (NOTI-02/03).
    final List<ReminderMilestone> kept = <ReminderMilestone>[];
    final List<int> minutes = <int>[];
    for (final ReminderMilestone m in milestones) {
      final DateTime? alarm = m.plannedAlarm(deadline, now: now);
      if (alarm == null) continue;
      final int before = deadline.difference(alarm).inMinutes;
      if (before <= 0 || minutes.contains(before)) continue;
      kept.add(m);
      minutes.add(before);
    }

    // 3. One device event per opportunity: update the one we made before, never add another.
    final String title = '[Scholink] Hạn đăng ký: ${opportunity.title}';
    final String description = <String>[
      opportunity.organizerName,
      if ((opportunity.sourceUrl ?? '').isNotEmpty) 'Nguồn: ${opportunity.sourceUrl}',
      'Múi giờ nguồn công bố: ${opportunity.timezone}',
    ].join('\n');
    try {
      final String nativeId = await calendar.upsertEvent(
        DeviceCalendarEvent(
          title: title,
          description: description,
          start: deadline.subtract(const Duration(minutes: 30)),
          end: deadline,
          timezone: opportunity.timezone,
          reminderMinutes: minutes.map((int m) => m - 30).where((int m) => m >= 0).toList(),
        ),
        existingEventId: previous?.nativeEventId,
      );

      await _roomDb.calendarDao.upsertEvent(
        eventId: key,
        opportunityId: opportunity.id,
        title: title,
        deadline: deadline,
        milestone: 'deadline',
        syncStatus: CalendarSyncStatus.synced.name,
        nativeEventId: nativeId,
        milestones: kept.map((ReminderMilestone m) => m.code).toList(),
        reminderMinutes: minutes,
      );
      return SuccessResult<CalendarEventRecord, Failure>((await getCalendarRecord(opportunity.id))!);
    } on DeviceServiceException catch (e) {
      return _calendarFailed(opportunity, deadline, previous, e);
    }
  }

  Future<Result<CalendarEventRecord, Failure>> _calendarDenied(
    OpportunityModel opportunity,
    DateTime deadline,
    CalendarEventRecord? previous,
  ) async {
    await _roomDb.calendarDao.upsertEvent(
      eventId: CalendarEventRecord.keyFor(opportunity.id),
      opportunityId: opportunity.id,
      title: opportunity.title,
      deadline: deadline,
      milestone: 'permission_denied',
      syncStatus: CalendarSyncStatus.permissionDenied.name,
      milestones: previous?.milestones ?? const <String>[],
    );
    return const FailureResult<CalendarEventRecord, Failure>(
      PermissionDeniedFailure(
        message: 'Từ chối quyền Lịch thiết bị: chưa có sự kiện nào được tạo. '
            'Bạn vẫn nhận nhắc hạn trong Hộp thư nếu đã lưu cơ hội.',
      ),
    );
  }

  Future<Result<CalendarEventRecord, Failure>> _calendarFailed(
    OpportunityModel opportunity,
    DateTime deadline,
    CalendarEventRecord? previous,
    DeviceServiceException e,
  ) async {
    if (e.kind == DeviceErrorKind.permissionDenied) return _calendarDenied(opportunity, deadline, previous);
    await _roomDb.calendarDao.upsertEvent(
      eventId: CalendarEventRecord.keyFor(opportunity.id),
      opportunityId: opportunity.id,
      title: opportunity.title,
      deadline: deadline,
      milestone: 'failed',
      syncStatus: CalendarSyncStatus.failed.name,
      milestones: previous?.milestones ?? const <String>[],
    );
    return FailureResult<CalendarEventRecord, Failure>(ServerFailure(message: e.message, code: 'CALENDAR_ERROR'));
  }

  /// Removes the device event (if it still exists) and the local record.
  Future<Result<void, Failure>> removeFromCalendar(String opportunityId) async {
    final CalendarEventRecord? record = await getCalendarRecord(opportunityId);
    final String? nativeId = record?.nativeEventId;
    if (nativeId != null && _calendar != null) {
      try {
        await _calendar.deleteEvent(nativeId);
      } on DeviceServiceException catch (e) {
        return FailureResult<void, Failure>(e.kind == DeviceErrorKind.permissionDenied
            ? PermissionDeniedFailure(message: e.message)
            : ServerFailure(message: e.message, code: 'CALENDAR_ERROR'));
      }
    }
    await _roomDb.calendarDao.deleteEvent(CalendarEventRecord.keyFor(opportunityId));
    return const SuccessResult<void, Failure>(null);
  }

  /// Check Calendar Sync status for a given opportunity
  Future<CalendarSyncStatus> getOpportunityCalendarSyncStatus(String opportunityId) async {
    return (await getCalendarRecord(opportunityId))?.syncStatus ?? CalendarSyncStatus.notSynced;
  }
}
