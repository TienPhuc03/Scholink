import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/features/application/application_repository.dart';
import 'package:scholink_mobile/features/application/submission_store.dart';
import 'package:scholink_mobile/features/application/team_submission_model.dart';
import 'package:scholink_mobile/features/application/team_submission_repository.dart';
import 'package:scholink_mobile/features/application/team_submission_view.dart';
import 'package:scholink_mobile/features/application/team_submission_viewmodel.dart';

import '../auth/auth_test_fakes.dart';
import 'apply_test_support.dart';

const String compId = 'opp_comp_1';
const String teamId = 'team_1';
const String leader = 'stu_leader';
const String member = 'stu_member';

Map<String, dynamic> teamJson() => <String, dynamic>{
      'id': teamId,
      'competitionId': compId,
      'name': 'Đội AI',
      'leaderId': leader,
      'minSize': 2,
      'maxSize': 4,
      'status': 'ACTIVE',
      'members': <Map<String, dynamic>>[
        <String, dynamic>{'studentId': leader, 'role': 'LEADER'},
        <String, dynamic>{'studentId': member, 'role': 'MEMBER'},
      ],
    };

Map<String, dynamic> consentJson(String studentId, DateTime at, {bool withIds = true}) => <String, dynamic>{
      'studentId': studentId,
      'previewId': withIds ? 'prv_$studentId' : '',
      'identityConsentId': withIds ? 'cns_$studentId' : '',
      'snapshotId': 'snap_$studentId',
      'profileVersion': 2,
      'payloadHash': 'h' * 64,
      'confirmedAt': at.toUtc().toIso8601String(),
    };

Map<String, dynamic> statusJson({
  bool active = true,
  String teamStatus = 'SUBMITTING',
  DateTime? leaseEnd,
  List<Map<String, dynamic>> consents = const <Map<String, dynamic>>[],
  String reservationId = 'res_1',
}) =>
    <String, dynamic>{
      'active': active,
      'teamId': teamId,
      'teamStatus': teamStatus,
      'leaderId': leader,
      if (active) ...<String, dynamic>{
        'reservationId': reservationId,
        'competitionId': compId,
        'status': 'PENDING',
        'expired': false,
        'leaseExpiresAt': (leaseEnd ?? DateTime.now().add(const Duration(minutes: 8))).toUtc().toIso8601String(),
        'fencingToken': 3,
        'rosterVersion': 2,
        'members': <String>[leader, member],
        'consents': consents,
      },
    };

class TeamHarness {
  final ScriptedApiClient api = ScriptedApiClient();
  final MemoryCache cache = MemoryCache();
  DateTime now = DateTime.now();
  String userId = leader;
  int keys = 0;

  TeamHarness() {
    api.reply(ApiEndpoints.teamDetail(teamId), teamJson());
    api.reply(ApiEndpoints.teamSubmission(teamId), statusJson(active: false, teamStatus: 'ACTIVE'));
    api.reply(ApiEndpoints.readiness, readinessBody());
    api.reply(ApiEndpoints.myApplications, <dynamic>[]);
  }

  SubmissionStore store() => SubmissionStore(cache, clock: () => now, currentUserId: () async => userId);

  TeamSubmissionViewModel build() => TeamSubmissionViewModel(
        repository: TeamSubmissionRepository(api, ApplicationRepository(api)),
        store: store(),
        currentUserId: () async => userId,
        teamId: teamId,
        competitionTitle: 'Scholink AI Challenge 2026',
        clock: () => now,
        newKey: () => 'key_${++keys}',
        tick: null,
      );
}

