import 'dart:convert';
import 'local_cache_manager.dart';

/// Room Database abstraction for Flutter, following the Android Room DB architecture.
/// Provides structured table schemas, DAOs (Data Access Objects), and indexed local querying.
abstract interface class RoomDatabase {
  OpportunityDao get opportunityDao;
  NotificationDao get notificationDao;
  CalendarDao get calendarDao;
  Future<void> clearAllTables();

  /// Drops data that belongs to the signed-in account (bookmarks, external marks,
  /// notifications) so the next account on this device does not see it (F37).
  /// Public opportunities stay cached; calendar sync records stay so device events
  /// are not created twice.
  Future<void> clearUserData();
}

/// Data Access Object (DAO) for Opportunities & Bookmarks table.
abstract interface class OpportunityDao {
  Future<void> insertOrUpdate(Map<String, dynamic> record);
  Future<void> insertAll(List<Map<String, dynamic>> records);
  Future<Map<String, dynamic>?> findById(String id);
  Future<List<Map<String, dynamic>>> getAll({String? type, String? searchQuery});
  Future<void> deleteById(String id);
  Future<DateTime?> getLastUpdatedAt();

  // Bookmarks
  Future<void> saveBookmark(String opportunityId, {Map<String, dynamic>? metadata});
  Future<void> removeBookmark(String opportunityId);
  Future<bool> isBookmarked(String opportunityId);
  Future<List<String>> getAllBookmarkedIds();

  // External Registration Self-Marking (FR-APP-04)
  Future<void> markExternalRegistered(String opportunityId, bool marked);
  Future<bool> isExternalMarked(String opportunityId);
}

/// Data Access Object (DAO) for Device Calendar Events (FR-NOTI-04).
/// Ensures eventId deduplication and sync status tracking.
abstract interface class CalendarDao {
  Future<void> upsertEvent({
    required String eventId,
    required String opportunityId,
    required String title,
    required DateTime deadline,
    required String milestone,
    required String syncStatus,
  });
  Future<Map<String, dynamic>?> findByEventId(String eventId);
  Future<List<Map<String, dynamic>>> getEventsByOpportunityId(String opportunityId);
  Future<void> deleteEvent(String eventId);
}

/// Data Access Object (DAO) for Notifications Inbox (FR-NOTI-01).
/// Enforces unique notificationId deduplication.
abstract interface class NotificationDao {
  Future<void> upsertNotification(Map<String, dynamic> noti);
  Future<void> upsertAll(List<Map<String, dynamic>> notis);
  Future<List<Map<String, dynamic>>> getAllNotifications();
  Future<void> markRead(String notificationId);
  Future<void> markAllRead();
  Future<int> getUnreadCount();
}

/// Concrete implementation of RoomDatabase backed by LocalCacheManager (KeyValue / Document Tables).
class RoomDatabaseImpl implements RoomDatabase {
  final LocalCacheManager _cacheManager;

  late final OpportunityDao _opportunityDao;
  late final NotificationDao _notificationDao;
  late final CalendarDao _calendarDao;

  RoomDatabaseImpl(this._cacheManager) {
    _opportunityDao = _OpportunityDaoImpl(_cacheManager);
    _notificationDao = _NotificationDaoImpl(_cacheManager);
    _calendarDao = _CalendarDaoImpl(_cacheManager);
  }

  @override
  OpportunityDao get opportunityDao => _opportunityDao;

  @override
  NotificationDao get notificationDao => _notificationDao;

  @override
  CalendarDao get calendarDao => _calendarDao;

  @override
  Future<void> clearAllTables() async {
    await _cacheManager.clear();
  }

  @override
  Future<void> clearUserData() async {
    for (final String key in <String>[
      _OpportunityDaoImpl._tableBookmarks,
      _OpportunityDaoImpl._tableExternalMarks,
      _NotificationDaoImpl._tableNotifications,
    ]) {
      await _cacheManager.remove(key);
    }
  }
}

class _OpportunityDaoImpl implements OpportunityDao {
  final LocalCacheManager _cache;

  static const String _tableOpportunities = 'room_table_opportunities';
  static const String _tableBookmarks = 'room_table_bookmarks';
  static const String _tableExternalMarks = 'room_table_external_marks';
  static const String _keyLastUpdated = 'room_opp_last_updated_at';

  _OpportunityDaoImpl(this._cache);

  @override
  Future<void> insertOrUpdate(Map<String, dynamic> record) async {
    final Map<String, dynamic> table = await _getTable();
    final String id = record['id']?.toString() ?? '';
    if (id.isEmpty) return;

    record['cachedAt'] = DateTime.now().toIso8601String();
    record['updatedAt'] ??= DateTime.now().toIso8601String();
    table[id] = record;

    await _cache.saveJson(_tableOpportunities, table);
    await _cache.saveString(_keyLastUpdated, DateTime.now().toIso8601String());
  }

