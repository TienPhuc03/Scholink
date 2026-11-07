import 'local_cache_manager.dart';

/// Room Database abstraction for Flutter, following the Android Room DB architecture.
/// Provides structured table schemas, DAOs (Data Access Objects), and indexed local querying.
abstract interface class RoomDatabase {
  OpportunityDao get opportunityDao;
  NotificationDao get notificationDao;
  CalendarDao get calendarDao;
  Future<void> clearAllTables();

  /// Drops data that belongs to the signed-in account (bookmarks, external marks,
  /// notifications, notification settings, unsent "read" marks) so the next account on this
  /// device does not see it (F37). Public opportunities stay cached; calendar sync records stay
  /// so device events are not created twice.
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

  /// Server is the source of truth for a signed-in user (OPP-06): replaces the local list.
  Future<void> replaceBookmarks(List<String> opportunityIds);

  // External Registration Self-Marking (FR-APP-04)
  Future<void> markExternalRegistered(String opportunityId, bool marked);
  Future<bool> isExternalMarked(String opportunityId);
  Future<List<String>> getAllExternalMarkedIds();
}

/// Data Access Object (DAO) for Device Calendar Events (FR-NOTI-04).
/// One record per Scholink key (`scholink_event_<opportunityId>`): the device event id is kept so
/// the next sync updates that event instead of creating another one.
abstract interface class CalendarDao {
  Future<void> upsertEvent({
    required String eventId,
    required String opportunityId,
    required String title,
    required DateTime deadline,
    required String milestone,
    required String syncStatus,
    String? nativeEventId,
    List<String> milestones = const <String>[],
    List<int> reminderMinutes = const <int>[],
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

  /// The server answered: its list replaces the cached inbox.
  Future<void> replaceAll(List<Map<String, dynamic>> notis);
  Future<List<Map<String, dynamic>>> getAllNotifications();
  Future<void> markRead(String notificationId);
  Future<void> markAllRead();
  Future<int> getUnreadCount();
  Future<DateTime?> getLastSyncedAt();

  // "Read" marks that could not reach the server yet (offline); resent on the next load.
  Future<void> addPendingRead(String notificationId);
  Future<Set<String>> getPendingReads();
  Future<void> removePendingReads(Iterable<String> notificationIds);
  Future<void> setPendingReadAll(bool pending);
  Future<bool> isPendingReadAll();

  // Notification settings last seen from the server, so the settings screen opens offline.
  Future<void> savePreferences(Map<String, dynamic> preferences);
  Future<Map<String, dynamic>?> getPreferences();
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
      _NotificationDaoImpl._keyLastSynced,
      _NotificationDaoImpl._tablePendingReads,
      _NotificationDaoImpl._keyPendingReadAll,
      _NotificationDaoImpl._keyPreferences,
    ]) {
      await _cacheManager.remove(key);
    }
  }
}

List<String> _stringList(dynamic raw) =>
    raw is List ? raw.map((dynamic e) => e.toString()).toList() : <String>[];

Map<String, dynamic> _stringMap(dynamic raw) =>
    raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};

class _OpportunityDaoImpl implements OpportunityDao {
  final LocalCacheManager _cache;

  static const String _tableOpportunities = 'room_table_opportunities';
  static const String _tableBookmarks = 'room_table_bookmarks';
  static const String _tableExternalMarks = 'room_table_external_marks';
  static const String _keyLastUpdated = 'room_opp_last_updated_at';

  _OpportunityDaoImpl(this._cache);

  @override
  Future<void> insertOrUpdate(Map<String, dynamic> record) async {
    await insertAll(<Map<String, dynamic>>[record]);
  }

  @override
  Future<void> insertAll(List<Map<String, dynamic>> records) async {
    final Map<String, dynamic> table = await _getTable();
    final String nowIso = DateTime.now().toIso8601String();

    for (final Map<String, dynamic> original in records) {
      final String id = original['id']?.toString() ?? '';
      if (id.isEmpty) continue;
      // Per-user flags are kept in their own tables, never inside the shared catalog cache.
      final Map<String, dynamic> record = Map<String, dynamic>.from(original)
        ..remove('isBookmarked')
        ..remove('isExternalMarked');
      record['cachedAt'] = nowIso;
      record['updatedAt'] ??= nowIso;
      table[id] = record;
    }

    await _cache.saveJson(_tableOpportunities, table);
    await _cache.saveString(_keyLastUpdated, nowIso);
  }

