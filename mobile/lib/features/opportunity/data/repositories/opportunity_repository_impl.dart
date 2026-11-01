import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../../domain/entities/opportunity_entity.dart';
import '../../domain/repositories/opportunity_repository.dart';
import '../datasources/opportunity_local_data_source.dart';
import '../datasources/opportunity_remote_data_source.dart';
import '../dtos/opportunity_dtos.dart';
import '../mappers/opportunity_mapper.dart';

class OpportunityRepositoryImpl implements OpportunityRepository {
  final OpportunityRemoteDataSource _remoteDataSource;
  final OpportunityLocalDataSource _localDataSource;

  OpportunityRepositoryImpl({
    required OpportunityRemoteDataSource remoteDataSource,
    required OpportunityLocalDataSource localDataSource,
  })  : _remoteDataSource = remoteDataSource,
        _localDataSource = localDataSource;

  @override
  Future<Result<List<OpportunityEntity>, Failure>> getOpportunities({
    String? type,
    String? cursor,
    int limit = 20,
    bool forceRefresh = false,
  }) async {
    try {
      final OpportunityListResponseDto response = await _remoteDataSource.getOpportunities(
        type: type,
        cursor: cursor,
        limit: limit,
      );

      final List<OpportunityEntity> entities = response.items
          .map((OpportunityItemDto dto) => OpportunityMapper.toEntity(dto))
          .toList();

      // Cache opportunities locally for offline viewing
      if (entities.isNotEmpty) {
        await _localDataSource.cacheOpportunities(response.items);
      }

      return SuccessResult<List<OpportunityEntity>, Failure>(entities);
    } catch (_) {
      // Offline fallback: load cached opportunities if network fails
      try {
        final List<OpportunityItemDto> cached = await _localDataSource.getCachedOpportunities();
        if (cached.isNotEmpty) {
          final List<OpportunityEntity> entities = cached
              .map((OpportunityItemDto dto) => OpportunityMapper.toEntity(dto))
              .toList();
          return SuccessResult<List<OpportunityEntity>, Failure>(entities);
        }
      } catch (_) {}

      return const FailureResult<List<OpportunityEntity>, Failure>(
        NetworkFailure(message: 'Không thể kết nối đến máy chủ và không có dữ liệu ngoại tuyến.'),
      );
    }
  }

  @override
  Future<Result<OpportunityEntity, Failure>> getOpportunityById(String id) async {
    try {
      final OpportunityItemDto dto = await _remoteDataSource.getOpportunityById(id);
      final OpportunityEntity entity = OpportunityMapper.toEntity(dto);
      return SuccessResult<OpportunityEntity, Failure>(entity);
    } on Failure catch (failure) {
      return FailureResult<OpportunityEntity, Failure>(failure);
    } catch (e) {
      return FailureResult<OpportunityEntity, Failure>(ServerFailure(message: e.toString()));
    }
  }
}