  @override
  Future<void> insertAll(List<Map<String, dynamic>> records) async {
    final Map<String, dynamic> table = await _getTable();
    final String nowIso = DateTime.now().toIso8601String();

    for (final Map<String, dynamic> record in records) {
      final String id = record['id']?.toString() ?? '';
      if (id.isNotEmpty) {
        record['cachedAt'] = nowIso;
        record['updatedAt'] ??= nowIso;
        table[id] = record;
      }
    }

    await _cache.saveJson(_tableOpportunities, table);
    await _cache.saveString(_keyLastUpdated, nowIso);
  }

  @override
  Future<Map<String, dynamic>?> findById(String id) async {
    final Map<String, dynamic> table = await _getTable();
    final dynamic item = table[id];
    if (item is Map<String, dynamic>) {
      return item;
    }
    return null;
  }

  @override
  Future<List<Map<String, dynamic>>> getAll({String? type, String? searchQuery}) async {
    final Map<String, dynamic> table = await _getTable();
    List<Map<String, dynamic>> results = table.values.whereType<Map<String, dynamic>>().toList();

    if (type != null && type.isNotEmpty && type != 'ALL') {
      results = results.where((Map<String, dynamic> item) {
        final String itemType = (item['type'] ?? '').toString().toUpperCase();
        return itemType.contains(type.toUpperCase());
      }).toList();
    }

    if (searchQuery != null && searchQuery.trim().isNotEmpty) {
      final String queryNorm = searchQuery.trim().toLowerCase();
      results = results.where((Map<String, dynamic> item) {
        final String title = (item['title'] ?? '').toString().toLowerCase();
        final String desc = (item['description'] ?? '').toString().toLowerCase();
        final String org = (item['organizerName'] ?? '').toString().toLowerCase();
        return title.contains(queryNorm) || desc.contains(queryNorm) || org.contains(queryNorm);
      }).toList();
    }

    return results;
  }

  @override
  Future<void> deleteById(String id) async {
    final Map<String, dynamic> table = await _getTable();
    if (table.containsKey(id)) {
      table.remove(id);
      await _cache.saveJson(_tableOpportunities, table);
    }
  }

  @override
  Future<DateTime?> getLastUpdatedAt() async {
    final String? str = await _cache.getString(_keyLastUpdated);
    if (str == null || str.isEmpty) return null;
    return DateTime.tryParse(str);
  }

  @override
  Future<void> saveBookmark(String opportunityId, {Map<String, dynamic>? metadata}) async {
    final List<String> list = await getAllBookmarkedIds();
    if (!list.contains(opportunityId)) {
      list.add(opportunityId);
      await _cache.saveJson(_tableBookmarks, list);
    }
  }

  @override
  Future<void> removeBookmark(String opportunityId) async {
    final List<String> list = await getAllBookmarkedIds();
    if (list.contains(opportunityId)) {
      list.remove(opportunityId);
      await _cache.saveJson(_tableBookmarks, list);
    }
  }

  @override
  Future<bool> isBookmarked(String opportunityId) async {
    final List<String> list = await getAllBookmarkedIds();
    return list.contains(opportunityId);
  }

  @override
  Future<List<String>> getAllBookmarkedIds() async {
    final dynamic raw = await _cache.getJson(_tableBookmarks);
    if (raw is List) {
      return raw.map((dynamic e) => e.toString()).toList();
    }
    return <String>[];
  }

  @override
  Future<void> markExternalRegistered(String opportunityId, bool marked) async {
    final dynamic raw = await _cache.getJson(_tableExternalMarks);
    final List<String> list = (raw is List) ? raw.map((dynamic e) => e.toString()).toList() : <String>[];
    if (marked && !list.contains(opportunityId)) {
      list.add(opportunityId);
    } else if (!marked && list.contains(opportunityId)) {
      list.remove(opportunityId);
    }
    await _cache.saveJson(_tableExternalMarks, list);
  }

  @override
  Future<bool> isExternalMarked(String opportunityId) async {
    final dynamic raw = await _cache.getJson(_tableExternalMarks);
    if (raw is List) {
      return raw.contains(opportunityId);
    }
    return false;
  }

  Future<Map<String, dynamic>> _getTable() async {
    final dynamic raw = await _cache.getJson(_tableOpportunities);
    if (raw is Map<String, dynamic>) {
      return raw;
    }
    return <String, dynamic>{};
  }
}

class _CalendarDaoImpl implements CalendarDao {
  final LocalCacheManager _cache;
  static const String _tableCalendar = 'room_table_calendar_events';

  _CalendarDaoImpl(this._cache);