  @override
  Future<Map<String, dynamic>?> findById(String id) async {
    final Map<String, dynamic> table = await _getTable();
    final dynamic item = table[id];
    return item is Map ? Map<String, dynamic>.from(item) : null;
  }

  @override
  Future<List<Map<String, dynamic>>> getAll({String? type, String? searchQuery}) async {
    final Map<String, dynamic> table = await _getTable();
    List<Map<String, dynamic>> results =
        table.values.whereType<Map<dynamic, dynamic>>().map((Map<dynamic, dynamic> e) => Map<String, dynamic>.from(e)).toList();

    if (type != null && type.isNotEmpty && type != 'ALL') {
      results = results.where((Map<String, dynamic> item) {
        final String itemType = (item['type'] ?? '').toString().toUpperCase();
        return itemType == type.toUpperCase();
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
    if (list.remove(opportunityId)) {
      await _cache.saveJson(_tableBookmarks, list);
    }
  }

  @override
  Future<bool> isBookmarked(String opportunityId) async {
    return (await getAllBookmarkedIds()).contains(opportunityId);
  }

  @override
  Future<List<String>> getAllBookmarkedIds() async => _stringList(await _cache.getJson(_tableBookmarks));

  @override
  Future<void> replaceBookmarks(List<String> opportunityIds) async {
    await _cache.saveJson(_tableBookmarks, opportunityIds.toSet().toList());
  }

  @override
  Future<void> markExternalRegistered(String opportunityId, bool marked) async {
    final List<String> list = await getAllExternalMarkedIds();
    if (marked && !list.contains(opportunityId)) {
      list.add(opportunityId);
    } else if (!marked) {
      list.remove(opportunityId);
    }
    await _cache.saveJson(_tableExternalMarks, list);
  }

  @override
  Future<bool> isExternalMarked(String opportunityId) async {
    return (await getAllExternalMarkedIds()).contains(opportunityId);
  }

  @override
  Future<List<String>> getAllExternalMarkedIds() async => _stringList(await _cache.getJson(_tableExternalMarks));

  Future<Map<String, dynamic>> _getTable() async => _stringMap(await _cache.getJson(_tableOpportunities));
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
    String? nativeEventId,
    List<String> milestones = const <String>[],
    List<int> reminderMinutes = const <int>[],
  }) async {
    final Map<String, dynamic> table = await _getTable();
    final Map<String, dynamic>? previous =
        table[eventId] is Map ? Map<String, dynamic>.from(table[eventId] as Map) : null;
    // Idempotent upsert by unique eventId to prevent duplication
    table[eventId] = <String, dynamic>{
      'eventId': eventId,
      'opportunityId': opportunityId,
      'title': title,
      'deadline': deadline.toUtc().toIso8601String(),
      'milestone': milestone,
      'milestones': milestones,
      'reminderMinutes': reminderMinutes,
      'syncStatus': syncStatus,
      // A failed attempt must not lose the device event created by an earlier success.
      'nativeEventId': nativeEventId ?? previous?['nativeEventId'],
      'syncedAt': DateTime.now().toUtc().toIso8601String(),
    };
    await _cache.saveJson(_tableCalendar, table);
  }

  @override
  Future<Map<String, dynamic>?> findByEventId(String eventId) async {
    final Map<String, dynamic> table = await _getTable();
    final dynamic item = table[eventId];
    return item is Map ? Map<String, dynamic>.from(item) : null;
  }

  @override
  Future<List<Map<String, dynamic>>> getEventsByOpportunityId(String opportunityId) async {
    final Map<String, dynamic> table = await _getTable();
    return table.values
        .whereType<Map<dynamic, dynamic>>()
        .map((Map<dynamic, dynamic> e) => Map<String, dynamic>.from(e))
        .where((Map<String, dynamic> item) => item['opportunityId'] == opportunityId)
        .toList();
  }

  @override
  Future<void> deleteEvent(String eventId) async {
    final Map<String, dynamic> table = await _getTable();
    if (table.remove(eventId) != null) {
      await _cache.saveJson(_tableCalendar, table);
    }
  }

  Future<Map<String, dynamic>> _getTable() async => _stringMap(await _cache.getJson(_tableCalendar));
}

class _NotificationDaoImpl implements NotificationDao {
  final LocalCacheManager _cache;
  static const String _tableNotifications = 'room_table_notifications';
  static const String _keyLastSynced = 'room_notifications_synced_at';
  static const String _tablePendingReads = 'room_notifications_pending_reads';
  static const String _keyPendingReadAll = 'room_notifications_pending_read_all';
  static const String _keyPreferences = 'room_notification_preferences';

