import 'dart:convert';
import 'package:dio/dio.dart';
import '../../core/constants/api_endpoints.dart';
import '../../core/database/local_cache_manager.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/network/api_client.dart';
import 'opportunity_model.dart';

/// Single concrete Repository for Opportunity feature in MVVM pattern.
class OpportunityRepository {
  final ApiClient _apiClient;
  final LocalCacheManager? _localCache;

  static const String _cacheKey = 'cached_opportunities';

  OpportunityRepository({
    required ApiClient apiClient,
    LocalCacheManager? localCache,
  })  : _apiClient = apiClient,
        _localCache = localCache;

  Future<Result<List<OpportunityModel>, Failure>> getOpportunities({
    String? type,
    String? cursor,
    int limit = 20,
    bool forceRefresh = false,
  }) async {
    try {
      final Map<String, dynamic> query = <String, dynamic>{'limit': limit};
      if (type != null && type.isNotEmpty && type != 'ALL') {
        query['type'] = type;
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

      final List<OpportunityModel> items = rawList
          .whereType<Map<String, dynamic>>()
          .map((Map<String, dynamic> item) => OpportunityModel.fromJson(item))
          .toList();

      // Cache locally for offline viewing
      if (items.isNotEmpty && _localCache != null) {
        final String encoded = jsonEncode(items.map((OpportunityModel m) => m.toJson()).toList());
        await _localCache.saveString(_cacheKey, encoded);
      }

      return SuccessResult<List<OpportunityModel>, Failure>(items);
    } catch (_) {
      // Offline fallback: load cached opportunities if network fails
      if (_localCache != null) {
        final String? cached = _localCache.getString(_cacheKey);
        if (cached != null && cached.isNotEmpty) {
          try {
            final dynamic decoded = jsonDecode(cached);
            if (decoded is List) {
              final List<OpportunityModel> cachedItems = decoded
                  .whereType<Map<String, dynamic>>()
                  .map((Map<String, dynamic> item) => OpportunityModel.fromJson(item))
                  .toList();
              return SuccessResult<List<OpportunityModel>, Failure>(cachedItems);
            }
          } catch (_) {}
        }
      }

      return const FailureResult<List<OpportunityModel>, Failure>(
        NetworkFailure(message: 'Không thể kết nối đến máy chủ và không có dữ liệu ngoại tuyến.'),
      );
    }
  }

  Future<Result<OpportunityModel, Failure>> getOpportunityById(String id) async {
    try {
      final Response<dynamic> response = await _apiClient.get<dynamic>(
        ApiEndpoints.opportunityDetail(id),
      );

      final dynamic resData = response.data;
      final dynamic payload = (resData is Map<String, dynamic>)
          ? (resData['data'] ?? resData)
          : resData;

      if (payload is Map<String, dynamic>) {
        return SuccessResult<OpportunityModel, Failure>(OpportunityModel.fromJson(payload));
      }

      return const FailureResult<OpportunityModel, Failure>(
        ServerFailure(message: 'Không tìm thấy cơ hội yêu cầu.'),
      );
    } on Failure catch (failure) {
      return FailureResult<OpportunityModel, Failure>(failure);
    } catch (e) {
      return FailureResult<OpportunityModel, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
