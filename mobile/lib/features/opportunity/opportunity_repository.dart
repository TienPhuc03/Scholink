import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/database/local_cache_manager.dart';
import '../../core/database/room_database.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'opportunity_model.dart';

/// Filters of the catalog screen. `bookmarkedOnly` is the "Đã lưu" chip; it is resolved on the
/// device (server bookmark list + cached opportunities), never sent to the catalog API.
class OpportunityQuery {
  final String? type; // SCHOLARSHIP | COMPETITION
  final String? keyword;
  final String? applyMode; // IN_APP | EXTERNAL
  final bool bookmarkedOnly;

  const OpportunityQuery({this.type, this.keyword, this.applyMode, this.bookmarkedOnly = false});

  bool matches(OpportunityModel o) {
    if (type == 'SCHOLARSHIP' && !o.isScholarship) return false;
    if (type == 'COMPETITION' && !o.isCompetition) return false;
    if (applyMode != null && o.applyMode.toUpperCase() != applyMode) return false;
    final String q = (keyword ?? '').trim().toLowerCase();
    if (q.isEmpty) return true;
    return o.title.toLowerCase().contains(q) ||
        o.description.toLowerCase().contains(q) ||
        o.organizerName.toLowerCase().contains(q) ||
        o.tags.any((String t) => t.toLowerCase().contains(q));
  }
}

/// One page of the catalog. When the server could not be reached the page comes from the
/// device cache: [fromCache] is true, [cachedAt] says how old it is and [refreshFailure] why.
class OpportunityPage {
  final List<OpportunityModel> items;
  final String? nextCursor;
  final bool hasMore;
  final bool fromCache;
  final DateTime? cachedAt;
  final Failure? refreshFailure;

  const OpportunityPage({
    required this.items,
    this.nextCursor,
    this.hasMore = false,
    this.fromCache = false,
    this.cachedAt,
    this.refreshFailure,
  });
}

/// Detail of one opportunity; [fromCache] when the server could not be reached.
class OpportunityDetail {
  final OpportunityModel item;
  final bool fromCache;
  final Failure? refreshFailure;

  const OpportunityDetail(this.item, {this.fromCache = false, this.refreshFailure});
}

/// Catalog, bookmark and external-mark data for the Opportunity feature (F11/F29).
///
/// Rules (F29, UX-02): the API is always tried first; on failure the cached copy is shown with
/// its update time, and when nothing is cached the real error is returned. No mock data is ever
/// returned in place of the API.
class OpportunityRepository {
  final ApiClient _apiClient;
  final RoomDatabase? _roomDb;
  final Future<bool> Function() _isSignedIn;

  OpportunityRepository({
    required ApiClient apiClient,
    RoomDatabase? roomDb,
    // Kept for the DI signature; the catalog cache lives in [roomDb].
    LocalCacheManager? localCache,
    Future<bool> Function()? isSignedIn,
  })  : _apiClient = apiClient,
        _roomDb = roomDb,
        _isSignedIn = isSignedIn ?? _assumeSignedIn;

  static Future<bool> _assumeSignedIn() async => true;

  static Failure _asFailure(Object e) =>
      e is Failure ? e : ServerFailure(message: 'Dữ liệu cơ hội không hợp lệ: $e');

  // ---------------------------------------------------------------- catalog

  Future<Result<OpportunityPage, Failure>> fetchPage(
    OpportunityQuery query, {
    String? cursor,
    int limit = 20,
  }) async {
    if (query.bookmarkedOnly) return _bookmarkedPage(query);

    try {
      final Map<String, dynamic> params = <String, dynamic>{'limit': limit};
      if (query.type != null) params['type'] = query.type;
      if ((query.keyword ?? '').trim().isNotEmpty) params['keyword'] = query.keyword!.trim();
      if (query.applyMode != null) params['applyMode'] = query.applyMode;
      if (cursor != null) params['cursor'] = cursor;

      final Response<dynamic> response =
          await _apiClient.get<dynamic>(ApiEndpoints.opportunities, queryParameters: params);
      final dynamic body = response.data;

      final List<dynamic> raw = switch (body) {
        List<dynamic> l => l,
        Map<String, dynamic> m when m['items'] is List => m['items'] as List<dynamic>,
        Map<String, dynamic> m when m['data'] is List => m['data'] as List<dynamic>,
        _ => <dynamic>[],
      };
      final List<OpportunityModel> items = raw
          .whereType<Map<dynamic, dynamic>>()
          .map((Map<dynamic, dynamic> e) => OpportunityModel.fromJson(Map<String, dynamic>.from(e)))
          .where((OpportunityModel o) => o.id.isNotEmpty)
          .toList();

      await _roomDb?.opportunityDao.insertAll(items.map((OpportunityModel m) => m.toJson()).toList());

      final String? next = body is Map ? body['nextCursor']?.toString() : null;
      final bool hasMore = body is Map && body['hasMore'] == true && next != null && next.isNotEmpty;
      return SuccessResult<OpportunityPage, Failure>(OpportunityPage(
        items: await _withUserFlags(items),
        nextCursor: hasMore ? next : null,
        hasMore: hasMore,
      ));
    } catch (e) {
      final Failure failure = _asFailure(e);
      // Next pages need the server; the first page can fall back to the cache.
      if (cursor != null || _roomDb == null) return FailureResult<OpportunityPage, Failure>(failure);

      final List<OpportunityModel> cached = (await _roomDb.opportunityDao.getAll(type: query.type))
          .map(OpportunityModel.fromJson)
          .where(query.matches)
          .toList()
        ..sort(_byDeadline);
      if (cached.isEmpty) return FailureResult<OpportunityPage, Failure>(failure);

      return SuccessResult<OpportunityPage, Failure>(OpportunityPage(
        items: await _withUserFlags(cached),
        fromCache: true,
        cachedAt: await _roomDb.opportunityDao.getLastUpdatedAt(),
        refreshFailure: failure,
      ));
    }
  }

