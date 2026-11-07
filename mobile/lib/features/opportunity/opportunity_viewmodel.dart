import 'dart:async';

import 'package:intl/intl.dart';
import '../../core/errors/failures.dart';
import '../../core/errors/result.dart';
import '../../core/viewmodels/base_viewmodel.dart';
import 'opportunity_model.dart';
import 'opportunity_repository.dart';

/// ViewModel managing state and operations for Opportunities in MVVM architecture.
/// Satisfies FR-OPP-01, FR-OPP-02, FR-OPP-04, FR-OPP-06, FR-UX-02, and FR-APP-04.
///
/// F29 rules:
/// - Filters and the search text survive retry, reload and screen rotation (they live here).
/// - A slow answer for an old filter never replaces the answer for the current one.
/// - Data already on screen stays visible when a refresh fails; the failure is shown above it.
class OpportunityViewModel extends BaseViewModel {
  final OpportunityRepository _repository;
  final Duration _searchDebounce;

  List<OpportunityModel> _items = <OpportunityModel>[];
  String _selectedTypeFilter = 'ALL'; // 'ALL', 'SCHOLARSHIP', 'COMPETITION', 'BOOKMARKED'
  String _selectedApplyMode = 'ALL'; // 'ALL', 'IN_APP', 'EXTERNAL'
  String _searchQuery = '';

  bool _isOffline = false;
  bool _showingCache = false;
  String? _lastUpdatedAtText;
  String? _refreshError;
  bool _isRefreshing = false;

  String? _nextCursor;
  bool _hasMore = false;
  bool _isLoadingMore = false;
  String? _loadMoreError;

  int _generation = 0;
  Timer? _debounce;
  bool _disposed = false;
  OpportunityModel? _selectedOpportunity;

  OpportunityViewModel(this._repository, {Duration searchDebounce = const Duration(milliseconds: 400)})
      : _searchDebounce = searchDebounce;

  List<OpportunityModel> get items => List<OpportunityModel>.unmodifiable(_items);
  String get selectedTypeFilter => _selectedTypeFilter;
  String get selectedApplyMode => _selectedApplyMode;
  String get searchQuery => _searchQuery;

  /// The server could not be reached (no network / timeout).
  bool get isOffline => _isOffline;

  /// The list on screen is the device copy, not a fresh server answer.
  bool get isShowingCache => _showingCache;
  String? get lastUpdatedAtText => _lastUpdatedAtText;

  /// Why the last refresh failed while older data stays on screen.
  String? get refreshError => _refreshError;
  bool get isRefreshing => _isRefreshing;
  bool get hasMore => _hasMore;
  bool get isLoadingMore => _isLoadingMore;
  String? get loadMoreError => _loadMoreError;
  bool get hasActiveFilters =>
      _selectedTypeFilter != 'ALL' || _selectedApplyMode != 'ALL' || _searchQuery.trim().isNotEmpty;
  OpportunityModel? get selectedOpportunity => _selectedOpportunity;

  OpportunityQuery get _query => OpportunityQuery(
        type: switch (_selectedTypeFilter) {
          'SCHOLARSHIP' || 'COMPETITION' => _selectedTypeFilter,
          _ => null,
        },
        keyword: _searchQuery.trim().isEmpty ? null : _searchQuery.trim(),
        applyMode: _selectedApplyMode == 'ALL' ? null : _selectedApplyMode,
        bookmarkedOnly: _selectedTypeFilter == 'BOOKMARKED',
      );

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  static String _fmt(DateTime t) => DateFormat('dd/MM/yyyy HH:mm').format(t.toLocal());

  Future<void> loadOpportunities({bool forceRefresh = false}) async {
    _debounce?.cancel();
    final int generation = ++_generation;
    final bool keepOnScreen = _items.isNotEmpty;
    if (keepOnScreen) {
      _isRefreshing = true;
      _notify();
    } else {
      setLoading();
    }

    final Result<OpportunityPage, Failure> result = await _repository.fetchPage(_query);
    if (_disposed || generation != _generation) return; // a newer filter/search took over

    _isRefreshing = false;
    _loadMoreError = null;
    result.fold<void>(
      onSuccess: (OpportunityPage page) {
        _items = List<OpportunityModel>.of(page.items);
        _nextCursor = page.nextCursor;
        _hasMore = page.hasMore;
        _showingCache = page.fromCache;
        _isOffline = page.refreshFailure is NetworkFailure;
        _refreshError = page.refreshFailure?.message;
        _lastUpdatedAtText = page.cachedAt != null ? _fmt(page.cachedAt!) : null;
        setSuccess();
      },
      onFailure: (Failure failure) {
        _isOffline = failure is NetworkFailure;
        if (keepOnScreen) {
          // Old list stays; the banner explains it may be outdated.
          _refreshError = failure.message;
          _showingCache = true;
          setSuccess();
        } else {
          _items = <OpportunityModel>[];
          _hasMore = false;
          _nextCursor = null;
          _refreshError = null;
          setError(_isOffline
              ? 'Không có kết nối mạng và chưa có dữ liệu lưu trên máy cho bộ lọc này.'
              : failure.message);
        }
      },
    );
  }

  /// The list on screen belongs to the old filters: drop it so the next load shows its own
  /// loading/empty/error state instead of results that no longer match.
  void _filtersChanged() {
    _items = <OpportunityModel>[];
    _hasMore = false;
    _nextCursor = null;
    _refreshError = null;
  }

