import '../../../../core/database/local_cache_manager.dart';
import '../dtos/opportunity_dtos.dart';

abstract interface class OpportunityLocalDataSource {
  Future<void> cacheOpportunities(List<OpportunityItemDto> items);
  Future<List<OpportunityItemDto>> getCachedOpportunities();
}

class OpportunityLocalDataSourceImpl implements OpportunityLocalDataSource {
  final LocalCacheManager _cacheManager;
  static const String _cacheKey = 'cached_opportunities_list';

  OpportunityLocalDataSourceImpl(this._cacheManager);

  @override
  Future<void> cacheOpportunities(List<OpportunityItemDto> items) async {
    final List<Map<String, dynamic>> rawList =
        items.map((OpportunityItemDto item) => item.toJson()).toList();
    await _cacheManager.saveJson(_cacheKey, rawList);
  }

  @override
  Future<List<OpportunityItemDto>> getCachedOpportunities() async {
    final dynamic cached = await _cacheManager.getJson(_cacheKey);
    if (cached is List) {
      return cached
          .whereType<Map<String, dynamic>>()
          .map((Map<String, dynamic> item) => OpportunityItemDto.fromJson(item))
          .toList();
    }
    return <OpportunityItemDto>[];
  }
}
