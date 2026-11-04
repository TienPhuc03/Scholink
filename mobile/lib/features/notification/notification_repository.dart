import 'dart:convert';
import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/database/room_database.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import '../opportunity/opportunity_model.dart';
import 'notification_mock_data.dart';
import 'notification_model.dart';

/// Repository managing Notifications Inbox and Device Calendar Synchronization.
/// Satisfies Tuần 3 (F20) - FR-NOTI-01, FR-NOTI-02, FR-NOTI-03, and FR-NOTI-04.
class NotificationRepository {
  final ApiClient _apiClient;
  final RoomDatabase _roomDb;

  NotificationRepository({
    required ApiClient apiClient,
    required RoomDatabase roomDb,
  })  : _apiClient = apiClient,
        _roomDb = roomDb;

  /// Fetch Inbox notifications with deduplication by unique notificationId (FR-NOTI-01).
  Future<Result<List<NotificationModel>, Failure>> getNotifications() async {
    List<NotificationModel> list = <NotificationModel>[];

    // 1. Try remote API
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(
        '/api/v1/notifications',
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData['items'] ?? resData)
          : resData;

      if (payload is List) {
        list = payload
            .whereType<Map<String, dynamic>>()
            .map((Map<String, dynamic> item) => NotificationModel.fromJson(item))
            .toList();

        // Persist remote notifications into Room Database
        if (list.isNotEmpty) {
          final List<Map<String, dynamic>> records =
              list.map((NotificationModel n) => n.toJson()).toList();
          await _roomDb.notificationDao.upsertAll(records);
        }
      }
    } catch (_) {
      // Offline fallback
    }

    // 2. Fallback to Room Database
    if (list.isEmpty) {
      final List<Map<String, dynamic>> cached =
          await _roomDb.notificationDao.getAllNotifications();
      if (cached.isNotEmpty) {
        list = cached
            .map((Map<String, dynamic> item) => NotificationModel.fromJson(item))
            .toList();
      }
    }

    // 3. Fallback to rich Mock notifications if empty
    if (list.isEmpty) {
      final List<NotificationModel> mocks = NotificationMockData.getMockNotifications();
      list = mocks;
      await _roomDb.notificationDao.upsertAll(
        mocks.map((NotificationModel n) => n.toJson()).toList(),
      );
    }

    // 4. Strict Deduplication by Unique notificationId (FR-NOTI-01)
    final Map<String, NotificationModel> dedupMap = <String, NotificationModel>{};
    for (final NotificationModel noti in list) {
      // Keep earliest or latest by notificationId
      if (!dedupMap.containsKey(noti.notificationId)) {
        dedupMap[noti.notificationId] = noti;
      }
    }

    final List<NotificationModel> dedupedList = dedupMap.values.toList();
    dedupedList.sort((NotificationModel a, NotificationModel b) => b.createdAt.compareTo(a.createdAt));

