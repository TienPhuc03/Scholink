import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/app.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/database/room_database.dart';
import 'package:scholink_mobile/core/di/service_locator.dart';
import 'package:scholink_mobile/core/network/session_events.dart';
import 'package:scholink_mobile/features/application/application_detail_view.dart';
import 'package:scholink_mobile/features/auth/login_view.dart';
import 'package:scholink_mobile/features/notification/notification_settings_view.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_detail_view.dart';

import 'application/application_f28_test.dart' show appId, detailJson;
import 'application/apply_test_support.dart';
import 'auth/auth_test_fakes.dart';
import 'f37_app_test.dart' show SilentMqtt;
import 'tv2_test_support.dart' show FakeDeviceCalendar, oppJson;

/// F29/F38: the TV2 screens inside the whole app, where they meet TV1's auth and application flows.
void main() {
  late ScriptedApiClient api;
  late InMemorySecureStorage storage;

  Future<void> boot({required bool signedIn}) async {
    await sl.reset();
    api = ScriptedApiClient()
      ..reply(ApiEndpoints.opportunities, <String, dynamic>{
        'items': <dynamic>[oppJson('opp_a', title: 'Học bổng A')],
        'hasMore': false,
      })
      ..reply(ApiEndpoints.opportunityDetail('opp_a'), oppJson('opp_a', title: 'Học bổng A'))
      ..reply(ApiEndpoints.passport, <String, dynamic>{'studentId': 'stu_a', 'fullName': 'Sinh viên A'})
      ..reply(ApiEndpoints.notificationPreferences, <String, dynamic>{'timezone': 'Asia/Ho_Chi_Minh'});
    storage = InMemorySecureStorage();
    if (signedIn) {
      storage
        ..accessToken = 'access_a'
        ..refreshToken = 'refresh_a'
        ..userId = 'stu_a';
    }
    final FakeDeviceCalendar device = FakeDeviceCalendar();
    registerDependencies(
      secureStorage: storage,
      localCache: MemoryCache(),
      sessionEvents: SessionEvents(),
      apiClient: api,
      mqttManager: SilentMqtt(),
      attachmentPicker: QueuePicker(),
      deviceCalendar: device,
      notificationPermission: device,
    );
  }

  void phone(WidgetTester tester) {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    // Other tabs (TV3) are not part of these checks; ignore their overflow under the test font.
    final void Function(FlutterErrorDetails)? original = FlutterError.onError;
    FlutterError.onError = (FlutterErrorDetails d) {
      if (!d.exceptionAsString().contains('RenderFlex overflowed')) original?.call(d);
    };
    addTearDown(() => FlutterError.onError = original);
  }

  tearDown(() async => sl.reset());

  testWidgets('guest taps "Lưu", logs in, and the bookmark is saved for them (F10 + F29)',
      (WidgetTester tester) async {
    phone(tester);
    await boot(signedIn: false);
    api
      ..reply(ApiEndpoints.login, <String, dynamic>{
        'accessToken': 'access_a',
        'refreshToken': 'refresh_a',
        'user': <String, dynamic>{'id': 'stu_a', 'email': 'sv@uit.edu.vn', 'fullName': 'Sinh viên A'},
      })
      ..reply(ApiEndpoints.opportunityBookmark('opp_a'), <String, dynamic>{'bookmarked': true});

    await tester.pumpWidget(const ScholinkApp(initialIsAuthenticated: false));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Khám phá trước, đăng nhập sau'));
    await tester.tap(find.text('Khám phá trước, đăng nhập sau'));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Lưu Học bổng A opp_a'));
    await tester.pumpAndSettle();
    expect(api.callsTo(ApiEndpoints.opportunityBookmark('opp_a')), isEmpty, reason: 'guest: no account call');
    await tester.tap(find.byKey(const Key('login_required_go')));
    await tester.pumpAndSettle();

    expect(find.byType(LoginView), findsOneWidget);
    await tester.enterText(find.byType(TextField).at(0), 'sv@uit.edu.vn');
    await tester.enterText(find.byType(TextField).at(1), 'Matkhau@123');
    await tester.ensureVisible(find.widgetWithText(ElevatedButton, 'Đăng nhập'));
    await tester.tap(find.widgetWithText(ElevatedButton, 'Đăng nhập'));
    await tester.pumpAndSettle();

    final List<RecordedCall> saves = api.callsTo(ApiEndpoints.opportunityBookmark('opp_a'));
    expect(saves, hasLength(1));
    expect(saves.single.data, <String, dynamic>{'bookmarked': true});
    expect(await sl<RoomDatabase>().opportunityDao.isBookmarked('opp_a'), isTrue);
    expect(find.textContaining('Đã lưu "Học bổng A opp_a"'), findsOneWidget);
  });

  testWidgets('an application update in the inbox opens TV1 application detail', (WidgetTester tester) async {
    phone(tester);
    await boot(signedIn: true);
    api
      ..reply(ApiEndpoints.notifications, <dynamic>[
        <String, dynamic>{
          'id': 'n_app',
          'type': 'APPLICATION_UPDATE',
          'title': 'Hồ sơ đã được xét duyệt',
          'body': 'Trạng thái: SHORTLISTED',
          'refUrl': '/applications/$appId',
          'createdAt': DateTime.now().toUtc().toIso8601String(),
        },
      ])
      ..reply(ApiEndpoints.notificationRead('n_app'), <String, dynamic>{'id': 'n_app', 'isRead': true})
      ..reply(ApiEndpoints.applicationDetail(appId), detailJson(canWithdraw: true));

    await tester.pumpWidget(const ScholinkApp(initialIsAuthenticated: true));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Thông báo').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey<String>('noti_n_app')));
    await tester.pumpAndSettle();

    expect(find.byType(ApplicationDetailView), findsOneWidget);
    expect(api.callsTo(ApiEndpoints.notificationRead('n_app')), hasLength(1));
  });

  Map<String, dynamic> unread(String id) => <String, dynamic>{
        'id': id,
        'type': 'TEAM_JOIN_REQUEST',
        'title': 'Có người xin vào đội $id',
        'body': 'Yêu cầu mới',
        'createdAt': DateTime.now().toUtc().toIso8601String(),
      };

  testWidgets('N2: after login the inbox and badge load without opening the inbox', (WidgetTester tester) async {
    phone(tester);
    await boot(signedIn: false);
    api
      ..reply(ApiEndpoints.login, <String, dynamic>{
        'accessToken': 'access_a',
        'refreshToken': 'refresh_a',
        'user': <String, dynamic>{'id': 'stu_a', 'email': 'sv@uit.edu.vn', 'fullName': 'Sinh viên A'},
      })
      ..reply(ApiEndpoints.notifications, <dynamic>[unread('n1'), unread('n2')]);

    await tester.pumpWidget(const ScholinkApp(initialIsAuthenticated: false));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'sv@uit.edu.vn');
    await tester.enterText(find.byType(TextField).at(1), 'Matkhau@123');
    await tester.ensureVisible(find.widgetWithText(ElevatedButton, 'Đăng nhập'));
    await tester.tap(find.widgetWithText(ElevatedButton, 'Đăng nhập'));
    await tester.pumpAndSettle();

    expect(api.callsTo(ApiEndpoints.notifications), isNotEmpty);
    expect(find.text('2'), findsOneWidget, reason: 'badge on the Thông báo tab right after login');
  });

  testWidgets('N2: coming back to the foreground reloads the inbox and the badge', (WidgetTester tester) async {
    phone(tester);
    await boot(signedIn: true);
    api.reply(ApiEndpoints.notifications, <dynamic>[unread('n1')]);
    await tester.pumpWidget(const ScholinkApp(initialIsAuthenticated: true));
    await tester.pumpAndSettle();
    expect(find.text('1'), findsOneWidget);
    final int before = api.callsTo(ApiEndpoints.notifications).length;

    // A new notification arrives while the app is in the background (no MQTT then).
    api.reply(ApiEndpoints.notifications, <dynamic>[unread('n1'), unread('n2'), unread('n3')]);
    for (final AppLifecycleState s in <AppLifecycleState>[
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(s);
    }
    await tester.pumpAndSettle();

    expect(api.callsTo(ApiEndpoints.notifications).length, before + 1);
    expect(find.text('3'), findsOneWidget);
  });

  testWidgets('the Thông báo tab shows the unread count and refreshes when opened again', (WidgetTester tester) async {
    phone(tester);
    await boot(signedIn: true);
    Map<String, dynamic> n(String id) => <String, dynamic>{
          'id': id,
          'type': 'DEADLINE_REMINDER',
          'title': 'Nhắc $id',
          'body': 'Còn 3 ngày',
          'createdAt': DateTime.now().toUtc().toIso8601String(),
        };
    api.reply(ApiEndpoints.notifications, <dynamic>[n('n1'), n('n2')]);

    await tester.pumpWidget(const ScholinkApp(initialIsAuthenticated: true));
    await tester.pumpAndSettle();
    expect(find.text('2'), findsOneWidget, reason: 'badge on the tab icon');

    final int before = api.callsTo(ApiEndpoints.notifications).length;
    api.reply(ApiEndpoints.notifications, <dynamic>[n('n1'), n('n2'), n('n3')]);
    await tester.tap(find.text('Thông báo').last);
    await tester.pumpAndSettle();

    expect(api.callsTo(ApiEndpoints.notifications).length, before + 1);
    expect(find.byKey(const ValueKey<String>('noti_n3')), findsOneWidget);
  });

  testWidgets('a deadline reminder opens its opportunity; settings open from the inbox', (WidgetTester tester) async {
    phone(tester);
    await boot(signedIn: true);
    api.reply(ApiEndpoints.notifications, <dynamic>[
      <String, dynamic>{
        'id': 'n_rem',
        'type': 'DEADLINE_REMINDER',
        'title': 'Nhắc hạn: Học bổng A',
        'body': 'Còn 3 ngày',
        'refUrl': '/opportunities/opp_a',
        'createdAt': DateTime.now().toUtc().toIso8601String(),
      },
    ]);

    await tester.pumpWidget(const ScholinkApp(initialIsAuthenticated: true));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Thông báo').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey<String>('noti_n_rem')));
    await tester.pumpAndSettle();
    expect(find.byType(OpportunityDetailView), findsOneWidget);
    expect(find.text('Học bổng A opp_a'), findsWidgets);

    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('inbox_settings')));
    await tester.pumpAndSettle();
    expect(find.byType(NotificationSettingsView), findsOneWidget);
    expect(find.text('Asia/Ho_Chi_Minh'), findsWidgets);
  });
}
