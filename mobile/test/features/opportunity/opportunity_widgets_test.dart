import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/database/room_database.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/features/notification/notification_inbox_view.dart';
import 'package:scholink_mobile/features/notification/notification_repository.dart';
import 'package:scholink_mobile/features/notification/notification_settings_view.dart';
import 'package:scholink_mobile/features/notification/notification_viewmodel.dart';
import 'package:scholink_mobile/features/notification/reminder_settings_sheet.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_detail_view.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_list_view.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_model.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_repository.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_viewmodel.dart';
import 'package:scholink_mobile/features/opportunity/widgets/opportunity_card.dart';

import '../tv2_test_support.dart';

OpportunityModel external({Duration deadlineIn = const Duration(days: 3)}) => OpportunityModel(
      id: 'comp-ext-1',
      type: OpportunityType.competition,
      title: 'Cuộc thi Hackathon Quốc Tế',
      description: 'Mô tả cuộc thi',
      organizerName: 'Ban tổ chức Quốc tế',
      applyMode: 'EXTERNAL',
      registerDeadline: DateTime.now().add(deadlineIn).toIso8601String(),
      sourceUrl: 'https://hackathon.org/apply',
      eligibilityRules: const <String>['Sinh viên năm 1-4'],
    );

void phone(WidgetTester tester, {bool landscape = false}) {
  tester.view.physicalSize = landscape ? const Size(2400, 1080) : const Size(1080, 2400);
  tester.view.devicePixelRatio = 2.5;
  addTearDown(tester.view.reset);
}

Widget scaled(Widget home, {double scale = 1}) => MaterialApp(
      builder: (BuildContext context, Widget? child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
        child: child!,
      ),
      home: home,
    );

