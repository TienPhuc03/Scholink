import 'package:flutter_test/flutter_test.dart';
import 'package:scholink_mobile/core/database/local_cache_manager.dart';
import 'package:scholink_mobile/core/database/room_database.dart';

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
  group('Tuần 1 (F02) - RoomDatabase & Local Storage Persistence Tests', () {
    late RoomDatabase roomDb;
    late InMemoryCacheManager cache;

  setUp(() {
    cache = InMemoryCacheManager();
    roomDb = RoomDatabaseImpl(cache);
  });

  test('OPP-06: OpportunityDao stores records with updatedAt and retrieves by ID', () async {
    final Map<String, dynamic> oppRecord = <String, dynamic>{
      'id': 'opp-test-1',
      'type': 'SCHOLARSHIP',
      'title': 'Học bổng Test',
      'description': 'Mô tả',
      'organizerName': 'Ban tổ chức',
      'applyMode': 'IN_APP',
      'registerDeadline': '2026-12-31T23:59:59.000Z',
    };

    await roomDb.opportunityDao.insertOrUpdate(oppRecord);

    final Map<String, dynamic>? retrieved = await roomDb.opportunityDao.findById('opp-test-1');
    expect(retrieved, isNotNull);
    expect(retrieved!['title'], equals('Học bổng Test'));
    expect(retrieved['updatedAt'], isNotNull);
    expect(retrieved['cachedAt'], isNotNull);

    final DateTime? lastUpdated = await roomDb.opportunityDao.getLastUpdatedAt();
    expect(lastUpdated, isNotNull);
  });

  test('OPP-06: OpportunityDao idempotent bookmark storage and removal', () async {
    expect(await roomDb.opportunityDao.isBookmarked('opp-100'), isFalse);

    await roomDb.opportunityDao.saveBookmark('opp-100');
    expect(await roomDb.opportunityDao.isBookmarked('opp-100'), isTrue);

    // Duplicate save should not duplicate IDs
    await roomDb.opportunityDao.saveBookmark('opp-100');
    final List<String> list = await roomDb.opportunityDao.getAllBookmarkedIds();
    expect(list.where((String id) => id == 'opp-100').length, equals(1));

    await roomDb.opportunityDao.removeBookmark('opp-100');
    expect(await roomDb.opportunityDao.isBookmarked('opp-100'), isFalse);
  });

  test('APP-04: External registration self-marking in local Room database', () async {
    expect(await roomDb.opportunityDao.isExternalMarked('opp-ext-1'), isFalse);

    await roomDb.opportunityDao.markExternalRegistered('opp-ext-1', true);
    expect(await roomDb.opportunityDao.isExternalMarked('opp-ext-1'), isTrue);

    await roomDb.opportunityDao.markExternalRegistered('opp-ext-1', false);
    expect(await roomDb.opportunityDao.isExternalMarked('opp-ext-1'), isFalse);
  });
  });
}