void main() {
  group('TeamSubmissionStatus', () {
    test('a consent older than the preview lifetime or without ids needs renewal (Q16)', () {
      final DateTime now = DateTime.now();
      final TeamSubmissionStatus s = TeamSubmissionStatus.fromJson(statusJson(consents: <Map<String, dynamic>>[
        consentJson(leader, now.subtract(const Duration(minutes: 1))),
        consentJson(member, now.subtract(const Duration(minutes: 11))),
      ]));

      expect(s.stateOf(leader, now), MemberConsentState.given);
      expect(s.stateOf(member, now), MemberConsentState.needsRenewal);
      expect(s.allReady(now), isFalse);

      final TeamSubmissionStatus legacy = TeamSubmissionStatus.fromJson(
          statusJson(consents: <Map<String, dynamic>>[consentJson(member, now, withIds: false)]));
      expect(legacy.stateOf(member, now), MemberConsentState.needsRenewal);
      expect(legacy.stateOf(leader, now), MemberConsentState.missing);
    });

    test('the commit body carries every member preview and Identity consent', () {
      final DateTime now = DateTime.now();
      final Map<String, dynamic> body = TeamSubmissionStatus.fromJson(statusJson(consents: <Map<String, dynamic>>[
        consentJson(leader, now),
        consentJson(member, now),
      ])).buildSubmitBody(expectedRuleVersion: 2);

      expect(body['submissionType'], 'TEAM');
      expect(body['opportunityId'], compId);
      expect(body['submissionId'], 'res_1');
      expect(body['fencingToken'], 3);
      expect(body['rosterVersion'], 2);
      expect((body['memberConsents'] as List<dynamic>).first,
          <String, dynamic>{'studentId': leader, 'previewId': 'prv_stu_leader', 'snapshotId': 'snap_stu_leader',
            'profileVersion': 2, 'payloadHash': 'h' * 64, 'consentId': 'cns_stu_leader'});
    });
  });

  group('TeamSubmissionViewModel', () {
    test('leader freezes the roster; an expired session is cancelled first', () async {
      final TeamHarness h = TeamHarness();
      final TeamSubmissionViewModel vm = h.build();
      await vm.load();
      expect(vm.isLeader, isTrue);
      expect(vm.status!.active, isFalse);

      h.api.reply(ApiEndpoints.teamSubmission(teamId), statusJson());
      await vm.startSubmission();
      expect(h.api.callsTo(ApiEndpoints.prepareTeamSubmission(teamId)), hasLength(1));
      expect(vm.isSessionOpen, isTrue);

      h.now = h.now.add(const Duration(minutes: 9));
      expect(vm.isLeaseOver, isTrue);
      await vm.startSubmission();
      expect(h.api.callsTo(ApiEndpoints.abortTeamSubmission('res_1')), hasLength(1));
      expect(h.api.callsTo(ApiEndpoints.prepareTeamSubmission(teamId)), hasLength(2));
    });

    test('a member previews their own Passport and consents with the preview ids', () async {
      final TeamHarness h = TeamHarness()..userId = member;
      h.api.reply(ApiEndpoints.teamSubmission(teamId), statusJson());
      h.api.handlers[ApiEndpoints.applicationPreviews] = (RecordedCall c) => previewBody(c, previewId: 'prv_m');
      h.api.reply(ApiEndpoints.consents, <String, dynamic>{'consentId': 'cns_m'});
      final TeamSubmissionViewModel vm = h.build();
      await vm.load();
      expect(vm.isLeader, isFalse);

      await vm.createMyPreview();
      final Map<String, dynamic> previewReq = h.api.callsTo(ApiEndpoints.applicationPreviews).single.data as Map<String, dynamic>;
      expect(previewReq['opportunityId'], compId);
      expect(previewReq['submissionId'], 'res_1');
      expect(vm.myPreview!.snapshot.fullName, 'Nguyễn Văn A');

      vm.setConsent(true);
      h.api.reply(ApiEndpoints.teamSubmission(teamId),
          statusJson(consents: <Map<String, dynamic>>[consentJson(member, DateTime.now())]));
      await vm.giveMyConsent();

      final Map<String, dynamic> teamConsent =
          h.api.callsTo(ApiEndpoints.teamSubmissionConsents('res_1')).single.data as Map<String, dynamic>;
      expect(teamConsent['previewId'], 'prv_m');
      expect(teamConsent['identityConsentId'], 'cns_m');
      expect(teamConsent['rosterVersion'], 2);
      expect(vm.myConsentState, MemberConsentState.given);
      expect(vm.actionError, isNull);
    });

    test('leader commit survives a lost response without a second application (Q17)', () async {
      final TeamHarness h = TeamHarness();
      final DateTime at = DateTime.now();
      h.api.reply(ApiEndpoints.teamSubmission(teamId),
          statusJson(consents: <Map<String, dynamic>>[consentJson(leader, at), consentJson(member, at)]));
      int attempts = 0;
      h.api.handlers[ApiEndpoints.applications] = (_) =>
          ++attempts == 1 ? const NetworkFailure() : <String, dynamic>{'applicationId': 'app_team', 'revision': 1, 'status': 'SUBMITTED'};
      final TeamSubmissionViewModel vm = h.build();
      await vm.load();
      expect(vm.canSubmit, isTrue);

      await vm.submit();
      expect(vm.canRetrySubmit, isTrue);

      // App killed: a new screen finds the unconfirmed attempt and resends it as is.
      final TeamSubmissionViewModel again = h.build();
      await again.load();
      expect(again.hasUnconfirmedAttempt, isTrue);
      await again.retrySubmit();

      final List<RecordedCall> sends = h.api.callsTo(ApiEndpoints.applications);
      expect(sends, hasLength(2));
      expect(sends.last.headers['Idempotency-Key'], sends.first.headers['Idempotency-Key']);
      expect(sends.last.data, sends.first.data);
      expect(again.takeCommittedApplicationId(), 'app_team');
    });

    test('submit stays locked while a consent is stale', () async {
      final TeamHarness h = TeamHarness();
      h.api.reply(ApiEndpoints.teamSubmission(teamId), statusJson(consents: <Map<String, dynamic>>[
        consentJson(leader, DateTime.now()),
        consentJson(member, DateTime.now().subtract(const Duration(minutes: 10))),
      ]));
      final TeamSubmissionViewModel vm = h.build();
      await vm.load();

      expect(vm.canSubmit, isFalse);
      await vm.submit();
      expect(h.api.callsTo(ApiEndpoints.applications), isEmpty);
    });
  });

  test('pending submissions are kept per account on a shared device (Q1)', () async {
    final MemoryCache cache = MemoryCache();
    String user = 'stu_a';
    final SubmissionStore store = SubmissionStore(cache, currentUserId: () async => user);
    await store.save(PendingSubmission(opportunityId: compId, submissionId: 'sub_a', createdAt: DateTime.now())
        .withRequest(idempotencyKey: 'key_a', body: <String, dynamic>{'consentId': 'cns_a'}));

    user = 'stu_b';
    expect(await store.load(compId), isNull);

    user = 'stu_a';
    expect((await store.load(compId))!.idempotencyKey, 'key_a');
  });

  group('TeamSubmissionView', () {
    Future<TeamHarness> pumpView(WidgetTester tester, TeamHarness h, {double textScale = 1}) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.5;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(
        builder: (BuildContext context, Widget? child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: TeamSubmissionView(viewModel: h.build(), onOpenApplication: (String id, {required bool justSubmitted}) {}),
      ));
      await tester.pumpAndSettle();
      return h;
    }

    testWidgets('leader sees every member state and a locked submit until all consent', (WidgetTester tester) async {
      final TeamHarness h = TeamHarness();
      h.api.reply(ApiEndpoints.teamSubmission(teamId),
          statusJson(consents: <Map<String, dynamic>>[consentJson(leader, DateTime.now())]));
      await pumpView(tester, h);

      expect(find.text('Đồng ý của thành viên (1/2)'), findsOneWidget);
      expect(find.text('Chưa đồng ý'), findsOneWidget);
      final ElevatedButton submit = tester.widget<ElevatedButton>(
          find.descendant(of: find.byKey(const Key('team_submit')), matching: find.byType(ElevatedButton)));
      expect(submit.onPressed, isNull);
      expect(find.byKey(const Key('team_cancel')), findsOneWidget);
    });

    testWidgets('tapping a teammate opens their profile, but not for yourself (FR-PROF-05)', (WidgetTester tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.5;
      addTearDown(tester.view.reset);
      final TeamHarness h = TeamHarness();
      h.api.reply(ApiEndpoints.teamSubmission(teamId), statusJson());
      final List<String> opened = <String>[];
      await tester.pumpWidget(MaterialApp(
        home: TeamSubmissionView(
          viewModel: h.build(),
          onOpenApplication: (String id, {required bool justSubmitted}) {},
          onOpenMemberProfile: opened.add,
        ),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('team_member_$leader')));
      await tester.tap(find.byKey(const Key('team_member_$member')));
      expect(opened, <String>[member]);
    });

    testWidgets('a member waits for the leader before a session exists', (WidgetTester tester) async {
      await pumpView(tester, TeamHarness()..userId = member);

      expect(find.byKey(const Key('team_waiting_leader')), findsOneWidget);
      expect(find.byKey(const Key('team_start')), findsNothing);
    });

    testWidgets('large text keeps the leader actions on screen (Q7)', (WidgetTester tester) async {
      final TeamHarness h = TeamHarness();
      h.api.reply(ApiEndpoints.teamSubmission(teamId), statusJson());
      await pumpView(tester, h, textScale: 2);

      expect(tester.takeException(), isNull);
      expect(find.byKey(const Key('team_submit')).hitTestable(), findsOneWidget);
      expect(find.byKey(const Key('team_cancel')).hitTestable(), findsOneWidget);
    });

    testWidgets('displays roster version, min/max team size, and leader summary with fencing token', (WidgetTester tester) async {
      final TeamHarness h = TeamHarness();
      final DateTime at = DateTime.now();
      h.api.reply(ApiEndpoints.teamSubmission(teamId),
          statusJson(consents: <Map<String, dynamic>>[consentJson(leader, at), consentJson(member, at)]));
      await pumpView(tester, h);

      expect(find.textContaining('Roster v2'), findsOneWidget);
      expect(find.textContaining('Min: 2, Max: 4'), findsWidgets);
      expect(find.text('Tổng hợp hồ sơ nộp đội (Fencing Token #3)'), findsOneWidget);
      expect(find.textContaining('#3 (Bảo vệ tính toàn vẹn)'), findsOneWidget);
      expect(find.text('SẴN SÀNG NỘP'), findsOneWidget);

      final ElevatedButton submit = tester.widget<ElevatedButton>(
          find.descendant(of: find.byKey(const Key('team_submit')), matching: find.byType(ElevatedButton)));
      expect(submit.onPressed, isNotNull);
    });

    testWidgets('shows stale consent warning and explicit action needed', (WidgetTester tester) async {
      final TeamHarness h = TeamHarness();
      final DateTime now = DateTime.now();
      h.api.reply(ApiEndpoints.teamSubmission(teamId),
          statusJson(consents: <Map<String, dynamic>>[
            consentJson(leader, now),
            consentJson(member, now.subtract(const Duration(minutes: 11))),
          ]));
      await pumpView(tester, h);

      expect(find.text('Cần đồng ý lại'), findsOneWidget);
      expect(find.textContaining('Cần thành viên ký lại'), findsOneWidget);
      expect(find.text('CHỜ THÀNH VIÊN'), findsOneWidget);
    });

    testWidgets('lease timeout displays server verification notice preventing split-brain unlock', (WidgetTester tester) async {
      final TeamHarness h = TeamHarness();
      h.api.reply(ApiEndpoints.teamSubmission(teamId),
          statusJson(active: true, leaseEnd: DateTime.now().subtract(const Duration(minutes: 1))));
      await pumpView(tester, h);

      expect(find.byKey(const Key('team_lease_over')), findsOneWidget);
      expect(find.textContaining('Đội KHÔNG tự động mở khoá'), findsOneWidget);
    });
  });
}
