import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../entities/opportunity_entity.dart';
import '../repositories/opportunity_repository.dart';

class GetOpportunitiesUseCase {
  final OpportunityRepository _repository;

  GetOpportunitiesUseCase(this._repository);

  Future<Result<List<OpportunityEntity>, Failure>> call({
    String? type,
    bool forceRefresh = false,
  }) {
    return _repository.getOpportunities(
      type: type,
      forceRefresh: forceRefresh,
    );
  }
}
