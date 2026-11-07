import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/features/application/application_detail_view.dart';
import 'package:scholink_mobile/features/application/application_model.dart';
import 'package:scholink_mobile/features/application/application_repository.dart';
import 'package:scholink_mobile/features/application/application_snapshot_view.dart';
import 'package:scholink_mobile/features/application/apply_viewmodel.dart';
import 'package:scholink_mobile/features/application/my_applications_viewmodel.dart';
import 'package:scholink_mobile/features/auth/widgets/login_required_sheet.dart';

import '../auth/auth_test_fakes.dart';
import 'apply_test_support.dart';

const String appId = 'app_1';

Map<String, dynamic> revisionJson(int n, {Map<String, dynamic>? snapshot, List<dynamic>? manifest}) =>
    <String, dynamic>{
      'id': 'rev_$n',
      'revision': n,
      'snapshotId': 'snap_$n',
      'profileVersion': n + 3,
      'ruleVersion': 2,
      'payloadHash': 'p' * 64,
      'consentId': 'cns_$n',
      'screening': 'ELIGIBLE',
      'submittedAt': '2026-11-0${n}T02:00:00.000Z',
      'snapshotJson': jsonEncode(snapshot ??
          <String, dynamic>{'studentId': 'stu_1', 'fullName': 'Nguyễn Văn A lần $n', 'completionScore': 80}),
      'manifestJson': jsonEncode(manifest ?? <dynamic>[]),
      'screeningReasons': <dynamic>[],
    };

Map<String, dynamic> detailJson({
  String status = 'SUBMITTED',
  int revision = 1,
  bool canWithdraw = false,
  bool canResubmit = false,
  bool viewerIsOwner = true,
  String submissionType = 'INDIVIDUAL',
  String deadline = '2026-12-01T16:59:59.000Z',
  List<Map<String, dynamic>>? revisions,
  List<Map<String, dynamic>>? events,
}) =>
    <String, dynamic>{
      'id': appId,
      'opportunityId': oppId,
      'opportunityTitle': 'Học bổng VinAI 2026',
      'opportunityType': 'SCHOLARSHIP',
      'submissionType': submissionType,
      'status': status,
      'screening': 'ELIGIBLE',
      'submittedAt': '2026-11-0${revision}T02:00:00.000Z',
      'revision': revision,
      'registrationDeadline': deadline,
      'viewerIsOwner': viewerIsOwner,
      'canWithdraw': canWithdraw,
      'canResubmit': canResubmit,
      'revisions': revisions ?? <Map<String, dynamic>>[for (int i = 1; i <= revision; i++) revisionJson(i)],
      'events': events ?? <Map<String, dynamic>>[],
    };