  Future<void> loadMore() async {
    final String? cursor = _nextCursor;
    if (!_hasMore || cursor == null || _isLoadingMore || isLoading) return;
    final int generation = _generation;
    _isLoadingMore = true;
    _loadMoreError = null;
    _notify();

    final Result<OpportunityPage, Failure> result = await _repository.fetchPage(_query, cursor: cursor);
    if (_disposed || generation != _generation) return;
    _isLoadingMore = false;
    result.fold<void>(
      onSuccess: (OpportunityPage page) {
        final Set<String> seen = _items.map((OpportunityModel o) => o.id).toSet();
        _items.addAll(page.items.where((OpportunityModel o) => seen.add(o.id)));
        _nextCursor = page.nextCursor;
        _hasMore = page.hasMore;
      },
      onFailure: (Failure f) => _loadMoreError = f.message,
    );
    _notify();
  }

  /// Change Category Filter (ALL, SCHOLARSHIP, COMPETITION, BOOKMARKED)
  void setTypeFilter(String filter) {
    if (_selectedTypeFilter == filter) return;
    _selectedTypeFilter = filter;
    _filtersChanged();
    loadOpportunities();
  }

  /// Change Apply Mode Filter (ALL, IN_APP, EXTERNAL)
  void setApplyModeFilter(String mode) {
    if (_selectedApplyMode == mode) return;
    _selectedApplyMode = mode;
    _filtersChanged();
    loadOpportunities();
  }

  /// Search keyword filter (FR-OPP-02). Typing is debounced: one request after the user pauses.
  void setSearchQuery(String query) {
    if (_searchQuery == query) return;
    _searchQuery = query;
    _debounce?.cancel();
    _debounce = Timer(_searchDebounce, () {
      _filtersChanged();
      loadOpportunities();
    });
  }

  /// Back to "Tất cả" with one request (the empty state's reset button).
  void resetFilters() {
    _debounce?.cancel();
    _selectedTypeFilter = 'ALL';
    _selectedApplyMode = 'ALL';
    _searchQuery = '';
    _filtersChanged();
    loadOpportunities();
  }

  /// FR-UX-02: Retry retains active filters and query
  Future<void> retry() => loadOpportunities(forceRefresh: true);

  OpportunityModel? findById(String id) {
    for (final OpportunityModel o in _items) {
      if (o.id == id) return o;
    }
    return _selectedOpportunity?.id == id ? _selectedOpportunity : null;
  }

  void _replace(OpportunityModel updated) {
    final int index = _items.indexWhere((OpportunityModel o) => o.id == updated.id);
    if (index != -1) _items[index] = updated;
    if (_selectedOpportunity?.id == updated.id) _selectedOpportunity = updated;
  }

  /// FR-OPP-06: saves the bookmark on the server. The icon changes at once and goes back when
  /// the server refuses, so the screen never claims a bookmark that is not saved.
  /// Returns the failure to show, or null on success.
  Future<Failure?> setBookmark(OpportunityModel opp, bool bookmarked) async {
    final OpportunityModel before = findById(opp.id) ?? opp;
    _replace(before.copyWith(isBookmarked: bookmarked));
    _notify();

    final Result<bool, Failure> result = await _repository.setBookmark(opp.id, bookmarked);
    if (_disposed) return result.errorOrNull;
    return result.fold(
      onSuccess: (bool saved) {
        _replace(before.copyWith(isBookmarked: saved));
        if (!saved && _selectedTypeFilter == 'BOOKMARKED') {
          _items.removeWhere((OpportunityModel o) => o.id == opp.id);
        }
        _notify();
        return null;
      },
      onFailure: (Failure f) {
        _replace(before);
        _notify();
        return f;
      },
    );
  }

  Future<Failure?> toggleBookmark(OpportunityModel opp) {
    final bool current = (findById(opp.id) ?? opp).isBookmarked;
    return setBookmark(opp, !current);
  }

  /// FR-APP-04: Self-mark External Registration (no Application is created).
  Future<Failure?> setExternalMark(OpportunityModel opp, bool marked) async {
    final OpportunityModel before = findById(opp.id) ?? opp;
    final Result<bool, Failure> result = await _repository.setExternalMark(opp.id, marked);
    if (_disposed) return result.errorOrNull;
    return result.fold(
      onSuccess: (bool saved) {
        _replace(before.copyWith(isExternalMarked: saved));
        _notify();
        return null;
      },
      onFailure: (Failure f) => f,
    );
  }

  Future<Failure?> toggleExternalMark(OpportunityModel opp) {
    final bool current = (findById(opp.id) ?? opp).isExternalMarked;
    return setExternalMark(opp, !current);
  }

  /// Reloads one opportunity for its detail screen and keeps the list in step with it.
  Future<Result<OpportunityDetail, Failure>> refreshDetail(String id) async {
    final Result<OpportunityDetail, Failure> res = await _repository.getDetail(id);
    final OpportunityDetail? detail = res.dataOrNull;
    if (detail != null && !_disposed) {
      _selectedOpportunity = detail.item;
      _replace(detail.item);
      _notify();
    }
    return res;
  }

  /// Load single opportunity detail
  Future<void> selectOpportunity(String id) async {
    await refreshDetail(id);
  }

  @override
  void dispose() {
    _disposed = true;
    _debounce?.cancel();
    super.dispose();
  }
}