  /// Open opportunities first (nearest deadline on top), closed ones last.
  static int _byDeadline(OpportunityModel a, OpportunityModel b) {
    final DateTime now = DateTime.now();
    final DateTime? da = a.registerDeadlineAt;
    final DateTime? db = b.registerDeadlineAt;
    final bool closedA = da == null || !now.isBefore(da);
    final bool closedB = db == null || !now.isBefore(db);
    if (closedA != closedB) return closedA ? 1 : -1;
    if (da == null || db == null) return 0;
    return da.compareTo(db);
  }

  Future<Result<OpportunityPage, Failure>> _bookmarkedPage(OpportunityQuery query) async {
    final RoomDatabase? db = _roomDb;
    if (db == null) return const SuccessResult<OpportunityPage, Failure>(OpportunityPage(items: <OpportunityModel>[]));

    Failure? syncFailure;
    if (await _isSignedIn()) {
      syncFailure = (await syncBookmarks()).errorOrNull;
    }
    final List<String> ids = await db.opportunityDao.getAllBookmarkedIds();

    final List<OpportunityModel> items = <OpportunityModel>[];
    for (final String id in ids) {
      Map<String, dynamic>? record = await db.opportunityDao.findById(id);
      if (record == null && syncFailure == null) {
        // Saved on another device and never opened here: fetch it once.
        final OpportunityDetail? fetched = (await getDetail(id)).dataOrNull;
        record = fetched?.item.toJson();
      }
      if (record != null) items.add(OpportunityModel.fromJson(record));
    }

    return SuccessResult<OpportunityPage, Failure>(OpportunityPage(
      items: await _withUserFlags(items.where(query.matches).toList()..sort(_byDeadline)),
      fromCache: syncFailure != null,
      cachedAt: syncFailure != null ? await db.opportunityDao.getLastUpdatedAt() : null,
      refreshFailure: syncFailure,
    ));
  }

  Future<List<OpportunityModel>> _withUserFlags(List<OpportunityModel> items) async {
    final RoomDatabase? db = _roomDb;
    if (db == null) return items;
    final Set<String> bookmarked = (await db.opportunityDao.getAllBookmarkedIds()).toSet();
    final Set<String> marked = (await db.opportunityDao.getAllExternalMarkedIds()).toSet();
    return items
        .map((OpportunityModel o) => o.copyWith(
              isBookmarked: bookmarked.contains(o.id),
              isExternalMarked: marked.contains(o.id),
            ))
        .toList();
  }

  // ---------------------------------------------------------------- detail

