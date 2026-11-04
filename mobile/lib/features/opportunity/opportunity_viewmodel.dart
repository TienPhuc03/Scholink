import 'package:intl/intl.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'opportunity_model.dart';
import 'opportunity_repository.dart';

/// ViewModel managing state and operations for Opportunities in MVVM architecture.
/// Satisfies FR-OPP-01, FR-OPP-02, FR-OPP-04, FR-OPP-06, FR-UX-02, and FR-APP-04.
class OpportunityViewModel extends BaseViewModel {
  final OpportunityRepository _repository;

  List<OpportunityModel> _items = <OpportunityModel>[];
  String _selectedTypeFilter = 'ALL'; // 'ALL', 'SCHOLARSHIP', 'COMPETITION', 'BOOKMARKED'
  String _selectedApplyMode = 'ALL'; // 'ALL', 'IN_APP', 'EXTERNAL'
  String _searchQuery = '';
  bool _isOffline = false;
  String? _lastUpdatedAtText;
  OpportunityModel? _selectedOpportunity;

  List<OpportunityModel> get items => _items;
  String get selectedTypeFilter => _selectedTypeFilter;
  String get selectedApplyMode => _selectedApplyMode;
  String get searchQuery => _searchQuery;
  bool get isOffline => _isOffline;
  String? get lastUpdatedAtText => _lastUpdatedAtText;
  OpportunityModel? get selectedOpportunity => _selectedOpportunity;

  OpportunityViewModel(this._repository);

  Future<void> loadOpportunities({bool forceRefresh = false}) async {
    setLoading();

    final Result<List<OpportunityModel>, Failure> result = await _repository.getOpportunities(
      type: _selectedTypeFilter == 'ALL' ? null : _selectedTypeFilter,
      searchQuery: _searchQuery.isEmpty ? null : _searchQuery,
      applyMode: _selectedApplyMode == 'ALL' ? null : _selectedApplyMode,
      forceRefresh: forceRefresh,
    );

    // Retrieve cache timestamp
    final DateTime? cachedTime = await _repository.getLastCachedTimestamp();
    if (cachedTime != null) {
      _lastUpdatedAtText = DateFormat('dd/MM/yyyy HH:mm').format(cachedTime);
    }

    result.fold<void>(
      onSuccess: (List<OpportunityModel> data) {
        _items = data;
        _isOffline = false;
        setSuccess();
      },
      onFailure: (Failure failure) {
        if (failure is NetworkFailure) {
          _isOffline = true;
        }
        setError(failure.message);
      },
    );
  }

  /// Change Category Filter (ALL, SCHOLARSHIP, COMPETITION, BOOKMARKED)
  void setTypeFilter(String filter) {
    if (_selectedTypeFilter != filter) {
      _selectedTypeFilter = filter;
      loadOpportunities();
    }
  }

  /// Change Apply Mode Filter (ALL, IN_APP, EXTERNAL)
  void setApplyModeFilter(String mode) {
    if (_selectedApplyMode != mode) {
      _selectedApplyMode = mode;
      loadOpportunities();
    }
  }

  /// Search keyword filter (FR-OPP-02)
  void setSearchQuery(String query) {
    _searchQuery = query;
    loadOpportunities();
  }

  /// FR-UX-02: Retry retains active filters and query
  void retry() {
    loadOpportunities(forceRefresh: true);
  }

  /// FR-OPP-06: Idempotent Bookmark toggle
  Future<void> toggleBookmark(OpportunityModel opp) async {
    final bool newBookmarkedState = await _repository.toggleBookmark(opp.id);
    final int index = _items.indexWhere((OpportunityModel item) => item.id == opp.id);
    if (index != -1) {
      _items[index] = _items[index].copyWith(isBookmarked: newBookmarkedState);
      if (_selectedTypeFilter == 'BOOKMARKED' && !newBookmarkedState) {
        _items.removeAt(index);
      }
      notifyListeners();
    }

    if (_selectedOpportunity != null && _selectedOpportunity!.id == opp.id) {
      _selectedOpportunity = _selectedOpportunity!.copyWith(isBookmarked: newBookmarkedState);
      notifyListeners();
    }
  }

  /// FR-APP-04: Self-mark External Registration
  Future<void> toggleExternalMark(OpportunityModel opp) async {
    final bool newMarked = await _repository.toggleExternalMark(opp.id);
    final int index = _items.indexWhere((OpportunityModel item) => item.id == opp.id);
    if (index != -1) {
      _items[index] = _items[index].copyWith(isExternalMarked: newMarked);
      notifyListeners();
    }
    if (_selectedOpportunity != null && _selectedOpportunity!.id == opp.id) {
      _selectedOpportunity = _selectedOpportunity!.copyWith(isExternalMarked: newMarked);
      notifyListeners();
    }
  }

  /// Load single opportunity detail
  Future<void> selectOpportunity(String id) async {
    final Result<OpportunityModel, Failure> res = await _repository.getOpportunityById(id);
    res.fold(
      onSuccess: (OpportunityModel opp) {
        _selectedOpportunity = opp;
        notifyListeners();
      },
      onFailure: (Failure f) {
        // Keep existing if any
      },
    );
  }
}
