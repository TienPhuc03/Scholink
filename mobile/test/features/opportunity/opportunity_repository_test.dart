import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/database/local_cache_manager.dart';
import 'package:scholink_mobile/core/database/room_database.dart';
import 'package:scholink_mobile/core/errors/failures.dart';
import 'package:scholink_mobile/core/errors/result.dart';
import 'package:scholink_mobile/core/network/api_client.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_model.dart';
import 'package:scholink_mobile/features/opportunity/opportunity_repository.dart';

class MockApiClient implements ApiClient {
  @override
  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? queryParameters, Options? options}) async {
    throw DioException(
      requestOptions: RequestOptions(path: path),
      type: DioExceptionType.connectionError,
    );
  }

  @override
  Future<Response<T>> post<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> put<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> patch<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    throw UnimplementedError();
  }

  @override
  Future<Response<T>> delete<T>(String path, {dynamic data, Map<String, dynamic>? queryParameters, Options? options}) async {
    throw UnimplementedError();
  }
}

class InMemoryCacheManager implements LocalCacheManager {
  final Map<String, dynamic> _store = <String, dynamic>{};

  @override
  Future<void> clear() async => _store.clear();

  @override
  Future<dynamic> getJson(String key) async => _store[key];

  @override
  Future<String?> getString(String key) async => _store[key] as String?;

  @override
  Future<void> remove(String key) async => _store.remove(key);

  @override
  Future<void> saveJson(String key, dynamic data) async => _store[key] = data;

  @override
  Future<void> saveString(String key, String value) async => _store[key] = value;
}

void main() {
  group('Tuần 2 (F11) - OpportunityRepository Filter, Cache & APP-04 Tests', () {
    late OpportunityRepository repository;
    late RoomDatabase roomDb;
    late InMemoryCacheManager cache;

    setUp(() {
      cache = InMemoryCacheManager();
      roomDb = RoomDatabaseImpl(cache);
      repository = OpportunityRepository(
        apiClient: MockApiClient(),
        roomDb: roomDb,
        localCache: cache,
      );
    });

    test('OPP-01 & OPP-02: Guest & Student can view both types and filter separately', () async {
      // 1. Fetch All
      final Result<List<OpportunityModel>, Failure> allRes =
          await repository.getOpportunities(type: 'ALL');
      expect(allRes.isSuccess, isTrue);
      final List<OpportunityModel> allItems = allRes.dataOrNull!;
      expect(allItems.any((OpportunityModel m) => m.isScholarship), isTrue);
      expect(allItems.any((OpportunityModel m) => m.isCompetition), isTrue);

      // 2. Filter Scholarships only
      final Result<List<OpportunityModel>, Failure> scholRes =
          await repository.getOpportunities(type: 'SCHOLARSHIP');
      expect(scholRes.isSuccess, isTrue);
      for (final OpportunityModel item in scholRes.dataOrNull!) {
        expect(item.isScholarship, isTrue);
      }

      // 3. Filter Competitions only
      final Result<List<OpportunityModel>, Failure> compRes =
          await repository.getOpportunities(type: 'COMPETITION');
      expect(compRes.isSuccess, isTrue);
      for (final OpportunityModel item in compRes.dataOrNull!) {
        expect(item.isCompetition, isTrue);
      }
    });

    test('OPP-02: Search by normalized title/keyword', () async {
      final Result<List<OpportunityModel>, Failure> searchRes =
          await repository.getOpportunities(searchQuery: 'Hackathon');
      expect(searchRes.isSuccess, isTrue);
      final List<OpportunityModel> items = searchRes.dataOrNull!;
      expect(items.isNotEmpty, isTrue);
      expect(items.first.title, contains('Hackathon'));
    });

    test('OPP-04 & APP-04: Filter by applyMode (IN_APP vs EXTERNAL)', () async {
      final Result<List<OpportunityModel>, Failure> inAppRes =
          await repository.getOpportunities(applyMode: 'IN_APP');
      expect(inAppRes.isSuccess, isTrue);
      for (final OpportunityModel item in inAppRes.dataOrNull!) {
        expect(item.isInApp, isTrue);
      }

      final Result<List<OpportunityModel>, Failure> extRes =
          await repository.getOpportunities(applyMode: 'EXTERNAL');
      expect(extRes.isSuccess, isTrue);
      for (final OpportunityModel item in extRes.dataOrNull!) {
        expect(item.isExternal, isTrue);
      }
    });

    test('OPP-06: Idempotent Bookmark toggle and fetch bookmarked filter', () async {
      final Result<List<OpportunityModel>, Failure> initRes =
          await repository.getOpportunities(type: 'ALL');
      final OpportunityModel first = initRes.dataOrNull!.first;

      // Toggle Bookmark
      final bool state1 = await repository.toggleBookmark(first.id);
      expect(state1, isTrue);

      final Result<List<OpportunityModel>, Failure> bookmarkedList =
          await repository.getOpportunities(type: 'BOOKMARKED');
      expect(bookmarkedList.dataOrNull!.any((OpportunityModel m) => m.id == first.id), isTrue);

      // Untoggle Bookmark
      final bool state2 = await repository.toggleBookmark(first.id);
      expect(state2, isFalse);

      final Result<List<OpportunityModel>, Failure> afterRemove =
          await repository.getOpportunities(type: 'BOOKMARKED');
      expect(afterRemove.dataOrNull!.any((OpportunityModel m) => m.id == first.id), isFalse);
    });

    test('APP-04: Self-mark External Registration (EXTERNAL_MARKED)', () async {
      const String oppId = 'opp-schol-002';
      final bool mark1 = await repository.toggleExternalMark(oppId);
      expect(mark1, isTrue);

      final Result<OpportunityModel, Failure> oppRes = await repository.getOpportunityById(oppId);
      expect(oppRes.dataOrNull!.isExternalMarked, isTrue);

      final bool mark2 = await repository.toggleExternalMark(oppId);
      expect(mark2, isFalse);
    });
  });
}
