import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/constants/api_endpoints.dart';
import 'package:scholink_mobile/core/database/room_database.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_model.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_repository.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_viewmodel.dart';

import '../tv2_test_support.dart';

Map<String, dynamic> page(List<String> ids) =>
    <String, dynamic>{'items': ids.map((String id) => oppJson(id)).toList(), 'hasMore': false};

void main() {
  group('F29 OpportunityViewModel', () {
    test('a late answer for an old filter never replaces the current one', () async {
      final DelayedApiClient api = DelayedApiClient();
      final OpportunityViewModel vm = OpportunityViewModel(
        OpportunityRepository(apiClient: api, roomDb: RoomDatabaseImpl(InMemoryCacheManager())),
      );

      final Future<void> first = vm.loadOpportunities(); // "Tất cả"
      vm.setTypeFilter('COMPETITION'); // second request
      await Future<void>.delayed(Duration.zero);
      expect(api.pending, hasLength(2));

      api.pending[1].complete(page(<String>['comp_1']));
      await Future<void>.delayed(Duration.zero);
      api.pending[0].complete(page(<String>['old_1', 'old_2']));
      await first;
      await Future<void>.delayed(Duration.zero);

      expect(vm.items.map((OpportunityModel o) => o.id), <String>['comp_1']);
      expect(vm.selectedTypeFilter, 'COMPETITION');
    });

    test('typing sends one search after the user pauses, with the last text', () async {
      final ScriptedApiClient api = ScriptedApiClient()..reply(ApiEndpoints.opportunities, page(<String>['a']));
      final OpportunityViewModel vm = OpportunityViewModel(
        OpportunityRepository(apiClient: api, roomDb: RoomDatabaseImpl(InMemoryCacheManager())),
        searchDebounce: const Duration(milliseconds: 30),
      );

      vm.setSearchQuery('h');
      vm.setSearchQuery('ho');
      vm.setSearchQuery('hoc bong');
      await Future<void>.delayed(const Duration(milliseconds: 80));

      final List<RecordedCall> calls = api.callsTo(ApiEndpoints.opportunities);
      expect(calls, hasLength(1));
      expect(calls.single.query!['keyword'], 'hoc bong');
      vm.dispose();
    });

    test('retry keeps every filter (UX-02: không mất filter khi retry)', () async {
      final ScriptedApiClient api = ScriptedApiClient()..reply(ApiEndpoints.opportunities, const NetworkFailure());
      final OpportunityViewModel vm = OpportunityViewModel(
        OpportunityRepository(apiClient: api, roomDb: RoomDatabaseImpl(InMemoryCacheManager())),
        searchDebounce: Duration.zero,
      );
      vm.setTypeFilter('SCHOLARSHIP');
      vm.setApplyModeFilter('EXTERNAL');
      await Future<void>.delayed(Duration.zero);
      expect(vm.hasError, isTrue);
      expect(vm.isOffline, isTrue);

      api.reply(ApiEndpoints.opportunities, page(<String>['s1']));
      await vm.retry();

      final Map<String, dynamic> q = api.callsTo(ApiEndpoints.opportunities).last.query!;
      expect(q['type'], 'SCHOLARSHIP');
      expect(q['applyMode'], 'EXTERNAL');
      expect(vm.selectedTypeFilter, 'SCHOLARSHIP');
      expect(vm.items.single.id, 's1');
    });

    test('a failed refresh keeps the list on screen and explains it', () async {
      final ScriptedApiClient api = ScriptedApiClient()..reply(ApiEndpoints.opportunities, page(<String>['a', 'b']));
      final OpportunityViewModel vm = OpportunityViewModel(
        OpportunityRepository(apiClient: api, roomDb: RoomDatabaseImpl(InMemoryCacheManager())),
      );
      await vm.loadOpportunities();

      api.reply(ApiEndpoints.opportunities, const NetworkFailure());
      await vm.loadOpportunities(forceRefresh: true);

      expect(vm.items, hasLength(2));
      expect(vm.hasError, isFalse);
      expect(vm.isShowingCache, isTrue);
      expect(vm.refreshError, isNotNull);
      expect(vm.lastUpdatedAtText, isNotNull);
    });

    test('bookmark icon goes back when the server refuses', () async {
      final ScriptedApiClient api = ScriptedApiClient()
        ..reply(ApiEndpoints.opportunities, page(<String>['a']))
        ..reply(ApiEndpoints.opportunityBookmark('a'), const ServerFailure(message: 'Lỗi máy chủ', statusCode: 500));
      final OpportunityViewModel vm = OpportunityViewModel(
        OpportunityRepository(apiClient: api, roomDb: RoomDatabaseImpl(InMemoryCacheManager())),
      );
      await vm.loadOpportunities();

      final Failure? failure = await vm.toggleBookmark(vm.items.single);

      expect(failure, isNotNull);
      expect(vm.items.single.isBookmarked, isFalse);
    });

    test('loads the next page with the cursor and skips duplicates', () async {
      final ScriptedApiClient api = ScriptedApiClient();
      api.handlers[ApiEndpoints.opportunities] = (RecordedCall c) => c.query!['cursor'] == null
          ? <String, dynamic>{
              'items': <dynamic>[oppJson('a'), oppJson('b')],
              'nextCursor': 'c2',
              'hasMore': true,
            }
          : <String, dynamic>{
              'items': <dynamic>[oppJson('b'), oppJson('c')],
              'hasMore': false,
            };
      final OpportunityViewModel vm = OpportunityViewModel(
        OpportunityRepository(apiClient: api, roomDb: RoomDatabaseImpl(InMemoryCacheManager())),
      );
      await vm.loadOpportunities();
      await vm.loadMore();

      expect(vm.items.map((OpportunityModel o) => o.id), <String>['a', 'b', 'c']);
      expect(vm.hasMore, isFalse);
      expect(api.callsTo(ApiEndpoints.opportunities).last.query!['cursor'], 'c2');
    });
  });
}