  Future<Result<OpportunityDetail, Failure>> getDetail(String id) async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(ApiEndpoints.opportunityDetail(id));
      final dynamic body = response.data;
      final dynamic payload = body is Map && body['data'] is Map ? body['data'] : body;
      if (payload is! Map || (payload['id'] ?? payload['_id']) == null) {
        throw const ServerFailure(message: 'Không tìm thấy thông tin cơ hội yêu cầu.', statusCode: 404);
      }
      final OpportunityModel model = OpportunityModel.fromJson(Map<String, dynamic>.from(payload));
      await _roomDb?.opportunityDao.insertOrUpdate(model.toJson());
      if (model.isExternal && await _isSignedIn()) await _refreshExternalMark(id);
      return SuccessResult<OpportunityDetail, Failure>(
        OpportunityDetail((await _withUserFlags(<OpportunityModel>[model])).first),
      );
    } catch (e) {
      final Failure failure = _asFailure(e);
      final Map<String, dynamic>? cached = await _roomDb?.opportunityDao.findById(id);
      if (cached == null) return FailureResult<OpportunityDetail, Failure>(failure);
      final OpportunityModel model = (await _withUserFlags(<OpportunityModel>[OpportunityModel.fromJson(cached)])).first;
      return SuccessResult<OpportunityDetail, Failure>(
        OpportunityDetail(model, fromCache: true, refreshFailure: failure),
      );
    }
  }

  /// Kept for callers that only need the model.
  Future<Result<OpportunityModel, Failure>> getOpportunityById(String id) async {
    final Result<OpportunityDetail, Failure> r = await getDetail(id);
    return r.fold(
      onSuccess: (OpportunityDetail d) => SuccessResult<OpportunityModel, Failure>(d.item),
      onFailure: (Failure f) => FailureResult<OpportunityModel, Failure>(f),
    );
  }

  // ---------------------------------------------------------------- bookmarks (OPP-06)

  /// Pulls the signed-in user's bookmarks from the server and replaces the local list.
  Future<Result<List<String>, Failure>> syncBookmarks() async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(ApiEndpoints.myBookmarks);
      final dynamic body = response.data;
      final dynamic raw = body is Map ? (body['opportunityIds'] ?? body['items']) : body;
      final List<String> ids = raw is List
          ? raw
              .map((dynamic e) => e is Map ? (e['opportunityId'] ?? e['id']) : e)
              .where((dynamic e) => e != null)
              .map((dynamic e) => e.toString())
              .toList()
          : <String>[];
      await _roomDb?.opportunityDao.replaceBookmarks(ids);
      return SuccessResult<List<String>, Failure>(ids);
    } catch (e) {
      return FailureResult<List<String>, Failure>(_asFailure(e));
    }
  }

  /// Saves or removes a bookmark on the server, then locally. Sends the target state, so a
  /// retry after a lost response cannot flip it back. Nothing changes locally on failure.
  Future<Result<bool, Failure>> setBookmark(String opportunityId, bool bookmarked) async {
    if (!await _isSignedIn()) {
      return const FailureResult<bool, Failure>(
        UnauthorizedFailure(message: 'Đăng nhập để lưu cơ hội và nhận nhắc hạn.'),
      );
    }
    try {
      final Response<dynamic> response = await _apiClient.post<dynamic>(
        ApiEndpoints.opportunityBookmark(opportunityId),
        data: <String, dynamic>{'bookmarked': bookmarked},
      );
      final dynamic body = response.data;
      final bool saved = body is Map && body['bookmarked'] is bool ? body['bookmarked'] as bool : bookmarked;
      if (saved) {
        await _roomDb?.opportunityDao.saveBookmark(opportunityId);
      } else {
        await _roomDb?.opportunityDao.removeBookmark(opportunityId);
      }
      return SuccessResult<bool, Failure>(saved);
    } catch (e) {
      return FailureResult<bool, Failure>(_asFailure(e));
    }
  }

  /// APP-04: self-mark "đã nộp tại nguồn" for an EXTERNAL opportunity (no Application is made).
  Future<Result<bool, Failure>> setExternalMark(String opportunityId, bool marked) async {
    if (!await _isSignedIn()) {
      return const FailureResult<bool, Failure>(
        UnauthorizedFailure(message: 'Đăng nhập để ghi nhận bạn đã nộp tại nguồn.'),
      );
    }
    try {
      final Response<dynamic> response = await _apiClient.post<dynamic>(
        ApiEndpoints.opportunityExternalMark(opportunityId),
        data: <String, dynamic>{'marked': marked},
      );
      final dynamic body = response.data;
      final bool saved =
          body is Map && body['isExternalMarked'] is bool ? body['isExternalMarked'] as bool : marked;
      await _roomDb?.opportunityDao.markExternalRegistered(opportunityId, saved);
      return SuccessResult<bool, Failure>(saved);
    } catch (e) {
      return FailureResult<bool, Failure>(_asFailure(e));
    }
  }

  /// The mark lives on the server (another device, or after re-login the local copy is gone).
  /// Best effort: the detail still opens when this call fails.
  Future<void> _refreshExternalMark(String opportunityId) async {
    try {
      final Response<dynamic> response =
          await _apiClient.get<dynamic>(ApiEndpoints.opportunityExternalMark(opportunityId));
      final dynamic body = response.data;
      if (body is Map && body['isExternalMarked'] is bool) {
        await _roomDb?.opportunityDao.markExternalRegistered(opportunityId, body['isExternalMarked'] as bool);
      }
    } catch (_) {
      // Keep the local value.
    }
  }

  /// Check last cache update timestamp (FR-OPP-06: cache có updatedAt)
  Future<DateTime?> getLastCachedTimestamp() async => _roomDb?.opportunityDao.getLastUpdatedAt();
}
