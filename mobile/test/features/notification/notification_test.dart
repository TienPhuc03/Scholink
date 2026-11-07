import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/database/room_database.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/features/notification/notification_model.dart';
import 'package:scholink_mobile/features/notification/notification_repository.dart';
import 'package:scholink_mobile/features/notification/notification_viewmodel.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_model.dart';

import '../tv2_test_support.dart';

Map<String, dynamic> noti(String id, {String type = 'DEADLINE_REMINDER', bool read = false, String? refUrl, int minutesAgo = 5}) =>
    <String, dynamic>{
      'id': id,
      'type': type,
      'title': 'Tiêu đề $id',
      'body': 'Nội dung $id',
      'refUrl': refUrl,
      'isRead': read,
      'createdAt': DateTime.now().subtract(Duration(minutes: minutesAgo)).toUtc().toIso8601String(),
    };

OpportunityModel opportunity(String id, DateTime deadline) => OpportunityModel(
      id: id,
      type: OpportunityType.scholarship,
      title: 'Học bổng $id',
      description: 'Mô tả',
      organizerName: 'UIT',
      applyMode: 'IN_APP',
      registerDeadline: deadline.toUtc().toIso8601String(),
    );

void main() {
  late ScriptedApiClient api;
  late RoomDatabase db;
  late FakeDeviceCalendar device;
  late NotificationRepository repo;
  late NotificationViewModel vm;

  setUp(() {
    api = ScriptedApiClient();
    db = RoomDatabaseImpl(InMemoryCacheManager());
    device = FakeDeviceCalendar();
    repo = NotificationRepository(apiClient: api, roomDb: db, calendar: device, notificationPermission: device);
    vm = NotificationViewModel(repo);
  });

  group('Inbox (NOTI-01, UX-02)', () {
    test('shows each notificationId once, newest first, straight from the server', () async {
      api.reply(ApiEndpoints.notifications, <dynamic>[
        noti('n1', minutesAgo: 30),
        noti('n2', minutesAgo: 1),
        noti('n1', minutesAgo: 30),
      ]);

      await vm.loadNotifications();

      expect(vm.items.map((NotificationModel n) => n.notificationId), <String>['n2', 'n1']);
      expect(vm.isShowingCache, isFalse);
    });

    test('server reminders of type REMINDER / DEADLINE_REMINDER open their opportunity', () {
      final NotificationModel a = NotificationModel.fromJson(noti('a', type: 'REMINDER', refUrl: '/opportunities/opp_1'));
      final NotificationModel b = NotificationModel.fromJson(noti('b', type: 'APPLICATION_UPDATE', refUrl: '/applications/app_9'));
      expect(a.type, NotificationType.deadlineReminder);
      expect(a.targetOpportunityId, 'opp_1');
      expect(b.type, NotificationType.applicationUpdate);
      expect(b.applicationId, 'app_9');
    });

    test('an empty server inbox stays empty (no sample notifications)', () async {
      api.reply(ApiEndpoints.notifications, <dynamic>[]);
      await vm.loadNotifications();
      expect(vm.items, isEmpty);
      expect(vm.hasError, isFalse);
    });

    test('offline shows the saved inbox with its time; nothing saved gives an error', () async {
      api.reply(ApiEndpoints.notifications, const NetworkFailure());
      await vm.loadNotifications();
      expect(vm.hasError, isTrue);

      api.reply(ApiEndpoints.notifications, <dynamic>[noti('n1')]);
      await vm.loadNotifications();
      api.reply(ApiEndpoints.notifications, const NetworkFailure());
      final NotificationViewModel fresh = NotificationViewModel(repo);
      await fresh.loadNotifications();

      expect(fresh.items.single.notificationId, 'n1');
      expect(fresh.isShowingCache, isTrue);
      expect(fresh.syncedAtText, isNotNull);
    });

    test('"read" made offline is kept and sent with the next load', () async {
      api.reply(ApiEndpoints.notifications, <dynamic>[noti('n1')]);
      await vm.loadNotifications();

      api.reply(ApiEndpoints.notificationRead('n1'), const NetworkFailure());
      await vm.markAsRead('n1');
      expect(vm.unreadCount, 0);
      expect(vm.pendingReads, 1);

      // Back online; the server still has it unread until our queued call arrives.
      api.reply(ApiEndpoints.notificationRead('n1'), <String, dynamic>{'id': 'n1', 'isRead': true});
      await vm.loadNotifications();

      expect(api.callsTo(ApiEndpoints.notificationRead('n1')), hasLength(2));
      expect(await db.notificationDao.getPendingReads(), isEmpty);
      expect(vm.pendingReads, 0);
    });

    test('mark all read offline is queued as one call', () async {
      api.reply(ApiEndpoints.notifications, <dynamic>[noti('n1'), noti('n2')]);
      await vm.loadNotifications();
      api.reply(ApiEndpoints.notificationsReadAll, const NetworkFailure());

      await vm.markAllAsRead();
      expect(vm.unreadCount, 0);
      expect(await db.notificationDao.isPendingReadAll(), isTrue);

      // Back online: the queued read-all reaches the server before the inbox is fetched again.
      api.reply(ApiEndpoints.notificationsReadAll, <String, dynamic>{'success': true});
      api.reply(ApiEndpoints.notifications, <dynamic>[noti('n1', read: true), noti('n2', read: true)]);
      await vm.loadNotifications();
      expect(api.callsTo(ApiEndpoints.notificationsReadAll), hasLength(2));
      expect(await db.notificationDao.isPendingReadAll(), isFalse);
      expect(vm.unreadCount, 0);
    });

    test('while the read-all is still queued the inbox keeps everything read', () async {
      api.reply(ApiEndpoints.notifications, <dynamic>[noti('n1'), noti('n2')]);
      await vm.loadNotifications();
      api.reply(ApiEndpoints.notificationsReadAll, const NetworkFailure());
      await vm.markAllAsRead();

      // The read-all still cannot be sent, but the inbox itself loads (server copy unread).
      await vm.loadNotifications();
      expect(await db.notificationDao.isPendingReadAll(), isTrue);
      expect(vm.unreadCount, 0);
    });
  });

  group('Device calendar (NOTI-02/03/04)', () {
    test('TỪ CHỐI QUYỀN KHÔNG BÁO THÀNH CÔNG: nothing is written, status is permissionDenied', () async {
      device
        ..calendarGranted = false
        ..grantOnRequest = false;
      final OpportunityModel opp = opportunity('o1', DateTime.now().add(const Duration(days: 10)));

      final bool ok = await vm.syncOpportunityToCalendar(opp, ReminderMilestone.values);

      expect(ok, isFalse);
      expect(vm.lastSyncIsSuccess, isFalse);
      expect(vm.lastSyncMessage, contains('Từ chối quyền Lịch thiết bị'));
      expect(vm.getCalendarSyncStatus('o1'), CalendarSyncStatus.permissionDenied);
      expect(device.events, isEmpty);
      expect(device.calendarRequests, 1);
    });

    test('syncing twice updates the same device event (lịch không trùng)', () async {
      final OpportunityModel opp = opportunity('o2', DateTime.now().add(const Duration(days: 10)));

      expect(await vm.syncOpportunityToCalendar(opp, <ReminderMilestone>[ReminderMilestone.sevenDays]), isTrue);
      expect(await vm.syncOpportunityToCalendar(opp, ReminderMilestone.values), isTrue);

      expect(device.events, hasLength(1));
      expect(device.upsertExistingIds.last, device.events.keys.single, reason: 'second call reuses the id');
      expect(vm.calendarRecordFor('o2')!.milestones, <String>['7d', '3d', '24h']);
      expect(device.events.values.single.reminderMinutes, hasLength(3));
    });

    test('an extended deadline moves the existing event instead of adding one', () async {
      final DateTime first = DateTime.now().add(const Duration(days: 10));
      await vm.syncOpportunityToCalendar(opportunity('o3', first), <ReminderMilestone>[ReminderMilestone.threeDays]);
      final DateTime extended = first.add(const Duration(days: 5));
      await vm.syncOpportunityToCalendar(opportunity('o3', extended), <ReminderMilestone>[ReminderMilestone.threeDays]);

      expect(device.events, hasLength(1));
      expect(device.events.values.single.end.isAtSameMomentAs(extended), isTrue);
    });

    test('a device event deleted by the user is created again on the next sync', () async {
      final OpportunityModel opp = opportunity('o4', DateTime.now().add(const Duration(days: 10)));
      await vm.syncOpportunityToCalendar(opp, ReminderMilestone.values);
      device.events.clear();

      await vm.syncOpportunityToCalendar(opp, ReminderMilestone.values);
      expect(device.events, hasLength(1));
    });

    test('past milestones are skipped; a closed opportunity cannot be saved', () async {
      final OpportunityModel soon = opportunity('o5', DateTime.now().add(const Duration(days: 2)));
      await vm.syncOpportunityToCalendar(soon, ReminderMilestone.values);
      expect(vm.calendarRecordFor('o5')!.milestones, <String>['24h']);

      final OpportunityModel closed = opportunity('o6', DateTime.now().subtract(const Duration(minutes: 1)));
      expect(await vm.syncOpportunityToCalendar(closed, ReminderMilestone.values), isFalse);
      expect(device.events, hasLength(1));
    });

    test('quiet hours [22:00, 07:00): alarms move to 07:00, daytime alarms stay', () {
      final DateTime now = DateTime(2026, 11, 1, 9);
      // 3 days before 10/11 23:30 = 07/11 23:30 -> quiet -> 08/11 07:00 (before the deadline)
      expect(
        ReminderMilestone.threeDays.plannedAlarm(DateTime(2026, 11, 10, 23, 30), now: now),
        DateTime(2026, 11, 8, 7),
      );
      // 24h before 06/11 02:00 = 05/11 02:00 -> quiet -> 05/11 07:00
      expect(
        ReminderMilestone.twentyFourHours.plannedAlarm(DateTime(2026, 11, 6, 2), now: now),
        DateTime(2026, 11, 5, 7),
      );
      // 7 days before 20/11 15:00 = 13/11 15:00 -> not quiet
      expect(
        ReminderMilestone.sevenDays.plannedAlarm(DateTime(2026, 11, 20, 15), now: now),
        DateTime(2026, 11, 13, 15),
      );
      // Already past: skipped
      expect(ReminderMilestone.sevenDays.plannedAlarm(DateTime(2026, 11, 3, 15), now: now), isNull);
    });
  });

  group('Channels & timezone (NOTI-03)', () {
    test('turning push on with the permission refused saves nothing', () async {
      api.reply(ApiEndpoints.notificationPreferences, <String, dynamic>{'timezone': 'Asia/Ho_Chi_Minh', 'pushEnabled': false});
      device.grantNotificationsOnRequest = false;
      await vm.loadPreferences();

      final Failure? f = await vm.savePreferences(pushEnabled: true);

      expect(f, isA<PermissionDeniedFailure>());
      expect(api.calls.where((RecordedCall c) => c.method == 'PUT'), isEmpty);
      expect(vm.preferences!.pushEnabled, isFalse);
    });

    test('timezone change is sent and the server answer is kept (also for offline reading)', () async {
      api.reply(ApiEndpoints.notificationPreferences, <String, dynamic>{'timezone': 'Asia/Ho_Chi_Minh'});
      await vm.loadPreferences();
      api.handlers[ApiEndpoints.notificationPreferences] = (RecordedCall c) => c.method == 'PUT'
          ? <String, dynamic>{'timezone': 'Europe/London', 'pushEnabled': true, 'emailEnabled': true, 'preferenceVersion': 2}
          : const NetworkFailure();

      expect(await vm.savePreferences(timezone: 'Europe/London'), isNull);
      expect(api.calls.lastWhere((RecordedCall c) => c.method == 'PUT').data, <String, dynamic>{'timezone': 'Europe/London'});

      final NotificationViewModel offline = NotificationViewModel(repo);
      await offline.loadPreferences();
      expect(offline.preferences!.timezone, 'Europe/London');
      expect(offline.preferencesFromCache, isTrue);
    });

    test('a failed save is reported, not shown as saved', () async {
      api.reply(ApiEndpoints.notificationPreferences, <String, dynamic>{'timezone': 'Asia/Ho_Chi_Minh', 'emailEnabled': true});
      await vm.loadPreferences();
      api.handlers[ApiEndpoints.notificationPreferences] =
          (RecordedCall c) => c.method == 'PUT' ? const NetworkFailure() : <String, dynamic>{};

      expect(await vm.savePreferences(emailEnabled: false), isA<NetworkFailure>());
      expect(vm.preferences!.emailEnabled, isTrue);
      expect(vm.preferencesError, isNotNull);
    });
  });
}
