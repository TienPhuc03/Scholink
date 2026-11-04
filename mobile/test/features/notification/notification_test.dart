import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/database/local_cache_manager.dart';
import 'package:scholink_mobile/core/database/room_database.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/core/errors/result.dart';
import 'package:scholink_mobile/core/network/api_client.dart';
import 'package:scholink_mobile/features/notification/notification_model.dart';
import 'package:scholink_mobile/features/notification/notification_repository.dart';
import 'package:scholink_mobile/features/notification/notification_viewmodel.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_model.dart';

class MockApiClient implements ApiClient {
  @override
  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? queryParameters, Options? options}) async {
    throw DioException(
      requestOptions: RequestOptions(path: path),
      type: DioExceptionType.connectionError,
    );
  }

  @override
  Future<Response<T>> post<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    return Response<T>(
      requestOptions: RequestOptions(path: path),
      data: <String, dynamic>{'success': true} as T,
      statusCode: 200,
    );
  }

  @override
  Future<Response<T>> put<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> patch<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> delete<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    throw UnimplementedError();
  }
}

class InMemoryCacheManager implements LocalCacheManager {
  final Map<String, dynamic> _store = <String, dynamic>{};

  @override
  Future<void> clear() async => _store.clear();

  @override
  Future<dynamic> getJson(String key) async => _store[key];

  @override
  Future<String?> getString(String key) async => _store[key] as String?;

  @override
  Future<void> remove(String key) async => _store.remove(key);

  @override
  Future<void> saveJson(String key, dynamic data) async => _store[key] = data;

  @override
  Future<void> saveString(String key, String value) async => _store[key] = value;
}

