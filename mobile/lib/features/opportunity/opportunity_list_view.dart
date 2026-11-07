import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/errors/failures.dart';
import '../../core/widgets/refresh_error_banner.dart';
import 'opportunity_detail_view.dart';
import 'opportunity_model.dart';
import 'opportunity_viewmodel.dart';
import 'widgets/opportunity_card.dart';

/// Opportunity List View implementing MVVM pattern.
/// Satisfies Tuần 1 (F02), Tuần 2 (F11) and Tuần 4 (F29):
/// - FR-OPP-01: Separate display of Scholarships and Competitions, with common schema & components.
/// - FR-OPP-02: Search & Filter (search waits for the user to stop typing).
/// - FR-OPP-04: Deadlines, source, applyMode.
/// - FR-OPP-06: Local cache with updatedAt, offline support, bookmarking synced to the account.
/// - FR-UX-02: loading / empty / error / offline states; retry keeps filters; data on screen stays
///   visible when a refresh fails.
/// - UX-03: works with TalkBack and large font sizes.
class OpportunityListView extends StatefulWidget {
  final OpportunityViewModel viewModel;
  final bool isGuest;
  final void Function(OpportunityModel opportunity)? onOpportunityTap;
  final VoidCallback? onOpenNotificationInbox;

  /// Guests tapping the bookmark are sent here (login, then the bookmark is saved: F10/AUTH-05).
  final void Function(OpportunityModel opportunity)? onBookmarkNeedsLogin;

  const OpportunityListView({
    super.key,
    required this.viewModel,
    this.isGuest = false,
    this.onOpportunityTap,
    this.onOpenNotificationInbox,
    this.onBookmarkNeedsLogin,
  });

  @override
  State<OpportunityListView> createState() => _OpportunityListViewState();
}

class _OpportunityListViewState extends State<OpportunityListView> {
  late final TextEditingController _searchController =
      TextEditingController(text: widget.viewModel.searchQuery);
  final ScrollController _scroll = ScrollController();

