import 'dart:convert';
import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/database/local_cache_manager.dart';
import '../../core/database/room_database.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'opportunity_mock_data.dart';
import 'opportunity_model.dart';

/// Single concrete Repository for Opportunity feature in MVVM pattern.
/// Implements SQLite / Room persistent caching, offline fallback, bookmarking, and mock API support.
class OpportunityRepository {
  final ApiClient _apiClient;
  final RoomDatabase? _roomDb;
  final LocalCacheManager? _localCache;

  OpportunityRepository({
    required ApiClient apiClient,
    RoomDatabase? roomDb,
    LocalCacheManager? localCache,
  })  : _apiClient = apiClient,
        _roomDb = roomDb,
        _localCache = localCache;

  /// Fetch opportunities with filters, caching, Room DB persistence, and Mock API fallback.
  Future<Result<List<OpportunityModel>, Failure>> getOpportunities({
    String? type,
    String? searchQuery,
    String? applyMode,
    String? cursor,
    int limit = 20,
    bool forceRefresh = false,
  }) async {
    List<OpportunityModel> items = <OpportunityModel>[];
    bool fetchedFromRemote = false;

    // 1. Attempt remote API fetch
    try {
      final Map<String, dynamic> query = <String, dynamic>{'limit': limit};
      if (type != null && type.isNotEmpty && type != 'ALL') {
        query['type'] = type;
      }
      if (searchQuery != null && searchQuery.isNotEmpty) {
        query['q'] = searchQuery;
      }
      if (cursor != null) {
        query['cursor'] = cursor;
      }

      final Response<dynamic> response = await _apiClient.get<dynamic>(
        ApiEndpoints.opportunities,
        queryParameters: query,
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData['items'] ?? resData)
          : resData;

      List<dynamic> rawList = <dynamic>[];
      if (payload is List) {
        rawList = payload;
      } else if (payload is Map<String, dynamic> && payload['items'] is List) {
        rawList = payload['items'] as List<dynamic>;
      }

      if (rawList.isNotEmpty) {
        items = rawList
            .whereType<Map<String, dynamic>>()
            .map((Map<String, dynamic> item) => OpportunityModel.fromJson(item))
            .toList();
        fetchedFromRemote = true;

        // Persist to Room Database table with updatedAt timestamp (FR-OPP-06)
        if (_roomDb != null) {
          final List<Map<String, dynamic>> records =
              items.map((OpportunityModel m) => m.toJson()).toList();
          await _roomDb.opportunityDao.insertAll(records);
        }
      }
    } catch (_) {
      // Remote API unavailable or network failure
      fetchedFromRemote = false;
    }

    // 2. Fallback to Room Database / Local Cache if remote failed or empty
    if (!fetchedFromRemote || items.isEmpty) {
      if (_roomDb != null) {
        final List<Map<String, dynamic>> cachedRecords = await _roomDb.opportunityDao.getAll(
          type: type,
          searchQuery: searchQuery,
        );
        if (cachedRecords.isNotEmpty) {
          items = cachedRecords
              .map((Map<String, dynamic> rec) => OpportunityModel.fromJson(rec))
              .toList();
        }
      }
    }

    // 3. Fallback to Mock API dataset for first-run, offline demo, and verification
    if (items.isEmpty) {
      final List<OpportunityModel> mocks = OpportunityMockData.getMockOpportunities();
      items = mocks;

      // Seed Room Database with mock data so offline always retains valid records
      if (_roomDb != null) {
        final List<Map<String, dynamic>> mockJson =
            mocks.map((OpportunityModel m) => m.toJson()).toList();
        await _roomDb.opportunityDao.insertAll(mockJson);
      }
    }

    // 4. Apply client-side filters (type, applyMode, search) and attach bookmark / externalMark state
    final List<String> bookmarkedIds =
        _roomDb != null ? await _roomDb.opportunityDao.getAllBookmarkedIds() : <String>[];

    List<OpportunityModel> filtered = await Future.wait(items.map((OpportunityModel opp) async {
      final bool isBookmarked = bookmarkedIds.contains(opp.id);
      final bool isExternalMarked = _roomDb != null ? await _roomDb.opportunityDao.isExternalMarked(opp.id) : false;
      return opp.copyWith(isBookmarked: isBookmarked, isExternalMarked: isExternalMarked);
    }));

    if (type != null && type.isNotEmpty && type != 'ALL') {
      filtered = filtered.where((OpportunityModel opp) {
        if (type == 'SCHOLARSHIP') return opp.isScholarship;
        if (type == 'COMPETITION') return opp.isCompetition;
        if (type == 'BOOKMARKED') return opp.isBookmarked;
        return true;
      }).toList();
    }

    if (applyMode != null && applyMode.isNotEmpty && applyMode != 'ALL') {
      filtered = filtered.where((OpportunityModel opp) {
        return opp.applyMode.toUpperCase() == applyMode.toUpperCase();
      }).toList();
    }

    if (searchQuery != null && searchQuery.trim().isNotEmpty) {
      final String q = searchQuery.trim().toLowerCase();
      filtered = filtered.where((OpportunityModel opp) {
        return opp.title.toLowerCase().contains(q) ||
            opp.description.toLowerCase().contains(q) ||
            opp.organizerName.toLowerCase().contains(q) ||
            opp.tags.any((String t) => t.toLowerCase().contains(q));
      }).toList();
    }

    return SuccessResult<List<OpportunityModel>, Failure>(filtered);
  }

