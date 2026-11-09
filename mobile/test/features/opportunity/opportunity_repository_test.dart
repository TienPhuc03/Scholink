import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/database/room_database.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/core/errors/result.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_model.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_repository.dart';

import '../tv2_test_support.dart';

void main() {
  late ScriptedApiClient api;
  late RoomDatabase db;
  late bool signedIn;
  late OpportunityRepository repo;

  setUp(() {
    api = ScriptedApiClient();
    db = RoomDatabaseImpl(InMemoryCacheManager());
    signedIn = true;
    repo = OpportunityRepository(apiClient: api, roomDb: db, isSignedIn: () async => signedIn);
  });

  group('F29 catalog (OPP-01/02/06, UX-02)', () {
    test('sends the filters the API understands and reads the cursor page', () async {
      api.reply(ApiEndpoints.opportunities, <String, dynamic>{
        'items': <dynamic>[oppJson('o1'), oppJson('o2', type: 'COMPETITION')],
        'nextCursor': 'cur_2',
        'hasMore': true,
      });

      final OpportunityPage page = (await repo.fetchPage(
        const OpportunityQuery(type: 'SCHOLARSHIP', keyword: ' AI ', applyMode: 'EXTERNAL'),
      ))
          .dataOrNull!;

      final Map<String, dynamic> q = api.callsTo(ApiEndpoints.opportunities).single.query!;
      expect(q['keyword'], 'AI', reason: 'backend reads "keyword", not "q"');
      expect(q['type'], 'SCHOLARSHIP');
      expect(q['applyMode'], 'EXTERNAL');
      expect(q.containsKey('q'), isFalse);
      expect(page.items.map((OpportunityModel o) => o.id), <String>['o1', 'o2']);
      expect(page.hasMore, isTrue);
      expect(page.nextCursor, 'cur_2');
      expect(page.fromCache, isFalse);
      expect(await db.opportunityDao.findById('o1'), isNotNull, reason: 'cached for offline use');
    });

    test('"Đã lưu" is resolved on the device and never sent as a catalog type', () async {
      api.reply(ApiEndpoints.myBookmarks, <String, dynamic>{
        'opportunityIds': <String>['o9'],
      });
      api.reply(ApiEndpoints.opportunityDetail('o9'), oppJson('o9'));

      final OpportunityPage page =
          (await repo.fetchPage(const OpportunityQuery(bookmarkedOnly: true))).dataOrNull!;

      expect(api.callsTo(ApiEndpoints.opportunities), isEmpty);
      expect(page.items.single.id, 'o9');
      expect(page.items.single.isBookmarked, isTrue);
      expect(await db.opportunityDao.getAllBookmarkedIds(), <String>['o9'], reason: 'server list replaces local');
    });

    test('offline: shows the cached copy with its time and why it is not fresh', () async {
      await db.opportunityDao.insertAll(<Map<String, dynamic>>[
        oppJson('o1'),
        oppJson('o2', type: 'COMPETITION'),
      ]);
      api.reply(ApiEndpoints.opportunities, const NetworkFailure());

      final OpportunityPage page =
          (await repo.fetchPage(const OpportunityQuery(type: 'COMPETITION'))).dataOrNull!;

      expect(page.fromCache, isTrue);
      expect(page.cachedAt, isNotNull);
      expect(page.refreshFailure, isA<NetworkFailure>());
      expect(page.items.map((OpportunityModel o) => o.id), <String>['o2'], reason: 'filter still applied');
    });

    test('offline with nothing cached returns the real error, never sample data', () async {
      api.reply(ApiEndpoints.opportunities, const NetworkFailure());

      final Result<OpportunityPage, Failure> res = await repo.fetchPage(const OpportunityQuery());

      expect(res.isFailure, isTrue);
      expect(res.errorOrNull, isA<NetworkFailure>());
    });

    test('next page needs the server: no cache fallback for a cursor', () async {
      await db.opportunityDao.insertAll(<Map<String, dynamic>>[oppJson('o1')]);
      api.reply(ApiEndpoints.opportunities, const NetworkFailure());

      expect((await repo.fetchPage(const OpportunityQuery(), cursor: 'c2')).isFailure, isTrue);
    });

    test('detail falls back to the cached copy and says so', () async {
      await db.opportunityDao.insertAll(<Map<String, dynamic>>[oppJson('o1')]);
      api.reply(ApiEndpoints.opportunityDetail('o1'), const NetworkFailure());

      final OpportunityDetail d = (await repo.getDetail('o1')).dataOrNull!;
      expect(d.fromCache, isTrue);
      expect(d.item.id, 'o1');
    });
  });

  group('F29 bookmark & external mark sync (OPP-06, APP-04)', () {
    test('bookmark sends the target state and is saved locally only after the server agrees', () async {
      api.reply(ApiEndpoints.opportunityBookmark('o1'), <String, dynamic>{'bookmarked': true});

      final Result<bool, Failure> res = await repo.setBookmark('o1', true);

      expect(res.dataOrNull, isTrue);
      expect(api.callsTo(ApiEndpoints.opportunityBookmark('o1')).single.data, <String, dynamic>{'bookmarked': true});
      expect(await db.opportunityDao.isBookmarked('o1'), isTrue);
    });

    test('a failed bookmark changes nothing on the device', () async {
      api.reply(ApiEndpoints.opportunityBookmark('o1'), const NetworkFailure());

      expect((await repo.setBookmark('o1', true)).isFailure, isTrue);
      expect(await db.opportunityDao.isBookmarked('o1'), isFalse);
    });

    test('guests get a login failure and no account API is called', () async {
      signedIn = false;

      final Result<bool, Failure> res = await repo.setBookmark('o1', true);

      expect(res.errorOrNull, isA<UnauthorizedFailure>());
      expect(api.calls, isEmpty);
    });

    test('external mark is sent with an explicit value', () async {
      api.reply(ApiEndpoints.opportunityExternalMark('o1'), <String, dynamic>{'isExternalMarked': true});

      expect((await repo.setExternalMark('o1', true)).dataOrNull, isTrue);
      expect(api.callsTo(ApiEndpoints.opportunityExternalMark('o1')).single.data, <String, dynamic>{'marked': true});
      expect(await db.opportunityDao.isExternalMarked('o1'), isTrue);
    });

    test('per-user flags are never stored inside the shared catalog cache', () async {
      await db.opportunityDao.insertAll(<Map<String, dynamic>>[
        <String, dynamic>{...oppJson('o1'), 'isBookmarked': true},
      ]);
      expect((await db.opportunityDao.findById('o1'))!.containsKey('isBookmarked'), isFalse);
    });
  });
}