  OpportunityViewModel get _vm => widget.viewModel;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_maybeLoadMore);
    // The view model outlives this widget (tab view models live per session): only load once.
    if (_vm.items.isEmpty && !_vm.isLoading) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _vm.loadOpportunities());
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _maybeLoadMore() {
    if (_scroll.hasClients && _scroll.position.extentAfter < 400) _vm.loadMore();
  }

  void _navigateToDetail(OpportunityModel opp) {
    if (widget.onOpportunityTap != null) {
      widget.onOpportunityTap!(opp);
      return;
    }
    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (BuildContext ctx) => OpportunityDetailView(
          opportunity: opp,
          viewModel: _vm,
          isGuest: widget.isGuest,
        ),
      ),
    );
  }

  Future<void> _onBookmarkTap(OpportunityModel opp) async {
    if (widget.isGuest) {
      if (widget.onBookmarkNeedsLogin != null) {
        widget.onBookmarkNeedsLogin!(opp);
      } else {
        _snack('Đăng nhập để lưu cơ hội và nhận nhắc hạn.');
      }
      return;
    }
    final bool willSave = !opp.isBookmarked;
    final Failure? failure = await _vm.toggleBookmark(opp);
    if (!mounted) return;
    if (failure != null) {
      _snack('Chưa lưu được thay đổi: ${failure.message}', error: true);
    } else {
      _snack(willSave ? 'Đã lưu. Scholink sẽ nhắc bạn trước hạn 7, 3 và 1 ngày.' : 'Đã bỏ lưu cơ hội.');
    }
  }

  void _snack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.error : null,
        duration: const Duration(seconds: 3),
      ));
  }

  void _resetFilters() {
    _searchController.clear();
    _vm.resetFilters();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Khám phá Cơ hội'),
        actions: <Widget>[
          if (widget.onOpenNotificationInbox != null)
            IconButton(
              icon: const Icon(Icons.notifications_none_rounded),
              tooltip: 'Hộp thư thông báo',
              onPressed: widget.onOpenNotificationInbox,
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Làm mới danh sách',
            onPressed: () => _vm.loadOpportunities(forceRefresh: true),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: _vm,
        builder: (BuildContext context, Widget? _) {
          return Column(
            children: <Widget>[
              _buildSearchField(),
              _buildTypeChips(),
              _buildApplyModeChips(),
              if (_vm.isRefreshing) const LinearProgressIndicator(minHeight: 2),
              ..._buildStatusBanners(),
              const Divider(height: 1),
              Expanded(child: _buildBody()),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSearchField() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
      child: TextField(
        key: const Key('opportunity_search'),
        controller: _searchController,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          hintText: 'Tìm theo tên, đơn vị, lĩnh vực...',
          labelText: 'Tìm kiếm cơ hội',
          floatingLabelBehavior: FloatingLabelBehavior.never,
          prefixIcon: const Icon(Icons.search, size: 22),
          suffixIcon: _searchController.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear, size: 20),
                  tooltip: 'Xóa từ khóa',
                  onPressed: () {
                    _searchController.clear();
                    _vm.setSearchQuery('');
                    setState(() {});
                  },
                )
              : null,
          filled: true,
          fillColor: Colors.grey.shade100,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.grey.shade300),
          ),
        ),
        onChanged: (String val) {
          _vm.setSearchQuery(val);
          setState(() {});
        },
        onSubmitted: (_) => _vm.loadOpportunities(),
      ),
    );
  }

  // Primary Filter Chips: ALL, SCHOLARSHIP, COMPETITION, BOOKMARKED (FR-OPP-01 & FR-OPP-06)
  Widget _buildTypeChips() {
    final String current = _vm.selectedTypeFilter;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
      child: Row(
        children: <Widget>[
          _buildFilterChip('ALL', 'Tất cả', current),
          const SizedBox(width: 8),
          _buildFilterChip('SCHOLARSHIP', '🎓 Học bổng', current),
          const SizedBox(width: 8),
          _buildFilterChip('COMPETITION', '🏆 Cuộc thi', current),
          if (!widget.isGuest) ...<Widget>[
            const SizedBox(width: 8),
            _buildFilterChip('BOOKMARKED', '⭐ Đã lưu', current),
          ],
        ],
      ),
    );
  }

  // Secondary Filter: Apply Mode (ALL, IN_APP, EXTERNAL)
  Widget _buildApplyModeChips() {
    final String mode = _vm.selectedApplyMode;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 2.0),
      child: Row(
        children: <Widget>[
          const Text('Chế độ nộp: ', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
          const SizedBox(width: 4),
          _buildSmallModeChip('ALL', 'Tất cả', mode),
          const SizedBox(width: 6),
          _buildSmallModeChip('IN_APP', 'Nộp online', mode),
          const SizedBox(width: 6),
          _buildSmallModeChip('EXTERNAL', 'Nguồn ngoài', mode),
        ],
      ),
    );
  }

  /// Offline / cache notice with its update time (FR-OPP-06) and the refresh error with a retry.
  List<Widget> _buildStatusBanners() {
    if (_vm.items.isEmpty) return const <Widget>[];
    final List<Widget> banners = <Widget>[];
    if (_vm.isShowingCache) {
      banners.add(Container(
        key: const Key('opportunity_cache_banner'),
        width: double.infinity,
        color: Colors.amber.shade100,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Row(
          children: <Widget>[
            Icon(_vm.isOffline ? Icons.wifi_off_rounded : Icons.history_rounded, size: 16, color: Colors.brown),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _vm.lastUpdatedAtText != null
                    ? '${_vm.isOffline ? 'Đang ngoại tuyến. ' : ''}Dữ liệu lưu trên máy, cập nhật lúc ${_vm.lastUpdatedAtText}.'
                    : 'Đang xem dữ liệu đã lưu trên máy.',
                style: const TextStyle(fontSize: 12, color: Colors.brown, fontWeight: FontWeight.w500),
              ),
            ),
          ],
        ),
      ));
    }
    if (_vm.refreshError != null) {
      banners.add(Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 6),
        child: RefreshErrorBanner(message: _vm.refreshError, onRetry: _vm.retry),
      ));
    }
    return banners;
  }

  // Main Content: Loading, Error, Empty, Success States (FR-UX-02)
  Widget _buildBody() {
    if (_vm.isLoading && _vm.items.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            CircularProgressIndicator(),
            SizedBox(height: 14),
            Text('Đang tải danh sách cơ hội...', style: TextStyle(color: AppColors.textSecondary)),
          ],
        ),
      );
    }

    // Error State (with retry retaining filters)
    if (_vm.hasError && _vm.items.isEmpty) {
      return _CenteredMessage(
        key: const Key('opportunity_error_state'),
        icon: _vm.isOffline ? Icons.wifi_off_outlined : Icons.error_outline_rounded,
        iconColor: AppColors.error,
        title: _vm.errorMessage ?? 'Không thể kết nối đến máy chủ.',
        message: _vm.hasActiveFilters
            ? 'Bộ lọc hiện tại vẫn được giữ nguyên khi bạn thử lại.'
            : 'Kiểm tra kết nối mạng rồi thử lại.',
        action: ElevatedButton.icon(
          key: const Key('opportunity_retry'),
          onPressed: _vm.retry,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('Thử lại'),
        ),
      );
    }

    // Empty State (distinct from error, per FR-UX-02)
    final List<OpportunityModel> items = _vm.items;
    if (items.isEmpty) {
      final bool bookmarks = _vm.selectedTypeFilter == 'BOOKMARKED';
      return _CenteredMessage(
        key: const Key('opportunity_empty_state'),
        icon: bookmarks ? Icons.bookmark_border_rounded : Icons.search_off_rounded,
        iconColor: AppColors.textMuted,
        title: bookmarks ? 'Bạn chưa lưu cơ hội nào' : 'Không tìm thấy cơ hội phù hợp',
        message: bookmarks
            ? 'Nhấn biểu tượng lưu trên một cơ hội để theo dõi và nhận nhắc hạn.'
            : 'Hãy thử điều chỉnh từ khóa tìm kiếm hoặc chọn bộ lọc "Tất cả".',
        action: _vm.hasActiveFilters
            ? OutlinedButton(onPressed: _resetFilters, child: const Text('Đặt lại bộ lọc'))
            : null,
      );
    }

    // Success List State
    return RefreshIndicator(
      onRefresh: () => _vm.loadOpportunities(forceRefresh: true),
      child: ListView.separated(
        key: const PageStorageKey<String>('opportunity_list'),
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16.0),
        itemCount: items.length + 1,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (BuildContext context, int index) {
          if (index == items.length) return _buildListFooter();
          final OpportunityModel item = items[index];
          return OpportunityCard(
            key: ValueKey<String>('opp_card_${item.id}'),
            item: item,
            onTap: () => _navigateToDetail(item),
            onBookmarkTap: () => _onBookmarkTap(item),
          );
        },
      ),
    );
  }

  Widget _buildListFooter() {
    if (_vm.isLoadingMore) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_vm.loadMoreError != null) {
      return Column(
        children: <Widget>[
          Text(
            'Không tải thêm được: ${_vm.loadMoreError}',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          TextButton(onPressed: _vm.loadMore, child: const Text('Thử tải thêm')),
        ],
      );
    }
    if (_vm.hasMore) {
      return Center(child: TextButton(onPressed: _vm.loadMore, child: const Text('Xem thêm')));
    }
    return const SizedBox(height: 24);
  }

  Widget _buildFilterChip(String value, String label, String currentFilter) {
    final bool isSelected = currentFilter == value;
    return FilterChip(
      selected: isSelected,
      label: Text(label),
      labelStyle: TextStyle(
        fontSize: 13,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
        color: isSelected ? Colors.white : AppColors.textPrimary,
      ),
      selectedColor: AppColors.primary,
      checkmarkColor: Colors.white,
      backgroundColor: AppColors.surface,
      side: BorderSide(color: isSelected ? AppColors.primary : AppColors.border),
      onSelected: (_) => _vm.setTypeFilter(value),
    );
  }

  Widget _buildSmallModeChip(String value, String label, String currentMode) {
    final bool isSelected = currentMode == value;
    return ChoiceChip(
      selected: isSelected,
      label: Text(label),
      labelStyle: TextStyle(
        fontSize: 11.5,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
        color: isSelected ? AppColors.primary : AppColors.textSecondary,
      ),
      selectedColor: AppColors.primary.withValues(alpha: 0.15),
      backgroundColor: Colors.transparent,
      side: BorderSide(color: isSelected ? AppColors.primary : Colors.grey.shade300),
      onSelected: (_) => _vm.setApplyModeFilter(value),
    );
  }
}

/// Scrollable so large text never pushes the action off screen.
class _CenteredMessage extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String message;
  final Widget? action;

  const _CenteredMessage({
    super.key,
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.message,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 54, color: iconColor),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13.5, color: AppColors.textSecondary),
            ),
            if (action != null) ...<Widget>[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}
