import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'opportunity_model.dart';
import 'opportunity_repository.dart';

/// ViewModel managing state and operations for Opportunities in MVVM architecture.
class OpportunityViewModel extends BaseViewModel {
  final OpportunityRepository _repository;

  List<OpportunityModel> _items = <OpportunityModel>[];
  String _selectedFilter = 'ALL'; // ALL, SCHOLARSHIP, COMPETITION

  List<OpportunityModel> get items => _items;
  String get selectedFilter => _selectedFilter;

  OpportunityViewModel(this._repository);

  Future<void> loadOpportunities({bool forceRefresh = false}) async {
    setLoading();

    final Result<List<OpportunityModel>, Failure> result = await _repository.getOpportunities(
      type: _selectedFilter == 'ALL' ? null : _selectedFilter,
      forceRefresh: forceRefresh,
    );

    result.fold<void>(
      onSuccess: (List<OpportunityModel> data) {
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
