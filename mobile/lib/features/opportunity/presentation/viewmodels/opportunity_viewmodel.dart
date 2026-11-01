import '../../../../core/errors/failures.dart';
import '../../../../core/errors/result.dart';
import '../../../../core/viewmodels/base_viewmodel.dart';
import '../../domain/entities/opportunity_entity.dart';
import '../../domain/usecases/get_opportunities_usecase.dart';

class OpportunityViewModel extends BaseViewModel {
  final GetOpportunitiesUseCase _getOpportunitiesUseCase;

  List<OpportunityEntity> _items = <OpportunityEntity>[];
  String _selectedFilter = 'ALL'; // ALL, SCHOLARSHIP, COMPETITION

  List<OpportunityEntity> get items => _items;
  String get selectedFilter => _selectedFilter;

  OpportunityViewModel(this._getOpportunitiesUseCase);

  Future<void> loadOpportunities({bool forceRefresh = false}) async {
    setLoading();

    final Result<List<OpportunityEntity>, Failure> result = await _getOpportunitiesUseCase(
      type: _selectedFilter == 'ALL' ? null : _selectedFilter,
      forceRefresh: forceRefresh,
    );

    result.fold<void>(
      onSuccess: (List<OpportunityEntity> data) {
        _items = data;
        setSuccess();
      },
      onFailure: (Failure failure) {
        setError(failure.message);
      },
    );
  }

  void setFilter(String filter) {
    if (_selectedFilter != filter) {
      _selectedFilter = filter;
      loadOpportunities();
    }
  }
}
