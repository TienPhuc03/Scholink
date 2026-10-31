import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../entities/opportunity_entity.dart';

abstract interface class OpportunityRepository {
  Future<Result<List<OpportunityEntity>, Failure>> getOpportunities({
    String? type,
    String? cursor,
    int limit = 20,
    bool forceRefresh = false,
  });

  Future<Result<OpportunityEntity, Failure>> getOpportunityById(String id);
}