void main() {
  group('Tuần 3 (F20) - NOTI-01/02/03/04 Notification, Calendar Sync & Permission Tests', () {
    late NotificationRepository repository;
    late NotificationViewModel viewModel;
    late RoomDatabase roomDb;
    late InMemoryCacheManager cache;

    setUp(() {
      cache = InMemoryCacheManager();
      roomDb = RoomDatabaseImpl(cache);
      repository = NotificationRepository(
        apiClient: MockApiClient(),
        roomDb: roomDb,
      );
      viewModel = NotificationViewModel(repository);
    });

    test('NOTI-01: Inbox hiển thị notificationId duy nhất (Deduplication by notificationId)', () async {
      // Seed duplicates into Room Database
      final NotificationModel noti1 = NotificationModel(
        notificationId: 'noti-unique-101',
        type: NotificationType.deadlineReminder,
        title: 'Nhắc hạn 1',
        body: 'Nội dung 1',
        createdAt: DateTime.now().subtract(const Duration(minutes: 5)),
      );
      final NotificationModel notiDuplicate = NotificationModel(
        notificationId: 'noti-unique-101', // Identical ID
        type: NotificationType.deadlineReminder,
        title: 'Nhắc hạn 1 (Bản sao)',
        body: 'Nội dung 1 (Bản sao)',
        createdAt: DateTime.now().subtract(const Duration(minutes: 1)),
      );

      await roomDb.notificationDao.upsertNotification(noti1.toJson());
      await roomDb.notificationDao.upsertNotification(notiDuplicate.toJson());

      await viewModel.loadNotifications();
      final List<NotificationModel> list = viewModel.items;

      // Assert only 1 notification exists for noti-unique-101
      final int count = list.where((NotificationModel n) => n.notificationId == 'noti-unique-101').length;
      expect(count, equals(1));
    });

    test('NOTI-02: Reminder milestones (7d, 3d, 24h) - Chỉ tạo mốc trong tương lai', () {
      final DateTime now = DateTime.now();
      // Deadline in 5 days -> 7d milestone is in past, 3d and 24h are in future
      final DateTime deadlineIn5Days = now.add(const Duration(days: 5));

      expect(ReminderMilestone.sevenDays.isFuture(deadlineIn5Days), isFalse);
      expect(ReminderMilestone.threeDays.isFuture(deadlineIn5Days), isTrue);
      expect(ReminderMilestone.twentyFourHours.isFuture(deadlineIn5Days), isTrue);
    });

    test('NOTI-04: TỪ CHỐI QUYỀN KHÔNG BÁO THÀNH CÔNG (Critical Rule)', () async {
      final OpportunityModel testOpp = OpportunityModel(
        id: 'opp-calendar-test',
        type: OpportunityType.scholarship,
        title: 'Học bổng Test Calendar',
        description: 'Mô tả',
        organizerName: 'UIT',
        applyMode: 'IN_APP',
        registerDeadline: DateTime.now().add(const Duration(days: 10)).toIso8601String(),
      );

      // Simulate permission rejection
      viewModel.togglePermissionSimulation(true);
      expect(viewModel.simulatePermissionDenied, isTrue);

      final bool success = await viewModel.syncOpportunityToCalendar(
        testOpp,
        <ReminderMilestone>[ReminderMilestone.sevenDays],
      );

      // CRITICAL ASSERTION:
      // When permission is denied, it MUST NOT report success!
      expect(success, isFalse, reason: 'Từ chối quyền không được phép báo thành công!');
      expect(viewModel.lastSyncIsSuccess, isFalse);
      expect(viewModel.lastSyncMessage, contains('Từ chối quyền Lịch thiết bị'));
      expect(viewModel.getCalendarSyncStatus(testOpp.id), equals(CalendarSyncStatus.permissionDenied));
    });

    test('NOTI-04: eventId CHỐNG TRÙNG khi đồng bộ nhiều lần (Deduplication)', () async {
      final OpportunityModel testOpp = OpportunityModel(
        id: 'opp-dedup-test',
        type: OpportunityType.competition,
        title: 'Cuộc thi Hackathon Dedup',
        description: 'Mô tả',
        organizerName: 'Scholink',
        applyMode: 'IN_APP',
        registerDeadline: DateTime.now().add(const Duration(days: 10)).toIso8601String(),
      );

      // Permission granted
      viewModel.togglePermissionSimulation(false);

      // Sync first time
      final bool firstSync = await viewModel.syncOpportunityToCalendar(
        testOpp,
        <ReminderMilestone>[ReminderMilestone.sevenDays],
      );
      expect(firstSync, isTrue);
      expect(viewModel.lastSyncIsSuccess, isTrue);

      final List<Map<String, dynamic>> eventsFirst =
          await roomDb.calendarDao.getEventsByOpportunityId(testOpp.id);

      // Sync second time (repeated tap)
      final bool secondSync = await viewModel.syncOpportunityToCalendar(
        testOpp,
        <ReminderMilestone>[ReminderMilestone.sevenDays],
      );
      expect(secondSync, isTrue);

      final List<Map<String, dynamic>> eventsSecond =
          await roomDb.calendarDao.getEventsByOpportunityId(testOpp.id);

      // Assert eventId is deterministic ('scholink_event_opp-dedup-test_7d') and count does NOT increase!
      expect(eventsSecond.length, equals(eventsFirst.length));
      final Map<String, dynamic> event7d = eventsSecond.firstWhere(
        (Map<String, dynamic> e) => e['milestone'] == '7d',
      );
      expect(event7d['eventId'], equals('scholink_event_opp-dedup-test_7d'));
    });

    test('NOTI-01: Mark notification as read and mark all read', () async {
      await viewModel.loadNotifications();
      expect(viewModel.items.isNotEmpty, isTrue);

      final String firstId = viewModel.items.first.notificationId;
      await viewModel.markAsRead(firstId);

      final NotificationModel updated =
          viewModel.items.firstWhere((NotificationModel n) => n.notificationId == firstId);
      expect(updated.isRead, isTrue);

      await viewModel.markAllAsRead();
      expect(viewModel.unreadCount, equals(0));
      for (final NotificationModel n in viewModel.items) {
        expect(n.isRead, isTrue);
      }
    });
  });
}