void main() {
  group('ApplicationRevision parsing', () {
    test('revisions are newest first and keep each submitted Passport', () {
      final ApplicationDetail d = ApplicationDetail.fromJson(detailJson(
        status: 'SUBMITTED',
        revision: 2,
        canWithdraw: true,
        revisions: <Map<String, dynamic>>[
          revisionJson(1),
          revisionJson(2, manifest: <dynamic>[
            <String, dynamic>{'assetId': 'ast_cv'},
            <String, dynamic>{'assetId': 'ast_ielts'},
          ]),
        ],
      ));

      expect(d.revisions.map((ApplicationRevision r) => r.revision), <int>[2, 1]);
      expect(d.revisions.first.passport!.fullName, 'Nguyễn Văn A lần 2');
      expect(d.revisions.last.passport!.fullName, 'Nguyễn Văn A lần 1');
      expect(d.revisions.first.attachmentIds, <String>['ast_cv', 'ast_ielts']);
      expect(d.revisionNumber(1)!.snapshotId, 'snap_1');
      expect(d.canWithdraw, isTrue);
      expect(d.canResubmit, isFalse);
      expect(d.registrationDeadline, DateTime.parse('2026-12-01T16:59:59.000Z').toLocal());
    });

    test('a purged revision is marked redacted and exposes no content', () {
      final ApplicationRevision r = ApplicationRevision.fromJson(revisionJson(1,
          snapshot: <String, dynamic>{'studentId': 'stu_1', 'redacted': true, 'trackingId': null}));

      expect(r.isRedacted, isTrue);
      expect(r.passport, isNull);
      expect(r.isTeam, isFalse);
    });

    test('a team revision lists every member with the leader and their files', () {
      final ApplicationRevision r = ApplicationRevision.fromJson(revisionJson(
        1,
        snapshot: <String, dynamic>{
          'teamId': 'team_1',
          'leaderId': 'stu_1',
          'rosterVersion': 3,
          'members': <dynamic>[
            <String, dynamic>{
              'studentId': 'stu_1',
              'profileVersion': 5,
              'snapshot': <String, dynamic>{'fullName': 'Trưởng Đội'},
            },
            <String, dynamic>{
              'studentId': 'stu_2',
              'profileVersion': 2,
              'snapshot': <String, dynamic>{'fullName': ''},
            },
          ],
        },
        manifest: <dynamic>[
          <String, dynamic>{
            'studentId': 'stu_1',
            'manifest': <dynamic>[
              <String, dynamic>{'assetId': 'ast_a'},
            ],
          },
          <String, dynamic>{'studentId': 'stu_2', 'manifest': <dynamic>[]},
        ],
      ));

      expect(r.isTeam, isTrue);
      expect(r.rosterVersion, 3);
      expect(r.leaderId, 'stu_1');
      expect(r.members.map((TeamMemberSnapshot m) => m.displayName), <String>['Trưởng Đội', 'stu_2']);
      expect(r.members.first.attachmentIds, <String>['ast_a']);
      expect(r.attachmentCount, 1);
    });

    test('timeline reasons are translated and organizer notes kept', () {
      ApplicationEvent e(String? reason) => ApplicationEvent.fromJson(
          <String, dynamic>{'id': 'e', 'toStatus': 'SUBMITTED', 'revision': 1, 'reason': reason ?? ''});

      expect(e('STUDENT_WITHDRAWN').reasonLabel, 'Bạn đã rút hồ sơ');
      expect(e('STUDENT_RESUBMITTED').reasonLabel, 'Nộp lại');
      expect(e('STUDENT_RESUBMITTED').isSubmission, isTrue);
      expect(e('TEAM_LEADER_WITHDRAWN').reasonLabel, 'Trưởng đội đã rút hồ sơ');
      expect(e('Hồ sơ rất tốt').reasonLabel, 'Ghi chú: Hồ sơ rất tốt');
      expect(e(null).reasonLabel, isNull);
      expect(e('STUDENT_WITHDRAWN').isSubmission, isFalse);
    });
  });

  group('Withdraw (ApplicationDetailViewModel)', () {
    late ScriptedApiClient api;
    late ApplicationRepository repo;
    late String status;

    setUp(() {
      api = ScriptedApiClient();
      repo = ApplicationRepository(api);
      status = 'SUBMITTED';
      api.handlers[ApiEndpoints.applicationDetail(appId)] = (_) => detailJson(
            status: status,
            canWithdraw: status == 'SUBMITTED',
            canResubmit: status == 'WITHDRAWN',
          );
    });

    test('success reloads the detail and tells other screens', () async {
      final ApplicationDetailViewModel vm = ApplicationDetailViewModel(repo, applicationId: appId);
      final MyApplicationsViewModel list = MyApplicationsViewModel(repo);
      api.reply(ApiEndpoints.myApplications, <dynamic>[]);
      await vm.load();
      api.handlers[ApiEndpoints.withdrawApplication(appId)] = (_) {
        status = 'WITHDRAWN';
        return <String, dynamic>{'applicationId': appId, 'status': 'WITHDRAWN', 'revision': 1, 'version': 2};
      };

      final String? message = await vm.withdraw();
      await pumpEventQueue();

      expect(message, isNull);
      expect(vm.detail!.summary.status, ApplicationStatus.withdrawn);
      expect(vm.detail!.canResubmit, isTrue);
      expect(api.callsTo(ApiEndpoints.myApplications), hasLength(1), reason: 'cached list reloads');
      list.dispose();
      vm.dispose();
    });

    test('409 because it was already withdrawn counts as done (Q3)', () async {
      final ApplicationDetailViewModel vm = ApplicationDetailViewModel(repo, applicationId: appId);
      await vm.load();
      api.handlers[ApiEndpoints.withdrawApplication(appId)] = (_) {
        status = 'WITHDRAWN';
        return const ServerFailure(message: 'Không thể rút hồ sơ đã ở trạng thái WITHDRAWN', code: 'STATE_CONFLICT', statusCode: 409);
      };

      expect(await vm.withdraw(), isNull);
      expect(vm.detail!.summary.status, ApplicationStatus.withdrawn);
      vm.dispose();
    });

    test('deadline passed shows a clear message and refreshes the actions', () async {
      final ApplicationDetailViewModel vm = ApplicationDetailViewModel(repo, applicationId: appId);
      await vm.load();
      api.reply(ApiEndpoints.withdrawApplication(appId),
          const ServerFailure(message: 'Không thể rút hồ sơ sau khi cơ hội đã hết hạn đăng ký', code: 'DEADLINE_PASSED', statusCode: 409));

      expect(await vm.withdraw(), 'Đã hết hạn đăng ký nên không thể rút hồ sơ.');
      expect(api.callsTo(ApiEndpoints.applicationDetail(appId)), hasLength(2));
      vm.dispose();
    });
  });

  test('apply flow knows it resubmits a withdrawn application as the next revision', () async {
    final ApplyHarness h = ApplyHarness();
    h.api.reply(ApiEndpoints.myApplications, <dynamic>[
      <String, dynamic>{
        'id': appId,
        'opportunityId': oppId,
        'status': 'WITHDRAWN',
        'submissionType': 'INDIVIDUAL',
        'revision': 2,
        'submittedAt': '2026-11-02T02:00:00.000Z',
      },
    ]);
    final ApplyViewModel vm = h.build();
    await vm.start();

    expect(vm.existingApplication, isNull);
    expect(vm.resubmitRevision, 3);
    expect(vm.step, ApplyStep.readiness);
    vm.dispose();
  });

  group('ApplicationDetailView', () {
    late ScriptedApiClient api;

    setUp(() => api = ScriptedApiClient());

    Future<ApplicationDetailViewModel> pumpDetail(
      WidgetTester tester,
      Map<String, dynamic> json, {
      void Function(ApplicationDetail d)? onResubmit,
      void Function(ApplicationDetail d, ApplicationRevision r)? onOpenRevision,
    }) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.5;
      addTearDown(tester.view.reset);
      api.reply(ApiEndpoints.applicationDetail(appId), json);
      final ApplicationDetailViewModel vm = ApplicationDetailViewModel(ApplicationRepository(api), applicationId: appId);
      await tester.pumpWidget(MaterialApp(
        home: ApplicationDetailView(viewModel: vm, onResubmit: onResubmit, onOpenRevision: onOpenRevision),
      ));
      await tester.pump();
      await tester.pump();
      return vm;
    }

    testWidgets('withdraw asks for confirmation before calling the API', (WidgetTester tester) async {
      await pumpDetail(tester, detailJson(canWithdraw: true));
      api.reply(ApiEndpoints.withdrawApplication(appId), <String, dynamic>{'status': 'WITHDRAWN'});

      await tester.tap(find.byKey(const Key('detail_withdraw')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Lần nộp lại sẽ là lần 2'), findsOneWidget);
      expect(api.callsTo(ApiEndpoints.withdrawApplication(appId)), isEmpty);

      await tester.tap(find.byKey(const Key('detail_withdraw_confirm')));
      await tester.pumpAndSettle();
      expect(api.callsTo(ApiEndpoints.withdrawApplication(appId)), hasLength(1));
      expect(find.textContaining('Đã rút hồ sơ'), findsOneWidget);
    });

    testWidgets('resubmit button names the next revision', (WidgetTester tester) async {
      ApplicationDetail? resubmitted;
      await pumpDetail(
        tester,
        detailJson(status: 'WITHDRAWN', canResubmit: true),
        onResubmit: (ApplicationDetail d) => resubmitted = d,
      );

      expect(find.text('Nộp lại (lần 2)'), findsOneWidget);
      expect(find.byKey(const Key('detail_withdraw')), findsNothing);
      await tester.tap(find.byKey(const Key('detail_resubmit')));
      expect(resubmitted!.summary.opportunityId, oppId);
    });

    testWidgets('a team member sees why there is no action (Q8)', (WidgetTester tester) async {
      await pumpDetail(tester, detailJson(submissionType: 'TEAM', viewerIsOwner: false));

      expect(find.text('Chỉ trưởng đội có thể rút hồ sơ của đội.'), findsOneWidget);
      expect(find.byKey(const Key('detail_withdraw')), findsNothing);
    });

    testWidgets('after the deadline the bar explains it', (WidgetTester tester) async {
      await pumpDetail(tester, detailJson(deadline: '2020-01-01T00:00:00.000Z'));

      expect(find.textContaining('Đã hết hạn đăng ký'), findsOneWidget);
    });

    testWidgets('revisions and timeline entries open the submitted snapshot', (WidgetTester tester) async {
      final List<int> opened = <int>[];
      await pumpDetail(
        tester,
        detailJson(
          revision: 2,
          canWithdraw: true,
          events: <Map<String, dynamic>>[
            <String, dynamic>{'id': 'e1', 'toStatus': 'SUBMITTED', 'revision': 1, 'reason': 'INITIAL_SUBMISSION',
              'createdAt': '2026-11-01T02:00:00.000Z'},
            <String, dynamic>{'id': 'e2', 'toStatus': 'WITHDRAWN', 'revision': 1, 'reason': 'STUDENT_WITHDRAWN',
              'createdAt': '2026-11-01T05:00:00.000Z'},
            <String, dynamic>{'id': 'e3', 'toStatus': 'SUBMITTED', 'revision': 2, 'reason': 'STUDENT_RESUBMITTED',
              'createdAt': '2026-11-02T02:00:00.000Z'},
          ],
        ),
        onOpenRevision: (ApplicationDetail d, ApplicationRevision r) => opened.add(r.revision),
      );

      expect(find.text('Bạn đã rút hồ sơ'), findsOneWidget);
      expect(find.text('Hiện tại'), findsOneWidget);
      await tester.tap(find.byKey(const Key('detail_revision_1')));
      await tester.tap(find.byKey(const Key('timeline_open_revision_2')));
      expect(opened, <int>[1, 2]);
    });
  });

  group('ApplicationSnapshotView', () {
    Future<void> pumpSnapshot(WidgetTester tester, ApplicationRevision r) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.5;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(
        home: ApplicationSnapshotView(opportunityTitle: 'Học bổng VinAI 2026', revision: r),
      ));
    }

    testWidgets('shows the Passport as submitted and its files', (WidgetTester tester) async {
      await pumpSnapshot(
        tester,
        ApplicationRevision.fromJson(revisionJson(1, manifest: <dynamic>[
          <String, dynamic>{'assetId': 'ast_cv'},
        ])),
      );

      expect(find.text('Bản đã nộp · lần 1'), findsOneWidget);
      expect(find.text('Nguyễn Văn A lần 1'), findsOneWidget);
      expect(find.text('Tệp đính kèm (1)'), findsOneWidget);
    });

    testWidgets('explains a snapshot removed by retention', (WidgetTester tester) async {
      await pumpSnapshot(
        tester,
        ApplicationRevision.fromJson(revisionJson(1, snapshot: <String, dynamic>{'redacted': true})),
      );

      expect(find.byKey(const Key('snapshot_redacted')), findsOneWidget);
    });

    testWidgets('a team snapshot expands per member with the leader marked', (WidgetTester tester) async {
      await pumpSnapshot(
        tester,
        ApplicationRevision.fromJson(revisionJson(1, snapshot: <String, dynamic>{
          'leaderId': 'stu_1',
          'rosterVersion': 2,
          'members': <dynamic>[
            <String, dynamic>{'studentId': 'stu_1', 'profileVersion': 5, 'snapshot': <String, dynamic>{'fullName': 'Trưởng Đội'}},
            <String, dynamic>{'studentId': 'stu_2', 'profileVersion': 2, 'snapshot': <String, dynamic>{'fullName': 'Thành Viên'}},
          ],
        })),
      );

      expect(find.text('Danh sách đội · phiên bản 2'), findsOneWidget);
      expect(find.text('Trưởng đội'), findsOneWidget);
      await tester.tap(find.byKey(const Key('snapshot_member_stu_2')));
      await tester.pumpAndSettle();
      expect(find.text('Thành Viên'), findsNWidgets(2));
    });
  });

  testWidgets('login sheet returns the guest choice (AUTH-05)', (WidgetTester tester) async {
    final List<LoginChoice?> choices = <LoginChoice?>[];
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (BuildContext context) => TextButton(
          onPressed: () async => choices.add(await LoginRequiredSheet.show(context, message: 'Đăng nhập để nộp')),
          child: const Text('open'),
        ),
      ),
    ));

    for (final String key in <String>['login_required_go', 'login_required_register', 'login_required_later']) {
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(Key(key)));
      await tester.pumpAndSettle();
    }

    expect(choices, <LoginChoice?>[LoginChoice.login, LoginChoice.register, null]);
  });
}