void main() {
  late ScriptedApiClient api;
  late RoomDatabase db;
  late OpportunityViewModel vm;

  setUp(() {
    api = ScriptedApiClient()
      ..reply(ApiEndpoints.opportunities, <String, dynamic>{
        'items': <dynamic>[
          oppJson('o1', title: 'Học bổng Tài năng Công nghệ Thông tin Quốc gia rất dài'),
          oppJson('o2', type: 'COMPETITION', applyMode: 'EXTERNAL', title: 'Cuộc thi'),
        ],
        'hasMore': false,
      });
    db = RoomDatabaseImpl(InMemoryCacheManager());
    vm = OpportunityViewModel(OpportunityRepository(apiClient: api, roomDb: db), searchDebounce: Duration.zero);
  });

  group('Catalog widgets (F02/F11/F29)', () {
    testWidgets('OpportunityCard renders scholarship properly with text deadline badge', (WidgetTester tester) async {
      final OpportunityModel opp = OpportunityModel(
        id: 'schol-card-1',
        type: OpportunityType.scholarship,
        title: 'Học bổng Xuất sắc 2026',
        description: 'Mô tả chi tiết',
        organizerName: 'Tổ chức ABC',
        applyMode: 'IN_APP',
        registerDeadline: DateTime.now().add(const Duration(days: 4)).toIso8601String(),
        tags: const <String>['IT', 'Full'],
      );

      await tester.pumpWidget(MaterialApp(home: Scaffold(body: OpportunityCard(item: opp, onTap: () {}))));

      expect(find.text('HỌC BỔNG'), findsOneWidget);
      expect(find.text('Nộp Online'), findsOneWidget);
      expect(find.text('Học bổng Xuất sắc 2026'), findsOneWidget);
      expect(find.text('Tổ chức ABC'), findsOneWidget);
      expect(find.textContaining('CÒN'), findsOneWidget);
      expect(find.text('#IT'), findsOneWidget);
    });

    testWidgets('TalkBack reads the card as one sentence and the bookmark as its own button',
        (WidgetTester tester) async {
      final SemanticsHandle semantics = tester.ensureSemantics();
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: OpportunityCard(item: external(), onTap: () {}, onBookmarkTap: () {})),
      ));

      expect(
        find.bySemanticsLabel(RegExp(r'^Cuộc thi, Cuộc thi Hackathon Quốc Tế, .*đăng ký tại website nguồn, còn \d+ ngày')),
        findsOneWidget,
      );
      expect(find.byTooltip('Lưu Cuộc thi Hackathon Quốc Tế'), findsOneWidget);
      semantics.dispose();
    });

    testWidgets('offline: the list stays with a banner telling when it was saved', (WidgetTester tester) async {
      phone(tester);
      await tester.pumpWidget(scaled(OpportunityListView(viewModel: vm)));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey<String>('opp_card_o1')), findsOneWidget);

      api.reply(ApiEndpoints.opportunities, const NetworkFailure());
      await tester.tap(find.byTooltip('Làm mới danh sách'));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey<String>('opp_card_o1')), findsOneWidget);
      expect(find.byKey(const Key('opportunity_cache_banner')), findsOneWidget);
      expect(find.byKey(const Key('refresh_error_banner')), findsOneWidget);
    });

    testWidgets('no network and nothing saved: error state with retry that keeps the filter',
        (WidgetTester tester) async {
      phone(tester);
      api.reply(ApiEndpoints.opportunities, const NetworkFailure());
      await tester.pumpWidget(scaled(OpportunityListView(viewModel: vm)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('🏆 Cuộc thi'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('opportunity_error_state')), findsOneWidget);
      expect(find.textContaining('Bộ lọc hiện tại vẫn được giữ nguyên'), findsOneWidget);

      api.reply(ApiEndpoints.opportunities, <String, dynamic>{'items': <dynamic>[oppJson('c9', type: 'COMPETITION')]});
      await tester.tap(find.byKey(const Key('opportunity_retry')));
      await tester.pumpAndSettle();

      expect(api.callsTo(ApiEndpoints.opportunities).last.query!['type'], 'COMPETITION');
      expect(find.byKey(const ValueKey<String>('opp_card_c9')), findsOneWidget);
    });

    testWidgets('rotating the phone keeps search text, filters and results', (WidgetTester tester) async {
      phone(tester);
      await tester.pumpWidget(scaled(OpportunityListView(viewModel: vm)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('opportunity_search')), 'Cuộc thi');
      await tester.ensureVisible(find.text('Nguồn ngoài'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Nguồn ngoài'));
      await tester.pumpAndSettle();
      final int callsBefore = api.calls.length;

      phone(tester, landscape: true);
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.widgetWithText(TextField, 'Cuộc thi'), findsOneWidget);
      expect(vm.selectedApplyMode, 'EXTERNAL');
      expect(api.calls.length, callsBefore, reason: 'rotation does not reload or reset the list');
    });

    testWidgets('guest bookmark asks to log in instead of calling the API', (WidgetTester tester) async {
      phone(tester);
      OpportunityModel? asked;
      await tester.pumpWidget(scaled(OpportunityListView(
        viewModel: vm,
        isGuest: true,
        onBookmarkNeedsLogin: (OpportunityModel o) => asked = o,
      )));
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip(RegExp(r'^Lưu Học bổng')).first);
      await tester.pump();

      expect(asked?.id, 'o1');
      expect(api.calls.where((RecordedCall c) => c.method == 'POST'), isEmpty);
      expect(find.text('⭐ Đã lưu'), findsNothing, reason: 'guests have no saved list');
    });
  });

  group('Detail (APP-04, BR11)', () {
    testWidgets('external source opens only the public URL after the safety dialog', (WidgetTester tester) async {
      phone(tester);
      final List<Uri> opened = <Uri>[];
      await tester.pumpWidget(MaterialApp(
        home: OpportunityDetailView(
          opportunity: external(),
          viewModel: vm,
          openLink: (Uri u) async {
            opened.add(u);
            return true;
          },
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Chi tiết Cuộc thi'), findsOneWidget);
      expect(find.text('https://hackathon.org/apply'), findsOneWidget);

      await tester.ensureVisible(find.byKey(const Key('detail_open_source')));
      await tester.tap(find.byKey(const Key('detail_open_source')));
      await tester.pumpAndSettle();
      expect(find.text('Chuyển hướng an toàn'), findsOneWidget);
      expect(find.textContaining('Scholink tuyệt đối KHÔNG đính kèm Access Token'), findsOneWidget);

      await tester.tap(find.byKey(const Key('detail_open_source_confirm')));
      await tester.pumpAndSettle();
      expect(opened, <Uri>[Uri.parse('https://hackathon.org/apply')]);
    });

    testWidgets('a closed IN_APP opportunity cannot be applied to', (WidgetTester tester) async {
      phone(tester);
      bool applied = false;
      final OpportunityModel closed = OpportunityModel.fromJson(oppJson('old', deadlineIn: const Duration(days: -1)));
      await tester.pumpWidget(MaterialApp(
        home: OpportunityDetailView(opportunity: closed, viewModel: vm, onApplyInApp: () => applied = true),
      ));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('detail_apply')));

      expect(find.text('Đã đóng đăng ký'), findsOneWidget);
      await tester.tap(find.byKey(const Key('detail_apply')));
      expect(applied, isFalse);
    });

    testWidgets('no fake "submitted" message when the apply flow is not connected', (WidgetTester tester) async {
      phone(tester);
      final OpportunityModel open = OpportunityModel.fromJson(oppJson('open'));
      await tester.pumpWidget(MaterialApp(home: OpportunityDetailView(opportunity: open, viewModel: vm)));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('detail_apply')));
      await tester.tap(find.byKey(const Key('detail_apply')));
      await tester.pumpAndSettle();

      expect(find.textContaining('thành công'), findsNothing);
      expect(find.textContaining('Không có dữ liệu nào được gửi đi'), findsOneWidget);
    });
  });

  group('Large text keeps actions usable (UX-03, F38)', () {
    for (final double scale in <double>[1.3, 2.0]) {
      testWidgets('catalog list at text scale $scale', (WidgetTester tester) async {
        phone(tester);
        await tester.pumpWidget(scaled(OpportunityListView(viewModel: vm), scale: scale));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.byTooltip(RegExp(r'^Lưu Học bổng')).hitTestable(), findsOneWidget);
      });

      testWidgets('detail keeps "Nộp hồ sơ" reachable at text scale $scale', (WidgetTester tester) async {
        phone(tester);
        final OpportunityModel open = OpportunityModel.fromJson(oppJson('open'));
        await tester.pumpWidget(scaled(
          OpportunityDetailView(opportunity: open, viewModel: vm, onApplyInApp: () {}, onOpenReminderSettings: () {}),
          scale: scale,
        ));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byKey(const Key('detail_apply')));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.byKey(const Key('detail_apply')).hitTestable(), findsOneWidget);
        expect(find.byKey(const Key('detail_bookmark')).hitTestable(), findsOneWidget);
      });

      testWidgets('inbox and settings at text scale $scale', (WidgetTester tester) async {
        phone(tester);
        final ScriptedApiClient napi = ScriptedApiClient()
          ..reply(ApiEndpoints.notifications, <dynamic>[
            <String, dynamic>{
              'id': 'n1',
              'type': 'DEADLINE_REMINDER',
              'title': 'Nhắc hạn: Học bổng Tài năng Công nghệ Thông tin Quốc gia',
              'body': 'Còn 3 ngày là đóng đăng ký.',
              'refUrl': '/opportunities/o1',
              'createdAt': DateTime.now().toUtc().toIso8601String(),
            },
          ])
          ..reply(ApiEndpoints.notificationPreferences, <String, dynamic>{'timezone': 'Asia/Ho_Chi_Minh'});
        final NotificationViewModel nvm = NotificationViewModel(
          NotificationRepository(apiClient: napi, roomDb: db, calendar: FakeDeviceCalendar()),
        );

        await tester.pumpWidget(scaled(
          NotificationInboxView(viewModel: nvm, onOpenSettings: () {}, onOpenTarget: (_) {}),
          scale: scale,
        ));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byKey(const ValueKey<String>('noti_n1')).hitTestable(), findsOneWidget);

        await tester.pumpWidget(scaled(NotificationSettingsView(viewModel: nvm), scale: scale));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.scrollUntilVisible(find.byKey(const Key('prefs_save')), 200,
            scrollable: find.byType(Scrollable).first);
        expect(find.byKey(const Key('prefs_save')).hitTestable(), findsOneWidget);
      });

      testWidgets('reminder sheet at text scale $scale: denied permission is an error, not success',
          (WidgetTester tester) async {
        phone(tester);
        final FakeDeviceCalendar device = FakeDeviceCalendar(calendarGranted: false, grantOnRequest: false);
        final NotificationViewModel nvm = NotificationViewModel(
          NotificationRepository(apiClient: ScriptedApiClient(), roomDb: db, calendar: device),
        );
        final OpportunityModel open = OpportunityModel.fromJson(oppJson('open'));
        await tester.pumpWidget(scaled(
          Scaffold(
            body: Builder(
              builder: (BuildContext context) => TextButton(
                onPressed: () => ReminderSettingsSheet.show(context, opportunity: open, viewModel: nvm),
                child: const Text('open'),
              ),
            ),
          ),
          scale: scale,
        ));
        await tester.tap(find.text('open'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byKey(const Key('calendar_save')));
        await tester.tap(find.byKey(const Key('calendar_save')));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.textContaining('Từ chối quyền Lịch thiết bị'), findsOneWidget);
        expect(find.textContaining('Đã lưu hạn chót'), findsNothing);
        expect(device.events, isEmpty);
      });
    }
  });
}
