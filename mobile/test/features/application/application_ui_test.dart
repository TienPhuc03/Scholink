import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/features/application/application_model.dart';
import 'package:scholink_mobile/features/application/apply_view.dart';

import 'apply_test_support.dart';

void main() {
  group('ApplicationDetail parsing', () {
    test('timeline is oldest first and maps gRPC defaults', () {
      final ApplicationDetail d = ApplicationDetail.fromJson(<String, dynamic>{
        'id': 'app_1',
        'opportunityId': oppId,
        'opportunityTitle': 'Học bổng VinAI 2026',
        'opportunityType': 'SCHOLARSHIP',
        'status': 'REVIEWING',
        'screening': 'ELIGIBLE',
        'submittedAt': '2026-11-07T02:00:00.000Z',
        'revision': 1,
        'teamId': '',
        'events': <Map<String, dynamic>>[
          <String, dynamic>{'id': 'e2', 'toStatus': 'REVIEWING', 'fromStatus': 'SUBMITTED', 'createdAt': '2026-11-07T05:00:00.000Z'},
          <String, dynamic>{'id': 'e1', 'toStatus': 'SUBMITTED', 'fromStatus': '', 'createdAt': '2026-11-07T02:00:00.000Z'},
        ],
      });
      expect(d.events.map((ApplicationEvent e) => e.id), <String>['e1', 'e2']);
      expect(d.events.first.fromStatus, isNull);
      expect(d.summary.displayTitle, 'Học bổng VinAI 2026');
      expect(d.summary.typeLabel, 'Học bổng');
      expect(d.summary.isTeam, isFalse);
    });
  });

  testWidgets('Nộp hồ sơ button is disabled until consent is ticked', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);

    final ApplyHarness h = ApplyHarness()..now = DateTime.now();
    await tester.pumpWidget(MaterialApp(
      home: ApplyView(
        viewModel: h.build(),
        onEditPassport: () async {},
        onOpenApplication: (String id, {required bool justSubmitted}) {},
      ),
    ));
    await tester.pump();
    await tester.pump();

    await tester.tap(find.byKey(const Key('apply_next_1')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('apply_next_2')));
    await tester.pump();
    await tester.pump();

    ElevatedButton submit() => tester.widget<ElevatedButton>(
          find.descendant(of: find.byKey(const Key('apply_submit')), matching: find.byType(ElevatedButton)),
        );
    expect(find.text('Nguyễn Văn A'), findsOneWidget);
    expect(submit().onPressed, isNull);

    await tester.tap(find.byKey(const Key('apply_consent')));
    await tester.pump();
    expect(submit().onPressed, isNotNull);

    // Stop the countdown timer before the test ends.
    await tester.pumpWidget(const SizedBox());
  });
}