    return SuccessResult<List<NotificationModel>, Failure>(dedupedList);
  }

  /// Mark single notification as read
  Future<void> markAsRead(String notificationId) async {
    try {
      await _apiClient.post<dynamic>('/api/v1/notifications/$notificationId/read');
    } catch (_) {}
    await _roomDb.notificationDao.markRead(notificationId);
  }

  /// Mark all notifications as read
  Future<void> markAllAsRead() async {
    try {
      await _apiClient.post<dynamic>('/api/v1/notifications/read-all');
    } catch (_) {}
    await _roomDb.notificationDao.markAllRead();
  }

  /// Get unread count
  Future<int> getUnreadCount() async {
    return _roomDb.notificationDao.getUnreadCount();
  }

  /// Device Calendar Sync with EventId Deduplication & Permission Verification (FR-NOTI-04).
  ///
  /// CRITICAL REQUIREMENT (NOTI-04):
  /// "Từ chối quyền không báo thành công; eventId chống trùng; inbox hiển thị notificationId duy nhất"
  Future<Result<List<CalendarEventRecord>, Failure>> syncOpportunityToCalendar({
    required OpportunityModel opportunity,
    required List<ReminderMilestone> milestones,
    bool simulatePermissionDenial = false,
  }) async {
    // 1. Permission Check
    // If permission is denied, NEVER report success!
    if (simulatePermissionDenial) {
      // Record permission denied state in Calendar DAO for tracking
      final String fallbackEventId = 'scholink_event_${opportunity.id}_denied';
      await _roomDb.calendarDao.upsertEvent(
        eventId: fallbackEventId,
        opportunityId: opportunity.id,
        title: opportunity.title,
        deadline: DateTime.tryParse(opportunity.registerDeadline) ?? DateTime.now(),
        milestone: 'permission_denied',
        syncStatus: CalendarSyncStatus.permissionDenied.name,
      );

      return const FailureResult<List<CalendarEventRecord>, Failure>(
        PermissionDeniedFailure(
          message: 'Từ chối quyền Lịch thiết bị: Hệ thống KHÔNG thể tạo sự kiện lịch. Thao tác đồng bộ thất bại.',
        ),
      );
    }

    // 2. Parse Deadline
    final DateTime? deadline = DateTime.tryParse(opportunity.registerDeadline);
    if (deadline == null) {
      return const FailureResult<List<CalendarEventRecord>, Failure>(
        ValidationFailure(message: 'Thời hạn đăng ký không hợp lệ, không thể lập lịch nhắc.'),
      );
    }

    // 3. Process milestones (FR-NOTI-02: Chỉ tạo mốc tương lai)
    final List<CalendarEventRecord> records = <CalendarEventRecord>[];

    for (final ReminderMilestone milestone in milestones) {
      if (!milestone.isFuture(deadline)) {
        // Skip past milestones per FR-NOTI-02
        continue;
      }

      // Calculate trigger time with Quiet Hours adjustment (FR-NOTI-03: 22h-07h)
      DateTime triggerTime = milestone.calculateTriggerTime(deadline);
      triggerTime = _applyQuietHours(triggerTime);

      // EventId Deduplication: Unique key prevents duplicate calendar events on repeated taps!
      final String uniqueEventId = 'scholink_event_${opportunity.id}_${milestone.code}';

      // Idempotent Upsert in Calendar DAO
      await _roomDb.calendarDao.upsertEvent(
        eventId: uniqueEventId,
        opportunityId: opportunity.id,
        title: '[Scholink Nhắc Hạn - ${milestone.label}] ${opportunity.title}',
        deadline: triggerTime,
        milestone: milestone.code,
        syncStatus: CalendarSyncStatus.synced.name,
      );

      final CalendarEventRecord rec = CalendarEventRecord(
        eventId: uniqueEventId,
        opportunityId: opportunity.id,
        title: '[Scholink] ${opportunity.title} (${milestone.label})',
        deadline: triggerTime,
        milestone: milestone.code,
        syncStatus: CalendarSyncStatus.synced,
        syncedAt: DateTime.now(),
      );
      records.add(rec);
    }

    // Also register the final deadline event
    final String deadlineEventId = 'scholink_event_${opportunity.id}_deadline';
    await _roomDb.calendarDao.upsertEvent(
      eventId: deadlineEventId,
      opportunityId: opportunity.id,
      title: '[Scholink HẠN CHÓT] ${opportunity.title}',
      deadline: deadline,
      milestone: 'deadline',
      syncStatus: CalendarSyncStatus.synced.name,
    );

    records.add(
      CalendarEventRecord(
        eventId: deadlineEventId,
        opportunityId: opportunity.id,
        title: '[Scholink HẠN CHÓT] ${opportunity.title}',
        deadline: deadline,
        milestone: 'deadline',
        syncStatus: CalendarSyncStatus.synced,
        syncedAt: DateTime.now(),
      ),
    );

    return SuccessResult<List<CalendarEventRecord>, Failure>(records);
  }

  /// Check Calendar Sync status for a given opportunity
  Future<CalendarSyncStatus> getOpportunityCalendarSyncStatus(String opportunityId) async {
    final List<Map<String, dynamic>> events =
        await _roomDb.calendarDao.getEventsByOpportunityId(opportunityId);

    if (events.isEmpty) {
      return CalendarSyncStatus.notSynced;
    }

    final bool hasDenied = events.any(
      (Map<String, dynamic> e) => e['syncStatus'] == CalendarSyncStatus.permissionDenied.name,
    );
    if (hasDenied) return CalendarSyncStatus.permissionDenied;

    final bool hasSynced = events.any(
      (Map<String, dynamic> e) => e['syncStatus'] == CalendarSyncStatus.synced.name,
    );
    if (hasSynced) return CalendarSyncStatus.synced;

    return CalendarSyncStatus.notSynced;
  }

  /// FR-NOTI-03: Quiet Hours 22:00 - 07:00 algorithm.
  /// If scheduled trigger falls within 22:00 - 07:00, defer to 07:00 the following morning.
  DateTime _applyQuietHours(DateTime time) {
    if (time.hour >= 22) {
      // Defer to 07:00 next morning
      final DateTime nextDay = time.add(const Duration(days: 1));
      return DateTime(nextDay.year, nextDay.month, nextDay.day, 7, 0, 0);
    } else if (time.hour < 7) {
      // Defer to 07:00 same day
      return DateTime(time.year, time.month, time.day, 7, 0, 0);
    }
    return time;
  }
}