  _NotificationDaoImpl(this._cache);

  static String _idOf(Map<String, dynamic> noti) =>
      noti['notificationId']?.toString() ?? noti['id']?.toString() ?? '';

  @override
  Future<void> upsertNotification(Map<String, dynamic> noti) async {
    await upsertAll(<Map<String, dynamic>>[noti]);
  }

  @override
  Future<void> upsertAll(List<Map<String, dynamic>> notis) async {
    final Map<String, dynamic> table = await _getTable();
    for (final Map<String, dynamic> noti in notis) {
      final String id = _idOf(noti);
      // Enforce unique notificationId
      if (id.isNotEmpty) table[id] = noti;
    }
    await _cache.saveJson(_tableNotifications, table);
  }

  @override
  Future<void> replaceAll(List<Map<String, dynamic>> notis) async {
    final Map<String, dynamic> table = <String, dynamic>{};
    for (final Map<String, dynamic> noti in notis) {
      final String id = _idOf(noti);
      if (id.isNotEmpty) table[id] = noti;
    }
    await _cache.saveJson(_tableNotifications, table);
    await _cache.saveString(_keyLastSynced, DateTime.now().toIso8601String());
  }

  @override
  Future<List<Map<String, dynamic>>> getAllNotifications() async {
    final Map<String, dynamic> table = await _getTable();
    final List<Map<String, dynamic>> list =
        table.values.whereType<Map<dynamic, dynamic>>().map((Map<dynamic, dynamic> e) => Map<String, dynamic>.from(e)).toList();
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
    if (table[notificationId] is Map) {
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
    for (final String key in table.keys.toList()) {
      if (table[key] is! Map) continue;
      final Map<String, dynamic> item = Map<String, dynamic>.from(table[key] as Map);
      item['isRead'] = true;
      item['readAt'] ??= nowIso;
      table[key] = item;
    }
    await _cache.saveJson(_tableNotifications, table);
  }

  @override
  Future<int> getUnreadCount() async {
    final Map<String, dynamic> table = await _getTable();
    return table.values.whereType<Map<dynamic, dynamic>>().where((Map<dynamic, dynamic> item) => item['isRead'] != true).length;
  }

  @override
  Future<DateTime?> getLastSyncedAt() async {
    final String? raw = await _cache.getString(_keyLastSynced);
    return raw == null ? null : DateTime.tryParse(raw);
  }

  @override
  Future<void> addPendingRead(String notificationId) async {
    final Set<String> pending = await getPendingReads()
      ..add(notificationId);
    await _cache.saveJson(_tablePendingReads, pending.toList());
  }

  @override
  Future<Set<String>> getPendingReads() async =>
      _stringList(await _cache.getJson(_tablePendingReads)).toSet();

  @override
  Future<void> removePendingReads(Iterable<String> notificationIds) async {
    final Set<String> pending = await getPendingReads()
      ..removeAll(notificationIds);
    await _cache.saveJson(_tablePendingReads, pending.toList());
  }

  @override
  Future<void> setPendingReadAll(bool pending) async {
    if (pending) {
      await _cache.saveString(_keyPendingReadAll, 'true');
    } else {
      await _cache.remove(_keyPendingReadAll);
    }
  }

  @override
  Future<bool> isPendingReadAll() async => (await _cache.getString(_keyPendingReadAll)) == 'true';

  @override
  Future<void> savePreferences(Map<String, dynamic> preferences) async {
    await _cache.saveJson(_keyPreferences, preferences);
  }

  @override
  Future<Map<String, dynamic>?> getPreferences() async {
    final dynamic raw = await _cache.getJson(_keyPreferences);
    return raw is Map ? Map<String, dynamic>.from(raw) : null;
  }

  Future<Map<String, dynamic>> _getTable() async => _stringMap(await _cache.getJson(_tableNotifications));
}
