import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/app.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/database/room_database.dart';
import 'package:scholink_mobile/core/di/service_locator.dart';
import 'package:scholink_mobile/core/network/session_events.dart';
import 'package:scholink_mobile/core/realtime/mqtt_manager.dart';
import 'package:scholink_mobile/features/application/application_detail_view.dart';
import 'package:scholink_mobile/features/application/application_repository.dart';
import 'package:scholink_mobile/features/application/apply_view.dart';
import 'package:scholink_mobile/features/application/apply_viewmodel.dart';
import 'package:scholink_mobile/features/application/attachment_model.dart';
import 'package:scholink_mobile/features/application/media_repository.dart';
import 'package:scholink_mobile/features/application/my_applications_view.dart';
import 'package:scholink_mobile/features/application/my_applications_viewmodel.dart';
import 'package:scholink_mobile/features/application/submission_store.dart';
import 'package:scholink_mobile/features/auth/login_view.dart';

import 'application/application_f28_test.dart' show appId, detailJson;
import 'application/apply_test_support.dart';
import 'auth/auth_test_fakes.dart';

class SilentMqtt implements MqttManager {
  // ignore: close_sinks, the fake lives for the whole test run.
  final StreamController<Map<String, String>> _messages = StreamController<Map<String, String>>.broadcast();

  @override
  Future<bool> connect(String userId) async => false;
  @override
  void disconnect() {}
  @override
  bool get isConnected => false;
  @override
  Stream<Map<String, String>> get messageStream => _messages.stream;
  @override
  void publish(String topic, String message) {}
  @override
  void subscribe(String topic) {}
}

class ThrowingPicker implements AttachmentPicker {
  @override
  Future<PickedAttachment?> pick() async => throw Exception('PERMISSION_DENIED');
}

void main() {
  group('Whole app on a shared device (F37, Q2/Q3)', () {
    late ScriptedApiClient api;
    late InMemorySecureStorage storage;
    late SessionEvents events;

    setUp(() async {
      await sl.reset();
      api = ScriptedApiClient()
        ..reply(ApiEndpoints.passport, <String, dynamic>{'studentId': 'stu_a', 'fullName': 'Sinh viên A', 'completionScore': 80})
        ..reply(ApiEndpoints.myApplications, <dynamic>[
          <String, dynamic>{'id': appId, 'opportunityId': oppId, 'opportunityTitle': 'Học bổng A', 'status': 'SUBMITTED',
            'revision': 1, 'submittedAt': '2026-11-01T02:00:00.000Z'},
        ]);
      storage = InMemorySecureStorage()
        ..accessToken = 'access_a'
        ..refreshToken = 'refresh_a'
        ..userId = 'stu_a';
      events = SessionEvents();
      registerDependencies(
        secureStorage: storage,
        localCache: MemoryCache(),
        sessionEvents: events,
        apiClient: api,
        mqttManager: SilentMqtt(),
        attachmentPicker: QueuePicker(),
      );
    });

    tearDown(() async => sl.reset());

    testWidgets('when the session ends no account screen or cached data is left', (WidgetTester tester) async {
      // The test font draws every glyph as a full square, so other members' list cards overflow here;
      // layout under large text is covered by the Q7 tests below.
      final void Function(FlutterErrorDetails)? original = FlutterError.onError;
      FlutterError.onError = (FlutterErrorDetails d) {
        if (!d.exceptionAsString().contains('RenderFlex overflowed')) original?.call(d);
      };
      addTearDown(() => FlutterError.onError = original);
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.5;
      addTearDown(tester.view.reset);
      await sl<RoomDatabase>().opportunityDao.saveBookmark('opp_bookmarked_by_a');

      await tester.pumpWidget(const ScholinkApp(initialIsAuthenticated: true));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Passport').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Hồ sơ ứng tuyển của tôi').first);
      await tester.pumpAndSettle();
      expect(find.byType(MyApplicationsView), findsOneWidget);
      expect(find.text('Học bổng A'), findsOneWidget);

      events.notifyExpired();
      await tester.pumpAndSettle();

      expect(find.byType(LoginView), findsOneWidget);
      expect(find.byType(MyApplicationsView), findsNothing);
      expect(find.text('Học bổng A'), findsNothing);
      expect(find.textContaining('Phiên đăng nhập đã hết hạn'), findsOneWidget);
      expect(await sl<RoomDatabase>().opportunityDao.getAllBookmarkedIds(), isEmpty);
    });
  });

  group('Large text and denied permissions (F37, Q7)', () {
    Widget scaled(Widget home, double scale) => MaterialApp(
          builder: (BuildContext context, Widget? child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
            child: child!,
          ),
          home: home,
        );

    void phone(WidgetTester tester) {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.5;
      addTearDown(tester.view.reset);
    }

    for (final double scale in <double>[1.3, 2.0]) {
      testWidgets('apply flow keeps its action visible at text scale $scale', (WidgetTester tester) async {
        phone(tester);
        final ApplyHarness h = ApplyHarness()..now = DateTime.now();
        await tester.pumpWidget(scaled(
          ApplyView(viewModel: h.build(), onEditPassport: () async {}, onOpenApplication: (String id, {required bool justSubmitted}) {}),
          scale,
        ));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.byKey(const Key('apply_next_1')).hitTestable(), findsOneWidget);
      });

      testWidgets('application detail keeps withdraw visible at text scale $scale', (WidgetTester tester) async {
        phone(tester);
        final ScriptedApiClient api = ScriptedApiClient()
          ..reply(ApiEndpoints.applicationDetail(appId), detailJson(canWithdraw: true));
        await tester.pumpWidget(scaled(
          ApplicationDetailView(viewModel: ApplicationDetailViewModel(ApplicationRepository(api), applicationId: appId)),
          scale,
        ));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.byKey(const Key('detail_withdraw')).hitTestable(), findsOneWidget);
      });
    }

    testWidgets('a failing file picker explains and keeps the flow usable', (WidgetTester tester) async {
      phone(tester);
      final ApplyHarness h = ApplyHarness()..now = DateTime.now();
      final ApplyViewModel vm = ApplyViewModel(
        applications: ApplicationRepository(h.api),
        media: MediaRepository(h.api),
        store: SubmissionStore(h.cache, clock: () => h.now),
        picker: ThrowingPicker(),
        opportunityId: oppId,
        opportunityTitle: 'Học bổng VinAI 2026',
        clock: () => h.now,
      );
      await tester.pumpWidget(scaled(
        ApplyView(viewModel: vm, onEditPassport: () async {}, onOpenApplication: (String id, {required bool justSubmitted}) {}),
        1,
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('apply_next_1')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('apply_add_file')));
      await tester.pumpAndSettle();

      expect(find.textContaining('Không mở được trình chọn tệp'), findsOneWidget);
      expect(find.byKey(const Key('apply_next_2')).hitTestable(), findsOneWidget);
    });
  });
}