  @override
  Future<void> upsertEvent({
    required String eventId,
    required String opportunityId,
    required String title,
    required DateTime deadline,
    required String milestone,
    required String syncStatus,
  }) async {
    final Map<String, dynamic> table = await _getTable();
    // Idempotent upsert by unique eventId to prevent duplication
    table[eventId] = <String, dynamic>{
      'eventId': eventId,
      'opportunityId': opportunityId,
      'title': title,
      'deadline': deadline.toIso8601String(),
      'milestone': milestone,
      'syncStatus': syncStatus,
      'syncedAt': DateTime.now().toIso8601String(),
    };
    await _cache.saveJson(_tableCalendar, table);
  }

  @override
  Future<Map<String, dynamic>?> findByEventId(String eventId) async {
    final Map<String, dynamic> table = await _getTable();
    final dynamic item = table[eventId];
    return (item is Map<String, dynamic>) ? item : null;
  }

  @override
  Future<List<Map<String, dynamic>>> getEventsByOpportunityId(String opportunityId) async {
    final Map<String, dynamic> table = await _getTable();
    return table.values
        .whereType<Map<String, dynamic>>()
        .where((Map<String, dynamic> item) => item['opportunityId'] == opportunityId)
        .toList();
  }

  @override
  Future<void> deleteEvent(String eventId) async {
    final Map<String, dynamic> table = await _getTable();
    if (table.containsKey(eventId)) {
      table.remove(eventId);
      await _cache.saveJson(_tableCalendar, table);
    }
  }

  Future<Map<String, dynamic>> _getTable() async {
    final dynamic raw = await _cache.getJson(_tableCalendar);
    return (raw is Map<String, dynamic>) ? raw : <String, dynamic>{};
  }
}

class _NotificationDaoImpl implements NotificationDao {
  final LocalCacheManager _cache;
  static const String _tableNotifications = 'room_table_notifications';

  _NotificationDaoImpl(this._cache);

  @override
  Future<void> upsertNotification(Map<String, dynamic> noti) async {
    final Map<String, dynamic> table = await _getTable();
    final String id = noti['id']?.toString() ?? noti['notificationId']?.toString() ?? '';
    if (id.isEmpty) return;
    table[id] = noti;
    await _cache.saveJson(_tableNotifications, table);
  }

  @override
  Future<void> upsertAll(List<Map<String, dynamic>> notis) async {
    final Map<String, dynamic> table = await _getTable();
    for (final Map<String, dynamic> noti in notis) {
      final String id = noti['id']?.toString() ?? noti['notificationId']?.toString() ?? '';
      if (id.isNotEmpty) {
        // Enforce unique notificationId
        table[id] = noti;
      }
    }
    await _cache.saveJson(_tableNotifications, table);
  }

  @override
  Future<List<Map<String, dynamic>>> getAllNotifications() async {
    final Map<String, dynamic> table = await _getTable();
    final List<Map<String, dynamic>> list = table.values.whereType<Map<String, dynamic>>().toList();
    // Sort descending by createdAt
    list.sort((Map<String, dynamic> a, Map<String, dynamic> b) {
      final String timeA = (a['createdAt'] ?? '').toString();
      final String timeB = (b['createdAt'] ?? '').toString();
      return timeB.compareTo(timeA);
    });
    return list;
  }

  @override
  Future<void> markRead(String notificationId) async {
    final Map<String, dynamic> table = await _getTable();
    if (table.containsKey(notificationId)) {
      final Map<String, dynamic> item = Map<String, dynamic>.from(table[notificationId] as Map);
      item['isRead'] = true;
      item['readAt'] = DateTime.now().toIso8601String();
      table[notificationId] = item;
      await _cache.saveJson(_tableNotifications, table);
    }
  }

  @override
  Future<void> markAllRead() async {
    final Map<String, dynamic> table = await _getTable();
    final String nowIso = DateTime.now().toIso8601String();
    for (final String key in table.keys) {
      final Map<String, dynamic> item = Map<String, dynamic>.from(table[key] as Map);
      item['isRead'] = true;
      item['readAt'] = nowIso;
      table[key] = item;
    }
    await _cache.saveJson(_tableNotifications, table);
  }

  @override
  Future<int> getUnreadCount() async {
    final Map<String, dynamic> table = await _getTable();
    int count = 0;
    for (final dynamic item in table.values) {
      if (item is Map<String, dynamic>) {
        final bool isRead = item['isRead'] == true;
        if (!isRead) count++;
      }
    }
    return count;
  }

  Future<Map<String, dynamic>> _getTable() async {
    final dynamic raw = await _cache.getJson(_tableNotifications);
    return (raw is Map<String, dynamic>) ? raw : <String, dynamic>{};
  }
}