  /// Get Opportunity details by ID
  Future<Result<OpportunityModel, Failure>> getOpportunityById(String id) async {
    // 1. Try remote
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(
        ApiEndpoints.opportunityDetail(id),
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData)
          : resData;

      if (payload is Map<String, dynamic>) {
        final OpportunityModel model = OpportunityModel.fromJson(payload);
        if (_roomDb != null) {
          await _roomDb.opportunityDao.insertOrUpdate(model.toJson());
        }
        return SuccessResult<OpportunityModel, Failure>(model);
      }
    } catch (_) {}

    // 2. Try Room Database
    if (_roomDb != null) {
      final Map<String, dynamic>? cached = await _roomDb.opportunityDao.findById(id);
      if (cached != null) {
        final bool isBookmarked = await _roomDb.opportunityDao.isBookmarked(id);
        final bool isExternal = await _roomDb.opportunityDao.isExternalMarked(id);
        return SuccessResult<OpportunityModel, Failure>(
          OpportunityModel.fromJson(cached).copyWith(
            isBookmarked: isBookmarked,
            isExternalMarked: isExternal,
          ),
        );
      }
    }

    // 3. Try Mock data
    final List<OpportunityModel> mocks = OpportunityMockData.getMockOpportunities();
    final OpportunityModel? match = mocks.where((OpportunityModel m) => m.id == id).firstOrNull;
    if (match != null) {
      final bool isBookmarked =
          _roomDb != null ? await _roomDb.opportunityDao.isBookmarked(id) : false;
      final bool isExternal =
          _roomDb != null ? await _roomDb.opportunityDao.isExternalMarked(id) : false;
      return SuccessResult<OpportunityModel, Failure>(
        match.copyWith(
          isBookmarked: isBookmarked,
          isExternalMarked: isExternal,
        ),
      );
    }

    return const FailureResult<OpportunityModel, Failure>(
      ServerFailure(message: 'Không tìm thấy thông tin cơ hội yêu cầu.'),
    );
  }

  /// Idempotent Bookmark toggle (FR-OPP-06)
  Future<bool> toggleBookmark(String opportunityId) async {
    if (_roomDb == null) return false;
    final bool current = await _roomDb.opportunityDao.isBookmarked(opportunityId);
    if (current) {
      await _roomDb.opportunityDao.removeBookmark(opportunityId);
      return false;
    } else {
      await _roomDb.opportunityDao.saveBookmark(opportunityId);
      return true;
    }
  }

  /// Self-mark External Registration (FR-APP-04)
  Future<bool> toggleExternalMark(String opportunityId) async {
    if (_roomDb == null) return false;
    final bool current = await _roomDb.opportunityDao.isExternalMarked(opportunityId);
    final bool newState = !current;
    await _roomDb.opportunityDao.markExternalRegistered(opportunityId, newState);
    return newState;
  }

  /// Check last cache update timestamp (FR-OPP-06: cache có updatedAt)
  Future<DateTime?> getLastCachedTimestamp() async {
    if (_roomDb != null) {
      return _roomDb.opportunityDao.getLastUpdatedAt();
    }
    return null;
  }
}
