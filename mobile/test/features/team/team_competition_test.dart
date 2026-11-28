import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/features/team/team_list_view.dart';
import 'package:scholink_mobile/features/team/team_model.dart';
import 'package:scholink_mobile/features/team/team_repository.dart';
import 'package:scholink_mobile/features/team/team_viewmodel.dart';

import '../auth/auth_test_fakes.dart';

Map<String, dynamic> team(String id, String competitionId,
        {String? title, String? status}) =>
    <String, dynamic>{
      'id': id,
      'competitionId': competitionId,
      'name': 'Đội $id',
      'leaderId': 'me',
      'minSize': 2,
      'maxSize': 4,
      'status': 'FORMING',
      'members': <Map<String, dynamic>>[
        <String, dynamic>{'studentId': 'me', 'role': 'LEADER'},
      ],
      if (title != null) 'competitionTitle': title,
      if (status != null) 'competitionStatus': status,
    };

void main() {
  late ScriptedApiClient api;
  late TeamViewModel vm;

  setUp(() {
    api = ScriptedApiClient()
      ..reply(ApiEndpoints.opportunities, <String, dynamic>{
        'items': <Map<String, dynamic>>[
          <String, dynamic>{'id': 'opp_a', 'title': 'Cuộc thi A', 'status': 'PUBLISHED'},
          <String, dynamic>{'id': 'opp_b', 'title': 'Cuộc thi B', 'status': 'PUBLISHED'},
        ],
      })
      ..reply(ApiEndpoints.myCompetitionSuggestions, <Map<String, dynamic>>[
        <String, dynamic>{'id': 'opp_mine', 'title': 'Hackathon của tôi', 'status': 'PENDING_REVIEW'},
        <String, dynamic>{'id': 'opp_old', 'title': 'Bị từ chối', 'status': 'REJECTED'},
      ])
      ..reply(ApiEndpoints.competitionTeams('opp_a'),
          <Map<String, dynamic>>[team('t1', 'opp_a')])
      ..reply(ApiEndpoints.myTeams, <Map<String, dynamic>>[
        team('t1', 'opp_a', title: 'Cuộc thi A', status: 'PUBLISHED'),
        team('t2', 'opp_mine', title: 'Hackathon của tôi', status: 'PENDING_REVIEW'),
      ]);
    vm = TeamViewModel(
        repository: TeamRepository(api),
        secureStorage: InMemorySecureStorage()..userId = 'me');
  });

  test('competitions: my suggestions under review first, rejected ones left out', () async {
    await vm.loadCompetitions();
    expect(vm.competitions.map((CompetitionOption c) => c.id),
        <String>['opp_mine', 'opp_a', 'opp_b']);
    expect(vm.competitions.first.isPending, isTrue);
  });

  test('suggesting a competition posts the link and makes it pickable', () async {
    api.reply(ApiEndpoints.competitionSuggestions, <String, dynamic>{
      'id': 'opp_new',
      'title': 'Cuộc thi mới',
      'status': 'PENDING_REVIEW',
    });
    final CompetitionOption? c = await vm.suggestCompetition(
      sourceUrl: ' https://example.com/contest ',
      title: 'Cuộc thi mới',
      registerDeadline: DateTime.utc(2027, 1, 31, 23, 59),
    );
    expect(c?.isPending, isTrue);
    expect(vm.competitions.first.id, 'opp_new');
    final RecordedCall post = api.callsTo(ApiEndpoints.competitionSuggestions).single;
    expect(post.data['sourceUrl'], 'https://example.com/contest');
    expect(post.data['registerDeadline'], '2027-01-31T23:59:00.000Z');
  });

  testWidgets(
      'opens on the first published competition (no hard-coded one) and "Đội của tôi" spans competitions',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(900, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    // The screen has endless animations (shimmer, pulse): pump fixed steps, never settle.
    Future<void> settle() async {
      for (int i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 200));
      }
    }

    await tester.pumpWidget(MaterialApp(home: TeamListView(viewModel: vm)));
    await settle();

    expect(find.text('Cuộc thi A'), findsWidgets);
    expect(api.callsTo(ApiEndpoints.competitionTeams('opp_a')), isNotEmpty);

    await tester.tap(find.text('Đội của tôi'));
    await settle();
    expect(find.text('Đội t1'), findsOneWidget);
    expect(find.text('Đội t2'), findsOneWidget);
    expect(find.textContaining('Cuộc thi chờ admin xác minh'), findsOneWidget);
  });
}
