import 'dart:async';

import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../core/errors/failures.dart';
import '../../core/widgets/refresh_error_banner.dart';
import 'opportunity_detail_view.dart';
import 'opportunity_model.dart';
import 'opportunity_viewmodel.dart';
import 'widgets/opportunity_card.dart';

/// Professional, LinkedIn-style Opportunity Feed.
/// Features rich visual banners, organization branding, clear typography, and zero clutter.
class OpportunityListView extends StatefulWidget {
  final OpportunityViewModel viewModel;
  final bool isGuest;
  final void Function(OpportunityModel opportunity)? onOpportunityTap;
  final VoidCallback? onOpenNotificationInbox;
  final VoidCallback? onOpenAiChat;

  /// Guests tapping the bookmark are prompted to login (F10/AUTH-05).
  final void Function(OpportunityModel opportunity)? onBookmarkNeedsLogin;

  const OpportunityListView({
    super.key,
    required this.viewModel,
    this.isGuest = false,
    this.onOpportunityTap,
    this.onOpenNotificationInbox,
    this.onOpenAiChat,
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
    if (_vm.items.isEmpty && !_vm.isLoading) {
      WidgetsBinding.instance
          .addPostFrameCallback((_) => _vm.loadOpportunities());
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _maybeLoadMore() {
    if (_scroll.hasClients && _scroll.position.extentAfter < 400) {
      _vm.loadMore();
    }
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
      _snack(willSave
          ? 'Đã lưu cơ hội vào danh sách của bạn.'
          : 'Đã bỏ lưu cơ hội.');
    }
  }

  void _snack(String message, {bool error = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.error : AppColors.primary,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        duration: const Duration(seconds: 2),
      ));
  }

  void _resetFilters() {
    _searchController.clear();
    _vm.resetFilters();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor:
          const Color(0xFFF3F2EF), // LinkedIn signature background tint
      appBar: AppBar(
        titleSpacing: 0,
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        leadingWidth: 44,
        leading: Padding(
          padding: const EdgeInsets.only(left: 12.0),
          child: Center(
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: const Color(0xFFEEF0FD),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFCBD5E1), width: 0.8),
              ),
              alignment: Alignment.center,
              child: const Icon(
                Icons.person_rounded,
                size: 18,
                color: AppColors.primary,
              ),
            ),
          ),
        ),
        title: Padding(
          padding: const EdgeInsets.only(right: 6.0),
          child: _buildSearchBar(),
        ),
        actions: <Widget>[
          if (widget.onOpenAiChat != null)
            IconButton(
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              icon: const Icon(Icons.chat_bubble_outline_rounded,
                  color: Color(0xFF475569), size: 20),
              tooltip: 'Trò chuyện AI',
              onPressed: widget.onOpenAiChat,
            ),
          if (widget.onOpenNotificationInbox != null)
            IconButton(
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              icon: const Icon(Icons.notifications_none_rounded,
                  color: Color(0xFF475569), size: 20),
              tooltip: 'Hộp thư thông báo',
              onPressed: widget.onOpenNotificationInbox,
            ),
          IconButton(
            padding: const EdgeInsets.only(right: 8),
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            icon: const Icon(Icons.refresh_rounded,
                color: Color(0xFF475569), size: 19),
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
              // Filter chips row (clean single horizontal scrollable row)
              Container(
                color: Colors.white,
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                child: _buildFilterChipsRow(),
              ),

              // Status / Offline Banners
              ..._buildStatusBanners(),

              if (_vm.isRefreshing) const LinearProgressIndicator(minHeight: 1.5),

              const Divider(height: 1, color: Color(0xFFE2E8F0)),

              // Main Feed: Post stream
              Expanded(child: _buildBody()),
            ],
          );
        },
      ),
    );
  }

  Widget _buildFilterChipsRow() {
    final String current = _vm.selectedTypeFilter;
    final String mode = _vm.selectedApplyMode;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: <Widget>[
          _buildChip('ALL', 'Tất cả', current == 'ALL'),
          const SizedBox(width: 6),
          _buildChip('SCHOLARSHIP', '🎓 Học bổng', current == 'SCHOLARSHIP'),
          const SizedBox(width: 6),
          _buildChip('COMPETITION', '🏆 Cuộc thi', current == 'COMPETITION'),
          if (!widget.isGuest) ...<Widget>[
            const SizedBox(width: 6),
            _buildChip('BOOKMARKED', '⭐ Đã lưu', current == 'BOOKMARKED'),
          ],
          Container(
            height: 18,
            width: 1,
            color: const Color(0xFFE2E8F0),
            margin: const EdgeInsets.symmetric(horizontal: 8),
          ),
          _buildSmallModeChip('ALL', 'Tất cả chế độ', mode),
          const SizedBox(width: 6),
          _buildSmallModeChip('IN_APP', 'Nộp online', mode),
          const SizedBox(width: 6),
          _buildSmallModeChip('EXTERNAL', 'Nguồn ngoài', mode),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      height: 35,
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE2E8F0), width: 0.7),
      ),
      child: TextField(
        key: const Key('opportunity_search'),
        controller: _searchController,
        textInputAction: TextInputAction.search,
        style: const TextStyle(fontSize: 12.5, color: Color(0xFF0F172A)),
        decoration: InputDecoration(
          hintText: 'Tìm kiếm học bổng, trường, ngành...',
          hintStyle: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
          prefixIcon: const Icon(Icons.search_rounded,
              size: 16, color: Color(0xFF64748B)),
          suffixIcon: _searchController.text.isNotEmpty
              ? IconButton(
                  padding: EdgeInsets.zero,
                  icon: const Icon(Icons.clear_rounded,
                      size: 15, color: Color(0xFF64748B)),
                  tooltip: 'Xóa từ khóa',
                  onPressed: () {
                    _searchController.clear();
                    _vm.setSearchQuery('');
                    setState(() {});
                  },
                )
              : null,
          border: InputBorder.none,
          filled: false,
          contentPadding: const EdgeInsets.symmetric(vertical: 7),
        ),
        onChanged: (String val) {
          _vm.setSearchQuery(val);
          setState(() {});
        },
        onSubmitted: (_) => _vm.loadOpportunities(),
      ),
    );
  }

  Widget _buildChip(String value, String label, bool isSelected) {
    return GestureDetector(
      onTap: () => _vm.setTypeFilter(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 5.5),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppColors.primary : const Color(0xFFCBD5E1),
            width: isSelected ? 1.0 : 0.8,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
            color: isSelected ? Colors.white : const Color(0xFF334155),
            letterSpacing: -0.1,
          ),
        ),
      ),
    );
  }

  Widget _buildSmallModeChip(String value, String label, String currentMode) {
    final bool isSelected = currentMode == value;
    return GestureDetector(
      onTap: () => _vm.setApplyModeFilter(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withValues(alpha: 0.1)
              : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? AppColors.primary : const Color(0xFFE2E8F0),
            width: isSelected ? 1.0 : 0.8,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
            color: isSelected ? AppColors.primary : const Color(0xFF64748B),
            letterSpacing: -0.1,
          ),
        ),
      ),
    );
  }

  List<Widget> _buildStatusBanners() {
    if (_vm.items.isEmpty) return const <Widget>[];
    final List<Widget> banners = <Widget>[];
    if (_vm.isShowingCache) {
      banners.add(Container(
        key: const Key('opportunity_cache_banner'),
        width: double.infinity,
        color: Colors.amber.shade50,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Row(
          children: <Widget>[
            Icon(_vm.isOffline ? Icons.wifi_off_rounded : Icons.history_rounded,
                size: 14, color: Colors.brown),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                _vm.lastUpdatedAtText != null
                    ? '${_vm.isOffline ? 'Đang ngoại tuyến. ' : ''}Dữ liệu lưu trên máy, cập nhật lúc ${_vm.lastUpdatedAtText}.'
                    : 'Đang xem dữ liệu đã lưu trên máy.',
                style: const TextStyle(
                    fontSize: 11.5,
                    color: Colors.brown,
                    fontWeight: FontWeight.w500),
              ),
            ),
          ],
        ),
      ));
    }
    if (_vm.refreshError != null) {
      banners.add(Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
        child:
            RefreshErrorBanner(message: _vm.refreshError, onRetry: _vm.retry),
      ));
    }
    return banners;
  }

  Widget _buildBody() {
    if (_vm.isLoading && _vm.items.isEmpty) {
      return const Center(child: CircularProgressIndicator(strokeWidth: 2.5));
    }

    if (_vm.hasError && _vm.items.isEmpty) {
      return _CenteredMessage(
        key: const Key('opportunity_error_state'),
        icon: _vm.isOffline
            ? Icons.wifi_off_outlined
            : Icons.error_outline_rounded,
        iconColor: AppColors.error,
        title: _vm.errorMessage ?? 'Không thể kết nối đến máy chủ.',
        message: _vm.hasActiveFilters
            ? 'Bộ lọc hiện tại vẫn được giữ nguyên khi bạn thử lại.'
            : 'Kiểm tra kết nối mạng rồi thử lại.',
        action: ElevatedButton.icon(
          key: const Key('opportunity_retry'),
          style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white),
          onPressed: _vm.retry,
          icon: const Icon(Icons.refresh_rounded, size: 16),
          label: const Text('Thử lại'),
        ),
      );
    }

    final List<OpportunityModel> items = _vm.items;
    if (items.isEmpty) {
      final bool bookmarks = _vm.selectedTypeFilter == 'BOOKMARKED';
      return _CenteredMessage(
        key: const Key('opportunity_empty_state'),
        icon: bookmarks
            ? Icons.bookmark_border_rounded
            : Icons.search_off_rounded,
        iconColor: const Color(0xFF94A3B8),
        title: bookmarks
            ? 'Bạn chưa lưu cơ hội nào'
            : 'Không tìm thấy cơ hội phù hợp',
        message: bookmarks
            ? 'Nhấn biểu tượng lưu trên một cơ hội để theo dõi và nhận nhắc hạn.'
            : 'Hãy thử điều chỉnh từ khóa tìm kiếm hoặc chọn bộ lọc "Tất cả".',
        action: _vm.hasActiveFilters
            ? OutlinedButton(
                onPressed: _resetFilters,
                style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primary),
                child: const Text('Đặt lại bộ lọc'),
              )
            : null,
      );
    }

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () => _vm.loadOpportunities(forceRefresh: true),
      child: ListView.separated(
        key: const PageStorageKey<String>('opportunity_list'),
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 10.0),
        itemCount: items.length + 1,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
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
        padding: EdgeInsets.symmetric(vertical: 14),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    if (_vm.loadMoreError != null) {
      return Column(
        children: <Widget>[
          Text(
            'Không tải thêm được: ${_vm.loadMoreError}',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
          ),
          TextButton(
              onPressed: _vm.loadMore,
              child: const Text('Thử tải thêm',
                  style: TextStyle(color: AppColors.primary))),
        ],
      );
    }
    if (_vm.hasMore) {
      return Center(
        child: TextButton(
            onPressed: _vm.loadMore,
            child: const Text('Xem thêm bài viết',
                style: TextStyle(color: AppColors.primary))),
      );
    }
    return const SizedBox(height: 16);
  }
}

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
            Icon(icon, size: 44, color: iconColor),
            const SizedBox(height: 10),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0F172A)),
            ),
            const SizedBox(height: 4),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
            ),
            if (action != null) ...<Widget>[
              const SizedBox(height: 14),
              action!
            ],
          ],
        ),
      ),
    );
  }
}
